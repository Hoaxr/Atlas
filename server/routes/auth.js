const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/database');

const getSetting = (key) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
};

const setSetting = (key, value) => {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
};

// Step 1: Request a device code from Trakt
router.post('/trakt/device-code', async (req, res) => {
  const clientId = getSetting('traktClientId');
  if (!clientId) {
    return res.status(400).json({ status: 'error', message: 'Trakt Client ID not configured' });
  }

  try {
    const response = await axios.post('https://api.trakt.tv/oauth/device/code', {
      client_id: clientId
    });
    // response.data: { device_code, user_code, verification_url, expires_in, interval }
    res.json({ status: 'success', data: response.data });
  } catch (err) {
    console.error('[Trakt Device Auth] Failed to get device code:', err.response?.data || err.message);
    res.status(500).json({ status: 'error', message: 'Failed to get device code from Trakt' });
  }
});

// Step 2: Poll for the token using the device code
router.post('/trakt/device-token', async (req, res) => {
  const { deviceCode } = req.body;
  if (!deviceCode) {
    return res.status(400).json({ status: 'error', message: 'Device code is required' });
  }

  const clientId = getSetting('traktClientId');
  const clientSecret = getSetting('traktClientSecret');

  if (!clientId || !clientSecret) {
    return res.status(400).json({ status: 'error', message: 'Trakt Client ID and Client Secret must be configured first' });
  }

  try {
    const response = await axios.post('https://api.trakt.tv/oauth/device/token', {
      code: deviceCode,
      client_id: clientId,
      client_secret: clientSecret
    });
    // response.data: { access_token, refresh_token, created_at, expires_in }
    const { access_token, refresh_token, created_at, expires_in } = response.data;
    setSetting('traktAccessToken', access_token);
    if (refresh_token) setSetting('traktRefreshToken', refresh_token);
    setSetting('traktTokenExpiresAt', String(created_at + expires_in));
    res.json({ status: 'success', message: 'Trakt account linked successfully!' });
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    // Trakt returns 400 while waiting — body can be "authorization_pending" (string) or { error: "authorization_pending" } (JSON)
    if (status === 400) {
      const errorStr = typeof body === 'string' ? body : body?.error || '';
      if (errorStr === 'authorization_pending' || errorStr === 'slow_down') {
        return res.json({ status: 'pending' });
      }
      if (errorStr === 'denied') {
        return res.status(400).json({ status: 'error', message: 'Authorization denied by user.' });
      }
    }
    if (status === 404) {
      return res.status(404).json({ status: 'error', message: 'Device code expired. Please start over.' });
    }
    console.error('[Trakt Device Auth] Token poll failed:', err.response?.data || err.message);
    res.status(500).json({ status: 'error', message: 'Failed to get token from Trakt' });
  }
});

// Check if Trakt is connected and token is still valid
router.get('/trakt/status', (req, res) => {
  const accessToken = getSetting('traktAccessToken');
  const expiresAt = parseInt(getSetting('traktTokenExpiresAt') || '0', 10);
  const now = Math.floor(Date.now() / 1000);
  const connected = !!accessToken;
  const expired = connected && expiresAt > 0 && now >= expiresAt;
  res.json({ status: 'success', data: { connected, expired, expiresAt } });
});

// Refresh the Trakt access token using the refresh token
router.post('/trakt/refresh', async (req, res) => {
  const clientId = getSetting('traktClientId');
  const clientSecret = getSetting('traktClientSecret');
  const refreshToken = getSetting('traktRefreshToken');

  if (!clientId || !clientSecret || !refreshToken) {
    return res.status(400).json({ status: 'error', message: 'Cannot refresh — missing credentials or refresh token' });
  }

  try {
    const response = await axios.post('https://api.trakt.tv/oauth/token', {
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token'
    });
    const { access_token, refresh_token, created_at, expires_in } = response.data;
    setSetting('traktAccessToken', access_token);
    if (refresh_token) setSetting('traktRefreshToken', refresh_token);
    setSetting('traktTokenExpiresAt', String(created_at + expires_in));
    res.json({ status: 'success', message: 'Token refreshed successfully' });
  } catch (err) {
    console.error('[Trakt] Token refresh failed:', err.response?.data || err.message);
    res.status(500).json({ status: 'error', message: 'Failed to refresh token' });
  }
});

// Disconnect Trakt (remove tokens)
router.post('/trakt/disconnect', (req, res) => {
  setSetting('traktAccessToken', '');
  setSetting('traktRefreshToken', '');
  setSetting('traktTokenExpiresAt', '0');
  res.json({ status: 'success', message: 'Disconnected from Trakt' });
});

module.exports = router;
