const axios = require('axios');
const db = require('../config/database');
const tmdbService = require('./tmdbService');

const getTraktClientId = () => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('traktClientId');
  return row ? row.value : null;
};

const traktApi = axios.create({
  baseURL: 'https://api.trakt.tv'
});

traktApi.interceptors.request.use((config) => {
  const clientId = getTraktClientId();
  if (!clientId) {
    throw new Error('Trakt Client ID is not configured. Please set it in Settings.');
  }
  config.headers = config.headers || {};
  config.headers['Content-Type'] = 'application/json';
  config.headers['trakt-api-version'] = '2';
  config.headers['trakt-api-key'] = clientId;
  return config;
});

const getTrendingMovies = async (limit = 20) => {
  try {
    const response = await traktApi.get(`/movies/trending`, { params: { limit } });
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

    return moviesWithTmdb.filter(m => m !== null);
  } catch (error) {
    if (error.response) {
      throw new Error(`Trakt Error: ${error.response.statusText}`);
    }
    throw error;
  }
};

const getTrendingShows = async (limit = 20) => {
  try {
    const response = await traktApi.get(`/shows/trending`, { params: { limit } });
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

    return showsWithTmdb.filter(s => s !== null);
  } catch (error) {
    if (error.response) {
      throw new Error(`Trakt Error: ${error.response.statusText}`);
    }
    throw error;
  }
};

module.exports = {
  getTrendingMovies,
  getTrendingShows
};
