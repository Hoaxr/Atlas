const express = require('express');
const router = express.Router();
const traktService = require('../services/traktService');

router.get('/trending/movies', async (req, res, next) => {
  try {
    const limit = req.query.limit || 20;
    const results = await traktService.getTrendingMovies(limit);
    res.json({ status: 'success', data: results });
  } catch (e) {
    next(e);
  }
});

router.get('/trending/shows', async (req, res, next) => {
  try {
    const limit = req.query.limit || 20;
    const results = await traktService.getTrendingShows(limit);
    res.json({ status: 'success', data: results });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
