const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(path.join(dbDir, 'database.sqlite'));

db.transaction = function (fn) {
  return function (...args) {
    db.exec('BEGIN TRANSACTION;');
    try {
      const result = fn.apply(this, args);
      db.exec('COMMIT;');
      return result;
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  };
};

db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
// Performance tuning — safe with WAL mode, dramatically reduces I/O
db.exec(`
  PRAGMA synchronous = NORMAL;
  PRAGMA cache_size = -64000;
  PRAGMA temp_store = MEMORY;
  PRAGMA mmap_size = 268435456;
`);

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
  CREATE INDEX IF NOT EXISTS idx_play_history_created ON play_history(created_at);
  CREATE INDEX IF NOT EXISTS idx_movies_file_path ON movies(file_path);
  CREATE INDEX IF NOT EXISTS idx_episodes_file_path ON episodes(file_path);
  CREATE INDEX IF NOT EXISTS idx_requests_tmdb_id ON requests(tmdb_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const hasColumn = (table, column) => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  return cols.includes(column);
};

const MIGRATIONS = [
  {
    id: 1,
    name: 'initial_alterations',
    run: (db) => {
      const alters = [
        ['movies', 'file_path', 'TEXT'],
        ['play_history', 'player', 'TEXT'],
        ['movies', 'quality_profile_id', 'INTEGER'],
        ['movies', 'scene_name', 'TEXT'],
        ['episodes', 'scene_name', 'TEXT'],
        ['shows', 'quality_profile_id', 'INTEGER'],
        ['quality_profiles', 'qualities', 'TEXT'],
        ['quality_profiles', 'cutoff', 'TEXT'],
        ['quality_profiles', 'upgrade_allowed', 'INTEGER DEFAULT 1'],
        ['quality_profiles', 'media_type', "TEXT DEFAULT 'both'"],
        ['release_profiles', 'apply_to', "TEXT DEFAULT 'all'"],
        ['users', 'origin', "TEXT DEFAULT 'atlas'"],
        ['movies', 'rating', 'REAL DEFAULT 0'],
        ['shows', 'rating', 'REAL DEFAULT 0'],
        ['movies', 'file_size', 'INTEGER DEFAULT 0'],
        ['shows', 'folder_size', 'INTEGER DEFAULT 0'],
        ['episodes', 'file_size', 'INTEGER DEFAULT 0'],
        ['movies', 'watched', 'INTEGER DEFAULT 0'],
        ['shows', 'watched', 'INTEGER DEFAULT 0'],
        ['movies', 'subtitles', "TEXT DEFAULT '[]'"],
        ['episodes', 'subtitles', "TEXT DEFAULT '[]'"],
        ['library_paths', 'type', "TEXT DEFAULT 'movies'"],
        ['movies', 'genres', "TEXT DEFAULT ''"],
        ['shows', 'genres', "TEXT DEFAULT ''"],
        ['movies', 'monitored', 'INTEGER DEFAULT 1'],
        ['movies', 'resolution', 'TEXT'],
        ['episodes', 'resolution', 'TEXT'],
        ['movies', 'codec', 'TEXT'],
        ['episodes', 'codec', 'TEXT'],
        ['movies', 'audio', 'TEXT'],
        ['episodes', 'audio', 'TEXT'],
        ['shows', 'monitored', 'INTEGER DEFAULT 1'],
        ['episodes', 'monitored', 'INTEGER DEFAULT 1'],
        ['episodes', 'air_date', 'TEXT'],
        ['movies', 'release_date', 'TEXT'],
        ['shows', 'tmdb_status', "TEXT DEFAULT ''"],
        ['requests', 'release_date', 'TEXT'],
        ['requests', 'poster_path', 'TEXT'],
        ['users', 'last_login', 'DATETIME']
      ];
      
      for (const [table, col, def] of alters) {
        if (!hasColumn(table, col)) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
        }
      }
    }
  },
  {
    id: 2,
    name: 'populate_codecs',
    run: (db) => {
      db.exec(`
        UPDATE movies SET codec = CASE
          WHEN scene_name LIKE '%x265%' OR scene_name LIKE '%h265%' OR scene_name LIKE '%hevc%' OR file_path LIKE '%x265%' OR file_path LIKE '%h265%' OR file_path LIKE '%hevc%' THEN 'x265'
          WHEN scene_name LIKE '%x264%' OR scene_name LIKE '%h264%' OR scene_name LIKE '%avc%' OR file_path LIKE '%x264%' OR file_path LIKE '%h264%' OR file_path LIKE '%avc%' THEN 'x264'
          ELSE NULL
        END
        WHERE codec IS NULL
      `);
      db.exec(`
        UPDATE episodes SET codec = CASE
          WHEN scene_name LIKE '%x265%' OR scene_name LIKE '%h265%' OR scene_name LIKE '%hevc%' OR file_path LIKE '%x265%' OR file_path LIKE '%h265%' OR file_path LIKE '%hevc%' THEN 'x265'
          WHEN scene_name LIKE '%x264%' OR scene_name LIKE '%h264%' OR scene_name LIKE '%avc%' OR file_path LIKE '%x264%' OR file_path LIKE '%h264%' OR file_path LIKE '%avc%' THEN 'x264'
          ELSE NULL
        END
        WHERE codec IS NULL
      `);
    }
  },
  {
    id: 3,
    name: 'populate_audio',
    run: (db) => {
      db.exec(`
        UPDATE movies SET audio = CASE
          WHEN scene_name LIKE '%atmos%' OR file_path LIKE '%atmos%' THEN 'Atmos'
          WHEN scene_name LIKE '%truehd%' OR file_path LIKE '%truehd%' THEN 'TrueHD'
          WHEN scene_name LIKE '%dts-hd%' OR scene_name LIKE '%dtshd%' OR file_path LIKE '%dts-hd%' OR file_path LIKE '%dtshd%' THEN 'DTS-HD'
          WHEN scene_name LIKE '%dts%' OR file_path LIKE '%dts%' THEN 'DTS'
          WHEN scene_name LIKE '%ddp7.1%' OR scene_name LIKE '%dd+7.1%' OR file_path LIKE '%ddp7.1%' OR file_path LIKE '%dd+7.1%' THEN 'DDP 7.1'
          WHEN scene_name LIKE '%ddp5.1%' OR scene_name LIKE '%dd+5.1%' OR scene_name LIKE '%ddp%' OR scene_name LIKE '%dd+%' OR file_path LIKE '%ddp5.1%' OR file_path LIKE '%dd+5.1%' OR file_path LIKE '%ddp%' OR file_path LIKE '%dd+%' THEN 'DDP 5.1'
          WHEN scene_name LIKE '%dd5.1%' OR scene_name LIKE '%ac3 5.1%' OR file_path LIKE '%dd5.1%' OR file_path LIKE '%ac3 5.1%' THEN 'DD 5.1'
          WHEN scene_name LIKE '%dd2.0%' OR scene_name LIKE '%ac3 2.0%' OR file_path LIKE '%dd2.0%' OR file_path LIKE '%ac3 2.0%' THEN 'DD Stereo'
          WHEN scene_name LIKE '%aac 5.1%' OR file_path LIKE '%aac 5.1%' THEN 'AAC 5.1'
          WHEN scene_name LIKE '%aac 2.0%' OR scene_name LIKE '%aac%' OR file_path LIKE '%aac 2.0%' OR file_path LIKE '%aac%' THEN 'AAC Stereo'
          WHEN scene_name LIKE '%ac3%' OR scene_name LIKE '%ac-3%' OR file_path LIKE '%ac3%' OR file_path LIKE '%ac-3%' THEN 'AC3'
          WHEN scene_name LIKE '%7.1%' OR file_path LIKE '%7.1%' THEN '7.1'
          WHEN scene_name LIKE '%5.1%' OR file_path LIKE '%5.1%' THEN '5.1'
          WHEN scene_name LIKE '%2.0%' OR scene_name LIKE '%stereo%' OR file_path LIKE '%2.0%' OR file_path LIKE '%stereo%' THEN 'Stereo'
          WHEN scene_name LIKE '%flac%' OR file_path LIKE '%flac%' THEN 'FLAC'
          WHEN scene_name LIKE '%opus%' OR file_path LIKE '%opus%' THEN 'Opus'
          WHEN scene_name LIKE '%mp3%' OR file_path LIKE '%mp3%' THEN 'MP3'
          ELSE NULL
        END
        WHERE audio IS NULL
      `);
      db.exec(`
        UPDATE episodes SET audio = CASE
          WHEN scene_name LIKE '%atmos%' OR file_path LIKE '%atmos%' THEN 'Atmos'
          WHEN scene_name LIKE '%truehd%' OR file_path LIKE '%truehd%' THEN 'TrueHD'
          WHEN scene_name LIKE '%dts-hd%' OR scene_name LIKE '%dtshd%' OR file_path LIKE '%dts-hd%' OR file_path LIKE '%dtshd%' THEN 'DTS-HD'
          WHEN scene_name LIKE '%dts%' OR file_path LIKE '%dts%' THEN 'DTS'
          WHEN scene_name LIKE '%ddp7.1%' OR scene_name LIKE '%dd+7.1%' OR file_path LIKE '%ddp7.1%' OR file_path LIKE '%dd+7.1%' THEN 'DDP 7.1'
          WHEN scene_name LIKE '%ddp5.1%' OR scene_name LIKE '%dd+5.1%' OR scene_name LIKE '%ddp%' OR scene_name LIKE '%dd+%' OR file_path LIKE '%ddp5.1%' OR file_path LIKE '%dd+5.1%' OR file_path LIKE '%ddp%' OR file_path LIKE '%dd+%' THEN 'DDP 5.1'
          WHEN scene_name LIKE '%dd5.1%' OR scene_name LIKE '%ac3 5.1%' OR file_path LIKE '%dd5.1%' OR file_path LIKE '%ac3 5.1%' THEN 'DD 5.1'
          WHEN scene_name LIKE '%dd2.0%' OR scene_name LIKE '%ac3 2.0%' OR file_path LIKE '%dd2.0%' OR file_path LIKE '%ac3 2.0%' THEN 'DD Stereo'
          WHEN scene_name LIKE '%aac 5.1%' OR file_path LIKE '%aac 5.1%' THEN 'AAC 5.1'
          WHEN scene_name LIKE '%aac 2.0%' OR scene_name LIKE '%aac%' OR file_path LIKE '%aac 2.0%' OR file_path LIKE '%aac%' THEN 'AAC Stereo'
          WHEN scene_name LIKE '%ac3%' OR scene_name LIKE '%ac-3%' OR file_path LIKE '%ac3%' OR file_path LIKE '%ac-3%' THEN 'AC3'
          WHEN scene_name LIKE '%7.1%' OR file_path LIKE '%7.1%' THEN '7.1'
          WHEN scene_name LIKE '%5.1%' OR file_path LIKE '%5.1%' THEN '5.1'
          WHEN scene_name LIKE '%2.0%' OR scene_name LIKE '%stereo%' OR file_path LIKE '%2.0%' OR file_path LIKE '%stereo%' THEN 'Stereo'
          WHEN scene_name LIKE '%flac%' OR file_path LIKE '%flac%' THEN 'FLAC'
          WHEN scene_name LIKE '%opus%' OR file_path LIKE '%opus%' THEN 'Opus'
          WHEN scene_name LIKE '%mp3%' OR file_path LIKE '%mp3%' THEN 'MP3'
          ELSE NULL
        END
        WHERE audio IS NULL
      `);
    }
  },
  {
    id: 4,
    name: 'populate_resolution',
    run: (db) => {
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
    }
  },
  {
    id: 5,
    name: 'fix_downloaded_status_and_watched_tmdb',
    run: (db) => {
      db.exec("UPDATE movies SET status = 'downloaded' WHERE file_path IS NOT NULL AND file_path != '' AND status != 'downloading'");
      db.exec("UPDATE shows SET status = 'downloaded' WHERE folder_path IS NOT NULL AND folder_path != '' AND status != 'downloading'");
      db.exec("UPDATE episodes SET status = 'downloaded' WHERE file_path IS NOT NULL AND file_path != '' AND status != 'downloading'");
      db.exec("CREATE TABLE IF NOT EXISTS watched_tmdb (tmdb_id INTEGER PRIMARY KEY, type TEXT NOT NULL);");
    }
  },
  {
    id: 6,
    name: 'seed_quality_profiles_and_admin',
    run: (db) => {
      const existingProfile = db.prepare('SELECT id FROM quality_profiles LIMIT 1').get();
      if (!existingProfile) {
        const defaultQualities = JSON.stringify(['720p', '1080p', '2160p']);
        db.prepare('INSERT INTO quality_profiles (name, preferred_resolution, qualities, cutoff, upgrade_allowed) VALUES (?, ?, ?, ?, ?)').run('Any (1080p+)', '1080p', defaultQualities, '1080p', 1);
      } else {
        db.prepare(`UPDATE quality_profiles SET qualities = ?, cutoff = ?, upgrade_allowed = ? WHERE qualities IS NULL`).run(JSON.stringify(['1080p']), '1080p', 1);
      }

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
        }
      }
    }
  },
  {
    id: 7,
    name: 'add_last_searched_at',
    run: (db) => {
      if (!hasColumn('movies', 'last_searched_at')) {
        db.exec("ALTER TABLE movies ADD COLUMN last_searched_at DATETIME;");
      }
      if (!hasColumn('episodes', 'last_searched_at')) {
        db.exec("ALTER TABLE episodes ADD COLUMN last_searched_at DATETIME;");
      }
    }
  },
  {
    id: 8,
    name: 'add_watched_at',
    run: (db) => {
      if (!hasColumn('movies', 'watched_at')) {
        db.exec("ALTER TABLE movies ADD COLUMN watched_at DATETIME;");
      }
      if (!hasColumn('episodes', 'watched_at')) {
        db.exec("ALTER TABLE episodes ADD COLUMN watched_at DATETIME;");
      }
      if (!hasColumn('shows', 'watched_at')) {
        db.exec("ALTER TABLE shows ADD COLUMN watched_at DATETIME;");
      }
    }
  },
  {
    id: 9,
    name: 'add_last_refreshed_at',
    run: (db) => {
      if (!hasColumn('movies', 'last_refreshed_at')) {
        db.exec("ALTER TABLE movies ADD COLUMN last_refreshed_at DATETIME;");
      }
      if (!hasColumn('shows', 'last_refreshed_at')) {
        db.exec("ALTER TABLE shows ADD COLUMN last_refreshed_at DATETIME;");
      }
    }
  },
  {
    id: 10,
    name: 'add_performance_indexes',
    run: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_movies_last_searched ON movies(last_searched_at);
        CREATE INDEX IF NOT EXISTS idx_episodes_last_searched ON episodes(last_searched_at);
        CREATE INDEX IF NOT EXISTS idx_movies_watched_at ON movies(watched_at);
        CREATE INDEX IF NOT EXISTS idx_episodes_watched_at ON episodes(watched_at);
        CREATE INDEX IF NOT EXISTS idx_movies_monitored ON movies(monitored);
        CREATE INDEX IF NOT EXISTS idx_episodes_monitored ON episodes(monitored);
      `);
    }
  },
  {
    id: 11,
    name: 'add_missing_performance_indexes',
    run: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_movies_release_date ON movies(release_date);
        CREATE INDEX IF NOT EXISTS idx_episodes_air_date ON episodes(air_date);
        CREATE INDEX IF NOT EXISTS idx_shows_quality_profile ON shows(quality_profile_id);
        CREATE INDEX IF NOT EXISTS idx_movies_quality_profile ON movies(quality_profile_id);
        CREATE INDEX IF NOT EXISTS idx_movies_watched ON movies(watched);
        CREATE INDEX IF NOT EXISTS idx_shows_watched ON shows(watched);
        CREATE INDEX IF NOT EXISTS idx_movies_genres ON movies(genres);
        CREATE INDEX IF NOT EXISTS idx_shows_genres ON shows(genres);
        CREATE INDEX IF NOT EXISTS idx_episodes_subtitles ON episodes(subtitles);
        CREATE INDEX IF NOT EXISTS idx_movies_added_at ON movies(added_at);
        CREATE INDEX IF NOT EXISTS idx_shows_added_at ON shows(added_at);
        CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
        CREATE INDEX IF NOT EXISTS idx_requests_user_id ON requests(user_id);
      `);
    }
  },
  {
    id: 12,
    name: 'add_episodes_syncing_column',
    run: (db) => {
      db.exec(`
        ALTER TABLE shows ADD COLUMN episodes_syncing INTEGER NOT NULL DEFAULT 0;
      `);
    }
  }
];

try {
  db.exec('BEGIN TRANSACTION;');
  for (const migration of MIGRATIONS) {
    const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE id = ?").get(migration.id);
    if (!applied) {
      console.log(`[DB] Running migration: ${migration.name}`);
      try {
        migration.run(db);
        db.prepare("INSERT INTO schema_migrations (id, name) VALUES (?, ?)").run(migration.id, migration.name);
      } catch (err) {
        console.error(`[DB] Migration ${migration.name} failed:`, err);
        throw err;
      }
    }
  }
  db.exec('COMMIT;');
} catch (err) {
  db.exec('ROLLBACK;');
  console.error('[DB] Migrations failed. Halting startup.');
  process.exit(1);
}

module.exports = db;
