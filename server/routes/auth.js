const express = require('express');
const router = express.Router();
const axios = require('axios');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../config/database');
const { getSetting, setSetting } = require('../utils/settings');

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set. Authentication will be insecure.');
  process.exit(1);
}

const authMiddleware = require('../middleware/authMiddleware');

// Rate limiter: max 5 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many login attempts. Please try again in 15 minutes.' },
});

// Login endpoint
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const authEnabled = getSetting('authEnabled') === 'true';

  if (!authEnabled) {
    return res.json({ status: 'success', message: 'Authentication is disabled' });
  }

  const user = db.prepare('SELECT id, username, password, role FROM users WHERE username = ?').get(username);
  
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    res.json({ status: 'success', data: { token, user: { id: user.id, username: user.username, role: user.role } } });
  } else {
    res.status(401).json({ status: 'error', message: 'Invalid credentials' });
  }
});

// Change password endpoint
router.put('/password', authMiddleware, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }
    
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ status: 'error', message: 'Current and new passwords are required' });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ status: 'error', message: 'New password must be at least 8 characters' });
    }
    
    const user = db.prepare('SELECT id, password FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    
    if (!await bcrypt.compare(currentPassword, user.password)) {
      return res.status(400).json({ status: 'error', message: 'Incorrect current password' });
    }
    
    const hashed = await bcrypt.hash(newPassword, 12);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.user.id);
    res.json({ status: 'success', message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});



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
      // Empty or pending body = still waiting for user to authorize
      if (!errorStr || errorStr === 'authorization_pending' || errorStr === 'slow_down') {
        return res.json({ status: 'pending' });
      }
      if (errorStr === 'denied') {
        return res.status(400).json({ status: 'error', message: 'Authorization denied by user.' });
      }
      console.error('[Trakt Device Auth] Unexpected 400:', JSON.stringify(body));
      return res.status(400).json({ status: 'error', message: `Trakt error: ${errorStr}` });
    }
    if (status === 404) {
      return res.status(404).json({ status: 'error', message: 'Device code expired. Please start over.' });
    }
    console.error('[Trakt Device Auth] Token poll failed:', err.response?.data || err.message);
    res.status(500).json({ status: 'error', message: 'Failed to get token from Trakt' });
  }
});

// Check if authentication is enabled and whether the current request is bypassed
router.get('/status', (req, res) => {
  const { getSetting } = require('../utils/settings');
  const authEnabled = getSetting('authEnabled') === 'true';
  const bypassLocalhost = getSetting('authBypassLocalhost') !== 'false';
  
  let isPrivate = false;
  if (bypassLocalhost) {
    const ip = (req.socket?.remoteAddress || req.connection?.remoteAddress || '').replace(/^::ffff:/, '');
    isPrivate = ip === '127.0.0.1' || ip === '::1' ||
      ip.startsWith('192.168.') || ip.startsWith('10.') ||
      ip.startsWith('fc') || ip.startsWith('fd');
    if (ip.startsWith('172.')) {
      const octet = parseInt(ip.split('.')[1], 10);
      if (octet >= 16 && octet <= 31) isPrivate = true;
    }
  }
  
  res.json({ status: 'success', data: { authEnabled, bypassLocalhost, isPrivate } });
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
