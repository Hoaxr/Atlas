const fs = require('fs/promises');
const path = require('path');
const db = require('../../config/database');
const tmdbService = require('../tmdbService');
const imageService = require('../imageService');
const { getMediaMetadata, parseAudioFromFileName } = require('../../utils/videoUtils');
const { parseResolution, parseCodec } = require('../../utils/mediaParsing');
const { isWatchedSyncEnabled } = require('../../utils/settings');
const { parseMediaTitle, scanSubtitleLangs } = require('./fileScanner');
const { isVideoFile } = require('../../utils/fileUtils');

const processScannedFiles = async (allFiles, scanProgress, mode, nextStage) => {
    nextStage('Processing files...');
    scanProgress.totalFiles = allFiles.length;

    for (const file of allFiles) {
      if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
      scanProgress.currentFile = file.name;
      
      const fileDir = file.parentPath || file.path;
      const fullPath = path.join(fileDir, file.name);
      const { title, year, isShow, seasonNumber, episodeNumber, episodeEnd } = parseMediaTitle(file.name, fileDir);
      if (!title) {
        scanProgress.skippedCount++;
        scanProgress.skippedFiles.push({ name: file.name, reason: 'Could not parse title from filename', path: file.path });
        continue;
      }

      if (isShow) {
        // TV Show logic
        let showFolderPath = fileDir;
        // Strip season subfolder — walk up until we're at the actual show directory
        while (path.basename(showFolderPath).match(/season\s*\d+/i)) {
          showFolderPath = path.dirname(showFolderPath);
        }

        let showId = null;
        let tmdbId = null;

        const existingShow = db.prepare('SELECT id, tmdb_id FROM shows WHERE folder_path = ? OR title = ? COLLATE NOCASE').get(showFolderPath, title);
        if (existingShow) {
          showId = existingShow.id;
          tmdbId = existingShow.tmdb_id;
          
          // Update tmdb_status if missing
          if (tmdbId) {
            try {
              const currentStatus = db.prepare('SELECT tmdb_status FROM shows WHERE id = ?').get(showId);
              if (!currentStatus?.tmdb_status) {
                const fullShow = await tmdbService.getShowById(tmdbId);
                if (fullShow?.status) {
                  db.prepare('UPDATE shows SET tmdb_status = ? WHERE id = ?').run(fullShow.status, showId);
                }
              }
            } catch { /* non-critical */ }
          }

          // Ensure we fetch episodes if they were missed in a previous scan
          const epCount = db.prepare('SELECT COUNT(*) as count FROM episodes WHERE show_id = ?').get(showId).count;
          if (epCount === 0 && tmdbId) {
            try {
              const seasons = await tmdbService.getShowSeasons(tmdbId);
              const insertEp = db.prepare(`
                INSERT INTO episodes (show_id, season_number, episode_number, title, overview, status, air_date, monitored)
                VALUES (?, ?, ?, ?, ?, 'missing', ?, 0)
                ON CONFLICT(show_id, season_number, episode_number) DO NOTHING
              `);
              
              for (const s of seasons) {
                if (s.season_number === 0) continue;
                const eps = await tmdbService.getSeasonEpisodes(tmdbId, s.season_number);
                for (const ep of eps) {
                  insertEp.run(showId, ep.season_number, ep.episode_number, ep.name, ep.overview, ep.air_date);
                }
              }
            } catch (epErr) {
              console.error(`Failed to backfill episodes for show ${title}:`, epErr.message);
            }
          }
        } else {
          try {
            const results = await tmdbService.searchShows(title);
            if (results.length === 0) {
              scanProgress.skippedCount++;
              scanProgress.skippedFiles.push({ name: file.name, reason: `TMDB search returned no results for show "${title}"`, path: file.path });
              scanProgress.failedShows.push({ title, reason: 'TMDB search returned no results', file: file.name, path: file.path });
            }
            if (results.length > 0) {
              const matchedShow = results[0];
              tmdbId = matchedShow.id;
              
              const existingMonitored = db.prepare('SELECT id, tmdb_id, folder_size FROM shows WHERE tmdb_id = ?').get(tmdbId);
              
              const showRating = matchedShow.vote_average || 0;
              let showId = existingMonitored ? existingMonitored.id : null;

              // Fetch full TMDB details for status and accurate data
              let fullShow = null;
              try {
                fullShow = await tmdbService.getShowById(tmdbId);
              } catch { /* keep matchedShow data */ }
              const tmdbStatus = fullShow?.status || '';

              if (existingMonitored) {
                db.prepare('UPDATE shows SET folder_path = ?, status = ?, rating = ?, tmdb_status = ? WHERE tmdb_id = ?').run(showFolderPath, 'downloaded', showRating, tmdbStatus, tmdbId);
                if (matchedShow.poster_path) await imageService.ensurePoster('shows', tmdbId, matchedShow.poster_path).catch(err => console.error(`[Scanner] Poster fetch failed for show ${tmdbId}:`, err.message));
              } else {
                // Only calculate folder size for truly new shows (one-time cost per show)
                let folderSize = 0;
                try {
                  const getSize = async (dir) => {
                    let total = 0;
                    const entries = await fs.readdir(dir, { withFileTypes: true });
                    for (const entry of entries) {
                      const entryPath = path.join(dir, entry.name);
                      if (entry.isDirectory()) {
                        total += await getSize(entryPath);
                      } else if (isVideoFile(entry.name)) {
                        const stat = await fs.stat(entryPath);
                        total += stat.size;
                      }
                    }
                    return total;
                  };
                  folderSize = await getSize(showFolderPath);
                } catch {
                  // Folder might not exist yet
                }

                const showYear = matchedShow.first_air_date ? parseInt(matchedShow.first_air_date.split('-')[0]) : null;

                // Default quality profile for shows (filter by media_type)
                const defaultProfile = db.prepare("SELECT id FROM quality_profiles WHERE media_type IN ('shows', 'both') OR media_type IS NULL ORDER BY id ASC LIMIT 1").get();
                const defaultProfileId = defaultProfile?.id || null;

                const insertRes = db.prepare(`
                  INSERT INTO shows (tmdb_id, title, year, poster_path, overview, status, folder_path, rating, folder_size, quality_profile_id, tmdb_status)
                  VALUES (?, ?, ?, ?, ?, 'downloaded', ?, ?, ?, ?, ?)
                `).run(
                  matchedShow.id,
                  matchedShow.name,
                  showYear,
                  matchedShow.poster_path,
                  matchedShow.overview,
                  showFolderPath,
                  showRating,
                  folderSize,
                  defaultProfileId,
                  tmdbStatus
                );
                showId = insertRes.lastInsertRowid;
                if (matchedShow.poster_path) await imageService.ensurePoster('shows', matchedShow.id, matchedShow.poster_path).catch(err => console.error(`[Scanner] Poster fetch failed for show ${matchedShow.id}:`, err.message));

                
                // Synchronously fetch and insert episodes for the newly discovered show
                let episodeCount = 0;
                try {
                  const seasons = await tmdbService.getShowSeasons(tmdbId);
                  const insertEp = db.prepare(`
                    INSERT INTO episodes (show_id, season_number, episode_number, title, overview, status, air_date, monitored)
                    VALUES (?, ?, ?, ?, ?, 'missing', ?, 0)
                    ON CONFLICT(show_id, season_number, episode_number) DO NOTHING
                  `);
                  
                  for (const s of seasons) {
                    if (s.season_number === 0) continue;
                    const eps = await tmdbService.getSeasonEpisodes(tmdbId, s.season_number);
                    for (const ep of eps) {
                      insertEp.run(showId, ep.season_number, ep.episode_number, ep.name, ep.overview, ep.air_date);
                      episodeCount++;
                    }
                  }
                } catch (epErr) {
                  console.error(`Failed to fetch episodes for show ${title}:`, epErr.message);
                }
                scanProgress.addedEpisodesCount += episodeCount;
              }
              scanProgress.addedShowsCount++;
              scanProgress.addedShows.push({ title: matchedShow.name });
            }
            // Apply Trakt watched status
            if (tmdbId) {
              try {
                if (isWatchedSyncEnabled()) {
                  db.prepare("UPDATE shows SET watched = 1 WHERE tmdb_id = ? AND EXISTS (SELECT 1 FROM watched_tmdb WHERE tmdb_id = ? AND type = 'show')").run(tmdbId, tmdbId);
                }
              } catch { /* non-critical */ }
            }
          } catch (tmdbErr) {
            console.error(`TMDB error for show ${title}:`, tmdbErr.message);
            scanProgress.failedShows.push({ title, reason: `TMDB error: ${tmdbErr.message}`, file: file.name, path: file.path });
          }
        }
        
        // Link the episode(s) to the file
        if (showId && seasonNumber !== undefined && episodeNumber !== undefined) {
          let fileSize = 0;
          try {
            const stat = await fs.stat(fullPath);
            fileSize = stat.size;
          } catch {
            // ignore
          }
          // Detect resolution, codec & audio for the episode
          let resolution = parseResolution(file.name);
          let codec = parseCodec(file.name);
          let audio = parseAudioFromFileName(file.name);
          let resName = resolution !== 'Unknown' ? file.name : null;

          try {
            if (resolution === 'Unknown' || codec === 'Unknown' || !audio) {
              const meta = await getMediaMetadata(fullPath);
              if (resolution === 'Unknown') {
                resolution = meta.resolution;
                if (resolution) resName = 'Unknown ' + resolution;
              }
              if (codec === 'Unknown') {
                codec = meta.codec;
              }
              if (!audio) {
                audio = meta.audio;
              }
            }
          } catch { /* ignore */ }

          const lastEp = episodeEnd || episodeNumber;
          for (let ep = episodeNumber; ep <= lastEp; ep++) {
            db.prepare(`
              INSERT OR IGNORE INTO episodes (show_id, season_number, episode_number, title, overview, status, air_date, monitored)
              VALUES (?, ?, ?, ?, ?, 'missing', NULL, 0)
            `).run(showId, seasonNumber, ep, file.name, '');

            db.prepare(`
              UPDATE episodes 
              SET file_path = ?, status = 'downloaded', file_size = ?, scene_name = ?, resolution = ?, codec = ?, audio = ?
              WHERE show_id = ? AND season_number = ? AND episode_number = ?
            `).run(fullPath, fileSize, resName, resolution, codec, audio, showId, seasonNumber, ep);
          }
          // Scan for subtitle files in the episode's directory (only for first episode)
          const epLangs = await scanSubtitleLangs(fullPath);
          if (epLangs.length > 0) {
            for (let ep = episodeNumber; ep <= lastEp; ep++) {
              db.prepare('UPDATE episodes SET subtitles = ? WHERE show_id = ? AND season_number = ? AND episode_number = ?')
                .run(JSON.stringify(epLangs), showId, seasonNumber, ep);
            }
          }
        }

      } else {
        // Movie logic
        const existingMovie = db.prepare('SELECT id, tmdb_id FROM movies WHERE file_path = ?').get(fullPath);
        if (existingMovie && mode !== 'rematch') {
          scanProgress.skippedCount++;
          scanProgress.skippedFiles.push({ name: file.name, reason: 'Already in library with this file path', path: file.path });
          continue;
        }

        try {
          // Search by title only — TMDB treats year-in-query as literal text; our scoring handles year matching
          const searchQuery = title;
          const results = await tmdbService.searchMovies(searchQuery);
          console.log(`[Scanner] TMDB search: "${searchQuery}" → ${results.length} results${results.length > 0 ? ': ' + results.slice(0, 3).map(r => `${r.title || r.name} (${r.release_date ? r.release_date.split('-')[0] : '?'})`).join(', ') : ''}`);
          let matchedMovie = null;
          if (results.length > 0) {
            if (year) {
              // Score results by title relevance + year proximity
              const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const titleNorm = normalize(title);
              const titleWords = titleNorm.split(/\s+/).filter(Boolean);

              let bestScore = -1;
              for (const r of results) {
                const rTitle = normalize(r.title || r.name || '');
                let score = 0;

                // Title match scoring
                if (rTitle === titleNorm) {
                  score += 100;
                } else if (rTitle.includes(titleNorm) || titleNorm.includes(rTitle)) {
                  score += 50;
                } else {
                  // Word-level matching: count how many title words appear in the result
                  const rWords = new Set(rTitle.split(/\s+/));
                  const matchedWords = titleWords.filter(w => rWords.has(w));
                  score += matchedWords.length * 10;
                }

                // Year proximity scoring
                if (r.release_date) {
                  const rYear = parseInt(r.release_date.split('-')[0]);
                  if (rYear === year) score += 30;
                  else if (Math.abs(rYear - year) === 1) score += 20;
                  else if (Math.abs(rYear - year) <= 2) score += 10;
                }

                if (score > bestScore) {
                  bestScore = score;
                  matchedMovie = r;
                }
              }
            }
            // Only fall back to first result if no year was available
            if (!matchedMovie && !year) matchedMovie = results[0];
          }

          if (!matchedMovie) {
            const reason = results.length === 0
              ? `TMDB search returned no results for "${searchQuery}"`
              : `TMDB search returned ${results.length} results for "${searchQuery}" but none matched (year: ${year}, title: "${title}")`;
            console.warn(`[Scanner] ${reason}`);
            scanProgress.skippedCount++;
            scanProgress.skippedFiles.push({ name: file.name, reason, path: file.path });
            scanProgress.failedMovies.push({ title, year, reason, file: file.name, path: file.path });
          }

          if (matchedMovie) {
            const movieYear = matchedMovie.release_date ? parseInt(matchedMovie.release_date.split('-')[0]) : year;
            const movieRating = matchedMovie.vote_average || 0;

            // Get file size
            let fileSize = 0;
            try {
              const stat = await fs.stat(fullPath);
              fileSize = stat.size;
            } catch {
              // File might not exist yet
            }

            // Look up default quality profile (filter by media_type for movies)
            const defaultProfile = db.prepare("SELECT id FROM quality_profiles WHERE media_type IN ('movies', 'both') OR media_type IS NULL ORDER BY id ASC LIMIT 1").get();
            const defaultProfileId = defaultProfile?.id || null;

            const existingMonitored = db.prepare('SELECT id FROM movies WHERE tmdb_id = ?').get(matchedMovie.id);
            
            if (existingMonitored) {
              // Assign default profile if the movie doesn't already have one
              db.prepare('UPDATE movies SET file_path = ?, status = ?, rating = ?, file_size = ?, quality_profile_id = COALESCE(quality_profile_id, ?) WHERE tmdb_id = ?')
                .run(fullPath, 'downloaded', movieRating, fileSize, defaultProfileId, matchedMovie.id);
              if (matchedMovie.poster_path) await imageService.ensurePoster('movies', matchedMovie.id, matchedMovie.poster_path).catch(err => console.error(`[Scanner] Poster fetch failed for movie ${matchedMovie.id}:`, err.message));

            } else if (mode === 'rematch' && existingMovie) {
              // Re-match: update the existing record with the corrected TMDB match
              db.prepare('UPDATE movies SET tmdb_id = ?, title = ?, year = ?, poster_path = ?, overview = ?, status = ?, file_path = ?, rating = ?, file_size = ?, release_date = ? WHERE id = ?')
                .run(matchedMovie.id, matchedMovie.title, movieYear, matchedMovie.poster_path, matchedMovie.overview, 'downloaded', fullPath, movieRating, fileSize, matchedMovie.release_date || null, existingMovie.id);
              if (matchedMovie.poster_path) await imageService.ensurePoster('movies', matchedMovie.id, matchedMovie.poster_path).catch(err => console.error(`[Scanner] Poster fetch failed for movie ${matchedMovie.id}:`, err.message));

              scanProgress.addedMoviesCount++;
              scanProgress.addedMovies.push({ title: matchedMovie.title, year: movieYear });
            } else {
              db.prepare(`
                INSERT INTO movies (tmdb_id, title, year, poster_path, overview, status, file_path, rating, file_size, quality_profile_id, release_date)
                VALUES (?, ?, ?, ?, ?, 'downloaded', ?, ?, ?, ?, ?)
              `).run(
                matchedMovie.id,
                matchedMovie.title,
                movieYear,
                matchedMovie.poster_path,
                matchedMovie.overview,
                fullPath,
                movieRating,
                fileSize,
                defaultProfileId,
                matchedMovie.release_date || null
              );
              scanProgress.addedMoviesCount++;
              if (matchedMovie.poster_path) await imageService.ensurePoster('movies', matchedMovie.id, matchedMovie.poster_path).catch(err => console.error(`[Scanner] Poster fetch failed for movie ${matchedMovie.id}:`, err.message));
              scanProgress.addedMovies.push({ title: matchedMovie.title, year: movieYear });
            }
            // Apply Trakt watched status if this TMDB ID was already marked as watched
            try {
              if (isWatchedSyncEnabled()) {
                db.prepare("UPDATE movies SET watched = 1 WHERE tmdb_id = ? AND EXISTS (SELECT 1 FROM watched_tmdb WHERE tmdb_id = ? AND type = 'movie')").run(matchedMovie.id, matchedMovie.id);
              }
            } catch { /* non-critical */ }
            // Detect and store resolution, codec & audio — file name first, ffprobe as fallback
            try {
              let resolution = parseResolution(file.name);
              let codec = parseCodec(file.name);
              let audio = parseAudioFromFileName(file.name);

              if (resolution === 'Unknown' || codec === 'Unknown' || !audio) {
                const meta = await getMediaMetadata(fullPath);
                if (resolution === 'Unknown') resolution = meta.resolution;
                if (codec === 'Unknown') codec = meta.codec;
                if (!audio) audio = meta.audio;
              }

              db.prepare('UPDATE movies SET resolution = ?, codec = ?, audio = ?, scene_name = COALESCE(NULLIF(scene_name, \'\'), ?) WHERE tmdb_id = ?')
                .run(resolution || null, codec || null, audio || null, 'Unknown ' + (resolution || '1080p'), matchedMovie.id);
            } catch { /* ignore */ }
            // Scan for subtitle files in the movie's directory
            const movieLangs = await scanSubtitleLangs(fullPath);
            if (movieLangs.length > 0) {
              const movieId = existingMonitored?.id || db.prepare('SELECT id FROM movies WHERE tmdb_id = ?').get(matchedMovie.id)?.id;
              if (movieId) {
                db.prepare('UPDATE movies SET subtitles = ? WHERE id = ?').run(JSON.stringify(movieLangs), movieId);
              }
            }
          }
        } catch (tmdbErr) {
          console.error(`TMDB error for movie ${title}:`, tmdbErr.message);
          scanProgress.failedMovies.push({ title, year, reason: `TMDB error: ${tmdbErr.message}`, file: file.name, path: file.path });
        }
      }
      scanProgress.processedFiles++;
    }
};

module.exports = { processScannedFiles };
