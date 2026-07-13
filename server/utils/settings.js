const db = require('../config/database');

// ── Module-level settings cache — avoids N+1 DB queries ──
// Invalidation: setSetting() clears cache; cache auto-refreshes on next getSetting() call
let _settingsCache = null;
let _cacheTimestamp = 0;
const CACHE_TTL = 30_000; // 30 seconds

const loadAllSettings = () => {
  if (_settingsCache && Date.now() - _cacheTimestamp < CACHE_TTL) return;
  const rows = db.prepare('SELECT key, value FROM settings').all();
  _settingsCache = new Map(rows.map(r => [r.key, r.value]));
  _cacheTimestamp = Date.now();
};

const getSetting = (key) => {
  loadAllSettings();
  return _settingsCache?.get(key) ?? null;
};

const setSetting = (key, value) => {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
  // Invalidate cache so next read picks up the change
  if (_settingsCache) _settingsCache.set(key, String(value));
};

// Invalidate the entire cache (call after external changes to settings table)
const invalidateSettingsCache = () => {
  _settingsCache = null;
  _cacheTimestamp = 0;
};

const isWatchedSyncEnabled = () => {
  return getSetting('traktWatchedSync') === 'true';
};

module.exports = { getSetting, setSetting, isWatchedSyncEnabled, invalidateSettingsCache };
