const db = require('../config/database');

const getSetting = (key) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
};

const setSetting = (key, value) => {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
};

const isWatchedSyncEnabled = () => {
  return getSetting('traktWatchedSync') === 'true';
};

module.exports = { getSetting, setSetting, isWatchedSyncEnabled };
