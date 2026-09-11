const express = require('express');
const router = express.Router();
const downloadClientService = require('../services/downloadClientService');
const { resetDownloadsNotInClient } = require('../services/mediaManagementService');
const eventBus = require('../services/eventBus');

router.get('/stats', async (req, res) => {
  try {
    const stats = await downloadClientService.getTransferInfo();
    res.json({ status: 'success', data: stats });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.get('/torrents', async (req, res) => {
  try {
    let torrents = await downloadClientService.getTorrents();
    
    const db = require('../config/database');
    const hideCompleted = db.prepare('SELECT value FROM settings WHERE key = ?').get('hideCompletedDownloads');
    if (!hideCompleted || hideCompleted.value !== 'false') {
      // Default is true, so filter out if it's not explicitly false
      torrents = torrents.filter(t => t.progress < 100 && t.state !== 'stalledUP' && t.state !== 'uploading');
    }

    // Lookup music artists and albums for mediaType classification
    let knownArtists = [];
    let knownAlbums = [];
    try {
      knownArtists = db.prepare('SELECT name FROM music_artists').all().map(a => a.name.toLowerCase()).filter(Boolean);
      knownAlbums = db.prepare('SELECT title FROM music_albums').all().map(a => a.title.toLowerCase()).filter(t => t && t.length > 4);
    } catch { /* proceed */ }

    torrents = torrents.map(t => {
      let mediaType = t.mediaType || null;
      const cat = (t.category || '').toLowerCase();
      const tags = (Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || '')).toLowerCase();
      const savePath = (t.save_path || t.downloadDir || '').toLowerCase();

      if (cat === 'music' || cat === 'audio' || tags.includes('music') || savePath.includes('/music')) {
        mediaType = 'music';
      } else if (cat === 'tv' || tags.includes('tv') || savePath.includes('/tv')) {
        mediaType = 'tv';
      } else if (cat === 'movies' || cat === 'movie' || tags.includes('movie') || savePath.includes('/movie')) {
        mediaType = 'movie';
      } else {
        const lowerName = (t.name || '').toLowerCase();
        if (knownArtists.some(art => lowerName.includes(art)) || knownAlbums.some(alb => lowerName.includes(alb))) {
          mediaType = 'music';
        }
      }

      return { ...t, mediaType };
    });
    
    res.json({ status: 'success', data: torrents });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/torrents/bulk-pause', async (req, res) => {
  try {
    const { hashes } = req.body;
    if (!Array.isArray(hashes) || hashes.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No torrent hashes provided' });
    }
    await downloadClientService.pauseTorrents(hashes);
    eventBus.emit('TORRENTS_MUTATED');
    res.json({ status: 'success', message: `${hashes.length} download(s) paused` });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/torrents/bulk-resume', async (req, res) => {
  try {
    const { hashes } = req.body;
    if (!Array.isArray(hashes) || hashes.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No torrent hashes provided' });
    }
    await downloadClientService.resumeTorrents(hashes);
    eventBus.emit('TORRENTS_MUTATED');
    res.json({ status: 'success', message: `${hashes.length} download(s) resumed` });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/torrents/bulk-delete', async (req, res) => {
  try {
    const { hashes, deleteFiles = true } = req.body;
    if (!Array.isArray(hashes) || hashes.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No torrent hashes provided' });
    }
    await downloadClientService.deleteTorrents(hashes, Boolean(deleteFiles));

    try {
      await resetDownloadsNotInClient();
    } catch (resetErr) {
      console.error('[Clients] Failed to reset removed downloads:', resetErr.message);
    }

    eventBus.emit('TORRENTS_MUTATED');
    res.json({ status: 'success', message: `${hashes.length} download(s) deleted` });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/torrents/:hash/pause', async (req, res) => {
  try {
    await downloadClientService.pauseTorrent(req.params.hash);
    eventBus.emit('TORRENTS_MUTATED');
    res.json({ status: 'success', message: 'Torrent paused' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/torrents/:hash/resume', async (req, res) => {
  try {
    await downloadClientService.resumeTorrent(req.params.hash);
    eventBus.emit('TORRENTS_MUTATED');
    res.json({ status: 'success', message: 'Torrent resumed' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.delete('/torrents/:hash', async (req, res) => {
  try {
    const deleteFiles = req.query.deleteFiles === 'true';
    await downloadClientService.deleteTorrent(req.params.hash, deleteFiles);

    // Reset any 'downloading' movies/episodes that belonged to removed
    // downloads back to 'monitored' immediately.
    try {
      await resetDownloadsNotInClient();
    } catch (resetErr) {
      console.error('[Clients] Failed to reset removed downloads:', resetErr.message);
    }

    eventBus.emit('TORRENTS_MUTATED');
    res.json({ status: 'success', message: 'Torrent deleted' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
