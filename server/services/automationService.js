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
  update_ratings:     '0 0 * * *',
  update_air_dates:   '0 1 * * *',
  trakt_watched_sync: '0 */6 * * *',
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
        try { qualities = JSON.parse(profile.qualities); } catch(e) {}
        
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
        db.prepare("UPDATE movies SET status = 'downloading' WHERE id = ?").run(movie.id);
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
    WHERE e.status = 'monitored' OR e.status = 'downloaded'
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
        try { qualities = JSON.parse(profile.qualities); } catch(e) {}
        
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
        db.prepare("UPDATE episodes SET status = 'downloading' WHERE id = ?").run(ep.id);
        eventBus.info('Download started', { title: `${ep.show_title} S${String(ep.season_number).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')}`, type: 'episode', release: bestRelease.title });
      }
    } catch (err) {
      console.error(`[Automation] Failed to process ${ep.show_title} S${ep.season_number}E${ep.episode_number}:`, err.message);
    }
  }
};

const runUpdateRatings = async () => {
  console.log('[Automation] Updating movie ratings...');
  const movies = db.prepare('SELECT id, tmdb_id FROM movies WHERE rating IS NULL OR rating = 0').all();
  for (const movie of movies) {
    try {
      const tmdbData = await tmdbService.getMovieById(movie.tmdb_id);
      if (tmdbData && tmdbData.vote_average) {
        db.prepare('UPDATE movies SET rating = ? WHERE id = ?').run(tmdbData.vote_average, movie.id);
      }
    } catch (err) {
      console.error(`[Automation] Failed to update movie ${movie.tmdb_id}: ${err.message}`);
    }
  }

  console.log('[Automation] Updating show ratings...');
  const shows = db.prepare('SELECT id, tmdb_id FROM shows WHERE rating IS NULL OR rating = 0').all();
  for (const show of shows) {
    try {
      const tmdbData = await tmdbService.getShowById(show.tmdb_id);
      if (tmdbData && tmdbData.vote_average) {
        db.prepare('UPDATE shows SET rating = ? WHERE id = ?').run(tmdbData.vote_average, show.id);
      }
    } catch (err) {
      console.error(`[Automation] Failed to update show ${show.tmdb_id}: ${err.message}`);
    }
  }
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
    { id: 'update_ratings',     name: 'Update Ratings',            desc: 'Fetches missing ratings from TMDB for movies and shows.',                                  fn: runUpdateRatings },
    { id: 'trakt_watched_sync', name: 'Trakt Watched Sync',        desc: 'Syncs watched status from your Trakt account to your local library.',                     fn: runTraktWatchedSync },
    { id: 'update_air_dates',   name: 'Update Air Dates',          desc: 'Fetches missing and upcoming episode air dates from TMDB.',                               fn: runUpdateAirDates },
  ];

  for (const task of tasks) {
    const cronExp = getSchedule(task.id);
    taskRegistry.registerTask(task.id, task.name, task.desc, cronExp, task.fn);
    scheduleTask(task.id, cronExp);
  }

  console.log('[Automation] Background search, rating, air date, and Trakt sync schedulers initialized.');
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
  rescheduleAll,
};
