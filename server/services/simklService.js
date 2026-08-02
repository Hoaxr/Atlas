const axios = require('axios');
const db = require('../config/database');
const tmdbService = require('./tmdbService');
const eventBus = require('./eventBus');

const getSimklClientId = () => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('simklClientId');
  return row ? row.value : null;
};

const getSimklAccessToken = () => {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get('simklAccessToken');
  return row ? row.value : null;
};

const simklApi = axios.create({
  baseURL: 'https://api.simkl.com'
});

const simklRequest = async (config) => {
  const clientId = getSimklClientId();
  if (!clientId) {
    throw new Error('Simkl Client ID is not configured. Please set it in Settings.');
  }

  config.headers = config.headers || {};
  config.headers['Content-Type'] = 'application/json';
  config.headers['simkl-api-key'] = clientId;
  
  const accessToken = getSimklAccessToken();
  if (accessToken && !config.noAuth) {
    config.headers['Authorization'] = `Bearer ${accessToken}`;
  }
  
  return config;
};

simklApi.interceptors.request.use(simklRequest);

/**
 * Get device code (PIN) for user authorization
 * GET /oauth/pin?client_id={client_id}
 */
const getDeviceCode = async () => {
  const clientId = getSimklClientId();
  if (!clientId) {
    throw new Error('Simkl Client ID is not configured.');
  }
  const response = await axios.get(`https://api.simkl.com/oauth/pin?client_id=${clientId}`);
  // response.data: { user_code, verification_url, expires_in, interval }
  return response.data;
};

/**
 * Poll for token using user_code
 * GET /oauth/pin/{user_code}?client_id={client_id}
 */
const pollDeviceToken = async (userCode) => {
  const clientId = getSimklClientId();
  if (!clientId) {
    throw new Error('Simkl Client ID is not configured.');
  }
  const response = await axios.get(`https://api.simkl.com/oauth/pin/${userCode}?client_id=${clientId}`);
  // If authorized, returns: { result: "OK", access_token: "..." }
  return response.data;
};

/**
 * Sync watched movies and shows from Simkl
 * GET /sync/all-items/{type}/{status}
 */
const syncWatchedMovies = async () => {
  try {
    const response = await simklApi.get('/sync/all-items/movies/completed?extended=full');
    const moviesList = response.data.movies || [];

    const count = db.transaction((list) => {
      let localCount = 0;
      const insertWatched = db.prepare('INSERT OR REPLACE INTO watched_tmdb (tmdb_id, type) VALUES (?, ?)');
      const getMovieByTmdb = db.prepare('SELECT id FROM movies WHERE tmdb_id = ?');

      for (const item of list) {
        const tmdbId = item.ids?.tmdb || item.movie?.ids?.tmdb;
        if (!tmdbId) continue;
        insertWatched.run(tmdbId, 'movie');
        const movie = getMovieByTmdb.get(tmdbId);
        if (movie) {
          db.prepare('UPDATE movies SET watched = 1 WHERE id = ?').run(movie.id);
          localCount++;
        }
      }
      return localCount;
    })(moviesList);

    console.log(`[SimklSync] Synced ${count} watched movies (${moviesList.length} items returned from Simkl)`);
    return count;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('[SimklSync] Cannot sync watched movies — OAuth token required.');
      eventBus.error('Simkl authentication expired or invalid. Please reconnect in Settings.', { module: 'SimklSync' });
      return 0;
    }
    console.error('[SimklSync] Failed to sync watched movies:', error.message);
    return 0;
  }
};

const syncWatchedShows = async () => {
  try {
    const response = await simklApi.get('/sync/all-items/shows/completed?extended=full');
    const showsList = response.data.shows || [];

    const count = db.transaction((list) => {
      let localCount = 0;
      const insertWatched = db.prepare('INSERT OR REPLACE INTO watched_tmdb (tmdb_id, type) VALUES (?, ?)');
      const getShowByTmdb = db.prepare('SELECT id FROM shows WHERE tmdb_id = ?');

      for (const item of list) {
        const tmdbId = item.ids?.tmdb || item.show?.ids?.tmdb;
        if (!tmdbId) continue;
        insertWatched.run(tmdbId, 'show');
        const show = getShowByTmdb.get(tmdbId);
        if (show) {
          db.prepare('UPDATE shows SET watched = 1 WHERE id = ?').run(show.id);
          localCount++;
        }
      }
      return localCount;
    })(showsList);

    console.log(`[SimklSync] Synced ${count} watched shows (${showsList.length} items returned from Simkl)`);
    return count;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('[SimklSync] Cannot sync watched shows — OAuth token required.');
      eventBus.error('Simkl authentication expired or invalid. Please reconnect in Settings.', { module: 'SimklSync' });
      return 0;
    }
    console.error('[SimklSync] Failed to sync watched shows:', error.message);
    return 0;
  }
};

/**
 * Instantly push single item watch status update to Simkl
 */
const pushToSimklOnWatched = async (tmdbId, type, watched) => {
  try {
    const enabled = db.prepare("SELECT value FROM settings WHERE key = 'simklWatchedSync'").get();
    if (!enabled || enabled.value !== 'true') return;
    if (!tmdbId) return;

    const key = type === 'movie' ? 'movies' : 'shows';
    const endpoint = watched ? '/sync/history' : '/sync/history/remove';

    const payload = {
      [key]: [{ ids: { tmdb: tmdbId } }]
    };

    await simklApi.post(endpoint, payload);
    console.log(`[SimklSync] ${watched ? 'Pushed watched' : 'Removed watched'} for ${type} (TMDB ${tmdbId}) to Simkl`);
  } catch (error) {
    console.error(`[SimklSync] Failed to ${watched ? 'push watched' : 'remove watched'} to Simkl:`, error.message);
  }
};

/**
 * Dry run of pushing local watched items from Atlas to Simkl
 */
const pushDryRun = async () => {
  const movies = db.prepare('SELECT title, year, tmdb_id FROM movies WHERE watched = 1 AND tmdb_id IS NOT NULL').all();
  const shows = db.prepare('SELECT title, year, tmdb_id FROM shows WHERE watched = 1 AND tmdb_id IS NOT NULL').all();

  console.log(`[SimklSync Dry Run] Found ${movies.length} watched movies and ${shows.length} watched shows in local DB ready for Simkl.`);
  return {
    moviesCount: movies.length,
    showsCount: shows.length,
    movies,
    shows
  };
};

/**
 * Push local watched items from Atlas to Simkl
 * POST /sync/history
 */
const pushWatchedToSimkl = async () => {
  try {
    const movies = db.prepare('SELECT tmdb_id FROM movies WHERE watched = 1 AND tmdb_id IS NOT NULL').all();
    const shows = db.prepare('SELECT tmdb_id FROM shows WHERE watched = 1 AND tmdb_id IS NOT NULL').all();

    const payload = {
      movies: movies.map(m => ({ ids: { tmdb: m.tmdb_id } })),
      shows: shows.map(s => ({ ids: { tmdb: s.tmdb_id } }))
    };

    if (payload.movies.length === 0 && payload.shows.length === 0) {
      console.log('[SimklSync] No local watched items to push to Simkl.');
      return { moviesPushed: 0, showsPushed: 0 };
    }

    await simklApi.post('/sync/history', payload);
    console.log(`[SimklSync] Pushed ${payload.movies.length} movies and ${payload.shows.length} shows to Simkl`);
    return { moviesPushed: payload.movies.length, showsPushed: payload.shows.length };
  } catch (error) {
    console.error('[SimklSync] Failed to push watched items to Simkl:', error.message);
    throw error;
  }
};

const syncWatched = async () => {
  const enabled = db.prepare("SELECT value FROM settings WHERE key = 'simklWatchedSync'").get();
  if (!enabled || enabled.value !== 'true') {
    console.log('[SimklSync] Simkl watched sync is disabled in Settings.');
    return;
  }
  console.log('[SimklSync] Starting watched status sync...');
  // Pull from Simkl to update local database
  const movieCount = await syncWatchedMovies();
  const showCount = await syncWatchedShows();
  console.log(`[SimklSync] Sync complete — ${movieCount} movies, ${showCount} shows marked as watched.`);
};

/**
 * Fetch stats for user from Simkl
 * GET /users/settings
 */
const getUserStats = async () => {
  try {
    const response = await simklApi.get('/users/settings');
    const user = response.data.user || {};
    const stats = response.data.stats || {};

    return {
      username: user.name || 'Simkl User',
      movies: {
        watched: stats.movies?.completed || 0,
        minutes: stats.movies?.minutes || 0
      },
      shows: {
        watched: stats.shows?.completed || 0
      },
      episodes: {
        watched: stats.episodes?.completed || 0,
        minutes: stats.episodes?.minutes || 0
      },
      totalMinutes: (stats.movies?.minutes || 0) + (stats.episodes?.minutes || 0)
    };
  } catch (error) {
    if (error.response?.status === 401) {
      return { error: 'Simkl authentication required. Connect Simkl in Settings.' };
    }
    console.error('[Simkl] Failed to fetch user stats:', error.message);
    return { error: 'Failed to fetch Simkl stats.' };
  }
};

module.exports = {
  getDeviceCode,
  pollDeviceToken,
  syncWatched,
  pushWatchedToSimkl,
  pushDryRun,
  pushToSimklOnWatched,
  getUserStats
};
