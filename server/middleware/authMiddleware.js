const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET;
// JWT_SECRET presence is validated at startup in index.js before this module loads.
// Using the value here is safe.


// Cache frequently-read settings to avoid DB queries on every request.
// Invalidated when settings are updated (see settings route exports).
let _cachedAdmin = null;
let _cacheExpiry = 0;
const CACHE_TTL = 30000; // 30 seconds

const getAdminUser = () => {
  const now = Date.now();
  if (_cachedAdmin && now < _cacheExpiry) return _cachedAdmin;
  _cachedAdmin = db.prepare("SELECT id, username, role FROM users WHERE role = 'admin' LIMIT 1").get();
  _cacheExpiry = now + CACHE_TTL;
  return _cachedAdmin;
};

// Allow external invalidation when auth-relevant settings change
const invalidateAuthCache = () => {
  _cachedAdmin = null;
  _cacheExpiry = 0;
  if (typeof getCachedSetting.clearCache === 'function') {
    getCachedSetting.clearCache();
  }
};

const getCachedSetting = (() => {
  const cache = {};
  const fn = (key) => {
    const now = Date.now();
    const entry = cache[key];
    if (entry && now < entry.expiry) return entry.value;
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    const value = row ? row.value : null;
    cache[key] = { value, expiry: now + CACHE_TTL };
    return value;
  };
  fn.clearCache = () => {
    for (const k in cache) delete cache[k];
  };
  return fn;
})();

const authMiddleware = (req, res, next) => {
  const attachDefaultAdmin = () => {
    const adminUser = getAdminUser();
    req.user = adminUser || { id: 1, role: 'admin', username: 'admin' };
  };

  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      
      // Ensure we have the most up-to-date role and check jwt_version from the database
      if (req.user && req.user.id) {
        const dbUser = db.prepare('SELECT role, jwt_version FROM users WHERE id = ?').get(req.user.id);
        if (!dbUser) {
          return res.status(401).json({ status: 'error', message: 'User not found or deleted' });
        }
        if (dbUser.jwt_version !== req.user.jwt_version) {
          return res.status(401).json({ status: 'error', message: 'Session invalidated' });
        }
        req.user.role = dbUser.role;
      }
      
      return next();
    } catch (err) {
      // Invalid token, we'll fall through to check bypass
    }
  }

  // If no valid token, check bypass rules.
  // `authEnabled` defaults to true when the setting is unset (fresh install safe-default).
  const authEnabled = getCachedSetting('authEnabled') !== 'false';

  if (!authEnabled) {
    attachDefaultAdmin();
    return next();
  }

  // Check if bypass for localhost is enabled (must be explicitly enabled in settings)
  const bypassLocalhost = getCachedSetting('authBypassLocalhost') === 'true'; // default false

  if (bypassLocalhost) {
    // Use the raw socket peer address rather than req.ip — req.ip can be derived from
    // client-controlled headers (X-Forwarded-For) when 'trust proxy' is enabled, which
    // would let a remote client spoof a localhost IP and bypass authentication.
    const ip = req.socket?.remoteAddress || req.connection?.remoteAddress || '';

    const isPrivate = (addr) => {
      // Strip IPv6 prefix if present
      const clean = addr.replace(/^::ffff:/, '');
      // Localhost
      if (clean === '127.0.0.1' || clean === '::1') return true;
      return false;
    };

    if (isPrivate(ip)) {
      attachDefaultAdmin();
      return next();
    }
  }

  return res.status(401).json({ status: 'error', message: 'Unauthorized: No valid token provided' });
};

module.exports = authMiddleware;
module.exports.invalidateAuthCache = invalidateAuthCache;
