const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const db = require('../config/database');
const { getAiredCutoffSql } = require('../utils/airDate');
const indexerService = require('./indexerService');
const downloadClientService = require('./downloadClientService');
const taskRegistry = require('./taskRegistry');
const tmdbService = require('./tmdbService');
const imageService = require('./imageService');
const eventBus = require('./eventBus');
const { runWithConcurrency } = require('../utils/concurrency');
const { registerJob } = require('../utils/cronRegistry');
const { isVideoFile, deleteFolderRecursive } = require('../utils/fileUtils');
const { isRootLibraryPath } = require('../utils/fileUtils');
const { calculateNextSearchAt, calculatePriority } = require('./schedulerLogic');

const DEFAULT_SCHEDULES = {
  search_cycle:       '0 * * * *',
  refresh_metadata:   '0 3 * * *',  // Daily at 3 AM
  simkl_watched_sync: '0 */6 * * *',
  missing_files_check:'0 * * * *',  // Hourly fast check for deleted files
  database_backup:    '0 4 * * *',  // Daily at 4 AM
  auto_delete_watched:'0 5 * * *',  // Daily at 5 AM
  poster_cache_warmer:'0 2 * * *',  // Daily at 2 AM
  orphaned_files:     '0 3 * * *',  // Daily at 3 AM
  deep_metadata:      '0 4 * * 0',  // Weekly on Sunday at 4 AM
  release_monitor:    '0 1 * * *',  // Daily at 1 AM
};

const getSchedule = (taskId) => {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(`schedule_${taskId}`);
    return row ? row.value : DEFAULT_SCHEDULES[taskId];
  } catch {
    return DEFAULT_SCHEDULES[taskId];
  }
};

const getProfile = (id) => {
  if (!id) return null;
  return db.prepare('SELECT * FROM quality_profiles WHERE id = ?').get(id);
};

// Proper path-relative containment check — unlike startsWith(), it won't match sibling
// directories like /data/movies-backup under root /data/movies.
const isInsideRoot = (root, p) => {
  const rel = path.relative(path.resolve(root), path.resolve(p));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
};

let isSearchCycleRunning = false;

const runSearchCycle = async () => {
  if (isSearchCycleRunning) {
    console.warn('[Automation] Search cycle already running — skipping this tick.');
    return;
  }
  isSearchCycleRunning = true;
  try {
    // Fetch active torrents to prevent double-downloading
    const activeTorrents = await downloadClientService.getTorrents().catch(() => []);
    const activeTitles = new Set(activeTorrents.map(t => t.name?.toLowerCase().trim()).filter(Boolean));

    let monitoredMovies = db.prepare(`
      SELECT m.* FROM movies m
      LEFT JOIN quality_profiles qp ON m.quality_profile_id = qp.id
      WHERE (m.status IN ('monitored', 'missing') OR (m.status = 'downloaded' AND qp.upgrade_allowed = 1))
        AND m.monitored = 1
        AND (m.next_search_at IS NULL OR m.next_search_at <= datetime('now'))
    `).all();
    
    // Sort by priority, highest first
    monitoredMovies.forEach(m => m.priority = calculatePriority(m, 'movie'));
    monitoredMovies.sort((a, b) => b.priority - a.priority);
    // Limit to top 20
    monitoredMovies = monitoredMovies.slice(0, 20);

    let movieFailures = 0;
    const processMovie = async (movie) => {
      if (movie.scene_name && activeTitles.has(movie.scene_name.toLowerCase().trim())) return;
      
      try {
        const profile = getProfile(movie.quality_profile_id);
        if (!profile) return;

        let hasFile = false;
        if (movie.folder_path && fs.existsSync(movie.folder_path)) {
          const files = await fsp.readdir(movie.folder_path);
          if (files.some(isVideoFile)) hasFile = true;
        }

        // Prevent premature searches on newly added movies
        if (!movie.next_search_at) {
          const next = calculateNextSearchAt(movie, 'movie', { isDownloaded: (movie.status === 'downloaded' || hasFile), isCutoffMet: false });
          if (next.state === 'PENDING') {
            db.prepare("UPDATE movies SET next_search_at = ?, search_state = 'PENDING' WHERE id = ?")
              .run(next.nextSearch ? next.nextSearch.toISOString() : null, movie.id);
            return;
          }
        }

        let isCutoffMet = false;
        let currentQuality = null;

        if (movie.status === 'downloaded' || hasFile) {
          if (!profile.upgrade_allowed) {
            const next = calculateNextSearchAt(movie, 'movie', { isDownloaded: true, isCutoffMet: true });
            db.prepare("UPDATE movies SET last_searched_at = datetime('now'), search_state = ?, next_search_at = ? WHERE id = ?").run(next.state, next.nextSearch ? next.nextSearch.toISOString() : null, movie.id);
            return;
          }
          
          currentQuality = indexerService.parseQuality(movie.scene_name || '');
          if (currentQuality === profile.cutoff) {
            isCutoffMet = true;
          } else {
            let qualities = [];
            try { qualities = JSON.parse(profile.qualities); } catch { qualities = []; }
            const currentIdx = qualities.indexOf(currentQuality);
            const cutoffIdx = qualities.indexOf(profile.cutoff);
            if (currentIdx !== -1 && cutoffIdx !== -1 && currentIdx <= cutoffIdx) {
              isCutoffMet = true;
            }
          }

          if (isCutoffMet) {
            const next = calculateNextSearchAt(movie, 'movie', { isDownloaded: true, isCutoffMet: true });
            db.prepare("UPDATE movies SET last_searched_at = datetime('now'), search_state = ?, next_search_at = ? WHERE id = ?").run(next.state, next.nextSearch ? next.nextSearch.toISOString() : null, movie.id);
            return;
          }
        }

        const results = await indexerService.searchMovie(movie.title, movie.year, profile, currentQuality, false, movie.tmdb_id);
        
        if (results.length > 0) {
          const bestRelease = results[0]; 
          await downloadClientService.addTorrent(bestRelease.link);
          db.prepare("UPDATE movies SET status = 'downloading', scene_name = COALESCE(NULLIF(scene_name, ''), ?), search_state = 'COMPLETED', retry_count = 0, last_success_at = datetime('now'), next_search_at = NULL WHERE id = ?").run(bestRelease.title, movie.id);
          eventBus.info('Download started', { title: movie.title, type: 'movie', release: bestRelease.title });
        } else {
          movie.retry_count = (movie.retry_count || 0) + 1;
          const next = calculateNextSearchAt(movie, 'movie', { isDownloaded: (movie.status === 'downloaded' || hasFile), isCutoffMet });
          db.prepare("UPDATE movies SET last_searched_at = datetime('now'), search_state = ?, next_search_at = ?, retry_count = ?, last_failure_at = datetime('now') WHERE id = ?")
            .run(next.state, next.nextSearch ? next.nextSearch.toISOString() : null, movie.retry_count, movie.id);
        }
      } catch (err) {
        // Transient error (indexer outage, network failure): don't burn a retry — only
        // empty result sets increment retry_count. Leave scheduling untouched so the
        // next search cycle retries naturally.
        movieFailures++;
        console.error(`[Automation] Failed to process ${movie.title}:`, err.message);
        db.prepare("UPDATE movies SET last_provider_response = ?, last_failure_at = datetime('now') WHERE id = ?")
          .run(err.message, movie.id);
      }
    };
    
    await runWithConcurrency(monitoredMovies, 3, processMovie);

    let monitoredEpisodes = db.prepare(`
      SELECT e.*, s.title as show_title, s.quality_profile_id, s.tmdb_id as show_tmdb_id
      FROM episodes e 
      JOIN shows s ON e.show_id = s.id
      LEFT JOIN quality_profiles qp ON s.quality_profile_id = qp.id
      WHERE (e.status IN ('monitored', 'missing') OR (e.status = 'downloaded' AND qp.upgrade_allowed = 1))
        AND e.monitored = 1
        AND s.monitored = 1
        AND (e.next_search_at IS NULL OR e.next_search_at <= datetime('now'))
    `).all();

    monitoredEpisodes.forEach(e => {
      e.priority = calculatePriority(e, 'episode');
      // Boost recently aired episodes (air date within last 7 days or today) to guarantee top queue placement
      if (e.air_date) {
        // Parse plain YYYY-MM-DD as local noon to avoid UTC midnight shifting the boundary into
        // the next local day on servers east of UTC (same fix as schedulerLogic.js)
        let airDate;
        if (e.air_date.includes('T') || e.air_date.includes(' ')) {
          airDate = new Date(e.air_date);
        } else {
          const [y, m, d] = e.air_date.split('-').map(Number);
          airDate = new Date(y, m - 1, d, 12, 0, 0);
        }
        const airDiffDays = (Date.now() - airDate.getTime()) / (86400 * 1000);
        if (airDiffDays >= -1 && airDiffDays <= 7) {
          e.priority += 500;
        }
      }
    });
    monitoredEpisodes.sort((a, b) => b.priority - a.priority);
    monitoredEpisodes = monitoredEpisodes.slice(0, 50);

    let episodeFailures = 0;
    const processEpisode = async (ep) => {
      const epLabel = `${ep.show_title} S${String(ep.season_number).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')}`;
      if (ep.scene_name && activeTitles.has(ep.scene_name.toLowerCase().trim())) return;

      try {
        const showRow = db.prepare("SELECT folder_path FROM shows WHERE id = ?").get(ep.show_id);
        const profile = getProfile(ep.quality_profile_id);
        if (!profile) return;

        let hasFile = false;
        if (showRow && showRow.folder_path && fs.existsSync(showRow.folder_path)) {
          const directRegex = new RegExp(`\\bS0?${ep.season_number}[._\\s-]*E0?${ep.episode_number}\\b`, 'i');
          const sceneRegex = new RegExp(`\\b0?${ep.season_number}x0?${ep.episode_number}\\b`, 'i');
          
          const isFileForEpisode = (filename) => {
            if (directRegex.test(filename) || sceneRegex.test(filename)) return true;
            const multiMatch = filename.match(/\bS(\d{1,2})[._\s-]*E(\d{1,3})(?:[-_E\s]+(?:S\d{1,2})?E?(\d{1,3}))+\b/i);
            if (multiMatch) {
              const sNum = parseInt(multiMatch[1], 10);
              const eStart = parseInt(multiMatch[2], 10);
              const extra = [...multiMatch[0].matchAll(/(\d{1,3})/g)].map(m => parseInt(m[1], 10));
              const eEnd = extra[extra.length - 1];
              if (sNum === ep.season_number && ep.episode_number >= eStart && ep.episode_number <= eEnd) {
                return true;
              }
            }
            return false;
          };

          const checkDir = async (dir) => {
            if (hasFile) return;
            const entries = await fsp.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                await checkDir(fullPath);
              } else if (isVideoFile(entry.name) && isFileForEpisode(entry.name)) {
                hasFile = true;
                break;
              }
            }
          };
          await checkDir(showRow.folder_path);
        }

        // Prevent premature searches on newly added episodes
        if (!ep.next_search_at) {
          const next = calculateNextSearchAt(ep, 'episode', { isDownloaded: (ep.status === 'downloaded' || hasFile), isCutoffMet: false });
          if (next.state === 'PENDING') {
            db.prepare("UPDATE episodes SET next_search_at = ?, search_state = 'PENDING' WHERE id = ?")
              .run(next.nextSearch ? next.nextSearch.toISOString() : null, ep.id);
            return;
          }
        }

        let isCutoffMet = false;
        let currentQuality = null;

        if (ep.status === 'downloaded' || hasFile) {
          if (!profile.upgrade_allowed) {
            const next = calculateNextSearchAt(ep, 'episode', { isDownloaded: true, isCutoffMet: true });
            db.prepare("UPDATE episodes SET last_searched_at = datetime('now'), search_state = ?, next_search_at = ? WHERE id = ?").run(next.state, next.nextSearch ? next.nextSearch.toISOString() : null, ep.id);
            return;
          }
          
          currentQuality = indexerService.parseQuality(ep.scene_name || '');
          if (currentQuality === profile.cutoff) {
            isCutoffMet = true;
          } else {
            let qualities = [];
            try { qualities = JSON.parse(profile.qualities); } catch { qualities = []; }
            const currentIdx = qualities.indexOf(currentQuality);
            const cutoffIdx = qualities.indexOf(profile.cutoff);
            if (currentIdx !== -1 && cutoffIdx !== -1 && currentIdx <= cutoffIdx) {
              isCutoffMet = true;
            }
          }

          if (isCutoffMet) {
            const next = calculateNextSearchAt(ep, 'episode', { isDownloaded: true, isCutoffMet: true });
            db.prepare("UPDATE episodes SET last_searched_at = datetime('now'), search_state = ?, next_search_at = ? WHERE id = ?").run(next.state, next.nextSearch ? next.nextSearch.toISOString() : null, ep.id);
            return;
          }
        }

        const results = await indexerService.searchEpisode(ep.show_title, ep.season_number, ep.episode_number, profile, currentQuality, false, ep.show_tmdb_id);
        
        if (results.length > 0) {
          const bestRelease = results[0];
          await downloadClientService.addTorrent(bestRelease.link);
          db.prepare("UPDATE episodes SET status = 'downloading', scene_name = COALESCE(NULLIF(scene_name, ''), ?), search_state = 'COMPLETED', retry_count = 0, last_success_at = datetime('now'), next_search_at = NULL WHERE id = ?").run(bestRelease.title, ep.id);
          eventBus.info('Download started', { title: epLabel, type: 'episode', release: bestRelease.title });
        } else {
          ep.retry_count = (ep.retry_count || 0) + 1;
          const next = calculateNextSearchAt(ep, 'episode', { isDownloaded: (ep.status === 'downloaded' || hasFile), isCutoffMet });
          db.prepare("UPDATE episodes SET last_searched_at = datetime('now'), search_state = ?, next_search_at = ?, retry_count = ?, last_failure_at = datetime('now') WHERE id = ?")
            .run(next.state, next.nextSearch ? next.nextSearch.toISOString() : null, ep.retry_count, ep.id);
        }
      } catch (err) {
        // Same as movies: transient errors leave retry_count untouched for next-cycle retry.
        episodeFailures++;
        console.error(`[Automation] Failed to process ${epLabel}:`, err.message);
        db.prepare("UPDATE episodes SET last_provider_response = ?, last_failure_at = datetime('now') WHERE id = ?")
          .run(err.message, ep.id);
      }
    };
    
    await runWithConcurrency(monitoredEpisodes, 3, processEpisode);

    if (movieFailures > 0 || episodeFailures > 0) {
      eventBus.warn('Search cycle completed with errors', { 
        movieFailures, 
        episodeFailures,
        totalMovies: monitoredMovies.length,
        totalEpisodes: monitoredEpisodes.length
      });
    }
  } finally {
    isSearchCycleRunning = false;
  }
};

const runRefreshMetadata = async () => {
  console.log('[Automation] Running daily trickle-refresh of metadata...');
  
  // Update 50 oldest movies
  const movies = db.prepare("SELECT id, tmdb_id, title FROM movies WHERE status != 'unmonitored' ORDER BY last_refreshed_at ASC NULLS FIRST LIMIT 50").all();
  let moviesUpdated = 0;

  await runWithConcurrency(movies, 3, async (movie) => {
    try {
      const tmdbData = await tmdbService.getMovieById(movie.tmdb_id);
      if (tmdbData) {
        db.prepare("UPDATE movies SET rating = ?, poster_path = ?, overview = ?, last_refreshed_at = datetime('now') WHERE id = ?")
          .run(tmdbData.vote_average || 0, tmdbData.poster_path, tmdbData.overview, movie.id);
        moviesUpdated++;
      } else {
        db.prepare("UPDATE movies SET last_refreshed_at = datetime('now') WHERE id = ?").run(movie.id);
      }
    } catch (err) {
      console.error(`[Automation] Failed to refresh metadata for movie ${movie.title}: ${err.message}`);
    }
  });

  // Update 20 oldest shows
  const shows = db.prepare("SELECT id, tmdb_id, title FROM shows WHERE status != 'unmonitored' ORDER BY last_refreshed_at ASC NULLS FIRST LIMIT 20").all();
  let showsUpdated = 0;

  await runWithConcurrency(shows, 3, async (show) => {
    try {
      const data = await tmdbService.getShowById(show.tmdb_id);
      if (data) {
        db.prepare("UPDATE shows SET rating = ?, poster_path = ?, overview = ?, tmdb_status = ?, last_refreshed_at = datetime('now') WHERE id = ?")
          .run(data.vote_average || 0, data.poster_path, data.overview, data.status || '', show.id);

        const seasons = await tmdbService.getShowSeasons(show.tmdb_id);
        const insertEp = db.prepare(`
          INSERT INTO episodes (show_id, season_number, episode_number, title, overview, status, air_date, runtime)
          VALUES (?, ?, ?, ?, ?, 'monitored', ?, ?)
          ON CONFLICT(show_id, season_number, episode_number) DO UPDATE SET
            title = excluded.title,
            overview = excluded.overview,
            air_date = excluded.air_date,
            runtime = excluded.runtime
        `);
        
        const tmdbEpisodeKeys = new Set();
        // Empty season list or any season returning zero episodes means the fetch is
        // unreliable (TMDB outage/API failure) — pruning against it would wipe real episodes.
        let reliableFetch = seasons.length > 0;
        for (const s of seasons) {
          if (!reliableFetch) break;
          if (s.season_number === 0) continue;
          const episodes = await tmdbService.getSeasonEpisodes(show.tmdb_id, s.season_number);
          if (episodes.length === 0) {
            reliableFetch = false;
            break;
          }
          for (const ep of episodes) {
            const key = `${ep.season_number}|${ep.episode_number}`;
            tmdbEpisodeKeys.add(key);
            insertEp.run(show.id, ep.season_number, ep.episode_number, ep.name, ep.overview, ep.air_date, ep.runtime || null);
          }
        }

        if (!reliableFetch) {
          console.warn(`[Automation] Skipping stale-episode cleanup for "${show.title}" — TMDB episode data incomplete or unavailable.`);
        } else {
          const allDbEpisodes = db.prepare(
            'SELECT id, season_number, episode_number, status FROM episodes WHERE show_id = ?'
          ).all(show.id);

          const runStaleDeletion = db.transaction(() => {
            const deleteStale = db.prepare('DELETE FROM episodes WHERE id = ?');
            let removedCount = 0;
            for (const ep of allDbEpisodes) {
              const key = `${ep.season_number}|${ep.episode_number}`;
              if (!tmdbEpisodeKeys.has(key) && ep.status !== 'downloaded') {
                deleteStale.run(ep.id);
                removedCount++;
              }
            }
            return removedCount;
          });

          runStaleDeletion();
        }
        showsUpdated++;
      } else {
        db.prepare("UPDATE shows SET last_refreshed_at = datetime('now') WHERE id = ?").run(show.id);
      }
    } catch (err) {
      console.error(`[Automation] Failed to refresh metadata for show ${show.title}: ${err.message}`);
    }
  });

  console.log(`[Automation] Metadata trickle-refresh complete. Refreshed ${moviesUpdated} movies and ${showsUpdated} shows.`);
};

const simklService = require('./simklService');

const runSimklWatchedSync = async () => {
  await simklService.syncWatched();
};

const runMissingFilesCheck = async () => {
  console.log('[Automation] Running missing files check...');
  
  // Get all configured library paths
  const pathsResult = db.prepare('SELECT path FROM library_paths').all();
  const validRootPaths = [];
  
  // Disconnected drive protection: only proceed for roots that exist
  for (const row of pathsResult) {
    if (fs.existsSync(row.path)) {
      validRootPaths.push(row.path);
    } else {
      console.warn(`[Automation] Skipping missing files check for ${row.path} (path not accessible).`);
    }
  }

  if (validRootPaths.length === 0) {
    console.log('[Automation] No valid library paths accessible. Aborting check.');
    return;
  }

  // Check Movies
  const movies = db.prepare("SELECT id, title, folder_path, file_path FROM movies WHERE status = 'downloaded'").all();
  let moviesRemoved = 0;
  const moviesToDelete = [];
  const moviesToReset = [];
  for (const movie of movies) {
    if (!movie.folder_path) continue;
    
    // Ensure movie belongs to an accessible root
    const isOnAccessibleRoot = validRootPaths.some(root => isInsideRoot(root, movie.folder_path));
    if (!isOnAccessibleRoot) continue;

    if (!fs.existsSync(movie.folder_path)) {
      console.log(`[Automation] Movie folder missing, removing from DB: ${movie.title}`);
      moviesToDelete.push(movie.id);
      moviesRemoved++;
    } else if (movie.file_path && !fs.existsSync(movie.file_path)) {
      console.log(`[Automation] Movie file missing, reverting to monitored: ${movie.title}`);
      moviesToReset.push(movie.id);
    }
  }
  
  const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));

  if (moviesToDelete.length > 0) {
    const chunks = chunkArray(moviesToDelete, 100);
    for (const chunk of chunks) {
      db.transaction((ids) => {
        const delStmt = db.prepare('DELETE FROM movies WHERE id = ?');
        for (const id of ids) delStmt.run(id);
      })(chunk);
      await new Promise(r => setImmediate(r));
    }
  }
  if (moviesToReset.length > 0) {
    const chunks = chunkArray(moviesToReset, 100);
    for (const chunk of chunks) {
      db.transaction((ids) => {
        const resetStmt = db.prepare("UPDATE movies SET file_path = NULL, status = 'monitored' WHERE id = ?");
        for (const id of ids) resetStmt.run(id);
      })(chunk);
      await new Promise(r => setImmediate(r));
    }
  }

  // Check Shows
  const shows = db.prepare("SELECT id, title, folder_path FROM shows WHERE status = 'downloaded'").all();
  let showsRemoved = 0;
  const showsToDelete = [];
  for (const show of shows) {
    if (!show.folder_path) continue;
    
    // Ensure show belongs to an accessible root
    const isOnAccessibleRoot = validRootPaths.some(root => isInsideRoot(root, show.folder_path));
    if (!isOnAccessibleRoot) continue;

    if (!fs.existsSync(show.folder_path)) {
      console.log(`[Automation] Show folder missing, removing from DB: ${show.title}`);
      showsToDelete.push(show.id);
      showsRemoved++;
    }
  }
  
  if (showsToDelete.length > 0) {
    const chunks = chunkArray(showsToDelete, 100);
    for (const chunk of chunks) {
      db.transaction((ids) => {
        const delEpStmt = db.prepare('DELETE FROM episodes WHERE show_id = ?');
        const delShowStmt = db.prepare('DELETE FROM shows WHERE id = ?');
        for (const id of ids) {
          delEpStmt.run(id);
          delShowStmt.run(id);
        }
      })(chunk);
      await new Promise(r => setImmediate(r));
    }
  }

  // Check Episodes specifically — only for episodes whose show folder is on an accessible root
  const episodes = db.prepare("SELECT e.id, e.title, e.file_path, e.show_id, s.folder_path as show_folder FROM episodes e LEFT JOIN shows s ON s.id = e.show_id WHERE e.status = 'downloaded' AND e.file_path IS NOT NULL").all();
  const episodesToReset = [];
  for (const ep of episodes) {
    // Only verify episodes of shows that aren't being deleted entirely
    if (showsToDelete.includes(ep.show_id)) continue;

    // Only check episodes whose show folder is on an accessible root (same guard as movies/shows)
    const showFolder = ep.show_folder;
    if (showFolder) {
      const isOnAccessibleRoot = validRootPaths.some(root => isInsideRoot(root, showFolder));
      if (!isOnAccessibleRoot) continue;
    } else {
      // No show folder — fall back to checking the episode file's path against roots
      const isOnAccessibleRoot = validRootPaths.some(root => isInsideRoot(root, ep.file_path));
      if (!isOnAccessibleRoot) continue;
    }

    if (!fs.existsSync(ep.file_path)) {
      console.log(`[Automation] Episode file missing, reverting to monitored: ${ep.title}`);
      episodesToReset.push(ep.id);
    }
  }


  if (episodesToReset.length > 0) {
    const chunks = chunkArray(episodesToReset, 100);
    for (const chunk of chunks) {
      db.transaction((ids) => {
        const resetStmt = db.prepare("UPDATE episodes SET file_path = NULL, status = 'monitored' WHERE id = ?");
        for (const id of ids) resetStmt.run(id);
      })(chunk);
      await new Promise(r => setImmediate(r));
    }
  }

  if (moviesRemoved > 0 || showsRemoved > 0) {
    eventBus.success('Scan complete: Removed missing files from DB', { moviesRemoved, showsRemoved });
  }

  console.log(`[Automation] Missing files check complete. Removed ${moviesRemoved} movies and ${showsRemoved} shows.`);
};

// Holds references to active node-cron jobs so we can stop/restart them
const activeJobs = {};

const scheduleTask = (taskId, cronExp) => {
  if (activeJobs[taskId]) {
    activeJobs[taskId].stop();
  }
  activeJobs[taskId] = cron.schedule(cronExp, () => taskRegistry.executeTask(taskId));
  registerJob(activeJobs[taskId]);
};

const runDatabaseBackup = async () => {
  console.log('[Automation] Running database backup...');
  try {
    // __dirname = server/services — database is at server/data/database.sqlite
    const dbPath = path.join(__dirname, '../data/database.sqlite');
    const backupDir = path.join(__dirname, '../data/backups');
    
    await fsp.mkdir(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `database-${timestamp}.sqlite`);
    
    // Perform backup using SQLite online backup API if available, otherwise safely copy file
    try {
      await db.backup(backupPath);
    } catch {
      await fsp.copyFile(dbPath, backupPath);
    }
    console.log(`[Automation] Database backed up to ${backupPath}`);
    
    // Cleanup old backups (keep last 7 days)
    const files = await fsp.readdir(backupDir);
    const backups = files.filter(f => f.startsWith('database-') && f.endsWith('.sqlite'));
    if (backups.length > 7) {
      // Sort oldest first
      backups.sort();
      const toDelete = backups.slice(0, backups.length - 7);
      for (const file of toDelete) {
        await fsp.unlink(path.join(backupDir, file)).catch(() => {});
      }
      console.log(`[Automation] Deleted ${toDelete.length} old backup(s).`);
    }
  } catch (err) {
    console.error(`[Automation] Failed to backup database: ${err.message}`);
  }
};

const runAutoDeleteWatched = async () => {
  try {
    const enabledRow = db.prepare("SELECT value FROM settings WHERE key = ?").get('autoDeleteWatchedEnabled');
    if (!enabledRow || enabledRow.value !== 'true') return;

    const settingRow = db.prepare("SELECT value FROM settings WHERE key = ?").get('autoDeleteWatchedDays');
    if (!settingRow || !settingRow.value) return;
    const days = parseInt(settingRow.value, 10);
    if (isNaN(days) || days <= 0) return;

    console.log(`[Automation] Running auto-delete for watched media (older than ${days} days)...`);

    // Use a computed cutoff datetime bound as a parameter — avoids SQL injection (#1)
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19);

    const moviesToDelete = db.prepare(
      `SELECT id, title, file_path, folder_path FROM movies
       WHERE watched = 1 AND file_path IS NOT NULL AND watched_at <= ?`
    ).all(cutoff);

    for (const movie of moviesToDelete) {
      try {
        if (fs.existsSync(movie.file_path)) {
          const dirPath = movie.folder_path || path.dirname(movie.file_path);
          if (isRootLibraryPath(dirPath)) {
            await fsp.unlink(movie.file_path);
          } else {
            await deleteFolderRecursive(dirPath);
          }
          console.log(`[Automation] Auto-deleted watched movie: ${movie.title}`);
        }
        db.prepare("UPDATE movies SET file_path = NULL, status = 'unmonitored' WHERE id = ?").run(movie.id);
      } catch (err) {
        console.error(`[Automation] Failed to auto-delete movie ${movie.title}: ${err.message}`);
      }
    }

    const epsToDelete = db.prepare(
      `SELECT id, title, file_path FROM episodes
       WHERE watched = 1 AND file_path IS NOT NULL AND watched_at <= ?`
    ).all(cutoff);

    for (const ep of epsToDelete) {
      try {
        if (fs.existsSync(ep.file_path)) {
          await fsp.unlink(ep.file_path);
          console.log(`[Automation] Auto-deleted watched episode: ${ep.title}`);
        }
        // Mirror movie behavior (status='unmonitored'): search cycle requires monitored=1,
        // so this keeps deleted episodes out of searches/stats without redownload churn.
        db.prepare("UPDATE episodes SET file_path = NULL, status = 'unmonitored', monitored = 0 WHERE id = ?").run(ep.id);
      } catch (err) {
        console.error(`[Automation] Failed to auto-delete episode ${ep.title}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`[Automation] Error running auto-delete watched: ${err.message}`);
  }
};

const runPosterCacheWarmer = async () => {
  console.log('[Automation] Running Poster Cache Warmer...');
  let downloadedCount = 0;
  
  const processItem = async (item, type) => {
    if (item.tmdb_id && item.poster_path) {
      const existing = imageService.posterPath(type, item.tmdb_id);
      if (!fs.existsSync(existing)) {
        try {
          await imageService.ensurePoster(type, item.tmdb_id, item.poster_path);
          downloadedCount++;
        } catch (err) {
          console.error(`[Automation] Poster Cache Warmer failed for ${type} ${item.tmdb_id}: ${err.message}`);
        }
      }
    }
  };

  const movies = db.prepare("SELECT tmdb_id, poster_path FROM movies WHERE tmdb_id IS NOT NULL AND poster_path IS NOT NULL").all();
  await runWithConcurrency(movies, 5, m => processItem(m, 'movies'));

  const shows = db.prepare("SELECT tmdb_id, poster_path FROM shows WHERE tmdb_id IS NOT NULL AND poster_path IS NOT NULL").all();
  await runWithConcurrency(shows, 5, s => processItem(s, 'shows'));

  console.log(`[Automation] Poster Cache Warmer complete. Downloaded ${downloadedCount} missing posters.`);
};

const runOrphanedFileDetector = async () => {
  console.log('[Automation] Running Orphaned File Detector...');
  
  const pathsResult = db.prepare('SELECT path FROM library_paths').all();
  const validRootPaths = [];
  
  for (const row of pathsResult) {
    if (fs.existsSync(row.path)) {
      validRootPaths.push(row.path);
    }
  }

  if (validRootPaths.length === 0) {
    console.log('[Automation] No valid library paths accessible. Aborting Orphaned File Detector.');
    return;
  }

  const allDiskFiles = new Set();
  
  const walkDir = async (dir) => {
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (isVideoFile(entry.name)) {
          allDiskFiles.add(fullPath);
        }
      }
    } catch {
      // ignore access errors
    }
  };

  for (const rootPath of validRootPaths) {
    await walkDir(rootPath);
  }

  const dbMovies = db.prepare("SELECT file_path FROM movies WHERE file_path IS NOT NULL").all();
  const dbEpisodes = db.prepare("SELECT file_path FROM episodes WHERE file_path IS NOT NULL").all();
  
  const dbFiles = new Set();
  for (const m of dbMovies) dbFiles.add(m.file_path);
  for (const e of dbEpisodes) dbFiles.add(e.file_path);
  
  // Find orphaned (on disk but not in DB)
  const orphaned = [];
  for (const diskFile of allDiskFiles) {
    if (!dbFiles.has(diskFile)) {
      orphaned.push(diskFile);
    }
  }
  
  // Get existing unmanaged files in DB
  let existingOrphanedRows = [];
  try {
    existingOrphanedRows = db.prepare("SELECT id, file_path FROM unmanaged_files").all();
  } catch {
    // Unmanaged files table might not exist yet if migration hasn't run
  }
  const existingOrphanedSet = new Set(existingOrphanedRows.map(r => r.file_path));
  
  let newOrphanCount = 0;
  let resolvedOrphanCount = 0;

  try {
    db.transaction(() => {
      const insertStmt = db.prepare("INSERT INTO unmanaged_files (file_path, library_path, size) VALUES (?, ?, ?)");
      const deleteStmt = db.prepare("DELETE FROM unmanaged_files WHERE file_path = ?");
      
      // Insert new ones
      for (const orphan of orphaned) {
        if (!existingOrphanedSet.has(orphan)) {
          try {
            const stat = fs.statSync(orphan);
            const libPath = validRootPaths.find(p => orphan.startsWith(p)) || '';
            insertStmt.run(orphan, libPath, stat.size);
            newOrphanCount++;
          } catch { /* ignore */ }
        }
      }
      
      // Delete resolved ones (no longer on disk or now tracked)
      const currentOrphanedSet = new Set(orphaned);
      for (const existingRow of existingOrphanedRows) {
        if (!currentOrphanedSet.has(existingRow.file_path)) {
          deleteStmt.run(existingRow.file_path);
          resolvedOrphanCount++;
        }
      }
    })();
  } catch (err) {
    console.error('[Automation] Orphaned File Detector DB transaction failed:', err.message);
  }
  
  console.log(`[Automation] Orphaned File Detector complete. Found ${newOrphanCount} new orphans, resolved ${resolvedOrphanCount}.`);
};

const runDeepMetadataRefresh = async () => {
  console.log('[Automation] Running Stale Metadata Refresh...');
  
  const cutoffDate = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 19);
  
  const movies = db.prepare(`
    SELECT id, tmdb_id, title 
    FROM movies 
    WHERE status != 'unmonitored' AND added_at <= ? 
      AND (last_refreshed_at IS NULL OR last_refreshed_at <= ?)
  `).all(cutoffDate, cutoffDate);
  
  let moviesUpdated = 0;

  await runWithConcurrency(movies, 3, async (movie) => {
    try {
      const tmdbData = await tmdbService.getMovieById(movie.tmdb_id);
      if (tmdbData) {
        db.prepare("UPDATE movies SET rating = ?, poster_path = ?, overview = ?, last_refreshed_at = datetime('now') WHERE id = ?")
          .run(tmdbData.vote_average || 0, tmdbData.poster_path, tmdbData.overview, movie.id);
        moviesUpdated++;
      } else {
        db.prepare("UPDATE movies SET last_refreshed_at = datetime('now') WHERE id = ?").run(movie.id);
      }
    } catch (err) {
      console.error(`[Automation] Failed to deep refresh metadata for movie ${movie.title}: ${err.message}`);
    }
  });

  const shows = db.prepare(`
    SELECT id, tmdb_id, title 
    FROM shows 
    WHERE status != 'unmonitored' AND added_at <= ? 
      AND (last_refreshed_at IS NULL OR last_refreshed_at <= ?)
  `).all(cutoffDate, cutoffDate);
  
  let showsUpdated = 0;

  await runWithConcurrency(shows, 3, async (show) => {
    try {
      const data = await tmdbService.getShowById(show.tmdb_id);
      if (data) {
        db.prepare("UPDATE shows SET rating = ?, poster_path = ?, overview = ?, tmdb_status = ?, last_refreshed_at = datetime('now') WHERE id = ?")
          .run(data.vote_average || 0, data.poster_path, data.overview, data.status || '', show.id);

        const seasons = await tmdbService.getShowSeasons(show.tmdb_id);
        const insertEp = db.prepare(`
          INSERT INTO episodes (show_id, season_number, episode_number, title, overview, status, air_date, runtime)
          VALUES (?, ?, ?, ?, ?, 'monitored', ?, ?)
          ON CONFLICT(show_id, season_number, episode_number) DO UPDATE SET
            title = excluded.title,
            overview = excluded.overview,
            air_date = excluded.air_date,
            runtime = excluded.runtime
        `);

        const tmdbEpisodeKeys = new Set();
        // Same reliability guard as runRefreshMetadata: never prune against a failed TMDB fetch.
        let reliableFetch = seasons.length > 0;
        for (const s of seasons) {
          if (!reliableFetch) break;
          if (s.season_number === 0) continue;
          const episodes = await tmdbService.getSeasonEpisodes(show.tmdb_id, s.season_number);
          if (episodes.length === 0) {
            reliableFetch = false;
            break;
          }
          for (const ep of episodes) {
            const key = `${ep.season_number}|${ep.episode_number}`;
            tmdbEpisodeKeys.add(key);
            insertEp.run(show.id, ep.season_number, ep.episode_number, ep.name, ep.overview, ep.air_date, ep.runtime || null);
          }
        }

        if (!reliableFetch) {
          console.warn(`[Automation] Skipping stale-episode cleanup for "${show.title}" — TMDB episode data incomplete or unavailable.`);
        } else {
          const allDbEpisodes = db.prepare(
            'SELECT id, season_number, episode_number, status FROM episodes WHERE show_id = ?'
          ).all(show.id);

          db.transaction(() => {
            const deleteStale = db.prepare('DELETE FROM episodes WHERE id = ?');
            for (const ep of allDbEpisodes) {
              const key = `${ep.season_number}|${ep.episode_number}`;
              if (!tmdbEpisodeKeys.has(key) && ep.status !== 'downloaded') {
                deleteStale.run(ep.id);
              }
            }
          })();
        }

        showsUpdated++;
      } else {
        db.prepare("UPDATE shows SET last_refreshed_at = datetime('now') WHERE id = ?").run(show.id);
      }
    } catch (err) {
      console.error(`[Automation] Failed to deep refresh metadata for show ${show.title}: ${err.message}`);
    }
  });

  console.log(`[Automation] Stale Metadata Refresh complete. Refreshed ${moviesUpdated} movies and ${showsUpdated} shows.`);
};

const runReleaseMonitoring = async () => {
  console.log('[Automation] Running Release Monitoring...');
  
  const moviesRes = db.prepare(`
    UPDATE movies 
    SET next_search_at = datetime('now'), search_state = 'PENDING'
    WHERE (status IN ('monitored', 'missing'))
      AND monitored = 1
      AND release_date IS NOT NULL 
      AND release_date <= date('now', 'localtime')
      AND (last_searched_at IS NULL OR last_searched_at < datetime(release_date))
  `).run();

  const episodesRes = db.prepare(`
    UPDATE episodes 
    SET next_search_at = datetime('now'), search_state = 'PENDING'
    WHERE (status IN ('monitored', 'missing'))
      AND monitored = 1
      AND air_date IS NOT NULL 
      AND air_date <= ${getAiredCutoffSql()}
      AND (last_searched_at IS NULL OR last_searched_at < datetime(air_date))
  `).run();

  console.log(`[Automation] Release Monitoring complete. Scheduled search for ${moviesRes.changes} movies and ${episodesRes.changes} episodes.`);
};

const init = () => {
  const tasks = [
    { id: 'search_cycle',       name: 'Torrent Search Cycle',      desc: 'Searches for missing monitored movies and episodes and sends them to the download client.', fn: runSearchCycle },
    { id: 'refresh_metadata',   name: 'Refresh Metadata',          desc: 'Nightly trickle-refresh of metadata to keep posters, overviews, ratings and seasons up to date.', fn: runRefreshMetadata },
    { id: 'simkl_watched_sync', name: 'Simkl Watched Sync',        desc: 'Syncs watched status from your Simkl account to your local library.',                     fn: runSimklWatchedSync },
    { id: 'missing_files_check',name: 'Missing Files Check',       desc: 'Quickly checks library folders and removes items that have been deleted from disk.',       fn: runMissingFilesCheck },
    { id: 'database_backup',    name: 'Database Backup',           desc: 'Creates a compressed backup of the SQLite database to prevent data loss.',                 fn: runDatabaseBackup },
    { id: 'auto_delete_watched',name: 'Auto-Delete Watched',       desc: 'Automatically deletes media a configured number of days after watching.',                  fn: runAutoDeleteWatched },
    { id: 'poster_cache_warmer',name: 'Poster Cache Warmer',       desc: 'Proactively downloads missing poster images for all media.',                                fn: runPosterCacheWarmer },
    { id: 'orphaned_files',     name: 'Orphaned File Detector',    desc: 'Scans library folders for unmanaged video files not tracked in the database.',              fn: runOrphanedFileDetector },
    { id: 'deep_metadata',      name: 'Stale Metadata Refresh',    desc: 'Periodically checks and updates TMDB metadata for items added more than 30 days ago.',      fn: runDeepMetadataRefresh },
    { id: 'release_monitor',    name: 'Release Monitoring',        desc: 'Triggers an immediate search for monitored media that has just passed its release date.',   fn: runReleaseMonitoring },
  ];

  for (const task of tasks) {
    const cronExp = getSchedule(task.id);
    taskRegistry.registerTask(task.id, task.name, task.desc, cronExp, task.fn);
    scheduleTask(task.id, cronExp);
  }

  console.log('[Automation] Background tasks initialized.');
};

// Called by settings API to hot-reload schedules without restart
const rescheduleAll = (newSchedules) => {
  for (const [taskId, cronExp] of Object.entries(newSchedules)) {
    if (activeJobs[taskId]) {
      scheduleTask(taskId, cronExp);
      console.log(`[Automation] Rescheduled ${taskId} → ${cronExp}`);
    }
  }
};

module.exports = {
  init,
  runSearchCycle,
  runMissingFilesCheck,
  rescheduleAll,
};
