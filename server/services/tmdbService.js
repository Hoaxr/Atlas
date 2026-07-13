const axios = require('axios');
const db = require('../config/database');

const getTmdbApiKey = () => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('tmdbApiKey');
  return row ? row.value : null;
};

const memoryCache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

const withCache = async (key, fetcher) => {
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
  const data = await fetcher();
  if (data) memoryCache.set(key, { data, timestamp: Date.now() });
  return data;
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
  if (config.params.language === undefined) {
    config.params.language = 'en-US';
  }
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
      throw new Error(`TMDB Error: ${error.response.data.status_message}`, { cause: error });
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
      throw new Error(`TMDB Error: ${error.response.data.status_message}`, { cause: error });
    }
    throw error;
  }
};

const searchMulti = async (query) => {
  try {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];

    const response = await tmdbApi.get('/search/multi', {
      params: { query: trimmedQuery, page: 1, include_adult: false }
    });
    
    // Filter out people, only return movies and tv shows
    return (response.data.results || []).filter(item => item.media_type === 'movie' || item.media_type === 'tv');
  } catch (error) {
    if (error.response) {
      throw new Error(`TMDB Error: ${error.response.data.status_message}`, { cause: error });
    }
    throw error;
  }
};

const getMovieById = async (id) => {
  return withCache(`movie_${id}`, async () => {
    try {
      const response = await tmdbApi.get(`/movie/${id}`, { params: { append_to_response: 'videos,credits,similar,release_dates' } });
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  });
};

const getShowById = async (id) => {
  return withCache(`show_${id}`, async () => {
    try {
      const response = await tmdbApi.get(`/tv/${id}`, { params: { append_to_response: 'videos,credits' } });
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  });
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
  return withCache('recent_movies', async () => {
    try {
      const response = await tmdbApi.get('/movie/now_playing');
      return response.data.results.map(r => ({ ...r, media_type: 'movie' }));
    } catch (error) {
      console.error('TMDB Recent Movies Error:', error.message);
      return [];
    }
  });
};

const getUpcomingMovies = async () => {
  return withCache('upcoming_movies', async () => {
    try {
      const response = await tmdbApi.get('/movie/upcoming');
      return response.data.results.map(r => ({ ...r, media_type: 'movie' }));
    } catch (error) {
      console.error('TMDB Upcoming Movies Error:', error.message);
      return [];
    }
  });
};

const getRecentShows = async () => {
  return withCache('recent_shows', async () => {
    try {
      const response = await tmdbApi.get('/tv/on_the_air');
      return response.data.results.map(r => ({ ...r, media_type: 'tv' }));
    } catch (error) {
      console.error('TMDB Recent Shows Error:', error.message);
      return [];
    }
  });
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

const getPersonById = async (personId) => {
  try {
    const response = await tmdbApi.get(`/person/${personId}`, {
      params: { append_to_response: 'combined_credits' }
    });
    return response.data;
  } catch (err) {
    console.error(`[TMDB] Failed to fetch person ${personId}:`, err.message);
    return null;
  }
};

/**
 * Get the earliest digital (4) or physical (5) release date for a movie.
 * Falls back to theatrical release_date if no digital/physical date found.
 */
const getMovieReleaseDates = async (tmdbId) => {
  try {
    const res = await tmdbApi.get(`/movie/${tmdbId}/release_dates`);
    const results = res.data.results || [];
    let digitalDate = null;
    let physicalDate = null;

    for (const country of results) {
      for (const rd of country.release_dates || []) {
        // Type 4 = Digital, Type 5 = Physical
        if (rd.type === 4 && rd.release_date) {
          if (!digitalDate || rd.release_date < digitalDate) digitalDate = rd.release_date;
        }
        if (rd.type === 5 && rd.release_date) {
          if (!physicalDate || rd.release_date < physicalDate) physicalDate = rd.release_date;
        }
      }
    }

    // Return earliest of digital or physical, or null if neither found
    if (digitalDate && physicalDate) return digitalDate < physicalDate ? digitalDate : physicalDate;
    if (digitalDate) return digitalDate;
    if (physicalDate) return physicalDate;
    return null;
  } catch (err) {
    console.error(`[TMDB] Failed to fetch release dates for movie ${tmdbId}:`, err.message);
    return null;
  }
};

module.exports = {
  searchMovies,
  searchShows,
  searchMulti,
  getMovieById,
  getShowById,
  getSeasonById,
  getShowSeasons,
  getSeasonEpisodes,
  getRecentMovies,
  getUpcomingMovies,
  getRecentShows,
  getRecommendationsForMovies,
  getRecommendationsForShows,
  getPersonById,
  getMovieReleaseDates,
};
