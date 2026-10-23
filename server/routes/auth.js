const express = require('express');
const router = express.Router();
const axios = require('axios');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const db = require('../config/database');
const { getSetting, setSetting, isAuthEnabled } = require('../utils/settings');

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const getJwtSecret = () => process.env.JWT_SECRET || JWT_SECRET || 'atlas_fallback_secret_for_tests';
// JWT_SECRET presence is validated at startup in index.js before this module loads.
// Using the value here is safe.

const authMiddleware = require('../middleware/authMiddleware');
const {
  generateSecret,
  verifyTOTP,
  generateOtpAuthUri,
  generateQRCodeDataUrl,
  generateBackupCodes,
  hashBackupCode,
  findMatchingBackupCodeIndex
} = require('../utils/totp');

// Rate limiter: max 5 attempts per 15 minutes per IP (skipped in test environment)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skip: () => process.env.NODE_ENV === 'test',
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

// Dedicated rate limiter for 2FA verification attempts (10 attempts per 15 min)
const totpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many 2FA verification attempts. Please try again in 15 minutes.' },
});

// Login endpoint
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, totp_code } = req.body;
  const authEnabled = isAuthEnabled();

  if (!authEnabled) {
    return res.json({ status: 'success', message: 'Authentication is disabled' });
  }

  const user = db.prepare('SELECT id, username, password, role, origin, jwt_version, totp_enabled, totp_secret, totp_backup_codes FROM users WHERE username = ?').get(username);

  // Always run a bcrypt comparison so response timing doesn't reveal whether the username exists
  const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpQ0D3NtRSm7oHFCjP.QfHm3XW1Bu';
  const passwordMatches = await bcrypt.compare(password, user?.password || DUMMY_HASH);

  if (!user || !passwordMatches) {
    return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
  }

  // If 2FA is enabled for this account
  if (user.totp_enabled) {
    if (!totp_code) {
      // Return temporary challenge token valid for 5 minutes
      const tempToken = jwt.sign(
        { id: user.id, username: user.username, role: user.role, stage: 'totp_pending' },
        getJwtSecret(),
        { expiresIn: '5m' }
      );
      return res.json({
        status: 'totp_required',
        message: 'Two-factor authentication code required',
        data: { temp_token: tempToken }
      });
    }

    // Verify code against TOTP or single-use backup codes
    const isTotpValid = verifyTOTP(totp_code, user.totp_secret);
    let isBackupValid = false;
    let backupCodes = [];
    try {
      backupCodes = user.totp_backup_codes ? JSON.parse(user.totp_backup_codes) : [];
    } catch { /* ignore */ }

    if (!isTotpValid) {
      const matchIdx = findMatchingBackupCodeIndex(totp_code, backupCodes);
      if (matchIdx !== -1) {
        isBackupValid = true;
        backupCodes.splice(matchIdx, 1);
        db.prepare('UPDATE users SET totp_backup_codes = ? WHERE id = ?').run(
          JSON.stringify(backupCodes),
          user.id
        );
      }
    }

    if (!isTotpValid && !isBackupValid) {
      return res.status(401).json({ status: 'error', message: 'Invalid two-factor authentication code or backup code' });
    }
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, jwt_version: user.jwt_version },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  res.json({ status: 'success', data: { token, user: { id: user.id, username: user.username, role: user.role, origin: user.origin } } });
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
    const errorMsg = err.response?.data?.message || err.message || 'Failed to get PIN from Simkl';
    console.error('[Simkl Auth] Failed to get PIN:', errorMsg);
    res.status(err.response?.status || 500).json({ status: 'error', message: errorMsg });
  }
});

router.post('/simkl/device-token', authMiddleware, async (req, res) => {
  const { userCode, deviceCode } = req.body;
  if (!userCode && !deviceCode) {
    return res.status(400).json({ status: 'error', message: 'User code or device code is required' });
  }
  const simklService = require('../services/simklService');
  try {
    const data = await simklService.pollDeviceToken(userCode, deviceCode);
    if ((data.result === 'OK' && data.access_token) || data.access_token) {
      setSetting('simklAccessToken', data.access_token);
      return res.json({ status: 'success', message: 'Simkl account linked successfully!' });
    }
    return res.json({ status: 'pending' });
  } catch (err) {
    if (err.response?.data?.error === 'authorization_pending' || err.response?.data?.error === 'slow_down') {
      return res.json({ status: 'pending' });
    }
    if (err.message && err.message.includes('expired')) {
      return res.status(400).json({ status: 'error', message: err.message });
    }
    console.error('[Simkl Auth] Token poll error:', err.message);
    res.status(500).json({ status: 'error', message: err.message || 'Failed to verify Simkl PIN' });
  }
});

router.post('/simkl/disconnect', authMiddleware, (req, res) => {
  setSetting('simklAccessToken', '');
  setSetting('simklWatchedSync', 'false');
  res.json({ status: 'success', message: 'Simkl account disconnected.' });
});

// Check if authentication is enabled and if initial setup is needed
router.get('/status', (req, res) => {
  const authEnabled = isAuthEnabled();
  const plexConfigured = !!getSetting('plexUrl');
  const jellyfinConfigured = !!getSetting('jellyfinUrl');
  const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get()?.count || 0;
  const needsSetup = adminCount === 0;

  res.json({ status: 'success', data: { authEnabled, plexConfigured, jellyfinConfigured, needsSetup } });
});

// Initial Setup Endpoint: create the first administrator account (can only be run once)
router.post('/setup', loginLimiter, async (req, res) => {
  const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  const setupFlag = getSetting('initialSetupCompleted');

  if (adminExists || setupFlag === 'true') {
    return res.status(403).json({ 
      status: 'error', 
      message: 'Access denied: Initial setup has already been completed. Only one administrator account can be created.' 
    });
  }

  const { username, password, email } = req.body;
  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ status: 'error', message: 'Username must be at least 3 characters long.' });
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters long.' });
  }

  try {
    const trimmedUser = username.trim();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(trimmedUser);
    if (existing) {
      return res.status(400).json({ status: 'error', message: 'A user with this username already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Run atomically inside transaction to eliminate race conditions
    let newUserId;
    try {
      const executeSetup = db.transaction(() => {
        const checkAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
        if (checkAdmin) {
          throw new Error('SETUP_ALREADY_COMPLETED');
        }

        const result = db.prepare("INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, 'admin')").run(
          trimmedUser,
          hashedPassword,
          email ? email.trim() : null
        );

        setSetting('initialSetupCompleted', 'true');
        return result.lastInsertRowid;
      });

      newUserId = executeSetup();
    } catch (txErr) {
      if (txErr.message === 'SETUP_ALREADY_COMPLETED') {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Access denied: Initial setup has already been completed.' 
        });
      }
      throw txErr;
    }

    const token = jwt.sign(
      { id: newUserId, username: trimmedUser, role: 'admin', jwt_version: 1 },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    res.json({
      status: 'success',
      message: 'Administrator account created successfully!',
      data: {
        token,
        user: { id: newUserId, username: trimmedUser, role: 'admin', origin: 'atlas' }
      }
    });
  } catch (err) {
    console.error('[Auth Setup] Error creating admin:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to create administrator account.' });
  }
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
  const authEnabled = isAuthEnabled();

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

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, jwt_version: user.jwt_version }, getJwtSecret(), { expiresIn: '7d' });
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
  const authEnabled = isAuthEnabled();

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

      const token = jwt.sign({ id: user.id, username: user.username, role: user.role, jwt_version: user.jwt_version }, getJwtSecret(), { expiresIn: '7d' });
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
    const statusRes = await axios.get(`${jellyfinUrl}/QuickConnect/Connect?Secret=${encodeURIComponent(secret)}`);
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

      const token = jwt.sign({ id: user.id, username: user.username, role: user.role, jwt_version: user.jwt_version }, getJwtSecret(), { expiresIn: '7d' });
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

// ── Two-Factor Authentication (TOTP) Endpoints ──────────────────────────────

// Verify login with TOTP code or backup code
router.post('/2fa/verify-login', totpLimiter, async (req, res) => {
  const { temp_token, totp_code } = req.body;
  if (!temp_token || !totp_code) {
    return res.status(400).json({ status: 'error', message: 'Missing token or 2FA code' });
  }

  try {
    const decoded = jwt.verify(temp_token, getJwtSecret());
    if (!decoded || decoded.stage !== 'totp_pending' || !decoded.id) {
      return res.status(401).json({ status: 'error', message: 'Invalid or expired 2FA session' });
    }

    const user = db.prepare('SELECT id, username, role, origin, jwt_version, totp_enabled, totp_secret, totp_backup_codes FROM users WHERE id = ?').get(decoded.id);
    if (!user || !user.totp_enabled) {
      return res.status(400).json({ status: 'error', message: '2FA is not enabled for this user' });
    }

    const isTotpValid = verifyTOTP(totp_code, user.totp_secret);
    let isBackupValid = false;
    let backupCodes = [];
    try {
      backupCodes = user.totp_backup_codes ? JSON.parse(user.totp_backup_codes) : [];
    } catch { /* ignore */ }

    if (!isTotpValid) {
      const matchIdx = findMatchingBackupCodeIndex(totp_code, backupCodes);
      if (matchIdx !== -1) {
        isBackupValid = true;
        backupCodes.splice(matchIdx, 1);
        db.prepare('UPDATE users SET totp_backup_codes = ? WHERE id = ?').run(
          JSON.stringify(backupCodes),
          user.id
        );
      }
    }

    if (!isTotpValid && !isBackupValid) {
      return res.status(401).json({ status: 'error', message: 'Invalid two-factor authentication code or backup code' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, jwt_version: user.jwt_version },
      getJwtSecret(),
      { expiresIn: '7d' }
    );
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    res.json({
      status: 'success',
      data: { token, user: { id: user.id, username: user.username, role: user.role, origin: user.origin } }
    });
  } catch {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired 2FA session' });
  }
});

// Check current user 2FA status
router.get('/2fa/status', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT totp_enabled FROM users WHERE id = ?').get(req.user.id);
  res.json({
    status: 'success',
    data: {
      enabled: !!(user && user.totp_enabled)
    }
  });
});

// Initiate 2FA setup: generate new secret and QR code
router.post('/2fa/setup', authMiddleware, async (req, res) => {
  try {
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const secret = generateSecret();
    const otpauthUri = generateOtpAuthUri({
      secret,
      username: user.username,
      issuer: 'Atlas'
    });
    const qrCodeDataUrl = await generateQRCodeDataUrl(otpauthUri);

    // Save pending secret (not yet enabled until verified)
    db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, user.id);

    res.json({
      status: 'success',
      data: {
        secret,
        qr_code: qrCodeDataUrl,
        otpauth_url: otpauthUri
      }
    });
  } catch (err) {
    console.error('[2FA Setup] Failed:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to initialize 2FA setup' });
  }
});

// Confirm 2FA setup with first code and receive emergency recovery codes
router.post('/2fa/enable', authMiddleware, (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ status: 'error', message: 'Verification code is required' });
  }

  const user = db.prepare('SELECT id, totp_secret FROM users WHERE id = ?').get(req.user.id);
  if (!user || !user.totp_secret) {
    return res.status(400).json({ status: 'error', message: '2FA setup was not initiated. Please start setup again.' });
  }

  const isValid = verifyTOTP(code, user.totp_secret);
  if (!isValid) {
    return res.status(400).json({ status: 'error', message: 'Invalid verification code. Please check your authenticator app and try again.' });
  }

  // Generate 8 emergency backup codes
  const rawBackupCodes = generateBackupCodes(8);
  const hashedBackupCodes = rawBackupCodes.map(hashBackupCode);

  db.prepare('UPDATE users SET totp_enabled = 1, totp_backup_codes = ? WHERE id = ?').run(
    JSON.stringify(hashedBackupCodes),
    user.id
  );

  res.json({
    status: 'success',
    message: 'Two-factor authentication has been enabled successfully',
    data: {
      backup_codes: rawBackupCodes
    }
  });
});

// Disable 2FA (requires password confirmation and TOTP/backup code)
router.post('/2fa/disable', authMiddleware, async (req, res) => {
  const { password, code } = req.body;
  if (!password || !code) {
    return res.status(400).json({ status: 'error', message: 'Current password and verification code are required' });
  }

  const user = db.prepare('SELECT id, password, totp_secret, totp_backup_codes FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ status: 'error', message: 'User not found' });
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    return res.status(400).json({ status: 'error', message: 'Incorrect current password' });
  }

  const isTotpValid = verifyTOTP(code, user.totp_secret);
  let isBackupValid = false;
  let backupCodes = [];
  try {
    backupCodes = user.totp_backup_codes ? JSON.parse(user.totp_backup_codes) : [];
  } catch { /* ignore */ }

  if (!isTotpValid) {
    const matchIdx = findMatchingBackupCodeIndex(code, backupCodes);
    if (matchIdx !== -1) {
      isBackupValid = true;
    }
  }

  if (!isTotpValid && !isBackupValid) {
    return res.status(400).json({ status: 'error', message: 'Invalid verification code or backup code' });
  }

  db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_backup_codes = NULL WHERE id = ?').run(user.id);

  res.json({
    status: 'success',
    message: 'Two-factor authentication has been disabled successfully'
  });
});

module.exports = router;


