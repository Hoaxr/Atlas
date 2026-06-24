const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, '../data/database.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    message TEXT, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdb_id INTEGER UNIQUE,
    title TEXT,
    year INTEGER,
    poster_path TEXT,
    overview TEXT,
    status TEXT DEFAULT 'monitored',
    file_path TEXT,
    quality_profile_id INTEGER,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS library_paths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS indexers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    url TEXT,
    api_key TEXT,
    type TEXT
  );

  CREATE TABLE IF NOT EXISTS shows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdb_id INTEGER UNIQUE,
    title TEXT,
    year INTEGER,
    poster_path TEXT,
    overview TEXT,
    status TEXT DEFAULT 'monitored',
    folder_path TEXT,
    quality_profile_id INTEGER,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    show_id INTEGER,
    season_number INTEGER,
    episode_number INTEGER,
    title TEXT,
    overview TEXT,
    status TEXT DEFAULT 'monitored',
    file_path TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(show_id, season_number, episode_number)
  );

  CREATE TABLE IF NOT EXISTS download_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    host TEXT,
    port INTEGER,
    username TEXT,
    password TEXT,
    type TEXT
  );

  CREATE TABLE IF NOT EXISTS quality_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    preferred_resolution TEXT,
    qualities TEXT,
    cutoff TEXT,
    upgrade_allowed INTEGER DEFAULT 1
  );
`);

try {
  db.exec("ALTER TABLE movies ADD COLUMN file_path TEXT;");
} catch (e) {}

try {
  db.exec("ALTER TABLE movies ADD COLUMN quality_profile_id INTEGER;");
} catch (e) {}

try {
  db.exec("ALTER TABLE shows ADD COLUMN quality_profile_id INTEGER;");
} catch (e) {}

try { db.exec("ALTER TABLE quality_profiles ADD COLUMN qualities TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE quality_profiles ADD COLUMN cutoff TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE quality_profiles ADD COLUMN upgrade_allowed INTEGER DEFAULT 1;"); } catch (e) {}

// Seed default quality profile if none exists
const existingProfile = db.prepare('SELECT id FROM quality_profiles LIMIT 1').get();
if (!existingProfile) {
  const defaultQualities = JSON.stringify(['720p', '1080p', '2160p']);
  db.prepare('INSERT INTO quality_profiles (name, preferred_resolution, qualities, cutoff, upgrade_allowed) VALUES (?, ?, ?, ?, ?)').run('Any (1080p+)', '1080p', defaultQualities, '1080p', 1);
} else {
  // Backfill if empty
  db.prepare(`UPDATE quality_profiles SET qualities = ?, cutoff = ?, upgrade_allowed = ? WHERE qualities IS NULL`).run(JSON.stringify(['1080p']), '1080p', 1);
}

module.exports = db;
