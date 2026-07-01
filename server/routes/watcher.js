const express = require('express');
const router = express.Router();
const watcherService = require('../services/watcherService');

router.get('/sessions', async (req, res, next) => {
  try {
    const sessions = await watcherService.getAllSessions();
    res.json({
      status: 'success',
      data: sessions
    });
  } catch (err) {
    next(err);
  }
});
const axios = require('axios');
const db = require('../config/database');

router.get('/stats', (req, res, next) => {
  try {
    const topMovies = db.prepare(`SELECT title, COUNT(*) as plays FROM play_history WHERE type = 'movie' GROUP BY title ORDER BY plays DESC LIMIT 10`).all();
    const topShows = db.prepare(`SELECT title, COUNT(*) as plays FROM play_history WHERE type IN ('episode', 'live') GROUP BY title ORDER BY plays DESC LIMIT 10`).all();
    const topUsers = db.prepare(`SELECT user, COUNT(*) as plays FROM play_history GROUP BY user ORDER BY plays DESC LIMIT 10`).all();
    
    // Most popular (by unique users)
    const popularMovies = db.prepare(`SELECT title, COUNT(DISTINCT user) as users FROM play_history WHERE type = 'movie' GROUP BY title ORDER BY users DESC LIMIT 10`).all();
    const popularShows = db.prepare(`SELECT title, COUNT(DISTINCT user) as users FROM play_history WHERE type IN ('episode', 'live') GROUP BY title ORDER BY users DESC LIMIT 10`).all();

    // Recently watched (last 10 entries)
    const recent = db.prepare(`SELECT user, title, type, server, player, created_at FROM play_history ORDER BY created_at DESC LIMIT 10`).all();

    // Most active platforms (by player)
    const topPlatforms = db.prepare(`SELECT player, COUNT(*) as plays FROM play_history WHERE player IS NOT NULL AND player != '' GROUP BY player ORDER BY plays DESC LIMIT 10`).all();

    // Total stats overview
    const totalPlays = db.prepare(`SELECT COUNT(*) as count FROM play_history`).get()?.count || 0;
    const uniqueUsers = db.prepare(`SELECT COUNT(DISTINCT user) as count FROM play_history`).get()?.count || 0;
    const uniqueTitles = db.prepare(`SELECT COUNT(DISTINCT title) as count FROM play_history`).get()?.count || 0;
    
    res.json({
      status: 'success',
      data: {
        topMovies,
        topShows,
        topUsers,
        popularMovies,
        popularShows,
        recent,
        topPlatforms,
        overview: {
          totalPlays,
          uniqueUsers,
          uniqueTitles
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// Reset watcher stats
router.delete('/stats', (req, res, next) => {
  try {
    db.prepare('DELETE FROM play_history').run();
    res.json({ status: 'success', message: 'Watcher stats have been reset' });
  } catch (err) {
    next(err);
  }
});

router.get('/image', async (req, res, next) => {
  try {
    const { server, path, id } = req.query;
    let url = '';
    let headers = {};

    if (server === 'plex') {
      const plexUrl = watcherService.getSetting('plexUrl')?.replace(/\/$/, '');
      const plexToken = watcherService.getSetting('plexToken');
      if (!plexUrl || !plexToken) return res.status(404).send('Not configured');
      url = `${plexUrl}${path}`;
      headers['X-Plex-Token'] = plexToken;
    } else if (server === 'jellyfin') {
      const jfUrl = watcherService.getSetting('jellyfinUrl')?.replace(/\/$/, '');
      const jfToken = watcherService.getSetting('jellyfinApiKey');
      if (!jfUrl || !jfToken) return res.status(404).send('Not configured');
      url = `${jfUrl}/Items/${id}/Images/Primary`;
      headers['X-Emby-Token'] = jfToken;
    } else if (server === 'emby') {
      const embyUrl = watcherService.getSetting('embyUrl')?.replace(/\/$/, '');
      const embyToken = watcherService.getSetting('embyApiKey');
      if (!embyUrl || !embyToken) return res.status(404).send('Not configured');
      url = `${embyUrl}/Items/${id}/Images/Primary`;
      headers['X-Emby-Token'] = embyToken;
    } else {
      return res.status(400).send('Invalid server');
    }

    const response = await axios.get(url, { headers, responseType: 'stream' });
    response.data.pipe(res);
  } catch (err) {
    res.status(404).send('Image not found');
  }
});

module.exports = router;
