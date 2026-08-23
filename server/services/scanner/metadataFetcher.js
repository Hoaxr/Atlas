const fs = require('fs/promises');
const path = require('path');
const db = require('../../config/database');
const tmdbService = require('../tmdbService');
const imageService = require('../imageService');
const { getMediaMetadata, parseAudioFromFileName } = require('../../utils/videoUtils');
const { parseResolution, parseCodec } = require('../../utils/mediaParsing');
const { isWatchedSyncEnabled } = require('../../utils/settings');
const { parseMediaTitle, scanSubtitleLangs } = require('./fileScanner');
const { isVideoFile, SUBTITLE_EXTENSIONS } = require('../../utils/fileUtils');
const { getNamingConfig, sanitizeTitle } = require('../mediaManagementService');

// Concurrency limiter helper
const runWithConcurrency = async (items, concurrency, workerFn, scanProgress) => {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      if (scanProgress?.cancelled) throw new Error('Scan cancelled by user');
      const currentIndex = index++;
      await workerFn(items[currentIndex]);
    }
  });
  await Promise.all(workers);
};

// Rename subtitle files that share the video's old base name so they keep
// matching the renamed video file (e.g. "Movie.en.srt" -> "Movie (2020).en.srt").
const renameMatchingSubtitles = async (dir, oldBase, newBase) => {
  if (oldBase === newBase) return;
  try {
    const items = await fs.readdir(dir);
    for (const item of items) {
      if (!SUBTITLE_EXTENSIONS.includes(path.extname(item).toLowerCase())) continue;
      if (!item.toLowerCase().startsWith(oldBase.toLowerCase())) continue;
      const suffix = item.slice(oldBase.length);
      const newName = `${newBase}${suffix}`;
      if (newName === item) continue;
      try {
        await fs.rename(path.join(dir, item), path.join(dir, newName));
        console.log(`[Scanner] Renamed subtitle "${item}" -> "${newName}"`);
      } catch (err) {
        console.warn(`[Scanner] Failed to rename subtitle "${item}": ${err.message}`);
      }
    }
  } catch { /* ignore */ }
};

// Rename a scanned video file in place to the configured naming format.
// Returns the (possibly new) full path.
const renameToNamingFormat = async (fullPath, { type, title, year, season, episode, episodeEnd, episodeTitle }) => {
  const config = getNamingConfig();
  const dir = path.dirname(fullPath);
  const ext = path.extname(fullPath);
  const currentBase = path.basename(fullPath, ext);

  let targetBase;
  if (type === 'movie') {
    if (!config.renameMovies) return fullPath;
    let format = config.standardMovieFormat || '{Movie Title} ({Release Year})';
    format = format.replace('{Movie Title}', sanitizeTitle(title || '', config));
    format = format.replace('{Release Year}', year ? String(year) : '');
    targetBase = format;
  } else {
    if (!config.renameEpisodes) return fullPath;
    const s = String(season).padStart(2, '0');
    const e = String(episode).padStart(2, '0');
    let format = config.standardEpisodeFormat || '{Show Title} - S{Season}E{Episode} - {Episode Title}';
    format = format.replace('{Show Title}', sanitizeTitle(title || '', config));
    format = format.replace('{Season}', s);
    format = format.replace('{Episode}', (episodeEnd && episodeEnd > episode) ? `${e}-E${String(episodeEnd).padStart(2, '0')}` : e);
    format = format.replace('{Episode Title}', sanitizeTitle(episodeTitle || '', config));
    targetBase = format;
  }

  // Strip any illegal characters introduced by the format itself
  targetBase = targetBase.replace(/[<>"/\\|?*]/g, '').trim().replace(/\s+/g, ' ');
  if (!targetBase || targetBase === currentBase) return fullPath;

  const newPath = path.join(dir, `${targetBase}${ext}`);
  try {
    await fs.access(newPath);
    console.warn(`[Scanner] Skipping rename — target already exists: ${newPath}`);
    return fullPath;
  } catch { /* target does not exist, safe to rename */ }

  try {
    await fs.rename(fullPath, newPath);
    console.log(`[Scanner] Renamed "${currentBase}${ext}" -> "${targetBase}${ext}"`);
    await renameMatchingSubtitles(dir, currentBase, targetBase);
    return newPath;
  } catch (err) {
    console.warn(`[Scanner] Failed to rename "${fullPath}": ${err.message}`);
    return fullPath;
  }
};

const processScannedFiles = async (allFiles, scanProgress, mode, nextStage) => {
  nextStage('Processing files...');
  scanProgress.totalFiles = allFiles.length;

  const processFile = async (file) => {
    if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
    scanProgress.currentFile = file.name;
    
    const fileDir = file.parentPath || file.path;
    let fullPath = path.join(fileDir, file.name);
    const { title, year, isShow, seasonNumber, episodeNumber, episodeEnd, tmdbId: explicitTmdbId, imdbId: explicitImdbId } = parseMediaTitle(file.name, fileDir, file.showContext);

    if (!title && !explicitTmdbId && !explicitImdbId) {
      scanProgress.skippedCount++;
      scanProgress.skippedFiles.push({ name: file.name, reason: 'Could not parse title from filename', path: file.path });
      scanProgress.processedFiles++;
      return;
    }

    if (isShow && !episodeNumber) {
      scanProgress.skippedCount++;
      scanProgress.skippedFiles.push({ name: file.name, reason: 'no episode number detected', path: file.path });
      scanProgress.processedFiles++;
      return;
    }

    if (isShow) {
      // ──────────────────────────────────────────────
      // TV Show logic
      // ──────────────────────────────────────────────
      let showFolderPath = fileDir;
      // Strip season/specials subfolder — walk up until we're at the actual show directory
      while (path.basename(showFolderPath).match(/(?:season\s*\d+|specials)/i)) {
        showFolderPath = path.dirname(showFolderPath);
      }

      let showId = null;
      let tmdbId = null;

      let existingShow = null;
      if (year) {
        existingShow = db.prepare('SELECT id, tmdb_id FROM shows WHERE folder_path = ? OR (tmdb_id IS NOT NULL AND tmdb_id = ?) OR (title = ? COLLATE NOCASE AND year = ?)').get(showFolderPath, explicitTmdbId || -1, title, year);
      }
      if (!existingShow) {
        existingShow = db.prepare('SELECT id, tmdb_id FROM shows WHERE folder_path = ? OR (tmdb_id IS NOT NULL AND tmdb_id = ?) OR title = ? COLLATE NOCASE').get(showFolderPath, explicitTmdbId || -1, title);
      }

      if (existingShow) {
        showId = existingShow.id;
        tmdbId = existingShow.tmdb_id;

        // Keep folder_path in sync if the show moved
        const currentFolder = db.prepare('SELECT folder_path FROM shows WHERE id = ?').get(showId)?.folder_path;
        if (currentFolder && currentFolder !== showFolderPath) {
          db.prepare('UPDATE shows SET folder_path = ? WHERE id = ?').run(showFolderPath, showId);
        }

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
              INSERT INTO episodes (show_id, season_number, episode_number, title, overview, status, air_date, monitored, runtime)
              VALUES (?, ?, ?, ?, ?, 'missing', ?, 1, ?)
              ON CONFLICT(show_id, season_number, episode_number) DO NOTHING
            `);
            
            for (const s of seasons) {
              const eps = await tmdbService.getSeasonEpisodes(tmdbId, s.season_number);
              for (const ep of eps) {
                insertEp.run(showId, ep.season_number, ep.episode_number, ep.name, ep.overview, ep.air_date, ep.runtime || null);
              }
            }
          } catch (epErr) {
            console.error(`Failed to backfill episodes for show ${title}:`, epErr.message);
          }
        }
      } else {
        try {
          let matchedShow = null;

          // 1. Direct TMDB ID lookup
          if (explicitTmdbId) {
            const fullShow = await tmdbService.getShowById(explicitTmdbId);
            if (fullShow) matchedShow = fullShow;
          }

          // 2. Direct IMDb ID lookup
          if (!matchedShow && explicitImdbId) {
            const imdbResults = await tmdbService.searchShows(`imdb:${explicitImdbId}`);
            if (imdbResults && imdbResults.length > 0) matchedShow = imdbResults[0];
          }

          // 3. Fallback: Search by title & year with smart ranking
          if (!matchedShow && title) {
            const results = await tmdbService.searchShows(title, year);
            if (results.length > 0) {
              matchedShow = [...results].sort((a, b) => {
                const aNameMatch = (a.name || '').toLowerCase() === title.toLowerCase();
                const bNameMatch = (b.name || '').toLowerCase() === title.toLowerCase();
                if (aNameMatch && !bNameMatch) return -1;
                if (!aNameMatch && bNameMatch) return 1;

                if (year) {
                  const aYearMatch = a.first_air_date && a.first_air_date.startsWith(String(year));
                  const bYearMatch = b.first_air_date && b.first_air_date.startsWith(String(year));
                  if (aYearMatch && !bYearMatch) return -1;
                  if (!aYearMatch && bYearMatch) return 1;
                }

                return (b.vote_count || 0) - (a.vote_count || 0);
              })[0];
            }
          }

          if (!matchedShow) {
            scanProgress.skippedCount++;
            scanProgress.skippedFiles.push({ name: file.name, reason: `TMDB search returned no results for show "${title}"`, path: file.path });
            scanProgress.failedShows.push({ title, reason: 'TMDB search returned no results', file: file.name, path: file.path });
          } else {
            tmdbId = matchedShow.id;
            
          const existingMonitored = db.prepare('SELECT id, tmdb_id, folder_size FROM shows WHERE tmdb_id = ?').get(tmdbId);
          const showRating = matchedShow.vote_average || 0;
          showId = existingMonitored ? existingMonitored.id : null;
          let racedDuplicate = false;

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
              // Calculate folder size for newly discovered show
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

              const showYear = matchedShow.first_air_date ? parseInt(matchedShow.first_air_date.split('-')[0], 10) : year;
              const defaultProfile = db.prepare("SELECT id FROM quality_profiles WHERE media_type IN ('shows', 'both') OR media_type IS NULL ORDER BY id ASC LIMIT 1").get();
              const defaultProfileId = defaultProfile?.id || null;

              const showRuntime = fullShow?.episode_run_time?.length
                ? Math.round(fullShow.episode_run_time.reduce((a, b) => a + b, 0) / fullShow.episode_run_time.length)
                : null;

              try {
                const insertRes = db.prepare(`
                  INSERT INTO shows (tmdb_id, title, year, poster_path, overview, status, folder_path, rating, folder_size, quality_profile_id, tmdb_status, runtime)
                  VALUES (?, ?, ?, ?, ?, 'downloaded', ?, ?, ?, ?, ?, ?)
                `).run(
                  matchedShow.id,
                  matchedShow.name || matchedShow.title,
                  showYear,
                  matchedShow.poster_path,
                  matchedShow.overview,
                  showFolderPath,
                  showRating,
                  folderSize,
                  defaultProfileId,
                  tmdbStatus,
                  showRuntime
                );
                showId = insertRes.lastInsertRowid;
              } catch (insertErr) {
                if (!String(insertErr.code || '').startsWith('SQLITE_CONSTRAINT')) throw insertErr;
                const dupRow = db.prepare('SELECT id FROM shows WHERE tmdb_id = ?').get(matchedShow.id);
                if (!dupRow) throw insertErr;
                showId = dupRow.id;
                racedDuplicate = true;
              }
              if (!racedDuplicate) {
              if (matchedShow.poster_path) await imageService.ensurePoster('shows', matchedShow.id, matchedShow.poster_path).catch(err => console.error(`[Scanner] Poster fetch failed for show ${matchedShow.id}:`, err.message));

              // Synchronously fetch and insert episodes for the newly discovered show
              let episodeCount = 0;
              try {
                const seasons = await tmdbService.getShowSeasons(tmdbId);
                const insertEp = db.prepare(`
                  INSERT INTO episodes (show_id, season_number, episode_number, title, overview, status, air_date, monitored, runtime)
                  VALUES (?, ?, ?, ?, ?, 'missing', ?, 1, ?)
                  ON CONFLICT(show_id, season_number, episode_number) DO NOTHING
                `);
                
                for (const s of seasons) {
                  const eps = await tmdbService.getSeasonEpisodes(tmdbId, s.season_number);
                  for (const ep of eps) {
                    insertEp.run(showId, ep.season_number, ep.episode_number, ep.name, ep.overview, ep.air_date, ep.runtime || null);
                    episodeCount++;
                  }
                }
              } catch (epErr) {
                console.error(`Failed to fetch episodes for show ${title}:`, epErr.message);
              }
              scanProgress.addedEpisodesCount += episodeCount;
              }
            }
            if (!racedDuplicate) {
            scanProgress.addedShowsCount++;
            scanProgress.addedShows.push({ title: matchedShow.name || matchedShow.title });
            }
          }

          // Apply Simkl watched status
          if (tmdbId) {
            try {
              if (isWatchedSyncEnabled()) {
                db.prepare("UPDATE shows SET watched = 1 WHERE tmdb_id = ? AND EXISTS (SELECT 1 FROM watched_tmdb WHERE tmdb_id = ? AND type = 'show')").run(tmdbId, tmdbId);
              }
              db.prepare(`
                UPDATE episodes
                SET watched = 1,
                    watched_at = COALESCE(episodes.watched_at, (
                      SELECT w.watched_at 
                      FROM watch_history w 
                      JOIN shows s ON s.tmdb_id = w.tmdb_id
                      WHERE s.id = episodes.show_id 
                        AND (
                          (w.type = 'episode' AND w.season_number = episodes.season_number AND w.episode_number = episodes.episode_number)
                          OR (w.type = 'show')
                        )
                      LIMIT 1
                    ))
                WHERE show_id = ? AND watched = 0 AND EXISTS (
                  SELECT 1 
                  FROM watch_history w 
                  JOIN shows s ON s.tmdb_id = w.tmdb_id
                  WHERE s.id = episodes.show_id 
                    AND (
                      (w.type = 'episode' AND w.season_number = episodes.season_number AND w.episode_number = episodes.episode_number)
                      OR (w.type = 'show')
                    )
                )
              `).run(showId);
            } catch { /* non-critical */ }
          }
        } catch (tmdbErr) {
          // A duplicate-show race means another worker already created the row
          // and linked its file — not a failure worth reporting.
          if (/UNIQUE constraint failed: shows\.tmdb_id/.test(tmdbErr.message)) {
            console.log(`[Scanner] Show "${title}" already exists (created concurrently) — linking skipped`);
            return;
          }
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
        } catch { /* ignore */ }

        // Rename to the configured naming format (in place)
        const showRow = db.prepare('SELECT title FROM shows WHERE id = ?').get(showId);
        const epTitleRow = db.prepare('SELECT title FROM episodes WHERE show_id = ? AND season_number = ? AND episode_number = ?').get(showId, seasonNumber, episodeNumber);
        const renamedPath = await renameToNamingFormat(fullPath, {
          type: 'episode',
          title: showRow?.title || title,
          season: seasonNumber,
          episode: episodeNumber,
          episodeEnd,
          episodeTitle: epTitleRow?.title,
        });
        if (renamedPath !== fullPath) fullPath = renamedPath;

        // Fast-path: Check if already probed in DB
        const existingEp = db.prepare(`
          SELECT resolution, codec, audio, subtitles, file_size 
          FROM episodes 
          WHERE show_id = ? AND season_number = ? AND episode_number = ? AND file_path = ?
        `).get(showId, seasonNumber, episodeNumber, fullPath);

        let resolution = parseResolution(file.name);
        let codec = parseCodec(file.name);
        let audio = parseAudioFromFileName(file.name);
        let resName = resolution !== 'Unknown' ? file.name : null;
        let allSubtitles = [];

        if (existingEp && existingEp.file_size === fileSize && existingEp.resolution && existingEp.codec && existingEp.resolution !== 'Unknown') {
          // Fast-path reuse
          resolution = existingEp.resolution;
          codec = existingEp.codec;
          audio = existingEp.audio || audio;
          resName = null;
        } else {
          // Probe file
          try {
            if (resolution === 'Unknown' || codec === 'Unknown' || !audio) {
              const meta = await getMediaMetadata(fullPath);
              if (resolution === 'Unknown' && meta.resolution) {
                resolution = meta.resolution;
                resName = null;
              }
              if (codec === 'Unknown' && meta.codec) {
                codec = meta.codec;
              }
              if (!audio && meta.audio) {
                audio = meta.audio;
              }
              if (meta.embeddedSubtitles && meta.embeddedSubtitles.length > 0) {
                allSubtitles.push(...meta.embeddedSubtitles);
              }
            }
          } catch { /* ignore */ }

          // Merge external .srt subtitles
          try {
            const epLangs = await scanSubtitleLangs(fullPath);
            if (epLangs && epLangs.length > 0) {
              allSubtitles.push(...epLangs);
            }
          } catch { /* ignore */ }
        }

        allSubtitles = [...new Set(allSubtitles)];

        const lastEp = episodeEnd || episodeNumber;
        for (let ep = episodeNumber; ep <= lastEp; ep++) {
          db.prepare(`
            INSERT OR IGNORE INTO episodes (show_id, season_number, episode_number, title, overview, status, air_date, monitored)
            VALUES (?, ?, ?, ?, ?, 'missing', NULL, 1)
          `).run(showId, seasonNumber, ep, file.name, '');

          db.prepare(`
            UPDATE episodes 
            SET file_path = ?, status = 'downloaded', file_size = ?, scene_name = ?, resolution = ?, codec = ?, audio = ?
            WHERE show_id = ? AND season_number = ? AND episode_number = ?
          `).run(fullPath, fileSize, resName, resolution, codec, audio, showId, seasonNumber, ep);

          if (allSubtitles.length > 0) {
            db.prepare('UPDATE episodes SET subtitles = ? WHERE show_id = ? AND season_number = ? AND episode_number = ?')
              .run(JSON.stringify(allSubtitles), showId, seasonNumber, ep);
          }
        }
      }

    } else {
      // ──────────────────────────────────────────────
      // Movie logic
      // ──────────────────────────────────────────────
      const existingMovie = db.prepare('SELECT id, tmdb_id, resolution, codec, audio, file_size FROM movies WHERE file_path = ?').get(fullPath);
      if (existingMovie && mode !== 'rematch') {
        scanProgress.skippedCount++;
        scanProgress.skippedFiles.push({ name: file.name, reason: 'Already in library with this file path', path: file.path });
        scanProgress.processedFiles++;
        return;
      }

      try {
        let matchedMovie = null;

        // 1. Direct TMDB ID lookup
        if (explicitTmdbId) {
          const fullMovie = await tmdbService.getMovieById(explicitTmdbId);
          if (fullMovie) matchedMovie = fullMovie;
        }

        // 2. Direct IMDb ID lookup
        if (!matchedMovie && explicitImdbId) {
          const imdbResults = await tmdbService.searchMovies(`imdb:${explicitImdbId}`);
          if (imdbResults && imdbResults.length > 0) matchedMovie = imdbResults[0];
        }

        // 3. Fallback: Search by title & year with relevance scoring
        if (!matchedMovie && title) {
          const results = await tmdbService.searchMovies(title);
          if (results.length > 0) {
            if (year) {
              const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const titleNorm = normalize(title);
              const titleWords = titleNorm.split(/\s+/).filter(Boolean);

              let bestScore = -1;
              for (const r of results) {
                const rTitle = normalize(r.title || r.name || '');
                let score = 0;

                if (rTitle === titleNorm) {
                  score += 100;
                } else if (rTitle.includes(titleNorm) || titleNorm.includes(rTitle)) {
                  score += 50;
                } else {
                  const rWords = new Set(rTitle.split(/\s+/));
                  const matchedWords = titleWords.filter(w => rWords.has(w));
                  score += matchedWords.length * 10;
                }

                if (r.release_date) {
                  const rYear = parseInt(r.release_date.split('-')[0], 10);
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
            if (!matchedMovie && !year) matchedMovie = results[0];
          }
        }

        if (!matchedMovie) {
          const reason = `TMDB search returned no match for movie (title: "${title}", year: ${year})`;
          scanProgress.skippedCount++;
          scanProgress.skippedFiles.push({ name: file.name, reason, path: file.path });
          scanProgress.failedMovies.push({ title, year, reason, file: file.name, path: file.path });
        } else {
          const movieYear = matchedMovie.release_date ? parseInt(matchedMovie.release_date.split('-')[0], 10) : year;
          const movieRating = matchedMovie.vote_average || 0;

          let fileSize = 0;
          try {
            const stat = await fs.stat(fullPath);
            fileSize = stat.size;
          } catch { /* ignore */ }

          // Rename to the configured naming format (in place)
          const renamedPath = await renameToNamingFormat(fullPath, {
            type: 'movie',
            title: matchedMovie.title,
            year: movieYear,
          });
          if (renamedPath !== fullPath) fullPath = renamedPath;

          const defaultProfile = db.prepare("SELECT id FROM quality_profiles WHERE media_type IN ('movies', 'both') OR media_type IS NULL ORDER BY id ASC LIMIT 1").get();
          const defaultProfileId = defaultProfile?.id || null;

          const existingMonitored = db.prepare('SELECT id FROM movies WHERE tmdb_id = ?').get(matchedMovie.id);
          
          if (existingMonitored) {
            db.prepare('UPDATE movies SET file_path = ?, status = ?, rating = ?, file_size = ?, quality_profile_id = COALESCE(quality_profile_id, ?) WHERE tmdb_id = ?')
              .run(fullPath, 'downloaded', movieRating, fileSize, defaultProfileId, matchedMovie.id);
            if (matchedMovie.poster_path) await imageService.ensurePoster('movies', matchedMovie.id, matchedMovie.poster_path).catch(err => console.error(`[Scanner] Poster fetch failed for movie ${matchedMovie.id}:`, err.message));
          } else if (mode === 'rematch' && existingMovie) {
            db.prepare('UPDATE movies SET tmdb_id = ?, title = ?, year = ?, poster_path = ?, overview = ?, status = ?, file_path = ?, rating = ?, file_size = ?, release_date = ? WHERE id = ?')
              .run(matchedMovie.id, matchedMovie.title, movieYear, matchedMovie.poster_path, matchedMovie.overview, 'downloaded', fullPath, movieRating, fileSize, matchedMovie.release_date || null, existingMovie.id);
            if (matchedMovie.poster_path) await imageService.ensurePoster('movies', matchedMovie.id, matchedMovie.poster_path).catch(err => console.error(`[Scanner] Poster fetch failed for movie ${matchedMovie.id}:`, err.message));

            scanProgress.addedMoviesCount++;
            scanProgress.addedMovies.push({ title: matchedMovie.title, year: movieYear });
          } else {
            try {
              db.prepare(`
                INSERT INTO movies (tmdb_id, title, year, poster_path, overview, status, file_path, rating, file_size, quality_profile_id, release_date, runtime)
                VALUES (?, ?, ?, ?, ?, 'downloaded', ?, ?, ?, ?, ?, ?)
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
                matchedMovie.release_date || null,
                matchedMovie.runtime || null
              );
            } catch (insertErr) {
              if (!String(insertErr.code || '').startsWith('SQLITE_CONSTRAINT')) throw insertErr;
              const dupRow = db.prepare('SELECT id FROM movies WHERE tmdb_id = ?').get(matchedMovie.id);
              if (!dupRow) throw insertErr;
              db.prepare('UPDATE movies SET file_path = ?, status = ?, rating = ?, file_size = ?, quality_profile_id = COALESCE(quality_profile_id, ?) WHERE tmdb_id = ?')
                .run(fullPath, 'downloaded', movieRating, fileSize, defaultProfileId, matchedMovie.id);
            }
            scanProgress.addedMoviesCount++;
            if (matchedMovie.poster_path) await imageService.ensurePoster('movies', matchedMovie.id, matchedMovie.poster_path).catch(err => console.error(`[Scanner] Poster fetch failed for movie ${matchedMovie.id}:`, err.message));
            scanProgress.addedMovies.push({ title: matchedMovie.title, year: movieYear });
          }

          // Apply Simkl watched status
          try {
            if (isWatchedSyncEnabled()) {
              db.prepare("UPDATE movies SET watched = 1 WHERE tmdb_id = ? AND EXISTS (SELECT 1 FROM watched_tmdb WHERE tmdb_id = ? AND type = 'movie')").run(matchedMovie.id, matchedMovie.id);
            }
          } catch { /* non-critical */ }

          // Probing: Detect resolution, codec & audio
          let resolution = parseResolution(file.name);
          let codec = parseCodec(file.name);
          let audio = parseAudioFromFileName(file.name);
          let allSubtitles = [];

          if (existingMovie && existingMovie.file_size === fileSize && existingMovie.resolution && existingMovie.codec && existingMovie.resolution !== 'Unknown') {
            resolution = existingMovie.resolution;
            codec = existingMovie.codec;
            audio = existingMovie.audio || audio;
          } else {
            try {
              if (resolution === 'Unknown' || codec === 'Unknown' || !audio) {
                const meta = await getMediaMetadata(fullPath);
                if (resolution === 'Unknown' && meta.resolution) resolution = meta.resolution;
                if (codec === 'Unknown' && meta.codec) codec = meta.codec;
                if (!audio && meta.audio) audio = meta.audio;
                if (meta.embeddedSubtitles && meta.embeddedSubtitles.length > 0) {
                  allSubtitles.push(...meta.embeddedSubtitles);
                }
              }
            } catch { /* ignore */ }

            try {
              const movieLangs = await scanSubtitleLangs(fullPath);
              if (movieLangs && movieLangs.length > 0) {
                allSubtitles.push(...movieLangs);
              }
            } catch { /* ignore */ }
          }

          allSubtitles = [...new Set(allSubtitles)];

          db.prepare("UPDATE movies SET resolution = ?, codec = ?, audio = ?, scene_name = COALESCE(NULLIF(scene_name, ''), ?) WHERE tmdb_id = ?")
            .run(resolution || null, codec || null, audio || null, null, matchedMovie.id);

          if (allSubtitles.length > 0) {
            const movieId = existingMonitored?.id || db.prepare('SELECT id FROM movies WHERE tmdb_id = ?').get(matchedMovie.id)?.id;
            if (movieId) {
              db.prepare('UPDATE movies SET subtitles = ? WHERE id = ?').run(JSON.stringify(allSubtitles), movieId);
            }
          }
        }
      } catch (tmdbErr) {
        // Same duplicate-race tolerance as shows: the movie row already exists.
        if (/UNIQUE constraint failed: movies\.tmdb_id/.test(tmdbErr.message)) {
          console.log(`[Scanner] Movie "${title}" already exists (created concurrently) — linking skipped`);
          return;
        }
        console.error(`TMDB error for movie ${title}:`, tmdbErr.message);
        scanProgress.failedMovies.push({ title, year, reason: `TMDB error: ${tmdbErr.message}`, file: file.name, path: file.path });
      }
    }
    scanProgress.processedFiles++;
  };

  // Run file processing with controlled concurrency (6 concurrent files)
  await runWithConcurrency(allFiles, 6, processFile, scanProgress);
};

module.exports = { processScannedFiles };
