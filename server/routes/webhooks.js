const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const taskRegistry = require('../services/taskRegistry');
const { getSetting, setSetting } = require('../utils/settings');
const requireAdmin = require('../middleware/requireAdmin');

// Lazily provision a shared secret so download clients can trigger
// post-processing without a JWT. Configure the client to call:
//   POST /api/webhooks/download-client?token=<secret>
const ensureWebhookSecret = () => {
  let secret = getSetting('webhookSecret');
  if (!secret) {
    secret = crypto.randomBytes(24).toString('hex');
    setSetting('webhookSecret', secret);
  }
  return secret;
};

router.get('/token', requireAdmin, (req, res) => {
  res.json({ status: 'success', data: { token: ensureWebhookSecret() } });
});

/**
 * Webhook endpoint for download clients (e.g. qBittorrent, SABnzbd).
 * When a download completes, the client can send a POST request here
 * to instantly trigger the media post-processing pipeline.
 * Requires the shared webhook secret via ?token= or x-webhook-token header.
 */
router.post('/download-client', async (req, res, next) => {
  try {
    const secret = ensureWebhookSecret();
    const provided = req.query.token
      || req.get('x-webhook-token')
      || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

    const secretBuf = Buffer.from(String(secret));
    const providedBuf = Buffer.from(String(provided || ''));
    if (providedBuf.length !== secretBuf.length || !crypto.timingSafeEqual(providedBuf, secretBuf)) {
      return res.status(401).json({ status: 'error', message: 'Invalid or missing webhook token' });
    }

    const { name } = req.body || {};
    console.log(`[Webhook] Received download client notification${name ? ` for: ${name}` : ''}`);

    // Fire-and-forget the media_mover task.
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
