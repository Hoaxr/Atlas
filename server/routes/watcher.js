const express = require('express');
const router = express.Router();
const axios = require('axios');
const watcherService = require('../services/watcherService');
const db = require('../config/database');
const { getSetting } = require('../utils/settings');

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

router.get('/stats', (req, res, next) => {
  try {
    const topMovies = db.prepare(`SELECT title, COUNT(*) as plays FROM play_history WHERE type = 'movie' GROUP BY title ORDER BY plays DESC LIMIT 10`).all();
    const topShows = db.prepare(`SELECT CASE WHEN INSTR(title, ' - S') > 0 THEN SUBSTR(title, 1, INSTR(title, ' - S') - 1) ELSE title END as title, COUNT(*) as plays FROM play_history WHERE type IN ('episode', 'live') GROUP BY 1 ORDER BY plays DESC LIMIT 10`).all();
    const topUsers = db.prepare(`SELECT user, COUNT(*) as plays FROM play_history GROUP BY user ORDER BY plays DESC LIMIT 10`).all();
    
    // Most popular (by unique users)
    const popularMovies = db.prepare(`SELECT title, COUNT(DISTINCT user) as users FROM play_history WHERE type = 'movie' GROUP BY title ORDER BY users DESC LIMIT 10`).all();
    const popularShows = db.prepare(`SELECT CASE WHEN INSTR(title, ' - S') > 0 THEN SUBSTR(title, 1, INSTR(title, ' - S') - 1) ELSE title END as title, COUNT(DISTINCT user) as users FROM play_history WHERE type IN ('episode', 'live') GROUP BY 1 ORDER BY users DESC LIMIT 10`).all();

    // Recently watched (last 10 entries)
    const recent = db.prepare(`SELECT id, user, title, type, server, player, created_at FROM play_history ORDER BY id DESC LIMIT 10`).all().map(item => {
      let created = item.created_at;
      if (created && !created.includes('Z') && !created.includes('+')) {
        created = created.replace(' ', 'T') + 'Z';
      }
      return { ...item, created_at: created };
    });

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
    const headers = {};

    if (server === 'plex') {
      if (!path || typeof path !== 'string' || !path.startsWith('/') || path.includes('..')) {
        return res.status(400).send('Invalid path');
      }
      const plexUrl = getSetting('plexUrl')?.replace(/\/$/, '');
      const plexToken = getSetting('plexToken');
      if (!plexUrl || !plexToken) return res.status(404).send('Not configured');
      url = `${plexUrl}${path}`;
      headers['X-Plex-Token'] = plexToken;
    } else if (server === 'jellyfin') {
      if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(id)) {
        return res.status(400).send('Invalid ID');
      }
      const jfUrl = getSetting('jellyfinUrl')?.replace(/\/$/, '');
      const jfToken = getSetting('jellyfinApiKey');
      if (!jfUrl || !jfToken) return res.status(404).send('Not configured');
      url = `${jfUrl}/Items/${id}/Images/Primary`;
      headers['X-Emby-Token'] = jfToken;
    } else if (server === 'emby') {
      if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(id)) {
        return res.status(400).send('Invalid ID');
      }
      const embyUrl = getSetting('embyUrl')?.replace(/\/$/, '');
      const embyToken = getSetting('embyApiKey');
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
