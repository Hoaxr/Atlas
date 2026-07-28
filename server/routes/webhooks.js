const express = require('express');
const router = express.Router();
const taskRegistry = require('../services/taskRegistry');

/**
 * Webhook endpoint for download clients (e.g. qBittorrent, Sabnzbd).
 * When a download completes, the client can send a POST request here
 * to instantly trigger the media post-processing pipeline.
 */
router.post('/download-client', async (req, res, next) => {
  try {
    const { name, category } = req.body || {};
    console.log(`[Webhook] Received download client notification${name ? ` for: ${name}` : ''}`);
    
    // We can fire-and-forget the media_mover task
    // It is protected from overlapping runs by taskRegistry
    taskRegistry.executeTask('media_mover').catch(err => {
      console.error('[Webhook] Failed to execute media_mover task:', err);
    });

    res.json({
      status: 'success',
      message: 'Media post-processing triggered successfully'
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
