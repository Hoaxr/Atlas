const express = require('express');
const router = express.Router();
const axios = require('axios');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../config/database');
const { getSetting, setSetting } = require('../utils/settings');

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
// JWT_SECRET presence is validated at startup in index.js before this module loads.
// Using the value here is safe.

const authMiddleware = require('../middleware/authMiddleware');

// Rate limiter: max 5 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many login attempts. Please try again in 15 minutes.' },
});

// Lighter limiter for unauthenticated endpoints that proxy third-party services (30 per 15 min per IP)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many requests. Please try again in 15 minutes.' },
});

// Login endpoint
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const authEnabled = getSetting('authEnabled') === 'true';

  if (!authEnabled) {
    return res.json({ status: 'success', message: 'Authentication is disabled' });
  }

  const user = db.prepare('SELECT id, username, password, role, origin, jwt_version FROM users WHERE username = ?').get(username);

  // Always run a bcrypt comparison so response timing doesn't reveal whether the username exists
  const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpQ0D3NtRSm7oHFCjP.QfHm3XW1Bu';
  const passwordMatches = await bcrypt.compare(password, user?.password || DUMMY_HASH);

  if (user && passwordMatches) {
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, jwt_version: user.jwt_version }, JWT_SECRET, { expiresIn: '7d' });
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    res.json({ status: 'success', data: { token, user: { id: user.id, username: user.username, role: user.role, origin: user.origin } } });
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
    db.prepare('UPDATE users SET password = ?, jwt_version = jwt_version + 1 WHERE id = ?').run(hashed, req.user.id);
    res.json({ status: 'success', message: 'Password updated successfully. Other sessions have been logged out.' });
  } catch (err) {
    console.error('[Auth] Password change failed:', err.message);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// Logout endpoint (invalidates tokens server-side by incrementing jwt_version)
router.post('/logout', authMiddleware, (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }
    db.prepare('UPDATE users SET jwt_version = jwt_version + 1 WHERE id = ?').run(req.user.id);
    res.json({ status: 'success', message: 'Logged out successfully' });
  } catch (err) {
    console.error('[Auth] Logout failed:', err.message);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// Simkl PIN Auth
router.post('/simkl/device-code', generalLimiter, async (req, res) => {
  const simklService = require('../services/simklService');
  try {
    const data = await simklService.getDeviceCode();
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('[Simkl Auth] Failed to get PIN:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to get PIN from Simkl' });
  }
});

router.post('/simkl/device-token', authMiddleware, async (req, res) => {
  const { userCode } = req.body;
  if (!userCode) {
    return res.status(400).json({ status: 'error', message: 'User code is required' });
  }
  const simklService = require('../services/simklService');
  try {
    const data = await simklService.pollDeviceToken(userCode);
    if (data.result === 'OK' && data.access_token) {
      setSetting('simklAccessToken', data.access_token);
      return res.json({ status: 'success', message: 'Simkl account linked successfully!' });
    }
    return res.json({ status: 'pending' });
  } catch (err) {
    if (err.response?.status === 400 || err.response?.status === 404) {
      return res.json({ status: 'pending' });
    }
    console.error('[Simkl Auth] Token poll error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to verify Simkl PIN' });
  }
});

router.post('/simkl/disconnect', authMiddleware, (req, res) => {
  setSetting('simklAccessToken', '');
  setSetting('simklWatchedSync', 'false');
  res.json({ status: 'success', message: 'Simkl account disconnected.' });
});

// Check if authentication is enabled
router.get('/status', (req, res) => {
  const { getSetting } = require('../utils/settings');
  const authEnabled = getSetting('authEnabled') === 'true';
  const plexConfigured = !!getSetting('plexUrl');
  const jellyfinConfigured = !!getSetting('jellyfinUrl');

  res.json({ status: 'success', data: { authEnabled, plexConfigured, jellyfinConfigured } });
});

// Plex Auth endpoint

// Generate Plex Pin (proxy to avoid client-side adblockers/CORS)
router.post('/plex/pin', generalLimiter, async (req, res) => {
  try {
    const clientId = 'Atlas-' + Math.random().toString(36).substring(2, 15);
    const pinRes = await axios.post('https://plex.tv/api/v2/pins?strong=true', null, {
      headers: {
        'Accept': 'application/json',
        'X-Plex-Client-Identifier': clientId,
        'X-Plex-Product': 'Atlas'
      }
    });
    res.json({ status: 'success', data: { ...pinRes.data, clientId } });
  } catch (err) {
    console.error('[Plex Pin] Failed:', err.response?.data || err.message);
    res.status(500).json({ status: 'error', message: 'Failed to generate Plex pin' });
  }
});

// Poll Plex Pin (proxy)
router.get('/plex/pin/:id', generalLimiter, async (req, res) => {
  const { id } = req.params;
  const { clientId } = req.query;
  if (!clientId) return res.status(400).json({ status: 'error', message: 'clientId required' });
  
  try {
    const pollRes = await axios.get(`https://plex.tv/api/v2/pins/${id}`, {
      headers: {
        'Accept': 'application/json',
        'X-Plex-Client-Identifier': clientId
      }
    });
    res.json({ status: 'success', data: pollRes.data });
  } catch (err) {
    console.error('[Plex Pin Poll] Failed:', err.response?.data || err.message);
    res.status(500).json({ status: 'error', message: 'Failed to poll Plex pin' });
  }
});

router.post('/plex/login', loginLimiter, async (req, res) => {
  const { authToken } = req.body;
  const { getSetting } = require('../utils/settings');
  const authEnabled = getSetting('authEnabled') === 'true';

  if (!authEnabled) {
    return res.json({ status: 'success', message: 'Authentication is disabled' });
  }

  if (!authToken) {
    return res.status(400).json({ status: 'error', message: 'Plex auth token required' });
  }

  try {
    const plexRes = await axios.get('https://plex.tv/api/v2/user', {
      headers: {
        'X-Plex-Token': authToken,
        'Accept': 'application/json',
      }
    });
    
    const plexUser = plexRes.data;
    const username = plexUser.username || plexUser.email;
    const email = plexUser.email;

    if (!username) {
      return res.status(400).json({ status: 'error', message: 'Plex account has no username or email' });
    }

    let user = db.prepare("SELECT id, username, role, origin, jwt_version FROM users WHERE ((username = ? AND origin = 'plex') OR (email = ? AND email IS NOT NULL AND email != '' AND origin = 'plex'))").get(username, email);
    
    if (!user) {
      // Check if username is already taken by another origin
      let finalUsername = username;
      const existingName = db.prepare('SELECT id FROM users WHERE username = ?').get(finalUsername);
      if (existingName) {
        finalUsername = `${username}_plex`;
      }
      // Create new user for Plex
      const result = db.prepare("INSERT INTO users (username, email, role, origin) VALUES (?, ?, 'user', 'plex')").run(finalUsername, email);
      user = { id: result.lastInsertRowid, username: finalUsername, role: 'user', origin: 'plex', jwt_version: 1 };
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, jwt_version: user.jwt_version }, JWT_SECRET, { expiresIn: '7d' });
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    
    res.json({ status: 'success', data: { token, user: { id: user.id, username: user.username, role: user.role, origin: user.origin } } });
  } catch (err) {
    console.error('[Plex Auth] Failed:', err.response?.data || err.message);
    res.status(401).json({ status: 'error', message: 'Invalid Plex token or Plex API unreachable' });
  }
});

// Jellyfin Auth endpoint
router.post('/jellyfin/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const { getSetting } = require('../utils/settings');
  const authEnabled = getSetting('authEnabled') === 'true';

  if (!authEnabled) {
    return res.json({ status: 'success', message: 'Authentication is disabled' });
  }

  const jellyfinUrl = getSetting('jellyfinUrl');
  if (!jellyfinUrl) {
    return res.status(400).json({ status: 'error', message: 'Jellyfin is not configured on this server' });
  }

  try {
    const jellyfinRes = await axios.post(`${jellyfinUrl}/Users/AuthenticateByName`, {
      Username: username,
      Pw: password
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'MediaBrowser Client="Atlas", Device="Web", DeviceId="AtlasAuth", Version="1.0"'
      }
    });

    if (jellyfinRes.status === 200 && jellyfinRes.data.User) {
      const jellyUser = jellyfinRes.data.User;
      const jfUsername = jellyUser.Name;

      let user = db.prepare("SELECT id, username, role, origin, jwt_version FROM users WHERE username = ? AND origin = 'jellyfin'").get(jfUsername);
      
      if (!user) {
        let finalUsername = jfUsername;
        const existingName = db.prepare('SELECT id FROM users WHERE username = ?').get(finalUsername);
        if (existingName) {
          finalUsername = `${jfUsername}_jellyfin`;
        }
        // Create new user for Jellyfin
        const result = db.prepare("INSERT INTO users (username, role, origin) VALUES (?, 'user', 'jellyfin')").run(finalUsername);
        user = { id: result.lastInsertRowid, username: finalUsername, role: 'user', origin: 'jellyfin', jwt_version: 1 };
      }

      const token = jwt.sign({ id: user.id, username: user.username, role: user.role, jwt_version: user.jwt_version }, JWT_SECRET, { expiresIn: '7d' });
      db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
      
      res.json({ status: 'success', data: { token, user: { id: user.id, username: user.username, role: user.role, origin: user.origin } } });
    } else {
      res.status(401).json({ status: 'error', message: 'Invalid Jellyfin credentials' });
    }
  } catch (err) {
    console.error('[Jellyfin Auth] Failed:', err.response?.data || err.message);
    res.status(401).json({ status: 'error', message: 'Invalid Jellyfin credentials or server unreachable' });
  }
});


// Jellyfin Quick Connect Initiate
router.get('/jellyfin/quickconnect/initiate', generalLimiter, async (req, res) => {
  const { getSetting } = require('../utils/settings');
  const jellyfinUrl = getSetting('jellyfinUrl');
  if (!jellyfinUrl) return res.status(400).json({ status: 'error', message: 'Jellyfin not configured' });

  try {
    const initRes = await axios.post(`${jellyfinUrl}/QuickConnect/Initiate`, {}, {
      headers: {
        'Authorization': 'MediaBrowser Client="Atlas", Device="Web", DeviceId="AtlasAuth", Version="1.0"'
      }
    });
    res.json({ status: 'success', data: initRes.data });
  } catch (err) {
    console.error('[Jellyfin QC] Initiate failed:', err.response?.data || err.message);
    res.status(500).json({ status: 'error', message: 'Failed to initiate Quick Connect' });
  }
});

// Jellyfin Quick Connect Status Poll
router.get('/jellyfin/quickconnect/status', generalLimiter, async (req, res) => {
  const { secret } = req.query;
  const { getSetting } = require('../utils/settings');
  const jellyfinUrl = getSetting('jellyfinUrl');
  if (!jellyfinUrl) return res.status(400).json({ status: 'error', message: 'Jellyfin not configured' });
  if (!secret) return res.status(400).json({ status: 'error', message: 'Secret is required' });

  try {
    const statusRes = await axios.get(`${jellyfinUrl}/QuickConnect/Connect?Secret=${secret}`);
    // returns { Authenticated: true/false }
    res.json({ status: 'success', data: statusRes.data });
  } catch (err) {
    // If it fails or returns 404, it might mean the secret is invalid or expired
    console.error('[Jellyfin QC] Status failed:', err.response?.data || err.message);
    res.status(500).json({ status: 'error', message: 'Failed to poll Quick Connect status' });
  }
});

// Jellyfin Quick Connect Login (finalize)
router.post('/jellyfin/quickconnect/login', loginLimiter, async (req, res) => {
  const { secret } = req.body;
  const { getSetting } = require('../utils/settings');
  const jellyfinUrl = getSetting('jellyfinUrl');
  if (!jellyfinUrl) return res.status(400).json({ status: 'error', message: 'Jellyfin not configured' });
  if (!secret) return res.status(400).json({ status: 'error', message: 'Secret is required' });

  try {
    // Finalize the auth using the secret
    const loginRes = await axios.post(`${jellyfinUrl}/Users/AuthenticateWithQuickConnect`, {
      Secret: secret
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'MediaBrowser Client="Atlas", Device="Web", DeviceId="AtlasAuth", Version="1.0"'
      }
    });

    if (loginRes.status === 200 && loginRes.data.User) {
      const jellyUser = loginRes.data.User;
      const jfUsername = jellyUser.Name;

      let user = db.prepare("SELECT id, username, role, origin, jwt_version FROM users WHERE username = ? AND origin = 'jellyfin'").get(jfUsername);
      
      if (!user) {
        let finalUsername = jfUsername;
        const existingName = db.prepare('SELECT id FROM users WHERE username = ?').get(finalUsername);
        if (existingName) {
          finalUsername = `${jfUsername}_jellyfin`;
        }
        const result = db.prepare("INSERT INTO users (username, role, origin) VALUES (?, 'user', 'jellyfin')").run(finalUsername);
        user = { id: result.lastInsertRowid, username: finalUsername, role: 'user', origin: 'jellyfin', jwt_version: 1 };
      }

      const token = jwt.sign({ id: user.id, username: user.username, role: user.role, jwt_version: user.jwt_version }, JWT_SECRET, { expiresIn: '7d' });
      db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
      
      res.json({ status: 'success', data: { token, user: { id: user.id, username: user.username, role: user.role, origin: user.origin } } });
    } else {
      res.status(401).json({ status: 'error', message: 'Quick Connect authentication failed' });
    }
  } catch (err) {
    console.error('[Jellyfin QC] Login failed:', err.response?.data || err.message);
    res.status(401).json({ status: 'error', message: 'Quick Connect authentication failed or server unreachable' });
  }
});

module.exports = router;


