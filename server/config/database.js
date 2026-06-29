const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, '../data/database.sqlite'));

db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');

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

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    email TEXT,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    tmdb_id INTEGER,
    type TEXT,
    title TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );


  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdb_id INTEGER UNIQUE,
    title TEXT,
    year INTEGER,
    poster_path TEXT,
    overview TEXT,
    status TEXT DEFAULT 'monitored',
    folder_path TEXT,
    file_path TEXT,
    scene_name TEXT,
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
    scene_name TEXT,
    air_date TEXT,
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

  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#06b6d4',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS movie_collections (
    movie_id INTEGER NOT NULL,
    collection_id INTEGER NOT NULL,
    PRIMARY KEY (movie_id, collection_id),
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS release_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    enabled INTEGER DEFAULT 1,
    must_contain TEXT DEFAULT '[]',
    must_not_contain TEXT DEFAULT '[]',
    indexer_id INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies(tmdb_id);
  CREATE INDEX IF NOT EXISTS idx_movies_status ON movies(status);
  CREATE INDEX IF NOT EXISTS idx_shows_tmdb_id ON shows(tmdb_id);
  CREATE INDEX IF NOT EXISTS idx_shows_status ON shows(status);
  CREATE INDEX IF NOT EXISTS idx_episodes_show_id ON episodes(show_id);
  CREATE INDEX IF NOT EXISTS idx_episodes_status ON episodes(status);
`);

try {
  db.exec("ALTER TABLE movies ADD COLUMN file_path TEXT;");
} catch (e) {}

try {
  db.exec("ALTER TABLE movies ADD COLUMN quality_profile_id INTEGER;");
} catch (e) {}

try {
  db.exec("ALTER TABLE movies ADD COLUMN scene_name TEXT;");
} catch (e) {}

try {
  db.exec("ALTER TABLE episodes ADD COLUMN scene_name TEXT;");
} catch (e) {}

try {
  db.exec("ALTER TABLE shows ADD COLUMN quality_profile_id INTEGER;");
} catch (e) {}

try { db.exec("ALTER TABLE quality_profiles ADD COLUMN qualities TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE quality_profiles ADD COLUMN cutoff TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE quality_profiles ADD COLUMN upgrade_allowed INTEGER DEFAULT 1;"); } catch (e) {}
try { db.exec("ALTER TABLE release_profiles ADD COLUMN apply_to TEXT DEFAULT 'all';"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN origin TEXT DEFAULT 'atlas';"); } catch (e) {}

// Ensure rating columns exist
try { db.exec("ALTER TABLE movies ADD COLUMN rating REAL DEFAULT 0;"); } catch (e) {}
try { db.exec("ALTER TABLE shows ADD COLUMN rating REAL DEFAULT 0;"); } catch (e) {}
// Ensure size columns exist
try { db.exec("ALTER TABLE movies ADD COLUMN file_size INTEGER DEFAULT 0;"); } catch (e) {}
try { db.exec("ALTER TABLE shows ADD COLUMN folder_size INTEGER DEFAULT 0;"); } catch (e) {}
try { db.exec("ALTER TABLE episodes ADD COLUMN file_size INTEGER DEFAULT 0;"); } catch (e) {}
// Ensure watched columns exist
try { db.exec("ALTER TABLE movies ADD COLUMN watched INTEGER DEFAULT 0;"); } catch (e) {}
try { db.exec("ALTER TABLE shows ADD COLUMN watched INTEGER DEFAULT 0;"); } catch (e) {}
// Ensure genres columns exist
try { db.exec("ALTER TABLE movies ADD COLUMN genres TEXT DEFAULT '';"); } catch (e) {}
try { db.exec("ALTER TABLE shows ADD COLUMN genres TEXT DEFAULT '';"); } catch (e) {}
// Ensure monitored columns exist (separate from status which tracks download state)
try { db.exec("ALTER TABLE movies ADD COLUMN monitored INTEGER DEFAULT 1;"); } catch (e) {}
try { db.exec("ALTER TABLE shows ADD COLUMN monitored INTEGER DEFAULT 1;"); } catch (e) {}
try { db.exec("ALTER TABLE episodes ADD COLUMN monitored INTEGER DEFAULT 1;"); } catch (e) {}
try { db.exec("ALTER TABLE episodes ADD COLUMN air_date TEXT;"); } catch (e) {}
// Fix existing items: if they have a file on disk, restore 'downloaded' status
try { db.exec("UPDATE movies SET status = 'downloaded' WHERE file_path IS NOT NULL AND file_path != '' AND status != 'downloading'"); } catch (e) {}
try { db.exec("UPDATE shows SET status = 'downloaded' WHERE folder_path IS NOT NULL AND folder_path != '' AND status != 'downloading'"); } catch (e) {}
try { db.exec("UPDATE episodes SET status = 'downloaded' WHERE file_path IS NOT NULL AND file_path != '' AND status != 'downloading'"); } catch (e) {}
// Track watched TMDB IDs even after library removal
try { db.exec("CREATE TABLE IF NOT EXISTS watched_tmdb (tmdb_id INTEGER PRIMARY KEY, type TEXT NOT NULL);"); } catch (e) {}

// Seed default quality profile if none exists
const existingProfile = db.prepare('SELECT id FROM quality_profiles LIMIT 1').get();
if (!existingProfile) {
  const defaultQualities = JSON.stringify(['720p', '1080p', '2160p']);
  db.prepare('INSERT INTO quality_profiles (name, preferred_resolution, qualities, cutoff, upgrade_allowed) VALUES (?, ?, ?, ?, ?)').run('Any (1080p+)', '1080p', defaultQualities, '1080p', 1);
} else {
  // Backfill if empty
  db.prepare(`UPDATE quality_profiles SET qualities = ?, cutoff = ?, upgrade_allowed = ? WHERE qualities IS NULL`).run(JSON.stringify(['1080p']), '1080p', 1);
}

// Migrate initial admin if users table is empty and we have settings
const existingAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
if (!existingAdmin) {
  const authUsernameRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('authUsername');
  const authPasswordRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('authPassword');
  
  if (authUsernameRow && authUsernameRow.value) {
    db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')").run(
      authUsernameRow.value,
      authPasswordRow ? authPasswordRow.value : ''
    );
  } else {
    // If no auth is set at all, maybe create a default admin 'admin'/'admin' if we want, but better to just leave it until set.
    // We will ensure new auth setup creates an admin in the users table.
  }
}


module.exports = db;
