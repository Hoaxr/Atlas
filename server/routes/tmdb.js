const express = require('express');
const router = express.Router();
const tmdbService = require('../services/tmdbService');

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

module.exports = router;
