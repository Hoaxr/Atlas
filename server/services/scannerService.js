const fs = require('fs/promises');
const path = require('path');
const db = require('../config/database');
const tmdbService = require('./tmdbService');

const isVideoFile = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return ['.mp4', '.mkv', '.avi', '.mov', '.wmv'].includes(ext);
};

const parseMediaTitle = (filename, folderPath) => {
  const cleanName = filename.replace(/\.(mp4|mkv|avi|mov|wmv)$/i, '');
  
  // Check if it's a TV Show (e.g., S01E01, Season 1, S1E1)
  const tvShowMatch = cleanName.match(/(S\d{1,2}E\d{1,2}|Season \d+)/i);
  if (tvShowMatch) {
    let title = cleanName.substring(0, tvShowMatch.index).replace(/[\.\_\(\)\[\]\-]/g, ' ').trim();
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

  let title = titlePart.replace(/[\.\_\(\)\[\]\-]/g, ' ').trim();
  title = title.replace(/\b(1080p|720p|4k|2160p|bluray|webdl|web-dl|x264|x265)\b.*/i, '').trim();

  return { title, year, isShow: false };
};

let scanProgress = {
  isScanning: false,
  totalFiles: 0,
  processedFiles: 0,
  currentFile: '',
  currentPhase: '',
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

const doScan = async () => {
  const paths = db.prepare('SELECT * FROM library_paths').all();
  if (!paths || paths.length === 0) {
    scanProgress.isScanning = false;
    return;
  }

  try {
    // Phase 1: Pre-scan to count total video files
    scanProgress.currentFile = 'Gathering files...';
    const allFiles = [];
    for (const libPath of paths) {
      try {
        const stat = await fs.stat(libPath.path);
        if (!stat.isDirectory()) {
          scanProgress.emptyPaths.push({ path: libPath.path, error: 'Not a directory' });
          continue;
        }
        
        const files = await fs.readdir(libPath.path, { recursive: true, withFileTypes: true });
        const videoFiles = [];
        for (const file of files) {
          if (file.isFile() && isVideoFile(file.name)) {
            videoFiles.push(file);
          }
        }
        
        if (videoFiles.length === 0) {
          scanProgress.emptyPaths.push({ path: libPath.path, error: 'No video files found — mount may be empty or disconnected' });
        }
        
        allFiles.push(...videoFiles);
      } catch (err) {
        console.error(`Error gathering files from ${libPath.path}:`, err.message);
        scanProgress.unreachablePaths.push({ path: libPath.path, error: err.message });
      }
    }

    scanProgress.totalFiles = allFiles.length;
    scanProgress.processedFiles = 0;
    scanProgress.currentPhase = 'Processing files...';

    // Phase 2: Process files
    for (const file of allFiles) {
      scanProgress.currentFile = file.name;
      
      const fileDir = file.parentPath || file.path;
      const fullPath = path.join(fileDir, file.name);
      const { title, year, isShow, seasonNumber, episodeNumber } = parseMediaTitle(file.name, fileDir);
      if (!title) {
        scanProgress.skippedCount++;
        scanProgress.skippedFiles.push({ name: file.name, reason: 'Could not parse title from filename' });
        continue;
      }

      if (isShow) {
        // TV Show logic
        let showFolderPath = fileDir;
        if (showFolderPath.match(/Season\s*\d+/i)) {
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
              scanProgress.skippedFiles.push({ name: file.name, reason: `TMDB search returned no results for show "${title}"` });
              scanProgress.failedShows.push({ title, reason: 'TMDB search returned no results', file: file.name });
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
                } catch (e) {
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
            scanProgress.failedShows.push({ title, reason: `TMDB error: ${tmdbErr.message}`, file: file.name });
          }
        }
        
        // Link the specific episode to the file
        if (showId && seasonNumber !== undefined && episodeNumber !== undefined) {
          db.prepare(`
            UPDATE episodes 
            SET file_path = ?, status = 'downloaded' 
            WHERE show_id = ? AND season_number = ? AND episode_number = ?
          `).run(fullPath, showId, seasonNumber, episodeNumber);
        }

      } else {
        // Movie logic
        const existingMovie = db.prepare('SELECT id FROM movies WHERE file_path = ?').get(fullPath);
        if (existingMovie) {
          scanProgress.skippedCount++;
          scanProgress.skippedFiles.push({ name: file.name, reason: 'Already in library with this file path' });
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
            scanProgress.failedMovies.push({ title, year, reason: 'TMDB search returned no results', file: file.name });
          }

          if (matchedMovie) {
            const movieYear = matchedMovie.release_date ? parseInt(matchedMovie.release_date.split('-')[0]) : year;
            const movieRating = matchedMovie.vote_average || 0;

            // Get file size
            let fileSize = 0;
            try {
              const stat = await fs.stat(fullPath);
              fileSize = stat.size;
            } catch (e) {
              // File might not exist yet
            }

            const existingMonitored = db.prepare('SELECT id FROM movies WHERE tmdb_id = ?').get(matchedMovie.id);
            
            if (existingMonitored) {
              db.prepare('UPDATE movies SET file_path = ?, status = ?, rating = ?, file_size = ? WHERE tmdb_id = ?').run(fullPath, 'downloaded', movieRating, fileSize, matchedMovie.id);
            } else {
              db.prepare(`
                INSERT INTO movies (tmdb_id, title, year, poster_path, overview, status, file_path, rating, file_size)
                VALUES (?, ?, ?, ?, ?, 'downloaded', ?, ?, ?)
              `).run(
                matchedMovie.id,
                matchedMovie.title,
                movieYear,
                matchedMovie.poster_path,
                matchedMovie.overview,
                fullPath,
                movieRating,
                fileSize
              );
              scanProgress.addedMoviesCount++;
              scanProgress.addedMovies.push({ title: matchedMovie.title, year: movieYear });
            }
          }
        } catch (tmdbErr) {
          console.error(`TMDB error for movie ${title}:`, tmdbErr.message);
          scanProgress.failedMovies.push({ title, year, reason: `TMDB error: ${tmdbErr.message}`, file: file.name });
        }
      }
      scanProgress.processedFiles++;
    }

    // Phase 3: Post-processing — refresh sizes for ALL existing items
    const existingMovies = db.prepare("SELECT id, title, file_path FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
    const existingShows = db.prepare("SELECT id, title, folder_path FROM shows WHERE status = 'downloaded' AND folder_path IS NOT NULL").all();
    const allMovies = db.prepare("SELECT id, title, tmdb_id FROM movies WHERE tmdb_id IS NOT NULL").all();
    const allShows = db.prepare("SELECT id, title, tmdb_id FROM shows WHERE tmdb_id IS NOT NULL").all();

    // Phase 3a: File/folder sizes
    const sizeTotal = existingMovies.length + existingShows.length;
    let postTotal = sizeTotal;
    if (sizeTotal > 0) {
      scanProgress.currentPhase = 'Updating file sizes...';
      scanProgress.totalFiles = sizeTotal;
      scanProgress.processedFiles = 0;

      for (const m of existingMovies) {
        scanProgress.currentFile = m.title;
        try {
          const stat = await fs.stat(m.file_path);
          db.prepare('UPDATE movies SET file_size = ? WHERE id = ?').run(stat.size, m.id);
        } catch (e) { /* skip */ }
        scanProgress.processedFiles++;
      }

      scanProgress.currentPhase = 'Calculating folder sizes...';
      for (const s of existingShows) {
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
            } catch (e) { /* ignore */ }
            return total;
          };
          folderSize = await getSize(s.folder_path);
          db.prepare('UPDATE shows SET folder_size = ? WHERE id = ?').run(folderSize, s.id);
        } catch (e) { /* skip */ }
        scanProgress.processedFiles++;
      }
    }

    // Phase 3b: Refresh ratings from TMDB
    const ratingTotal = allMovies.length + allShows.length;
    if (ratingTotal > 0) {
      postTotal += ratingTotal;
      scanProgress.currentPhase = 'Refreshing ratings...';
      scanProgress.totalFiles = postTotal;
      // processedFiles carries over from size phase

      for (const m of allMovies) {
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
          // Small delay to respect TMDB rate limits
          await new Promise(r => setTimeout(r, 50));
        } catch (e) { /* skip */ }
        scanProgress.processedFiles++;
      }

      for (const s of allShows) {
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
        } catch (e) { /* skip */ }
        scanProgress.processedFiles++;
      }
    }

    // Phase 3c: Sync Trakt watched status
    postTotal += 1; // Single step for Trakt sync
    scanProgress.currentPhase = 'Syncing Trakt watched status...';
    scanProgress.currentFile = 'Trakt';
    scanProgress.totalFiles = postTotal;
    try {
      const traktService = require('./traktService');
      await traktService.syncWatched();
    } catch (e) { /* Trakt may not be configured */ }
    scanProgress.processedFiles++;
  } catch (error) {
    console.error('Scan error:', error);
  } finally {
    scanProgress.isScanning = false;
    scanProgress.currentFile = 'Finished';
    const eventBus = require('./eventBus');
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
  getScanProgress
};
