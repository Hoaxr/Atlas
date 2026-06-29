const cron = require('node-cron');
const db = require('../config/database');
const indexerService = require('./indexerService');
const downloadClientService = require('./downloadClientService');
const taskRegistry = require('./taskRegistry');
const tmdbService = require('./tmdbService');
const traktService = require('./traktService');
const eventBus = require('./eventBus');

const DEFAULT_SCHEDULES = {
  search_cycle:       '0 * * * *',
  refresh_ratings:    '0 3 * * 0',  // Weekly on Sunday at 3 AM
  update_air_dates:   '0 2 * * 0',  // Weekly on Sunday at 2 AM
  trakt_watched_sync: '0 */6 * * *',
  stale_cleanup:      '0 */6 * * *', // Every 6 hours
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
  const monitoredMovies = db.prepare("SELECT * FROM movies WHERE status = 'monitored' OR status = 'downloaded'").all();
  
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

      const results = await indexerService.searchMovie(movie.title, movie.year, profile, currentQuality);
      
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
    SELECT e.*, s.title as show_title, s.quality_profile_id 
    FROM episodes e 
    JOIN shows s ON e.show_id = s.id 
    WHERE (e.status = 'monitored' OR e.status = 'downloaded')
      AND e.monitored = 1
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

      const results = await indexerService.searchEpisode(ep.show_title, ep.season_number, ep.episode_number, profile, currentQuality);
      
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
  console.log('[Automation] Refreshing all movie ratings...');
  const movies = db.prepare('SELECT id, tmdb_id FROM movies').all();
  let updated = 0;
  for (const movie of movies) {
    try {
      const tmdbData = await tmdbService.getMovieById(movie.tmdb_id);
      if (tmdbData && tmdbData.vote_average !== undefined) {
        db.prepare('UPDATE movies SET rating = ? WHERE id = ? AND rating != ?').run(tmdbData.vote_average, movie.id, tmdbData.vote_average);
        updated++;
      }
    } catch (err) {
      console.error(`[Automation] Failed to refresh movie ${movie.tmdb_id}: ${err.message}`);
    }
  }

  console.log('[Automation] Refreshing all show ratings...');
  const shows = db.prepare('SELECT id, tmdb_id FROM shows').all();
  for (const show of shows) {
    try {
      const tmdbData = await tmdbService.getShowById(show.tmdb_id);
      if (tmdbData && tmdbData.vote_average !== undefined) {
        db.prepare('UPDATE shows SET rating = ? WHERE id = ? AND rating != ?').run(tmdbData.vote_average, show.id, tmdbData.vote_average);
        updated++;
      }
    } catch (err) {
      console.error(`[Automation] Failed to refresh show ${show.tmdb_id}: ${err.message}`);
    }
  }

  if (updated > 0) console.log(`[Automation] Refreshed ${updated} rating(s)`);
};

const runUpdateAirDates = async () => {
  console.log('[Automation] Updating episode air dates...');
  const shows = db.prepare("SELECT id, tmdb_id FROM shows WHERE status != 'unmonitored'").all();
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

const runStaleCleanup = async () => {
  console.log('[Automation] Checking for stale downloads...');
  const stale = db.prepare(`
    SELECT id, title, 'movie' as type FROM movies WHERE status = 'downloading'
    UNION ALL
    SELECT e.id, s.title, 'episode' as type 
    FROM episodes e JOIN shows s ON e.show_id = s.id 
    WHERE e.status = 'downloading'
  `).all();

  const torrents = await downloadClientService.getTorrents();
  const torrentNames = new Set(torrents.map(t => t.name?.toLowerCase()));

  let reset = 0;
  for (const item of stale) {
    try {
      const isActive = [...torrentNames].some(name => {
        const normalized = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const torrentNorm = name.replace(/[^a-z0-9]/g, '');
        return torrentNorm.includes(normalized) || normalized.includes(torrentNorm);
      });

      if (!isActive) {
        const table = item.type === 'movie' ? 'movies' : 'episodes';
        db.prepare(`UPDATE ${table} SET status = 'monitored', scene_name = NULL WHERE id = ?`).run(item.id);
        reset++;
        console.log(`[Automation] Reset stale download: ${item.title}`);
      }
    } catch (err) {
      console.error(`[Automation] Stale cleanup error for ${item.title}:`, err.message);
    }
  }

  if (reset > 0) {
    console.log(`[Automation] Reset ${reset} stale download(s) back to monitored`);
    eventBus.info(`Reset ${reset} stale download(s)`, { type: 'cleanup' });
  }
};

// Holds references to active node-cron jobs so we can stop/restart them
const activeJobs = {};

const scheduleTask = (taskId, cronExp) => {
  if (activeJobs[taskId]) {
    activeJobs[taskId].stop();
  }
  activeJobs[taskId] = cron.schedule(cronExp, () => taskRegistry.executeTask(taskId));
};

const init = () => {
  const tasks = [
    { id: 'search_cycle',       name: 'Torrent Search Cycle',      desc: 'Searches for missing monitored movies and sends them to the download client.',             fn: runSearchCycle },
    { id: 'stale_cleanup',      name: 'Stale Download Cleanup',    desc: 'Resets items stuck in downloading back to monitored if torrent was removed.',               fn: runStaleCleanup },
    { id: 'refresh_ratings',    name: 'Refresh All Ratings',       desc: 'Refreshes all ratings from TMDB to pick up rating changes (weekly).',                      fn: runRefreshAllRatings },
    { id: 'trakt_watched_sync', name: 'Trakt Watched Sync',        desc: 'Syncs watched status from your Trakt account to your local library.',                     fn: runTraktWatchedSync },
    { id: 'update_air_dates',   name: 'Update Air Dates',          desc: 'Fetches missing and upcoming episode air dates from TMDB (weekly).',                      fn: runUpdateAirDates },
  ];

  for (const task of tasks) {
    const cronExp = getSchedule(task.id);
    taskRegistry.registerTask(task.id, task.name, task.desc, cronExp, task.fn);
    scheduleTask(task.id, cronExp);
  }

  console.log('[Automation] Background search, rating, air date, Trakt sync, and ratings refresh schedulers initialized.');
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
  runStaleCleanup,
  rescheduleAll,
};
