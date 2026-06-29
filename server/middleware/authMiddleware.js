const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'atlas_super_secret_key_change_me';

const authMiddleware = (req, res, next) => {
  // Check if authentication is enabled
  const authEnabledRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('authEnabled');
  const authEnabled = authEnabledRow ? authEnabledRow.value === 'true' : false;

  if (!authEnabled) {
    req.user = { role: 'admin' };
    return next();
  }

  // Check if bypass for localhost is enabled
  const bypassLocalhostRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('authBypassLocalhost');
  const bypassLocalhost = bypassLocalhostRow ? bypassLocalhostRow.value === 'true' : true;

  if (bypassLocalhost) {
    // Check if the request comes from localhost
    const ip = req.ip || req.connection.remoteAddress;
    const isLocalhost = ip === '127.0.0.1' || ip === '::ffff:127.0.0.1' || ip === '::1' || ip.includes('localhost');
    
    // Also check standard proxy headers if behind a reverse proxy that didn't set x-forwarded-for properly,
    // though usually you want to trust x-forwarded-for if set up correctly.
    if (isLocalhost) {
      req.user = { role: 'admin' };
      return next();
    }
  }

  // Auth is required, check for token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { username: '...' }
    next();
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized: Invalid token' });
  }
};

module.exports = authMiddleware;
