const express = require('express');
const router = express.Router();
const downloadClientService = require('../services/downloadClientService');
const { resetDownloadsNotInClient } = require('../services/mediaManagementService');

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
      torrents = torrents.filter(t => t.progress < 1 && t.state !== 'stalledUP' && t.state !== 'uploading');
    }
    
    res.json({ status: 'success', data: torrents });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/torrents/:hash/pause', async (req, res) => {
  try {
    await downloadClientService.pauseTorrent(req.params.hash);
    res.json({ status: 'success', message: 'Torrent paused' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/torrents/:hash/resume', async (req, res) => {
  try {
    await downloadClientService.resumeTorrent(req.params.hash);
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

    res.json({ status: 'success', message: 'Torrent deleted' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
