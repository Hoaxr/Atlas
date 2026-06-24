const express = require('express');
const router = express.Router();
const downloadClientService = require('../services/downloadClientService');

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
    const torrents = await downloadClientService.getTorrents();
    res.json({ status: 'success', data: torrents });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.delete('/torrents/:hash', async (req, res) => {
  try {
    const deleteFiles = req.query.deleteFiles === 'true';
    await downloadClientService.deleteTorrent(req.params.hash, deleteFiles);
    res.json({ status: 'success', message: 'Torrent deleted' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
