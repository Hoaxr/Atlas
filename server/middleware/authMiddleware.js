const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET;
// JWT_SECRET presence is validated at startup in index.js before this module loads.
// Using the value here is safe.


// Cache frequently-read settings to avoid DB queries on every request.
// Invalidated when settings are updated (see settings route exports).
// Cache frequently-read settings to avoid DB queries on every request.
// Invalidated when settings are updated (see settings route exports).
let _cachedAdmin = null;
let _cacheExpiry = 0;
const CACHE_TTL = 30000; // 30 seconds

// Cache active user sessions for 5 seconds to prevent synchronous SQLite queries
// from blocking the event loop on rapid polls (e.g. 5s torrent polls, 15s layout polls).
const _userCache = new Map();
const USER_CACHE_TTL = 5000;

const getUserSession = (userId) => {
  const now = Date.now();
  const entry = _userCache.get(userId);
  if (entry && now < entry.expiry) return entry.user;
  const dbUser = db.prepare('SELECT id, role, jwt_version FROM users WHERE id = ?').get(userId);
  _userCache.set(userId, { user: dbUser, expiry: now + USER_CACHE_TTL });
  return dbUser;
};

const invalidateUserCache = (userId) => {
  if (userId) {
    _userCache.delete(userId);
  } else {
    _userCache.clear();
  }
};

const verifyUserSession = (userId, jwtVersion) => {
  const dbUser = getUserSession(userId);
  if (!dbUser) return null;
  if (dbUser.jwt_version !== jwtVersion) return null;
  return dbUser;
};

const getAdminUser = () => {
  const now = Date.now();
  if (_cachedAdmin && now < _cacheExpiry) return _cachedAdmin;
  _cachedAdmin = db.prepare("SELECT id, username, role FROM users WHERE role = 'admin' LIMIT 1").get();
  _cacheExpiry = now + CACHE_TTL;
  return _cachedAdmin;
};

// Allow external invalidation when auth-relevant settings change
const invalidateAuthCache = (userId) => {
  _cachedAdmin = null;
  _cacheExpiry = 0;
  invalidateUserCache(userId);
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
  const bearerToken = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  // <img>/<audio> tags cannot attach an Authorization header, so allow the JWT to
  // be passed as a query parameter on safe (GET) requests — mirrors the /api/images
  // poster route. Never accept query tokens for state-changing methods.
  const queryToken = (req.method === 'GET' && typeof req.query?.token === 'string')
    ? req.query.token
    : null;

  const token = bearerToken || queryToken;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!decoded || !decoded.id) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized: Invalid token payload' });
      }

      const dbUser = getUserSession(decoded.id);
      if (!dbUser) {
        return res.status(401).json({ status: 'error', message: 'User not found or deleted' });
      }
      if (dbUser.jwt_version !== decoded.jwt_version) {
        return res.status(401).json({ status: 'error', message: 'Session invalidated' });
      }

      req.user = {
        ...decoded,
        id: dbUser.id,
        role: dbUser.role,
      };

      return next();
    } catch {
      // Invalid token, we'll fall through to check bypass
    }
  }

  // If no valid token, check if auth is disabled.
  // `authEnabled` defaults to true when the setting is unset (fresh install safe-default).
  const authEnabled = getCachedSetting('authEnabled') !== 'false';

  if (!authEnabled) {
    attachDefaultAdmin();
    return next();
  }

  return res.status(401).json({ status: 'error', message: 'Unauthorized: No valid token provided' });
};

module.exports = authMiddleware;
module.exports.invalidateAuthCache = invalidateAuthCache;
module.exports.invalidateUserCache = invalidateUserCache;
module.exports.verifyUserSession = verifyUserSession;
