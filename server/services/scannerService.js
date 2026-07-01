const fs = require('fs/promises');
const path = require('path');
const db = require('../config/database');
const tmdbService = require('./tmdbService');
const { exec } = require('child_process');
const util = require('util');

const isVideoFile = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return ['.mp4', '.mkv', '.avi', '.mov', '.wmv'].includes(ext);
};

const RECYCLE_DIRS = new Set([
  '$Recycle.Bin',     // Windows
  '.Trash',           // Linux root trash
  '.Trashes',         // macOS
  '.recycle',         // Common NAS
  '#recycle',         // Synology
  '@Recycle',         // Some NAS
  '@Recycle.Bin',     // Some NAS
  '.Trash-1000',      // Linux user trash
]);

const shouldSkipDir = (dirName) => {
  if (RECYCLE_DIRS.has(dirName)) return true;
  // Match .Trash-$UID patterns (Linux)
  if (/^\.Trash-\d+$/.test(dirName)) return true;
  return false;
};

const SUBTITLE_EXTS = ['.srt', '.sub', '.vtt', '.ass', '.ssa', '.smi', '.idx'];

const scanSubtitleLangs = async (filePath) => {
  const dir = path.dirname(filePath);
  try {
    const items = await fs.readdir(dir);
    return [...new Set(
      items
        .filter(item => SUBTITLE_EXTS.includes(path.extname(item).toLowerCase()))
        .map(item => {
          const name = path.basename(item, path.extname(item));
          const match = name.match(/[._-]([a-z]{2,3})(?:\.[a-z0-9]+)?$/i);
          return match ? match[1].toLowerCase() : null;
        })
        .filter(Boolean)
    )];
  } catch {
    return [];
  }
};

const parseMediaTitle = (filename, folderPath) => {
  const cleanName = filename.replace(/\.(mp4|mkv|avi|mov|wmv)$/i, '');
  
  const tvShowMatch = cleanName.match(/(S\d{1,2}E\d{1,2}|Season \d+)/i);
  if (tvShowMatch) {
    let title = cleanName.substring(0, tvShowMatch.index).replace(/[._()[\]-]/g, ' ').trim();
    let seasonNumber = 1;
    let episodeNumber = 1;
    
    const sMatch = tvShowMatch[0].match(/S(\d{1,2})/i);
    const eMatch = tvShowMatch[0].match(/E(\d{1,2})/i);
    if (sMatch) seasonNumber = parseInt(sMatch[1], 10);
    if (eMatch) episodeNumber = parseInt(eMatch[1], 10);
    
    if (!sMatch && !eMatch) {
      const seasonWordMatch = tvShowMatch[0].match(/Season\s+(\d+)/i);
      if (seasonWordMatch) seasonNumber = parseInt(seasonWordMatch[1], 10);
      const epWordMatch = cleanName.match(/Episode\s+(\d+)/i);
      if (epWordMatch) episodeNumber = parseInt(epWordMatch[1], 10);
    }

    if (!title && folderPath) {
      const parts = folderPath.split(path.sep);
      const parent = parts[parts.length - 1];
      if (parent.match(/Season\s*\d+/i)) {
        title = parts[parts.length - 2];
      } else {
        title = parent;
      }
    }
    
    // Strip trailing year (e.g., "Invasion 2021" -> "Invasion")
    title = title.replace(/\s*(19\d{2}|20\d{2})\s*$/, '').trim();
    
    return { title, seasonNumber, episodeNumber, isShow: true };
  }

  // Otherwise, treat as Movie
  const yearMatch = cleanName.match(/(19\d{2}|20\d{2})/);
  const year = yearMatch ? parseInt(yearMatch[0]) : null;
  
  let titlePart = cleanName;
  if (yearMatch) {
    titlePart = cleanName.substring(0, yearMatch.index);
  }

  let title = titlePart.replace(/[._()[\]-]/g, ' ').trim();
  title = title.replace(/\b(1080p|720p|4k|2160p|bluray|webdl|web-dl|x264|x265)\b.*/i, '').trim();

  return { title, year, isShow: false };
};

let scanProgress = {
  isScanning: false,
  cancelled: false,
  totalFiles: 0,
  processedFiles: 0,
  currentFile: '',
  currentPhase: '',
  currentStage: 0,
  totalStages: 5,
  addedCount: 0,
  addedMoviesCount: 0,
  addedShowsCount: 0,
  addedEpisodesCount: 0,
  addedMovies: [],
  addedShows: [],
  failedMovies: [],
  failedShows: [],
  skippedCount: 0,
  skippedFiles: [],
  unreachablePaths: [],
  emptyPaths: []
};

const getScanProgress = () => {
  return scanProgress;
};

const stopScan = () => {
  if (!scanProgress.isScanning) return false;
  scanProgress.cancelled = true;
  return true;
};

const { getResolution } = require('../utils/videoUtils');

const setStage = (stage, phase) => {
  scanProgress.currentStage = stage;
  scanProgress.currentPhase = phase;
  scanProgress.processedFiles = 0;
  scanProgress.totalFiles = 0;
};

const doScan = async () => {
  const allPaths = db.prepare('SELECT * FROM library_paths').all();
  // Only scan movies and tv paths — skip downloads
  const paths = allPaths.filter(p => p.type !== 'downloads');
  if (!paths || paths.length === 0) {
    scanProgress.isScanning = false;
    return;
  }

  try {
    // ════════════════════════════════════════════
    // Stage 1/5: Gather files
    // ════════════════════════════════════════════
    setStage(1, 'Gathering files...');
    const allFiles = [];

    async function getFiles(dir) {
      try {
        const dirents = await fs.readdir(dir, { withFileTypes: true });
        for (const dirent of dirents) {
          const res = path.join(dir, dirent.name);
          if (dirent.isDirectory()) {
            if (shouldSkipDir(dirent.name)) {
              console.log(`[Scanner] Skipping recycle/trash directory: ${res}`);
              continue;
            }
            await getFiles(res);
          } else if (dirent.isFile() && isVideoFile(dirent.name)) {
            allFiles.push({
              name: dirent.name,
              path: res,
              parentPath: dir,
              isFile: () => true
            });
            if (allFiles.length % 50 === 0) {
              scanProgress.currentFile = `Gathering files... (Found ${allFiles.length})`;
            }
          }
        }
      } catch (e) {
        console.error(`Error reading directory ${dir}:`, e.message);
      }
    }

    for (const libPath of paths) {
      try {
        const stat = await fs.stat(libPath.path);
        if (!stat.isDirectory()) {
          scanProgress.emptyPaths.push({ path: libPath.path, error: 'Not a directory' });
          continue;
        }
        
        const initialCount = allFiles.length;
        await getFiles(libPath.path);
        
        if (allFiles.length === initialCount) {
          scanProgress.emptyPaths.push({ path: libPath.path, error: 'No video files found — mount may be empty or disconnected' });
        }
      } catch (err) {
        console.error(`Error gathering files from ${libPath.path}:`, err.message);
        scanProgress.unreachablePaths.push({ path: libPath.path, error: err.message });
      }
    }

    if (scanProgress.cancelled) throw new Error('Scan cancelled by user');

    scanProgress.totalFiles = allFiles.length;

    // ════════════════════════════════════════════
    // Stage 2/5: Process files (match to TMDB)
    // ════════════════════════════════════════════
    setStage(2, 'Processing files...');
    scanProgress.totalFiles = allFiles.length;

    for (const file of allFiles) {
      if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
      scanProgress.currentFile = file.name;
      scanProgress.currentFile = file.name;
      
      const fileDir = file.parentPath || file.path;
      const fullPath = path.join(fileDir, file.name);
      const { title, year, isShow, seasonNumber, episodeNumber } = parseMediaTitle(file.name, fileDir);
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
          
          // Ensure we fetch episodes if they were missed in a previous scan
          const epCount = db.prepare('SELECT COUNT(*) as count FROM episodes WHERE show_id = ?').get(showId).count;
          if (epCount === 0 && tmdbId) {
            try {
              const seasons = await tmdbService.getShowSeasons(tmdbId);
              const insertEp = db.prepare(`
                INSERT INTO episodes (show_id, season_number, episode_number, title, overview, status, air_date)
                VALUES (?, ?, ?, ?, ?, 'monitored', ?)
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

              if (existingMonitored) {
                db.prepare('UPDATE shows SET folder_path = ?, status = ?, rating = ? WHERE tmdb_id = ?').run(showFolderPath, 'downloaded', showRating, tmdbId);
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
                const insertRes = db.prepare(`
                  INSERT INTO shows (tmdb_id, title, year, poster_path, overview, status, folder_path, rating, folder_size)
                  VALUES (?, ?, ?, ?, ?, 'downloaded', ?, ?, ?)
                `).run(
                  matchedShow.id,
                  matchedShow.name,
                  showYear,
                  matchedShow.poster_path,
                  matchedShow.overview,
                  showFolderPath,
                  showRating,
                  folderSize
                );
                showId = insertRes.lastInsertRowid;
                
                // Synchronously fetch and insert episodes for the newly discovered show
                let episodeCount = 0;
                try {
                  const seasons = await tmdbService.getShowSeasons(tmdbId);
                  const insertEp = db.prepare(`
                    INSERT INTO episodes (show_id, season_number, episode_number, title, overview, status, air_date)
                    VALUES (?, ?, ?, ?, ?, 'monitored', ?)
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
          } catch (tmdbErr) {
            console.error(`TMDB error for show ${title}:`, tmdbErr.message);
            scanProgress.failedShows.push({ title, reason: `TMDB error: ${tmdbErr.message}`, file: file.name, path: file.path });
          }
        }
        
        // Link the specific episode to the file
        if (showId && seasonNumber !== undefined && episodeNumber !== undefined) {
          let fileSize = 0;
          try {
            const stat = await fs.stat(fullPath);
            fileSize = stat.size;
          } catch {
            // ignore
          }

          db.prepare(`
            UPDATE episodes 
            SET file_path = ?, status = 'downloaded', file_size = ?
            WHERE show_id = ? AND season_number = ? AND episode_number = ?
          `).run(fullPath, fileSize, showId, seasonNumber, episodeNumber);

          // Scan for subtitle files in the episode's directory
          const epLangs = await scanSubtitleLangs(fullPath);
          if (epLangs.length > 0) {
            db.prepare('UPDATE episodes SET subtitles = ? WHERE show_id = ? AND season_number = ? AND episode_number = ?')
              .run(JSON.stringify(epLangs), showId, seasonNumber, episodeNumber);
          }
        }

      } else {
        // Movie logic
        const existingMovie = db.prepare('SELECT id FROM movies WHERE file_path = ?').get(fullPath);
        if (existingMovie) {
          scanProgress.skippedCount++;
          scanProgress.skippedFiles.push({ name: file.name, reason: 'Already in library with this file path', path: file.path });
          continue;
        }

        try {
          const results = await tmdbService.searchMovies(title);
          let matchedMovie = null;
          if (results.length > 0) {
            if (year) {
              matchedMovie = results.find(r => r.release_date && r.release_date.startsWith(year.toString()));
            }
            if (!matchedMovie) matchedMovie = results[0];
          }

          if (!matchedMovie) {
            scanProgress.skippedCount++;
            scanProgress.skippedFiles.push({ name: file.name, reason: `TMDB search returned no results for "${title}"` });
            scanProgress.failedMovies.push({ title, year, reason: 'TMDB search returned no results', file: file.name, path: file.path });
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

            // Look up default quality profile (first in table)
            const defaultProfile = db.prepare('SELECT id FROM quality_profiles ORDER BY id ASC LIMIT 1').get();
            const defaultProfileId = defaultProfile?.id || null;

            const existingMonitored = db.prepare('SELECT id FROM movies WHERE tmdb_id = ?').get(matchedMovie.id);
            
            if (existingMonitored) {
              // Assign default profile if the movie doesn't already have one
              db.prepare('UPDATE movies SET file_path = ?, status = ?, rating = ?, file_size = ?, quality_profile_id = COALESCE(quality_profile_id, ?) WHERE tmdb_id = ?')
                .run(fullPath, 'downloaded', movieRating, fileSize, defaultProfileId, matchedMovie.id);
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
              scanProgress.addedMovies.push({ title: matchedMovie.title, year: movieYear });
            }

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

    if (scanProgress.cancelled) throw new Error('Scan cancelled by user');

    // ════════════════════════════════════════════
    // Stage 3/5: Update sizes & ratings
    // ════════════════════════════════════════════
    const existingMovies = db.prepare("SELECT id, title, file_path, scene_name FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
    const existingShows = db.prepare("SELECT id, title, folder_path FROM shows WHERE status = 'downloaded' AND folder_path IS NOT NULL").all();
    const allMovies = db.prepare("SELECT id, title, tmdb_id FROM movies WHERE tmdb_id IS NOT NULL").all();
    const allShows = db.prepare("SELECT id, title, tmdb_id FROM shows WHERE tmdb_id IS NOT NULL").all();

    // File/folder sizes
    const sizeTotal = existingMovies.length + existingShows.length;
    const ratingTotal = allMovies.length + allShows.length;
    const stage3Total = sizeTotal + ratingTotal;

    setStage(3, 'Updating file sizes...');
    scanProgress.totalFiles = stage3Total;

    for (const m of existingMovies) {
      if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
      scanProgress.currentFile = m.title;
      try {
        const stat = await fs.stat(m.file_path);
        let resName = null;
        try {
          if (!m.scene_name || m.scene_name === '' || m.scene_name.startsWith('Unknown ')) {
            const res = await getResolution(m.file_path);
            if (res) resName = `Unknown ${res}`;
          }
        } catch { /* ignore */ }
        
        if (resName) {
          db.prepare('UPDATE movies SET file_size = ?, scene_name = ? WHERE id = ?').run(stat.size, resName, m.id);
        } else {
          db.prepare('UPDATE movies SET file_size = ? WHERE id = ?').run(stat.size, m.id);
        }
      } catch { /* skip */ }
      scanProgress.processedFiles++;
    }

    scanProgress.currentPhase = 'Calculating folder sizes...';
    for (const s of existingShows) {
      if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
      scanProgress.currentFile = s.title;
      try {
        let folderSize = 0;
        const getSize = async (dir) => {
          let total = 0;
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              const entryPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                total += await getSize(entryPath);
              } else if (isVideoFile(entry.name)) {
                const st = await fs.stat(entryPath);
                total += st.size;
              }
            }
          } catch { /* ignore */ }
          return total;
        };
        folderSize = await getSize(s.folder_path);
        db.prepare('UPDATE shows SET folder_size = ? WHERE id = ?').run(folderSize, s.id);
      } catch { /* skip */ }
      scanProgress.processedFiles++;
    }

    // Refresh ratings from TMDB
    scanProgress.currentPhase = 'Refreshing ratings...';
    for (const m of allMovies) {
      if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
      scanProgress.currentFile = m.title;
      try {
        const data = await tmdbService.getMovieById(m.tmdb_id);
        if (data) {
          const updates = [];
          const values = [];
          if (data.vote_average !== undefined) {
            updates.push('rating = ?');
            values.push(data.vote_average);
          }
          if (data.genres && Array.isArray(data.genres)) {
            updates.push('genres = ?');
            values.push(data.genres.map(g => g.name).join(', '));
          }
          if (updates.length > 0) {
            values.push(m.id);
            db.prepare(`UPDATE movies SET ${updates.join(', ')} WHERE id = ?`).run(...values);
          }
        }
        await new Promise(r => setTimeout(r, 50));
      } catch { /* skip */ }
      scanProgress.processedFiles++;
    }

    for (const s of allShows) {
      if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
      scanProgress.currentFile = s.title;
      try {
        const data = await tmdbService.getShowById(s.tmdb_id);
        if (data) {
          const updates = [];
          const values = [];
          if (data.vote_average !== undefined) {
            updates.push('rating = ?');
            values.push(data.vote_average);
          }
          if (data.genres && Array.isArray(data.genres)) {
            updates.push('genres = ?');
            values.push(data.genres.map(g => g.name).join(', '));
          }
          if (updates.length > 0) {
            values.push(s.id);
            db.prepare(`UPDATE shows SET ${updates.join(', ')} WHERE id = ?`).run(...values);
          }
        }
        await new Promise(r => setTimeout(r, 50));
      } catch { /* skip */ }
      scanProgress.processedFiles++;
    }

    if (scanProgress.cancelled) throw new Error('Scan cancelled by user');

    // ════════════════════════════════════════════
    // Stage 4/5: Sync Trakt
    // ════════════════════════════════════════════
    setStage(4, 'Syncing Trakt watched status...');
    scanProgress.totalFiles = 1;
    scanProgress.currentFile = 'Trakt';
    try {
      const traktService = require('./traktService');
      await traktService.syncWatched();
    } catch { /* Trakt may not be configured */ }
    scanProgress.processedFiles = 1;

    if (scanProgress.cancelled) throw new Error('Scan cancelled by user');

    // ════════════════════════════════════════════
    // Stage 5/5: Scan subtitles
    // ════════════════════════════════════════════
    const subMoviesList = db.prepare("SELECT id, file_path FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
    const subEpisodesList = db.prepare("SELECT id, file_path FROM episodes WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
    const subTotal = subMoviesList.length + subEpisodesList.length;

    setStage(5, 'Scanning movie subtitles...');
    scanProgress.totalFiles = subTotal;

    for (const m of subMoviesList) {
      if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
      scanProgress.currentFile = path.basename(m.file_path);
      try {
        const langs = await scanSubtitleLangs(m.file_path);
        db.prepare('UPDATE movies SET subtitles = ? WHERE id = ?').run(JSON.stringify(langs), m.id);
      } catch (e) {
        console.warn(`[Scanner] Failed to scan subtitles for ${m.file_path}:`, e.message);
      }
      scanProgress.processedFiles++;
    }

    scanProgress.currentPhase = 'Scanning episode subtitles...';
    // Group episodes by directory to avoid re-reading the same dir
    const epDirMap = {};
    for (const ep of subEpisodesList) {
      const dir = path.dirname(ep.file_path);
      if (!epDirMap[dir]) epDirMap[dir] = [];
      epDirMap[dir].push(ep);
    }

    for (const [dir, eps] of Object.entries(epDirMap)) {
      if (scanProgress.cancelled) throw new Error('Scan cancelled by user');
      let subFiles = [];
      try {
        subFiles = await fs.readdir(dir);
        subFiles = subFiles.filter(f => SUBTITLE_EXTS.includes(path.extname(f).toLowerCase()));
      } catch { /* skip */ }

      for (const ep of eps) {
        scanProgress.currentFile = path.basename(ep.file_path);
        const baseName = path.basename(ep.file_path, path.extname(ep.file_path));
        const s = ep.season_number;
        const e = ep.episode_number;
        const matchStr1 = `s${String(s).padStart(2, '0')}e${String(e).padStart(2, '0')}`;
        const matchStr2 = `${s}x${String(e).padStart(2, '0')}`;

        const matchingSubs = subFiles.filter(f => {
          if (f.startsWith(baseName)) return true;
          const fLower = f.toLowerCase();
          return fLower.includes(matchStr1) || fLower.includes(matchStr2);
        });

        const langs = [...new Set(
          matchingSubs.map(f => {
            const name = path.basename(f, path.extname(f));
            const m = name.match(/[._-]([a-z]{2,3})(?:\.[a-z0-9]+)?$/i);
            return m ? m[1].toLowerCase() : null;
          }).filter(Boolean)
        )];

        try {
          db.prepare('UPDATE episodes SET subtitles = ? WHERE id = ?').run(JSON.stringify(langs), ep.id);
        } catch (e) {
          console.warn(`[Scanner] Failed to update subtitles for ${ep.file_path}:`, e.message);
        }
        scanProgress.processedFiles++;
      }
    }
  } catch (error) {
    const isCancelled = error?.message === 'Scan cancelled by user';
    if (isCancelled) {
      console.log('[Scanner] Scan cancelled by user');
    } else {
      console.error('Scan error:', error);
    }
  } finally {
    scanProgress.isScanning = false;
    scanProgress.cancelled = false;
    scanProgress.currentFile = 'Finished';
    scanProgress.currentStage = 5;
    const eventBus = require('./eventBus');
    if (scanProgress.currentPhase === 'Scan cancelled by user') {
      scanProgress.currentPhase = 'Cancelled';
    } else {
      scanProgress.currentPhase = 'Finished';
    }
    const added = scanProgress.addedMoviesCount + scanProgress.addedShowsCount;
    const failed = (scanProgress.failedMovies?.length || 0) + (scanProgress.failedShows?.length || 0);
    if (added > 0 || failed > 0) {
      eventBus.success(`Scan complete: ${added} added${failed > 0 ? `, ${failed} failed` : ''}`);
    } else {
      eventBus.info('Scan complete: no new items found');
    }
  }
};

const scanLibrary = async () => {
  if (scanProgress.isScanning) {
    return { status: 'error', message: 'Scan already in progress' };
  }

  const eventBus = require('./eventBus');
  eventBus.info('Library scan started');
  
  scanProgress = {
    isScanning: true,
    totalFiles: 0,
    processedFiles: 0,
    currentFile: 'Starting...',
    addedCount: 0,
    addedMoviesCount: 0,
    addedShowsCount: 0,
    addedEpisodesCount: 0,
    addedMovies: [],
    addedShows: [],
    failedMovies: [],
    failedShows: [],
    skippedCount: 0,
    skippedFiles: [],
    unreachablePaths: [],
    emptyPaths: []
  };
  
  // Start in background
  doScan();
  
  return { status: 'success', message: 'Scan started' };
};

module.exports = {
  scanLibrary,
  getScanProgress,
  stopScan
};
