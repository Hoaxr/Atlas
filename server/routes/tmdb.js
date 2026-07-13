const express = require('express');
const router = express.Router();
const axios = require('axios');
const tmdbService = require('../services/tmdbService');
const traktService = require('../services/traktService');
const db = require('../config/database');

router.get('/movies/now-playing', async (req, res, next) => {
  try {
    const movies = await tmdbService.getRecentMovies();
    res.json({ status: 'success', data: movies });
  } catch (e) { next(e); }
});

router.get('/movies/upcoming', async (req, res, next) => {
  try {
    const movies = await tmdbService.getUpcomingMovies();
    res.json({ status: 'success', data: movies });
  } catch (e) { next(e); }
});

router.get('/search/movie', async (req, res, next) => {
  try {
    const query = req.query.query;
    if (!query) {
      return res.status(400).json({ status: 'error', message: 'Query is required' });
    }
    const results = await tmdbService.searchMovies(query);
    res.json({ status: 'success', data: results });
  } catch (e) {
    next(e);
  }
});

router.get('/search/show', async (req, res, next) => {
  try {
    const query = req.query.query;
    if (!query) {
      return res.status(400).json({ status: 'error', message: 'Query is required' });
    }
    const results = await tmdbService.searchShows(query);
    res.json({ status: 'success', data: results });
  } catch (e) {
    next(e);
  }
});

router.get('/search/multi', async (req, res, next) => {
  try {
    const query = req.query.query;
    if (!query) {
      return res.status(400).json({ status: 'error', message: 'Query is required' });
    }
    const results = await tmdbService.searchMulti(query);
    res.json({ status: 'success', data: results });
  } catch (e) {
    next(e);
  }
});

router.get('/movie/:id', async (req, res, next) => {
  try {
    const movie = await tmdbService.getMovieById(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });
    res.json({ status: 'success', data: movie });
  } catch (error) {
    next(error);
  }
});

router.get('/show/:id', async (req, res, next) => {
  try {
    const show = await tmdbService.getShowById(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });
    res.json({ status: 'success', data: show });
  } catch (error) {
    next(error);
  }
});

router.get('/recent/:type', async (req, res, next) => {
  try {
    const type = req.params.type;
    const results = type === 'shows' ? await tmdbService.getRecentShows() : await tmdbService.getRecentMovies();
    res.json({ status: 'success', data: results });
  } catch (e) {
    next(e);
  }
});

router.get('/recommended/:type', async (req, res, next) => {
  try {
    const type = req.params.type;
    let libraryIds = [];
    if (type === 'shows') {
      const shows = db.prepare('SELECT tmdb_id FROM shows').all();
      libraryIds = shows.map(s => s.tmdb_id);
    } else {
      const movies = db.prepare('SELECT tmdb_id FROM movies').all();
      libraryIds = movies.map(m => m.tmdb_id);
    }
    let results = type === 'shows' ? await tmdbService.getRecommendationsForShows(libraryIds) : await tmdbService.getRecommendationsForMovies(libraryIds);

    // Exclude already-watched items by checking Trakt API directly
    const traktSync = db.prepare("SELECT value FROM settings WHERE key = 'traktWatchedSync'").get();
    if (traktSync && traktSync.value === 'true') {
      try {
        const traktType = type === 'shows' ? 'show' : 'movie';
        const watchedIds = await traktService.getWatchedTmdbIds(traktType);
        const watchedSet = new Set(watchedIds.map(Number));
        results = results.filter(item => !watchedSet.has(Number(item.id)));
      } catch (err) {
        console.error('[Recommendations] Failed to check Trakt watched status:', err.message);
      }
    }

    res.json({ status: 'success', data: results });
  } catch (e) {
    next(e);
  }
});

// Test TMDB API key
router.get('/test', async (req, res) => {
  try {
    const apiKey = db.prepare("SELECT value FROM settings WHERE key = 'tmdbApiKey'").get()?.value;
    if (!apiKey) {
      return res.status(400).json({ status: 'error', message: 'TMDB API key not configured' });
    }
    const response = await axios.get(`https://api.themoviedb.org/3/movie/550?api_key=${apiKey}`);
    if (response.data) {
      return res.json({ status: 'success', message: 'TMDB API key is valid and working' });
    }
  } catch (err) {
    if (err.response?.status === 401) {
      return res.status(401).json({ status: 'error', message: 'TMDB API key is invalid' });
    }
    if (err.response?.status === 404) {
      return res.status(400).json({ status: 'error', message: 'TMDB API key is invalid or has no access' });
    }
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// Person details + filmography (cross-referenced with local library)
// ── Cached lookup maps — avoids full table scans on every person request ──
let _personLookupCache = null;
let _personLookupTimestamp = 0;
const PERSON_CACHE_TTL = 5 * 60 * 1000;

const getLookupMaps = () => {
  if (_personLookupCache && Date.now() - _personLookupTimestamp < PERSON_CACHE_TTL) {
    return _personLookupCache;
  }
  const movies = db.prepare('SELECT id, tmdb_id FROM movies').all();
  const shows  = db.prepare('SELECT id, tmdb_id FROM shows').all();
  _personLookupCache = {
    movieMap: new Map(movies.map(m => [m.tmdb_id, m.id])),
    showMap:  new Map(shows.map(s => [s.tmdb_id, s.id])),
  };
  _personLookupTimestamp = Date.now();
  return _personLookupCache;
};

router.get('/person/:id', async (req, res, next) => {
  try {
    const person = await tmdbService.getPersonById(req.params.id);
    if (!person) return res.status(404).json({ status: 'error', message: 'Person not found' });

    // Cross-reference credits with local library (cached)
    const { movieMap, showMap } = getLookupMaps();

    const credits = person.combined_credits || {};
    const enrichCredit = (credit) => {
      const libraryId = credit.media_type === 'movie'
        ? movieMap.get(credit.id)
        : showMap.get(credit.id);
      return {
        ...credit,
        inLibrary: libraryId !== undefined,
        libraryId: libraryId ?? null,
      };
    };

    person.combined_credits = {
      cast: (credits.cast || []).map(enrichCredit),
      crew: (credits.crew || []).map(enrichCredit),
    };

    res.json({ status: 'success', data: person });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
