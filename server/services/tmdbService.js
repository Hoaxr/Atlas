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
    
    // Try ID lookup
    let idResult = null;
    if (isTmdb || /^\d+$/.test(trimmedQuery)) {
      const searchId = isTmdb ? explicitId : trimmedQuery;
      try {
        const responseMovie = await tmdbApi.get(`/movie/${searchId}`).catch(() => null);
        if (responseMovie && responseMovie.data) {
          responseMovie.data.media_type = 'movie';
          idResult = responseMovie.data;
        }
      } catch (e) {
        // Ignore
      }
      // If explicit tmdb: prefix was used, return just the ID result (or empty if not found)
      if (isTmdb) {
        return idResult ? [idResult] : [];
      }
    }

    // Also run a text search for plain numbers — this ensures searching "300" (the title)
    // doesn't get short-circuited by the ID lookup returning a different movie
    const response = await tmdbApi.get('/search/movie', {
      params: { query: trimmedQuery, include_adult: false, page: 1 }
    });
    const textResults = response.data.results || [];

    // If we found an exact ID match, prepend it (avoid duplicate if it's already in text results)
    if (idResult) {
      const isDuplicate = textResults.some(r => r.id === idResult.id);
      if (!isDuplicate) {
        textResults.unshift(idResult);
      }
    }

    return textResults;
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
    
    // Try ID lookup
    let idResult = null;
    if (isTmdb || /^\d+$/.test(trimmedQuery)) {
      const searchId = isTmdb ? explicitId : trimmedQuery;
      try {
        const responseShow = await tmdbApi.get(`/tv/${searchId}`).catch(() => null);
        if (responseShow && responseShow.data) {
          responseShow.data.media_type = 'tv';
          idResult = responseShow.data;
        }
      } catch (e) {
        // Ignore
      }
      // If explicit tmdb: prefix was used, return just the ID result (or empty if not found)
      if (isTmdb) {
        return idResult ? [idResult] : [];
      }
    }

    // Also run a text search for plain numbers
    const response = await tmdbApi.get('/search/tv', {
      params: { query: trimmedQuery, page: 1 }
    });
    const textResults = response.data.results || [];

    // Prepend exact ID match if found and not already in results
    if (idResult) {
      const isDuplicate = textResults.some(r => r.id === idResult.id);
      if (!isDuplicate) {
        textResults.unshift(idResult);
      }
    }

    return textResults;
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

const getSeasonById = async (showId, seasonNumber) => {
  try {
    const response = await tmdbApi.get(`/tv/${showId}/season/${seasonNumber}`);
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

const getRecentMovies = async () => {
  try {
    const response = await tmdbApi.get('/movie/now_playing');
    return response.data.results.map(r => ({ ...r, media_type: 'movie' }));
  } catch (error) {
    console.error('TMDB Recent Movies Error:', error.message);
    return [];
  }
};

const getRecentShows = async () => {
  try {
    const response = await tmdbApi.get('/tv/on_the_air');
    return response.data.results.map(r => ({ ...r, media_type: 'tv' }));
  } catch (error) {
    console.error('TMDB Recent Shows Error:', error.message);
    return [];
  }
};

const getRecommendations = async (type, libraryIds) => {
  if (!libraryIds || libraryIds.length === 0) return [];
  // Pick up to 3 random IDs to seed recommendations
  const shuffled = [...libraryIds].sort(() => 0.5 - Math.random());
  const seedIds = shuffled.slice(0, 3);
  
  const results = [];
  const seenIds = new Set(libraryIds); // Don't recommend what they already have

  for (const id of seedIds) {
    try {
      const endpoint = type === 'movie' ? `/movie/${id}/recommendations` : `/tv/${id}/recommendations`;
      const response = await tmdbApi.get(endpoint);
      const items = response.data.results;
      for (const item of items) {
        if (!seenIds.has(item.id)) {
          item.media_type = type;
          results.push(item);
          seenIds.add(item.id);
        }
      }
    } catch (e) {
      console.error(`Failed to get recommendations for ${type} ${id}:`, e.message);
    }
  }

  // Sort by popularity and return top 20
  results.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  return results.slice(0, 20);
};

const getRecommendationsForMovies = (libraryIds) => getRecommendations('movie', libraryIds);
const getRecommendationsForShows = (libraryIds) => getRecommendations('tv', libraryIds);

module.exports = {
  searchMovies,
  searchShows,
  getMovieById,
  getShowById,
  getSeasonById,
  getShowSeasons,
  getSeasonEpisodes,
  getRecentMovies,
  getRecentShows,
  getRecommendationsForMovies,
  getRecommendationsForShows
};
