const express = require('express');
const router = express.Router();
const simklService = require('../services/simklService');

router.get('/stats', async (req, res, next) => {
  try {
    const stats = await simklService.getUserStats();
    if (stats.error) {
      return res.json({ status: 'error', message: stats.error });
    }
    res.json({ status: 'success', data: stats });
  } catch (e) {
    next(e);
  }
});

router.get('/push/dry-run', async (req, res, next) => {
  try {
    const result = await simklService.pushDryRun();
    res.json({ status: 'success', data: result });
  } catch (e) {
    next(e);
  }
});

router.post('/pull', async (req, res, next) => {
  try {
    const moviesSynced = await simklService.syncWatchedMovies();
    const showsSynced = await simklService.syncWatchedShows();
    res.json({ 
      status: 'success', 
      data: { moviesSynced, showsSynced },
      message: `Successfully pulled ${moviesSynced} movies and ${showsSynced} shows from Simkl.` 
    });
  } catch (e) {
    next(e);
  }
});

router.post('/push', async (req, res, next) => {
  try {
    const result = await simklService.pushWatchedToSimkl();
    res.json({ status: 'success', data: result, message: `Successfully pushed ${result.moviesPushed} movies and ${result.showsPushed} shows to Simkl.` });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
