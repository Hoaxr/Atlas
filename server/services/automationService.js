const cron = require('node-cron');
const db = require('../config/database');
const indexerService = require('./indexerService');
const downloadClientService = require('./downloadClientService');
const taskRegistry = require('./taskRegistry');
const tmdbService = require('./tmdbService');
const traktService = require('./traktService');
const eventBus = require('./eventBus');
const fs = require('fs');
const { runWithConcurrency } = require('../utils/concurrency');
const { registerJob } = require('../utils/cronRegistry');

const DEFAULT_SCHEDULES = {
  search_cycle:       '0 * * * *',
  refresh_metadata:   '0 3 * * *',  // Daily at 3 AM
  trakt_watched_sync: '0 */6 * * *',
  missing_files_check:'0 * * * *',  // Hourly fast check for deleted files
  database_backup:    '0 4 * * *',  // Daily at 4 AM
  auto_delete_watched:'0 5 * * *',  // Daily at 5 AM
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

    const monitoredMovies = db.prepare(`
      SELECT m.* FROM movies m
      LEFT JOIN quality_profiles qp ON m.quality_profile_id = qp.id
      WHERE (m.status = 'monitored' OR (m.status = 'downloaded' AND qp.upgrade_allowed = 1))
        AND (m.release_date IS NULL OR date(m.release_date) <= date('now'))
        AND (m.last_searched_at IS NULL OR m.last_searched_at < datetime('now', '-23 hours'))
      ORDER BY m.last_searched_at ASC NULLS FIRST
      LIMIT 20
    `).all();
    
    let movieFailures = 0;
    const processMovie = async (movie) => {
      if (movie.scene_name && activeTitles.has(movie.scene_name.toLowerCase().trim())) return;
      
      try {
        // Quick local check before searching: if folder exists and has video files, skip search.
        if (movie.folder_path && require('fs').existsSync(movie.folder_path)) {
          const files = await require('fs/promises').readdir(movie.folder_path);
          const { isVideoFile } = require('../utils/fileUtils');
          if (files.some(isVideoFile)) {
            // A video file exists but Atlas hasn't fully scanned it yet. Skip search.
            db.prepare("UPDATE movies SET last_searched_at = datetime('now') WHERE id = ?").run(movie.id);
            return;
          }
        }
        const profile = getProfile(movie.quality_profile_id);
        if (!profile) return;

        let currentQuality = null;
        if (movie.status === 'downloaded') {
          if (!profile.upgrade_allowed) return;
          currentQuality = indexerService.parseQuality(movie.scene_name || '');
          if (currentQuality === profile.cutoff) return;
          
          let qualities = [];
          try { qualities = JSON.parse(profile.qualities); } catch { qualities = []; }
          
          const currentIdx = qualities.indexOf(currentQuality);
          const cutoffIdx = qualities.indexOf(profile.cutoff);
          if (currentIdx !== -1 && cutoffIdx !== -1 && currentIdx <= cutoffIdx) return;
        }

        const results = await indexerService.searchMovie(movie.title, movie.year, profile, currentQuality, false, movie.tmdb_id);
        
        db.prepare("UPDATE movies SET last_searched_at = datetime('now') WHERE id = ?").run(movie.id);

        if (results.length > 0) {
          const bestRelease = results[0]; 
          await downloadClientService.addTorrent(bestRelease.link);
          db.prepare("UPDATE movies SET status = 'downloading', scene_name = ? WHERE id = ?").run(bestRelease.title, movie.id);
          eventBus.info('Download started', { title: movie.title, type: 'movie', release: bestRelease.title });
        }
      } catch (err) {
        movieFailures++;
        console.error(`[Automation] Failed to process ${movie.title}:`, err.message);
      }
    };
    
    await runWithConcurrency(monitoredMovies, 3, processMovie);

    const monitoredEpisodes = db.prepare(`
      SELECT e.*, s.title as show_title, s.quality_profile_id, s.tmdb_id as show_tmdb_id
      FROM episodes e 
      JOIN shows s ON e.show_id = s.id
      LEFT JOIN quality_profiles qp ON s.quality_profile_id = qp.id
      WHERE (e.status = 'monitored' OR (e.status = 'downloaded' AND qp.upgrade_allowed = 1))
        AND e.monitored = 1
        AND (e.air_date IS NULL OR date(e.air_date) < date('now'))
        AND (e.last_searched_at IS NULL OR e.last_searched_at < datetime('now', '-23 hours'))
      ORDER BY e.last_searched_at ASC NULLS FIRST
      LIMIT 50
    `).all();

    let episodeFailures = 0;
    const processEpisode = async (ep) => {
      const epLabel = `${ep.show_title} S${String(ep.season_number).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')}`;
      if (ep.scene_name && activeTitles.has(ep.scene_name.toLowerCase().trim())) return;

      try {
        const showRow = db.prepare("SELECT folder_path FROM shows WHERE id = ?").get(ep.show_id);
        if (showRow && showRow.folder_path && require('fs').existsSync(showRow.folder_path)) {
          // Quick recursive check for SxxExx
          const s = String(ep.season_number).padStart(2,'0');
          const eStr = String(ep.episode_number).padStart(2,'0');
          const epRegex = new RegExp(`s${s}e${eStr}`, 'i');
          const { isVideoFile } = require('../utils/fileUtils');
          
          let found = false;
          const checkDir = async (dir) => {
            if (found) return;
            const entries = await require('fs/promises').readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = require('path').join(dir, entry.name);
              if (entry.isDirectory()) {
                await checkDir(fullPath);
              } else if (isVideoFile(entry.name) && epRegex.test(entry.name)) {
                found = true;
                break;
              }
            }
          };
          await checkDir(showRow.folder_path);
          if (found) {
             // File exists but Atlas hasn't fully scanned it yet
             db.prepare("UPDATE episodes SET last_searched_at = datetime('now') WHERE id = ?").run(ep.id);
             return;
          }
        }

        const profile = getProfile(ep.quality_profile_id);
        if (!profile) return;

        let currentQuality = null;
        if (ep.status === 'downloaded') {
          if (!profile.upgrade_allowed) return;
          currentQuality = indexerService.parseQuality(ep.scene_name || '');
          if (currentQuality === profile.cutoff) return;
          
          let qualities = [];
          try { qualities = JSON.parse(profile.qualities); } catch { qualities = []; }
          
          const currentIdx = qualities.indexOf(currentQuality);
          const cutoffIdx = qualities.indexOf(profile.cutoff);
          if (currentIdx !== -1 && cutoffIdx !== -1 && currentIdx <= cutoffIdx) return;
        }

        const results = await indexerService.searchEpisode(ep.show_title, ep.season_number, ep.episode_number, profile, currentQuality, false, ep.show_tmdb_id);
        
        db.prepare("UPDATE episodes SET last_searched_at = datetime('now') WHERE id = ?").run(ep.id);

        if (results.length > 0) {
          const bestRelease = results[0];
          await downloadClientService.addTorrent(bestRelease.link);
          db.prepare("UPDATE episodes SET status = 'downloading', scene_name = ? WHERE id = ?").run(bestRelease.title, ep.id);
          eventBus.info('Download started', { title: epLabel, type: 'episode', release: bestRelease.title });
        }
      } catch (err) {
        episodeFailures++;
        console.error(`[Automation] Failed to process ${epLabel}:`, err.message);
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
        db.prepare('UPDATE movies SET rating = ?, poster_path = ?, overview = ?, last_refreshed_at = datetime("now") WHERE id = ?')
          .run(tmdbData.vote_average || 0, tmdbData.poster_path, tmdbData.overview, movie.id);
        moviesUpdated++;
      } else {
        db.prepare('UPDATE movies SET last_refreshed_at = datetime("now") WHERE id = ?').run(movie.id);
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
        db.prepare('UPDATE shows SET rating = ?, poster_path = ?, overview = ?, tmdb_status = ?, last_refreshed_at = datetime("now") WHERE id = ?')
          .run(data.vote_average || 0, data.poster_path, data.overview, data.status || '', show.id);

        const seasons = await tmdbService.getShowSeasons(show.tmdb_id);
        const insertEp = db.prepare(`
          INSERT INTO episodes (show_id, season_number, episode_number, title, overview, status, air_date)
          VALUES (?, ?, ?, ?, ?, 'monitored', ?)
          ON CONFLICT(show_id, season_number, episode_number) DO UPDATE SET
            title = excluded.title,
            overview = excluded.overview,
            air_date = excluded.air_date
        `);
        
        const tmdbEpisodeKeys = new Set();
        for (const s of seasons) {
          if (s.season_number === 0) continue;
          const episodes = await tmdbService.getSeasonEpisodes(show.tmdb_id, s.season_number);
          for (const ep of episodes) {
            const key = `${ep.season_number}|${ep.episode_number}`;
            tmdbEpisodeKeys.add(key);
            insertEp.run(show.id, ep.season_number, ep.episode_number, ep.name, ep.overview, ep.air_date);
          }
        }

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
        showsUpdated++;
      } else {
        db.prepare('UPDATE shows SET last_refreshed_at = datetime("now") WHERE id = ?').run(show.id);
      }
    } catch (err) {
      console.error(`[Automation] Failed to refresh metadata for show ${show.title}: ${err.message}`);
    }
  });

  console.log(`[Automation] Metadata trickle-refresh complete. Refreshed ${moviesUpdated} movies and ${showsUpdated} shows.`);
};

const runTraktWatchedSync = async () => {
  await traktService.syncWatched();
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
  const movies = db.prepare("SELECT id, title, folder_path, file_path FROM movies WHERE status != 'unmonitored'").all();
  let moviesRemoved = 0;
  const moviesToDelete = [];
  const moviesToReset = [];
  for (const movie of movies) {
    if (!movie.folder_path) continue;
    
    // Ensure movie belongs to an accessible root
    const isOnAccessibleRoot = validRootPaths.some(root => movie.folder_path.startsWith(root));
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
  const shows = db.prepare("SELECT id, title, folder_path FROM shows WHERE status != 'unmonitored'").all();
  let showsRemoved = 0;
  const showsToDelete = [];
  for (const show of shows) {
    if (!show.folder_path) continue;
    
    // Ensure show belongs to an accessible root
    const isOnAccessibleRoot = validRootPaths.some(root => show.folder_path.startsWith(root));
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

  // Check Episodes specifically
  const episodes = db.prepare("SELECT id, title, file_path, show_id FROM episodes WHERE file_path IS NOT NULL").all();
  let episodesReset = 0;
  const episodesToReset = [];
  for (const ep of episodes) {
    // Only verify episodes of shows that aren't being deleted entirely
    if (showsToDelete.includes(ep.show_id)) continue;
    
    if (!fs.existsSync(ep.file_path)) {
      console.log(`[Automation] Episode file missing, reverting to monitored: ${ep.title}`);
      episodesToReset.push(ep.id);
      episodesReset++;
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
    const fsp = require('fs/promises');
    const path = require('path');
    const dbPath = path.join(__dirname, '../../data/database.sqlite');
    const backupDir = path.join(__dirname, '../../data/backups');
    
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
    const fsp = require('fs/promises');
    const path = require('path');
    const { isRootLibraryPath } = require('../utils/fileUtils');

    const moviesToDelete = db.prepare(`SELECT id, title, file_path, folder_path FROM movies WHERE watched = 1 AND watched_at <= datetime('now', '-${days} days') AND file_path IS NOT NULL`).all();
    
    for (const movie of moviesToDelete) {
      try {
        if (fs.existsSync(movie.file_path)) {
          const dirPath = movie.folder_path || path.dirname(movie.file_path);
          if (isRootLibraryPath(dirPath)) {
            await fsp.unlink(movie.file_path);
          } else {
            await fsp.rm(dirPath, { recursive: true, force: true });
          }
          console.log(`[Automation] Auto-deleted watched movie: ${movie.title}`);
        }
        db.prepare("UPDATE movies SET file_path = NULL, status = 'unmonitored' WHERE id = ?").run(movie.id);
      } catch (err) {
        console.error(`[Automation] Failed to auto-delete movie ${movie.title}: ${err.message}`);
      }
    }

    const epsToDelete = db.prepare(`SELECT id, title, file_path FROM episodes WHERE watched = 1 AND watched_at <= datetime('now', '-${days} days') AND file_path IS NOT NULL`).all();
    
    for (const ep of epsToDelete) {
      try {
        if (fs.existsSync(ep.file_path)) {
          await fsp.unlink(ep.file_path);
          console.log(`[Automation] Auto-deleted watched episode: ${ep.title}`);
        }
        db.prepare("UPDATE episodes SET file_path = NULL WHERE id = ?").run(ep.id);
      } catch (err) {
        console.error(`[Automation] Failed to auto-delete episode ${ep.title}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`[Automation] Error running auto-delete watched: ${err.message}`);
  }
};

const init = () => {
  const tasks = [
    { id: 'search_cycle',       name: 'Torrent Search Cycle',      desc: 'Searches for missing monitored movies and episodes and sends them to the download client.', fn: runSearchCycle },
    { id: 'refresh_metadata',   name: 'Refresh Metadata',          desc: 'Nightly trickle-refresh of metadata to keep posters, overviews, ratings and seasons up to date.', fn: runRefreshMetadata },
    { id: 'trakt_watched_sync', name: 'Trakt Watched Sync',        desc: 'Syncs watched status from your Trakt account to your local library.',                     fn: runTraktWatchedSync },
    { id: 'missing_files_check',name: 'Missing Files Check',       desc: 'Quickly checks library folders and removes items that have been deleted from disk.',       fn: runMissingFilesCheck },
    { id: 'database_backup',    name: 'Database Backup',           desc: 'Creates a compressed backup of the SQLite database to prevent data loss.',                 fn: runDatabaseBackup },
    { id: 'auto_delete_watched',name: 'Auto-Delete Watched',       desc: 'Automatically deletes media a configured number of days after watching.',                  fn: runAutoDeleteWatched },
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
