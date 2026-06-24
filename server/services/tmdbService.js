const axios = require('axios');
const db = require('../config/database');

const getTmdbApiKey = () => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('tmdbApiKey');
  return row ? row.value : null;
};

const tmdbApi = axios.create({
  baseURL: 'https://api.themoviedb.org/3'
});

tmdbApi.interceptors.request.use((config) => {
  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    throw new Error('TMDB API Key is not configured. Please set it in Settings.');
  }
  config.params = config.params || {};
  config.params.api_key = apiKey;
  config.params.language = 'en-US'; // Or support multiple languages later
  return config;
});

const searchMovies = async (query) => {
  try {
    const trimmedQuery = query.trim();
    
    let isImdb = false;
    let isTmdb = false;
    let explicitId = trimmedQuery;
    
    if (trimmedQuery.startsWith('imdb:')) {
      isImdb = true;
      explicitId = trimmedQuery.replace('imdb:', '').trim();
    } else if (trimmedQuery.startsWith('tmdb:')) {
      isTmdb = true;
      explicitId = trimmedQuery.replace('tmdb:', '').trim();
    } else if (/^tt\d+$/i.test(trimmedQuery)) {
      isImdb = true;
    } else if (/^\d+$/.test(trimmedQuery)) {
      // It's all digits, we can treat it as a TMDB ID but we fallback to search just in case
      // For explicit ID parsing, we will let it fall down or we can just try it here.
    }
    
    if (isImdb) {
      const response = await tmdbApi.get(`/find/${explicitId}`, {
        params: { external_source: 'imdb_id' }
      });
      const movies = response.data.movie_results || [];
      const shows = response.data.tv_results || [];
      movies.forEach(m => m.media_type = 'movie');
      shows.forEach(s => s.media_type = 'tv');
      return [...movies, ...shows];
    }
    
    if (isTmdb || /^\d+$/.test(trimmedQuery)) {
      const searchId = isTmdb ? explicitId : trimmedQuery;
      try {
        const responseMovie = await tmdbApi.get(`/movie/${searchId}`).catch(() => null);
        const responseShow = await tmdbApi.get(`/tv/${searchId}`).catch(() => null);
        
        const results = [];
        if (responseMovie && responseMovie.data) {
          responseMovie.data.media_type = 'movie';
          results.push(responseMovie.data);
        }
        if (responseShow && responseShow.data) {
          responseShow.data.media_type = 'tv';
          results.push(responseShow.data);
        }
        
        if (results.length > 0) return results;
        if (isTmdb) return []; // If explicit tmdb: was used and not found, return empty
      } catch (e) {
        if (isTmdb) return [];
      }
    }

    const response = await tmdbApi.get('/search/movie', {
      params: { query: trimmedQuery, include_adult: false, page: 1 }
    });
    return response.data.results;
  } catch (error) {
    if (error.response) {
      throw new Error(`TMDB Error: ${error.response.data.status_message}`);
    }
    throw error;
  }
};

const searchShows = async (query) => {
  try {
    const trimmedQuery = query.trim();
    
    let isImdb = false;
    let isTmdb = false;
    let explicitId = trimmedQuery;
    
    if (trimmedQuery.startsWith('imdb:')) {
      isImdb = true;
      explicitId = trimmedQuery.replace('imdb:', '').trim();
    } else if (trimmedQuery.startsWith('tmdb:')) {
      isTmdb = true;
      explicitId = trimmedQuery.replace('tmdb:', '').trim();
    } else if (/^tt\d+$/i.test(trimmedQuery)) {
      isImdb = true;
    } else if (/^\d+$/.test(trimmedQuery)) {
      // It's all digits, we can treat it as a TMDB ID but we fallback to search just in case
    }
    
    if (isImdb) {
      const response = await tmdbApi.get(`/find/${explicitId}`, {
        params: { external_source: 'imdb_id' }
      });
      const movies = response.data.movie_results || [];
      const shows = response.data.tv_results || [];
      movies.forEach(m => m.media_type = 'movie');
      shows.forEach(s => s.media_type = 'tv');
      return [...shows, ...movies]; // prioritize shows in the list
    }
    
    if (isTmdb || /^\d+$/.test(trimmedQuery)) {
      const searchId = isTmdb ? explicitId : trimmedQuery;
      try {
        const responseShow = await tmdbApi.get(`/tv/${searchId}`).catch(() => null);
        const responseMovie = await tmdbApi.get(`/movie/${searchId}`).catch(() => null);
        
        const results = [];
        if (responseShow && responseShow.data) {
          responseShow.data.media_type = 'tv';
          results.push(responseShow.data);
        }
        if (responseMovie && responseMovie.data) {
          responseMovie.data.media_type = 'movie';
          results.push(responseMovie.data);
        }
        
        if (results.length > 0) return results;
        if (isTmdb) return []; // If explicit tmdb: was used and not found, return empty
      } catch (e) {
        if (isTmdb) return [];
      }
    }

    const response = await tmdbApi.get('/search/tv', {
      params: { query: trimmedQuery, page: 1 }
    });
    return response.data.results;
  } catch (error) {
    if (error.response) {
      throw new Error(`TMDB Error: ${error.response.data.status_message}`);
    }
    throw error;
  }
};

const getMovieById = async (id) => {
  try {
    const response = await tmdbApi.get(`/movie/${id}`, { params: { append_to_response: 'videos' } });
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
};

const getShowById = async (id) => {
  try {
    const response = await tmdbApi.get(`/tv/${id}`, { params: { append_to_response: 'videos' } });
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
};

const getShowSeasons = async (tmdbId) => {
  const apiKey = getTmdbApiKey();
  if (!apiKey) return [];
  try {
    const res = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${apiKey}&language=en-US`);
    return res.data.seasons || [];
  } catch (err) {
    console.error('Failed to fetch show seasons', err.message);
    return [];
  }
};

const getSeasonEpisodes = async (tmdbId, seasonNumber) => {
  const apiKey = getTmdbApiKey();
  if (!apiKey) return [];
  try {
    const res = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}?api_key=${apiKey}&language=en-US`);
    return res.data.episodes || [];
  } catch (err) {
    console.error(`Failed to fetch episodes for season ${seasonNumber}`, err.message);
    return [];
  }
};

module.exports = {
  searchMovies,
  searchShows,
  getMovieById,
  getShowById,
  getShowSeasons,
  getSeasonEpisodes
};
