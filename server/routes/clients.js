const express = require('express');
const router = express.Router();
const downloadClientService = require('../services/downloadClientService');
const { resetDownloadsNotInClient } = require('../services/mediaManagementService');
const eventBus = require('../services/eventBus');

router.get('/stats', async (req, res, next) => {
  try {
    const stats = await downloadClientService.getTransferInfo();
    res.json({ status: 'success', data: stats });
  } catch (err) {
    next(err);
  }
});

router.get('/torrents', async (req, res, next) => {
  try {
    let torrents = await downloadClientService.getTorrents();
    
    const db = require('../config/database');
    const hideCompleted = db.prepare('SELECT value FROM settings WHERE key = ?').get('hideCompletedDownloads');
    if (!hideCompleted || hideCompleted.value !== 'false') {
      // Default is true, so filter out if it's not explicitly false
      torrents = torrents.filter(t => t.progress < 100 && t.state !== 'stalledUP' && t.state !== 'uploading');
    }

    res.json({ status: 'success', data: torrents });
  } catch (err) {
    next(err);
  }
});

router.post('/torrents', async (req, res, next) => {
  try {
    const { url, type = 'movie' } = req.body;
    if (!url) {
      return res.status(400).json({ status: 'error', message: 'URL is required' });
    }
    await downloadClientService.addTorrent(url, type);
    eventBus.emit('TORRENTS_MUTATED');
    res.json({ status: 'success', message: 'Torrent added successfully' });
  } catch (err) {
    next(err);
  }
});

router.post('/torrents/bulk-pause', async (req, res, next) => {
  try {
    const { hashes } = req.body;
    if (!Array.isArray(hashes) || hashes.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No torrent hashes provided' });
    }
    await downloadClientService.pauseTorrents(hashes);
    eventBus.emit('TORRENTS_MUTATED');
    res.json({ status: 'success', message: `${hashes.length} download(s) paused` });
  } catch (err) {
    next(err);
  }
});

router.post('/torrents/bulk-resume', async (req, res, next) => {
  try {
    const { hashes } = req.body;
    if (!Array.isArray(hashes) || hashes.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No torrent hashes provided' });
    }
    await downloadClientService.resumeTorrents(hashes);
    eventBus.emit('TORRENTS_MUTATED');
    res.json({ status: 'success', message: `${hashes.length} download(s) resumed` });
  } catch (err) {
    next(err);
  }
});

router.post('/torrents/bulk-delete', async (req, res, next) => {
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
    next(err);
  }
});

router.post('/torrents/:hash/pause', async (req, res, next) => {
  try {
    await downloadClientService.pauseTorrent(req.params.hash);
    eventBus.emit('TORRENTS_MUTATED');
    res.json({ status: 'success', message: 'Torrent paused' });
  } catch (err) {
    next(err);
  }
});

router.post('/torrents/:hash/resume', async (req, res, next) => {
  try {
    await downloadClientService.resumeTorrent(req.params.hash);
    eventBus.emit('TORRENTS_MUTATED');
    res.json({ status: 'success', message: 'Torrent resumed' });
  } catch (err) {
    next(err);
  }
});

router.delete('/torrents/:hash', async (req, res, next) => {
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
    next(err);
  }
});

module.exports = router;
