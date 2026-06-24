const cron = require('node-cron');
const db = require('../config/database');
const indexerService = require('./indexerService');
const downloadClientService = require('./downloadClientService');
const taskRegistry = require('./taskRegistry');
const tmdbService = require('./tmdbService');

const getProfile = (id) => {
  if (!id) return null;
  return db.prepare('SELECT * FROM quality_profiles WHERE id = ?').get(id);
};

const runSearchCycle = async () => {
  // Find monitored movies
  const monitoredMovies = db.prepare("SELECT * FROM movies WHERE status = 'monitored'").all();
  
  for (const movie of monitoredMovies) {
    try {
      const profile = getProfile(movie.quality_profile_id);
      const results = await indexerService.searchMovie(movie.title, movie.year, profile);
      
      if (results.length > 0) {
        const bestRelease = results[0]; 
        await downloadClientService.addTorrent(bestRelease.link);
        db.prepare("UPDATE movies SET status = 'downloading' WHERE id = ?").run(movie.id);
      }
    } catch (err) {
      console.error(`[Automation] Failed to process ${movie.title}:`, err.message);
    }
  }

  // Find monitored episodes
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

  cron.schedule(cronExp, () => taskRegistry.executeTask('search_cycle'));
  cron.schedule(ratingsCron, () => taskRegistry.executeTask('update_ratings'));
  console.log('[Automation] Background search and rating schedulers initialized.');
};

module.exports = {
  init,
  runSearchCycle
};
