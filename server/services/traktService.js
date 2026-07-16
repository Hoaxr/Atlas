const axios = require('axios');
const db = require('../config/database');
const tmdbService = require('./tmdbService');
const eventBus = require('./eventBus');

const getTraktClientId = () => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('traktClientId');
  return row ? row.value : null;
};

const trendingCache = {
  movies: { data: null, timestamp: 0 },
  shows: { data: null, timestamp: 0 }
};
const TRENDING_CACHE_TTL = 1000 * 60 * 60; // 1 hour

const traktApi = axios.create({
  baseURL: 'https://api.trakt.tv'
});

const getTraktAccessToken = () => {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get('traktAccessToken');
  return row ? row.value : null;
};

const traktRequest = async (config) => {
  const clientId = getTraktClientId();
  if (!clientId) {
    throw new Error('Trakt Client ID is not configured. Please set it in Settings.');
  }

  // Refresh token automatically if expired
  if (!config.noAuth) {
    await refreshTokenIfExpired();
  }

  config.headers = config.headers || {};
  config.headers['Content-Type'] = 'application/json';
  config.headers['trakt-api-version'] = '2';
  config.headers['trakt-api-key'] = clientId;
  
  const accessToken = getTraktAccessToken();
  if (accessToken && !config.noAuth) {
    config.headers['Authorization'] = `Bearer ${accessToken}`;
  }
  
  return config;
};

traktApi.interceptors.request.use(traktRequest);

const getTrendingMovies = async (limit = 20) => {
  if (trendingCache.movies.data && Date.now() - trendingCache.movies.timestamp < TRENDING_CACHE_TTL) {
    return trendingCache.movies.data.slice(0, limit);
  }

  try {
    const response = await traktApi.get(`/movies/trending`, { params: { limit }, noAuth: true });
    const traktMovies = response.data;

    // Fetch TMDB data for each movie
    const moviesWithTmdb = await Promise.all(
      traktMovies.map(async (item) => {
        const tmdbId = item.movie.ids.tmdb;
        if (!tmdbId) return null;
        
        try {
          const tmdbData = await tmdbService.getMovieById(tmdbId);
          if (!tmdbData) return null;
          
          return {
            ...item.movie,
            media_type: 'movie',
            watchers: item.watchers,
            poster_path: tmdbData.poster_path,
            vote_average: tmdbData.vote_average,
            release_date: tmdbData.release_date
          };
        } catch (e) {
          console.error(`Failed to fetch TMDB data for movie ID ${tmdbId}:`, e.message);
          return null;
        }
      })
    );

    const result = moviesWithTmdb.filter(m => m !== null);
    trendingCache.movies = { data: result, timestamp: Date.now() };
    return result;
  } catch (error) {
    if (error.response) {
      throw new Error(`Trakt Error: ${error.response.statusText}`, { cause: error });
    }
    throw error;
  }
};

const getTrendingShows = async (limit = 20) => {
  if (trendingCache.shows.data && Date.now() - trendingCache.shows.timestamp < TRENDING_CACHE_TTL) {
    return trendingCache.shows.data.slice(0, limit);
  }

  try {
    const response = await traktApi.get(`/shows/trending`, { params: { limit }, noAuth: true });
    const traktShows = response.data;

    const showsWithTmdb = await Promise.all(
      traktShows.map(async (item) => {
        const tmdbId = item.show.ids.tmdb;
        if (!tmdbId) return null;
        
        try {
          const tmdbData = await tmdbService.getShowById(tmdbId);
          if (!tmdbData) return null;
          
          return {
            ...item.show,
            media_type: 'tv',
            watchers: item.watchers,
            poster_path: tmdbData.poster_path,
            vote_average: tmdbData.vote_average,
            release_date: tmdbData.first_air_date
          };
        } catch (e) {
          console.error(`Failed to fetch TMDB data for show ID ${tmdbId}:`, e.message);
          return null;
        }
      })
    );

    const result = showsWithTmdb.filter(s => s !== null);
    trendingCache.shows = { data: result, timestamp: Date.now() };
    return result;
  } catch (error) {
    if (error.response) {
      throw new Error(`Trakt Error: ${error.response.statusText}`, { cause: error });
    }
    throw error;
  }
};

const refreshTokenIfExpired = async () => {
  const expiresAt = parseInt(db.prepare("SELECT value FROM settings WHERE key = ?").get('traktTokenExpiresAt')?.value || '0', 10);
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt > 0 && now >= expiresAt) {
    console.log('[TraktSync] Token expired, refreshing...');
    const clientId = db.prepare("SELECT value FROM settings WHERE key = ?").get('traktClientId')?.value;
    const clientSecret = db.prepare("SELECT value FROM settings WHERE key = ?").get('traktClientSecret')?.value;
    const refreshToken = db.prepare("SELECT value FROM settings WHERE key = ?").get('traktRefreshToken')?.value;
    if (!clientId || !clientSecret || !refreshToken) {
      console.log('[TraktSync] Cannot refresh — missing credentials');
      return;
    }
    try {
      const response = await axios.post('https://api.trakt.tv/oauth/token', {
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token'
      });
      const { access_token, refresh_token, created_at, expires_in } = response.data;
      db.prepare("UPDATE settings SET value = ? WHERE key = 'traktAccessToken'").run(access_token);
      if (refresh_token) db.prepare("UPDATE settings SET value = ? WHERE key = 'traktRefreshToken'").run(refresh_token);
      db.prepare("UPDATE settings SET value = ? WHERE key = 'traktTokenExpiresAt'").run(String(Number(created_at) + Number(expires_in)));
      console.log('[TraktSync] Token refreshed successfully');
    } catch (err) {
      console.error('[TraktSync] Token refresh failed:', err.response?.data || err.message);
      // hoisted eventBus
      eventBus.error('Trakt token refresh failed. Please reconnect your account in Settings.', { module: 'TraktSync' });
    }
  }
};

const syncWatchedMovies = async () => {
  try {
    let page = 1;
    let totalPages = 1;
    let count = 0;

    const processWatchedMovies = db.transaction((moviesList) => {
      let localCount = 0;
      const insertWatched = db.prepare('INSERT OR REPLACE INTO watched_tmdb (tmdb_id, type) VALUES (?, ?)');
      const getMovie = db.prepare('SELECT id FROM movies WHERE tmdb_id = ?');
      const updateWatched = db.prepare('UPDATE movies SET watched = 1, watched_at = CURRENT_TIMESTAMP WHERE id = ?');

      for (const item of moviesList) {
        const tmdbId = item.movie.ids.tmdb;
        if (!tmdbId) continue;
        insertWatched.run(tmdbId, 'movie');
        const movie = getMovie.get(tmdbId);
        if (movie) {
          updateWatched.run(movie.id);
          localCount++;
        }
      }
      return localCount;
    });

    while (page <= totalPages) {
      const response = await traktApi.get('/sync/watched/movies', { params: { page } });
      totalPages = parseInt(response.headers['x-pagination-page-count']) || 1;
      const watchedMovies = response.data;

      count += processWatchedMovies(watchedMovies);
      page++;
    }

    console.log(`[TraktSync] Synced ${count} watched movies`);
    return count;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('[TraktSync] Cannot sync watched movies — OAuth token required. Add a Trakt access token in Settings.');
      // hoisted eventBus
      eventBus.error('Trakt authentication expired or invalid. Please reconnect in Settings.', { module: 'TraktSync' });
      return 0;
    }
    console.error('[TraktSync] Failed to sync watched movies:', error.message);
    return 0;
  }
};

const syncWatchedShows = async () => {
  try {
    let page = 1;
    let totalPages = 1;
    let count = 0;

    const processWatchedShows = db.transaction((showsList) => {
      let localCount = 0;
      const insertWatched = db.prepare('INSERT OR REPLACE INTO watched_tmdb (tmdb_id, type) VALUES (?, ?)');
      const getShow = db.prepare('SELECT id FROM shows WHERE tmdb_id = ?');
      const updateWatched = db.prepare('UPDATE shows SET watched = 1 WHERE id = ?');

      for (const item of showsList) {
        const tmdbId = item.show.ids.tmdb;
        if (!tmdbId) continue;
        insertWatched.run(tmdbId, 'show');
        const show = getShow.get(tmdbId);
        if (show) {
          updateWatched.run(show.id);
          localCount++;
        }
      }
      return localCount;
    });

    while (page <= totalPages) {
      const response = await traktApi.get('/sync/watched/shows', { params: { page } });
      totalPages = parseInt(response.headers['x-pagination-page-count']) || 1;
      const watchedShows = response.data;

      count += processWatchedShows(watchedShows);
      page++;
    }

    console.log(`[TraktSync] Synced ${count} watched shows`);
    return count;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('[TraktSync] Cannot sync watched shows — OAuth token required. Add a Trakt access token in Settings.');
      // hoisted eventBus
      eventBus.error('Trakt authentication expired or invalid. Please reconnect in Settings.', { module: 'TraktSync' });
      return 0;
    }
    console.error('[TraktSync] Failed to sync watched shows:', error.message);
    return 0;
  }
};

const watchedCache = {
  movie: { ids: null, timestamp: 0 },
  show: { ids: null, timestamp: 0 }
};
const CACHE_TTL = 1000 * 60 * 15; // 15 minutes

const getWatchedTmdbIds = async (type) => {
  if (watchedCache[type].ids && Date.now() - watchedCache[type].timestamp < CACHE_TTL) {
    return watchedCache[type].ids;
  }

  try {
    const endpoint = type === 'movie' ? '/sync/watched/movies' : '/sync/watched/shows';
    let allItems = [];
    let page = 1;
    
    while (true) {
      const response = await traktApi.get(endpoint, { params: { page, limit: 1000 } });
      allItems = allItems.concat(response.data);
      const pageCount = parseInt(response.headers['x-pagination-page-count'], 10) || 1;
      if (page >= pageCount) break;
      page++;
    }
    
    const ids = [];
    for (const item of allItems) {
      const tmdbId = type === 'movie' ? item.movie?.ids?.tmdb : item.show?.ids?.tmdb;
      if (tmdbId) ids.push(tmdbId);
    }
    
    watchedCache[type] = { ids, timestamp: Date.now() };
    return ids;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('[TraktSync] Cannot fetch watched list — OAuth token required.');
      return [];
    }
    console.error(`[TraktSync] Failed to fetch watched ${type}s:`, error.message);
    return [];
  }
};

const getUserStats = async () => {
  try {
    const response = await traktApi.get('/users/me/stats');
    const { movies, shows, episodes } = response.data;

    return {
      movies: {
        watched: movies?.watched || 0,
        minutes: movies?.minutes || 0,
      },
      shows: {
        watched: shows?.watched || 0,
      },
      episodes: {
        watched: episodes?.watched || 0,
        minutes: episodes?.minutes || 0,
      },
      totalMinutes: (movies?.minutes || 0) + (episodes?.minutes || 0),
    };
  } catch (error) {
    if (error.response?.status === 401) {
      return { error: 'Trakt authentication required. Connect Trakt in Settings.' };
    }
    console.error('[Trakt] Failed to fetch user stats:', error.message);
    return { error: 'Failed to fetch Trakt stats.' };
  }
};

const syncWatched = async () => {
  const enabled = db.prepare("SELECT value FROM settings WHERE key = 'traktWatchedSync'").get();
  if (!enabled || enabled.value !== 'true') {
    console.log('[TraktSync] Trakt watched sync is disabled in Settings.');
    return;
  }
  console.log('[TraktSync] Starting watched status sync...');
  const movieCount = await syncWatchedMovies();
  const showCount = await syncWatchedShows();
  console.log(`[TraktSync] Sync complete — ${movieCount} movies, ${showCount} shows marked as watched.`);
};

module.exports = {
  getTrendingMovies,
  getTrendingShows,
  syncWatched,
  getWatchedTmdbIds,
  getUserStats
};
