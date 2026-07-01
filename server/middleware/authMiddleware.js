const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set. Authentication will be insecure.');
  process.exit(1);
}

const authMiddleware = (req, res, next) => {
  const attachDefaultAdmin = () => {
    const adminUser = db.prepare("SELECT id, username, role FROM users WHERE role = 'admin' LIMIT 1").get();
    req.user = adminUser || { id: 1, role: 'admin', username: 'admin' };
  };

  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      
      // Ensure we have the most up-to-date role from the database
      if (req.user && req.user.id) {
        const dbUser = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
        if (dbUser) {
          req.user.role = dbUser.role;
        }
      }
      
      return next();
    } catch (err) {
      // Invalid token, we'll fall through to check bypass
    }
  }

  // Check if authentication is enabled
  const authEnabledRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('authEnabled');
  const authEnabled = authEnabledRow ? authEnabledRow.value === 'true' : false;

  // If no valid token, check bypass rules
  if (!authEnabled) {
    attachDefaultAdmin();
    return next();
  }

  // Check if bypass for localhost is enabled
  const bypassLocalhostRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('authBypassLocalhost');
  const bypassLocalhost = bypassLocalhostRow ? bypassLocalhostRow.value === 'true' : true;

  if (bypassLocalhost) {
    // Use the raw socket peer address rather than req.ip — req.ip can be derived from
    // client-controlled headers (X-Forwarded-For) when 'trust proxy' is enabled, which
    // would let a remote client spoof a localhost IP and bypass authentication.
    const ip = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
    const isLocalhost = ip === '127.0.0.1' || ip === '::ffff:127.0.0.1' || ip === '::1';

    if (isLocalhost) {
      attachDefaultAdmin();
      return next();
    }
  }

  return res.status(401).json({ status: 'error', message: 'Unauthorized: No valid token provided' });
};

module.exports = authMiddleware;
