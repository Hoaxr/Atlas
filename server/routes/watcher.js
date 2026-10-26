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
    const stats = watcherService.getStats();
    res.json({
      status: 'success',
      data: stats
    });
  } catch (err) {
    next(err);
  }
});

// Reset watcher stats
router.delete('/stats', (req, res, next) => {
  try {
    db.prepare('DELETE FROM play_history').run();
    watcherService.recordedPlayMap?.clear();
    watcherService.recordedPlaySet?.clear();
    res.json({ status: 'success', message: 'Watcher stats have been reset' });
  } catch (err) {
    next(err);
  }
});

router.get('/image', async (req, res) => {
  try {
    const { server, id } = req.query;
    let url = '';
    const headers = {};

    if (server === 'plex') {
      const rawPath = req.query.path;
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(rawPath || '');
      } catch {
        return res.status(400).send('Invalid path');
      }
      if (
        !decodedPath ||
        typeof decodedPath !== 'string' ||
        !decodedPath.startsWith('/') ||
        decodedPath.startsWith('//') ||
        decodedPath.includes('..') ||
        decodedPath.includes('\\') ||
        decodedPath.includes('@') ||
        decodedPath.includes('?') || // disallow query string injection
        (!decodedPath.startsWith('/photo/:/transcode') && !decodedPath.startsWith('/library/metadata/'))
      ) {
        return res.status(400).send('Invalid path');
      }
      const plexUrl = getSetting('plexUrl')?.replace(/\/$/, '');
      const plexToken = getSetting('plexToken');
      if (!plexUrl || !plexToken) return res.status(404).send('Not configured');
      url = `${plexUrl}${decodedPath}`;
      headers['X-Plex-Token'] = plexToken;
    } else if (server === 'jellyfin') {
      if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(id)) {
        return res.status(400).send('Invalid ID');
      }
      const jfUrl = getSetting('jellyfinUrl')?.replace(/\/$/, '');
      const jfToken = getSetting('jellyfinApiKey');
      if (!jfUrl || !jfToken) return res.status(404).send('Not configured');
      url = `${jfUrl}/Items/${id}/Images/Primary`;
      headers['Authorization'] = `MediaBrowser Token="${jfToken}"`;
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
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    response.data.pipe(res);
  } catch {
    res.status(404).send('Image not found');
  }
});

module.exports = router;
