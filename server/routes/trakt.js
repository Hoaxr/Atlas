const express = require('express');
const router = express.Router();
const traktService = require('../services/traktService');

router.get('/trending/movies', async (req, res, next) => {
  try {
    const limit = req.query.limit || 20;
    const results = await traktService.getTrendingMovies(limit);
    res.json({ status: 'success', data: results });
  } catch (e) {
    if (e.message && e.message.includes('not configured')) {
      return res.json({ status: 'success', data: [] });
    }
    next(e);
  }
});

router.get('/trending/shows', async (req, res, next) => {
  try {
    const limit = req.query.limit || 20;
    const results = await traktService.getTrendingShows(limit);
    res.json({ status: 'success', data: results });
  } catch (e) {
    if (e.message && e.message.includes('not configured')) {
      return res.json({ status: 'success', data: [] });
    }
    next(e);
  }
});

router.get('/stats', async (req, res, next) => {
  try {
    const stats = await traktService.getUserStats();
    if (stats.error) {
      return res.json({ status: 'error', message: stats.error });
    }
    res.json({ status: 'success', data: stats });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
