const cron = require('node-cron');
const db = require('../config/database');
const indexerService = require('./indexerService');
const downloadClientService = require('./downloadClientService');
const taskRegistry = require('./taskRegistry');
const tmdbService = require('./tmdbService');
const traktService = require('./traktService');
const eventBus = require('./eventBus');

const getProfile = (id) => {
  if (!id) return null;
  return db.prepare('SELECT * FROM quality_profiles WHERE id = ?').get(id);
};

const runSearchCycle = async () => {
  const monitoredMovies = db.prepare("SELECT * FROM movies WHERE status = 'monitored'").all();
  
  for (const movie of monitoredMovies) {
    try {
      const profile = getProfile(movie.quality_profile_id);
      const results = await indexerService.searchMovie(movie.title, movie.year, profile);
      
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
    WHERE e.status = 'monitored'
  `).all();

  for (const ep of monitoredEpisodes) {
    try {
      const profile = getProfile(ep.quality_profile_id);
      const results = await indexerService.searchEpisode(ep.show_title, ep.season_number, ep.episode_number, profile);
      
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
  // Find shows that are monitored and have missing or upcoming air dates.
  // Actually, easiest is just to update all monitored shows' episodes periodically.
  // But to be efficient, we can fetch seasons for shows that are monitored.
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

const init = () => {
  const cronExp = '0 * * * *';
  
  taskRegistry.registerTask(
    'search_cycle', 
    'Torrent Search Cycle', 
    'Searches for missing monitored movies and sends them to the download client.',
    cronExp,
    runSearchCycle
  );

  const ratingsCron = '0 0 * * *'; // Every day at midnight
  taskRegistry.registerTask(
    'update_ratings',
    'Update Ratings',
    'Fetches missing ratings from TMDB for movies and shows.',
    ratingsCron,
    runUpdateRatings
  );

  const traktSyncCron = '0 */6 * * *'; // Every 6 hours
  taskRegistry.registerTask(
    'trakt_watched_sync',
    'Trakt Watched Sync',
    'Syncs watched status from your Trakt account to your local library.',
    traktSyncCron,
    runTraktWatchedSync
  );

  const airDatesCron = '0 1 * * *'; // Every day at 1 AM
  taskRegistry.registerTask(
    'update_air_dates',
    'Update Air Dates',
    'Fetches missing and upcoming episode air dates from TMDB.',
    airDatesCron,
    runUpdateAirDates
  );

  cron.schedule(cronExp, () => taskRegistry.executeTask('search_cycle'));
  cron.schedule(ratingsCron, () => taskRegistry.executeTask('update_ratings'));
  cron.schedule(traktSyncCron, () => taskRegistry.executeTask('trakt_watched_sync'));
  cron.schedule(airDatesCron, () => taskRegistry.executeTask('update_air_dates'));
  console.log('[Automation] Background search, rating, air date, and Trakt sync schedulers initialized.');
};

module.exports = {
  init,
  runSearchCycle
};
