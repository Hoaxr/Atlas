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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
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
    release_date TEXT,
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

  CREATE TABLE IF NOT EXISTS play_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE,
    user TEXT,
    title TEXT,
    type TEXT,
    server TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_play_history_type ON play_history(type);
  CREATE INDEX IF NOT EXISTS idx_play_history_user ON play_history(user);
`);

try {
  db.exec("ALTER TABLE movies ADD COLUMN file_path TEXT;");
} catch { /* ignore */ }

try {
  db.exec("ALTER TABLE play_history ADD COLUMN player TEXT;");
} catch { /* ignore */ }

try {
  db.exec("ALTER TABLE movies ADD COLUMN quality_profile_id INTEGER;");
} catch { /* ignore */ }

try {
  db.exec("ALTER TABLE movies ADD COLUMN scene_name TEXT;");
} catch { /* ignore */ }

try {
  db.exec("ALTER TABLE episodes ADD COLUMN scene_name TEXT;");
} catch { /* ignore */ }

try {
  db.exec("ALTER TABLE shows ADD COLUMN quality_profile_id INTEGER;");
} catch { /* ignore */ }

try { db.exec("ALTER TABLE quality_profiles ADD COLUMN qualities TEXT;"); } catch { /* ignore */ }
try { db.exec("ALTER TABLE quality_profiles ADD COLUMN cutoff TEXT;"); } catch { /* ignore */ }
try { db.exec("ALTER TABLE quality_profiles ADD COLUMN upgrade_allowed INTEGER DEFAULT 1;"); } catch { /* ignore */ }
try { db.exec("ALTER TABLE release_profiles ADD COLUMN apply_to TEXT DEFAULT 'all';"); } catch { /* ignore */ }
try { db.exec("ALTER TABLE users ADD COLUMN origin TEXT DEFAULT 'atlas';"); } catch { /* ignore */ }

// Ensure rating columns exist
try { db.exec("ALTER TABLE movies ADD COLUMN rating REAL DEFAULT 0;"); } catch { /* ignore */ }
try { db.exec("ALTER TABLE shows ADD COLUMN rating REAL DEFAULT 0;"); } catch { /* ignore */ }
// Ensure size columns exist
try { db.exec("ALTER TABLE movies ADD COLUMN file_size INTEGER DEFAULT 0;"); } catch { /* ignore */ }
try { db.exec("ALTER TABLE shows ADD COLUMN folder_size INTEGER DEFAULT 0;"); } catch { /* ignore */ }
try { db.exec("ALTER TABLE episodes ADD COLUMN file_size INTEGER DEFAULT 0;"); } catch { /* ignore */ }
// Ensure watched columns exist
try { db.exec("ALTER TABLE movies ADD COLUMN watched INTEGER DEFAULT 0;"); } catch { /* ignore */ }
try { db.exec("ALTER TABLE shows ADD COLUMN watched INTEGER DEFAULT 0;"); } catch { /* ignore */ }// Ensure subtitle columns exist
try { db.exec("ALTER TABLE movies ADD COLUMN subtitles TEXT DEFAULT '[]';"); } catch { /* ignore */ }
try { db.exec("ALTER TABLE episodes ADD COLUMN subtitles TEXT DEFAULT '[]';"); } catch { /* ignore */ }
// Ensure library_paths type column exists
try { db.exec("ALTER TABLE library_paths ADD COLUMN type TEXT DEFAULT 'movies';"); } catch { /* ignore */ }// Ensure genres columns exist
try { db.exec("ALTER TABLE movies ADD COLUMN genres TEXT DEFAULT '';"); } catch { /* ignore */ }
try { db.exec("ALTER TABLE shows ADD COLUMN genres TEXT DEFAULT '';"); } catch { /* ignore */ }
// Ensure monitored columns exist (separate from status which tracks download state)
try { db.exec("ALTER TABLE movies ADD COLUMN monitored INTEGER DEFAULT 1;"); } catch { /* ignore */ }
// Ensure resolution columns exist
try { db.exec("ALTER TABLE movies ADD COLUMN resolution TEXT;"); } catch { /* ignore */ }
try { db.exec("ALTER TABLE episodes ADD COLUMN resolution TEXT;"); } catch { /* ignore */ }
// Populate resolution from existing scene_name data
try {
  db.exec(`
    UPDATE movies SET resolution = CASE
      WHEN scene_name LIKE '%2160p%' OR scene_name LIKE '%4K%' OR scene_name LIKE '%4k%' THEN '2160p'
      WHEN scene_name LIKE '%1080p%' THEN '1080p'
      WHEN scene_name LIKE '%720p%' THEN '720p'
      WHEN scene_name LIKE '%480p%' THEN '480p'
      WHEN scene_name LIKE '%SD%' OR scene_name LIKE '%sd%' THEN 'SD'
      ELSE NULL
    END
    WHERE resolution IS NULL AND scene_name IS NOT NULL
  `);
  db.exec(`
    UPDATE episodes SET resolution = CASE
      WHEN scene_name LIKE '%2160p%' OR scene_name LIKE '%4K%' OR scene_name LIKE '%4k%' THEN '2160p'
      WHEN scene_name LIKE '%1080p%' THEN '1080p'
      WHEN scene_name LIKE '%720p%' THEN '720p'
      WHEN scene_name LIKE '%480p%' THEN '480p'
      WHEN scene_name LIKE '%SD%' OR scene_name LIKE '%sd%' THEN 'SD'
      ELSE NULL
    END
    WHERE resolution IS NULL AND scene_name IS NOT NULL
  `);
} catch { /* ignore */ }
try { db.exec("ALTER TABLE shows ADD COLUMN monitored INTEGER DEFAULT 1;"); } catch { /* ignore */ }
try { db.exec("ALTER TABLE episodes ADD COLUMN monitored INTEGER DEFAULT 1;"); } catch { /* ignore */ }
try { db.exec("ALTER TABLE episodes ADD COLUMN air_date TEXT;"); } catch { /* ignore */ }
try { db.exec("ALTER TABLE movies ADD COLUMN release_date TEXT;"); } catch { /* ignore */ }
try { db.exec("ALTER TABLE shows ADD COLUMN tmdb_status TEXT DEFAULT '';"); } catch { /* ignore */ }
// Fix existing items: if they have a file on disk, restore 'downloaded' status
try { db.exec("UPDATE movies SET status = 'downloaded' WHERE file_path IS NOT NULL AND file_path != '' AND status != 'downloading'"); } catch { /* ignore */ }
try { db.exec("UPDATE shows SET status = 'downloaded' WHERE folder_path IS NOT NULL AND folder_path != '' AND status != 'downloading'"); } catch { /* ignore */ }
try { db.exec("UPDATE episodes SET status = 'downloaded' WHERE file_path IS NOT NULL AND file_path != '' AND status != 'downloading'"); } catch { /* ignore */ }
// Track watched TMDB IDs even after library removal
try { db.exec("CREATE TABLE IF NOT EXISTS watched_tmdb (tmdb_id INTEGER PRIMARY KEY, type TEXT NOT NULL);"); } catch { /* ignore */ }

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
    const bcrypt = require('bcrypt');
    const password = authPasswordRow ? authPasswordRow.value : '';
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')").run(
      authUsernameRow.value,
      hashedPassword
    );
  } else {
    // If no auth is set at all, maybe create a default admin 'admin'/'admin' if we want, but better to just leave it until set.
    // We will ensure new auth setup creates an admin in the users table.
  }
}

// Migration: add last_login column for existing databases
try {
  const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!cols.includes('last_login')) {
    db.exec('ALTER TABLE users ADD COLUMN last_login DATETIME');
    console.log('[DB] Added last_login column to users table');
  }
} catch { /* ignore */ }

module.exports = db;
