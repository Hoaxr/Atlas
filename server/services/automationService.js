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
  refresh_ratings:    '0 3 * * 0',  // Weekly on Sunday at 3 AM
  update_air_dates:   '0 2 * * 0',  // Weekly on Sunday at 2 AM
  trakt_watched_sync: '0 */6 * * *',
  missing_files_check:'0 * * * *',  // Hourly fast check for deleted files
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

const runSearchCycle = async () => {
  // Skip movies not yet released (release_date is in the future).
  // Only include downloaded movies if their profile allows upgrades.
  const monitoredMovies = db.prepare(`
    SELECT m.* FROM movies m
    LEFT JOIN quality_profiles qp ON m.quality_profile_id = qp.id
    WHERE (m.status = 'monitored' OR (m.status = 'downloaded' AND qp.upgrade_allowed = 1))
      AND (m.release_date IS NULL OR date(m.release_date) <= date('now'))
  `).all();
  
  for (const movie of monitoredMovies) {
    try {
      const profile = getProfile(movie.quality_profile_id);
      if (!profile) continue;

      let currentQuality = null;
      if (movie.status === 'downloaded') {
        if (!profile.upgrade_allowed) continue;
        currentQuality = indexerService.parseQuality(movie.scene_name || '');
        
        if (currentQuality === profile.cutoff) continue;
        
        let qualities = [];
        try { qualities = JSON.parse(profile.qualities); } catch { /* ignore */ }
        
        const currentIdx = qualities.indexOf(currentQuality);
        const cutoffIdx = qualities.indexOf(profile.cutoff);
        
        if (currentIdx !== -1 && cutoffIdx !== -1 && currentIdx <= cutoffIdx) {
          continue;
        }
      }

      const results = await indexerService.searchMovie(movie.title, movie.year, profile, currentQuality, false, movie.tmdb_id);
      
      if (results.length > 0) {
        const bestRelease = results[0]; 
        await downloadClientService.addTorrent(bestRelease.link);
        db.prepare("UPDATE movies SET status = 'downloading', scene_name = ? WHERE id = ?").run(bestRelease.title, movie.id);
        eventBus.info('Download started', { title: movie.title, type: 'movie', release: bestRelease.title });
      }
    } catch (err) {
      console.error(`[Automation] Failed to process ${movie.title}:`, err.message);
    }
  }

  const monitoredEpisodes = db.prepare(`
    SELECT e.*, s.title as show_title, s.quality_profile_id, s.tmdb_id as show_tmdb_id
    FROM episodes e 
    JOIN shows s ON e.show_id = s.id
    LEFT JOIN quality_profiles qp ON s.quality_profile_id = qp.id
    WHERE (e.status = 'monitored' OR (e.status = 'downloaded' AND qp.upgrade_allowed = 1))
      AND e.monitored = 1
      AND (e.air_date IS NULL OR date(e.air_date) <= date('now'))
  `).all();

  for (const ep of monitoredEpisodes) {
    try {
      const profile = getProfile(ep.quality_profile_id);
      if (!profile) continue;

      let currentQuality = null;
      if (ep.status === 'downloaded') {
        if (!profile.upgrade_allowed) continue;
        currentQuality = indexerService.parseQuality(ep.scene_name || '');
        if (currentQuality === profile.cutoff) continue;
        
        let qualities = [];
        try { qualities = JSON.parse(profile.qualities); } catch { /* ignore */ }
        
        const currentIdx = qualities.indexOf(currentQuality);
        const cutoffIdx = qualities.indexOf(profile.cutoff);
        
        if (currentIdx !== -1 && cutoffIdx !== -1 && currentIdx <= cutoffIdx) {
          continue;
        }
      }

      const results = await indexerService.searchEpisode(ep.show_title, ep.season_number, ep.episode_number, profile, currentQuality, false, ep.show_tmdb_id);
      
      if (results.length > 0) {
        const bestRelease = results[0];
        await downloadClientService.addTorrent(bestRelease.link);
        db.prepare("UPDATE episodes SET status = 'downloading', scene_name = ? WHERE id = ?").run(bestRelease.title, ep.id);
        eventBus.info('Download started', { title: `${ep.show_title} S${String(ep.season_number).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')}`, type: 'episode', release: bestRelease.title });
      }
    } catch (err) {
      console.error(`[Automation] Failed to process ${ep.show_title} S${ep.season_number}E${ep.episode_number}:`, err.message);
    }
  }
};

const runRefreshAllRatings = async () => {
  // Only refresh items with missing or zero ratings — established ratings rarely change
  // and this avoids burning 1000+ TMDB API calls every week.
  console.log('[Automation] Refreshing movie ratings...');
  const movies = db.prepare("SELECT id, tmdb_id FROM movies WHERE rating IS NULL OR rating = 0").all();
  let updated = 0;

  await runWithConcurrency(movies, 3, async (movie) => {
    try {
      const tmdbData = await tmdbService.getMovieById(movie.tmdb_id);
      if (tmdbData && tmdbData.vote_average !== undefined) {
        db.prepare('UPDATE movies SET rating = ? WHERE id = ? AND (rating IS NULL OR rating = 0 OR rating != ?)').run(tmdbData.vote_average, movie.id, tmdbData.vote_average);
        updated++;
      }
    } catch (err) {
      console.error(`[Automation] Failed to refresh movie ${movie.tmdb_id}: ${err.message}`);
    }
  });

  console.log('[Automation] Refreshing show ratings...');
  const shows = db.prepare("SELECT id, tmdb_id FROM shows WHERE rating IS NULL OR rating = 0").all();

  await runWithConcurrency(shows, 3, async (show) => {
    try {
      const tmdbData = await tmdbService.getShowById(show.tmdb_id);
      if (tmdbData && tmdbData.vote_average !== undefined) {
        db.prepare('UPDATE shows SET rating = ? WHERE id = ? AND (rating IS NULL OR rating = 0 OR rating != ?)').run(tmdbData.vote_average, show.id, tmdbData.vote_average);
        updated++;
      }
    } catch (err) {
      console.error(`[Automation] Failed to refresh show ${show.tmdb_id}: ${err.message}`);
    }
  });

  if (updated > 0) console.log(`[Automation] Refreshed ${updated} rating(s)`);
};

const runUpdateAirDates = async () => {
  // Only process shows that have episodes without air dates (i.e. currently/previously airing).
  // Fully aired shows where every episode has a date are skipped.
  console.log('[Automation] Updating episode air dates...');
  const shows = db.prepare(`
    SELECT DISTINCT s.id, s.tmdb_id FROM shows s
    JOIN episodes e ON e.show_id = s.id
    WHERE s.status != 'unmonitored' AND (e.air_date IS NULL OR e.air_date = '')
  `).all();
  const updateEp = db.prepare(`
    UPDATE episodes SET air_date = ? 
    WHERE show_id = ? AND season_number = ? AND episode_number = ?
  `);
  
  for (const show of shows) {
    try {
      const seasons = await tmdbService.getShowSeasons(show.tmdb_id);
      for (const season of seasons) {
        if (season.season_number === 0) continue;
        const eps = await tmdbService.getSeasonEpisodes(show.tmdb_id, season.season_number);
        for (const ep of eps) {
          if (ep.air_date) {
            updateEp.run(ep.air_date, show.id, ep.season_number, ep.episode_number);
          }
        }
      }
    } catch (err) {
      console.error(`[Automation] Failed to update air dates for show ${show.tmdb_id}: ${err.message}`);
    }
  }
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
  const movies = db.prepare("SELECT id, title, folder_path FROM movies WHERE status != 'unmonitored'").all();
  let moviesRemoved = 0;
  for (const movie of movies) {
    if (!movie.folder_path) continue;
    
    // Ensure movie belongs to an accessible root
    const isOnAccessibleRoot = validRootPaths.some(root => movie.folder_path.startsWith(root));
    if (!isOnAccessibleRoot) continue;

    if (!fs.existsSync(movie.folder_path)) {
      console.log(`[Automation] Movie folder missing, removing from DB: ${movie.title}`);
      db.prepare('DELETE FROM movies WHERE id = ?').run(movie.id);
      moviesRemoved++;
    }
  }

  // Check Shows
  const shows = db.prepare("SELECT id, title, folder_path FROM shows WHERE status != 'unmonitored'").all();
  let showsRemoved = 0;
  for (const show of shows) {
    if (!show.folder_path) continue;
    
    // Ensure show belongs to an accessible root
    const isOnAccessibleRoot = validRootPaths.some(root => show.folder_path.startsWith(root));
    if (!isOnAccessibleRoot) continue;

    if (!fs.existsSync(show.folder_path)) {
      console.log(`[Automation] Show folder missing, removing from DB: ${show.title}`);
      db.prepare('DELETE FROM episodes WHERE show_id = ?').run(show.id);
      db.prepare('DELETE FROM shows WHERE id = ?').run(show.id);
      showsRemoved++;
    }
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

const init = () => {
  const tasks = [
    { id: 'search_cycle',       name: 'Torrent Search Cycle',      desc: 'Searches for missing monitored movies and episodes and sends them to the download client.', fn: runSearchCycle },
    { id: 'refresh_ratings',    name: 'Refresh All Ratings',       desc: 'Refreshes all ratings from TMDB to pick up rating changes (weekly).',                      fn: runRefreshAllRatings },
    { id: 'trakt_watched_sync', name: 'Trakt Watched Sync',        desc: 'Syncs watched status from your Trakt account to your local library.',                     fn: runTraktWatchedSync },
    { id: 'update_air_dates',   name: 'Update Air Dates',          desc: 'Fetches missing and upcoming episode air dates from TMDB (weekly).',                      fn: runUpdateAirDates },
    { id: 'missing_files_check',name: 'Missing Files Check',       desc: 'Quickly checks library folders and removes items that have been deleted from disk.',       fn: runMissingFilesCheck },
  ];

  for (const task of tasks) {
    const cronExp = getSchedule(task.id);
    taskRegistry.registerTask(task.id, task.name, task.desc, cronExp, task.fn);
    scheduleTask(task.id, cronExp);
  }

  console.log('[Automation] Background search, rating, air date, Trakt sync schedulers initialized.');
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
