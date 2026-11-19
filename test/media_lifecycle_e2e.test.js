const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const db = require('../server/config/database');
const { setSetting, invalidateSettingsCache } = require('../server/utils/settings');
const { runMediaManagement } = require('../server/services/mediaManagementService');
const downloadClientService = require('../server/services/downloadClientService');

test('Core Automation & Media Post-Processing Lifecycle E2E Suite', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-e2e-test-'));
  const moviesDir = path.join(tempDir, 'movies');
  const tvDir = path.join(tempDir, 'tvshows');
  const downloadsDir = path.join(tempDir, 'downloads');
  fs.mkdirSync(moviesDir, { recursive: true });
  fs.mkdirSync(tvDir, { recursive: true });
  fs.mkdirSync(downloadsDir, { recursive: true });

  const origMovieRoot = db.prepare("SELECT value FROM settings WHERE key = 'movies_path'").get()?.value;
  const origTvRoot = db.prepare("SELECT value FROM settings WHERE key = 'tv_path'").get()?.value;
  const origDownloadClient = db.prepare("SELECT * FROM download_clients WHERE name = 'E2E_MockClient'").get();

  t.after(() => {
    // Cleanup temporary files and restore settings
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }

    if (origMovieRoot !== undefined) {
      setSetting('movies_path', origMovieRoot);
    } else {
      db.prepare("DELETE FROM settings WHERE key = 'movies_path'").run();
    }
    if (origTvRoot !== undefined) {
      setSetting('tv_path', origTvRoot);
    } else {
      db.prepare("DELETE FROM settings WHERE key = 'tv_path'").run();
    }
    invalidateSettingsCache();

    // Clean test records from DB
    db.prepare("DELETE FROM movies WHERE title LIKE 'E2E Test Movie%'").run();
    db.prepare("DELETE FROM episodes WHERE title LIKE 'E2E Test Ep%'").run();
    db.prepare("DELETE FROM shows WHERE title LIKE 'E2E Test Show%'").run();
    db.prepare("DELETE FROM download_clients WHERE name = 'E2E_MockClient'").run();
  });

  setSetting('movies_path', moviesDir);
  setSetting('tv_path', tvDir);
  invalidateSettingsCache();

  // Insert Mock Download Client
  db.prepare("DELETE FROM download_clients WHERE name = 'E2E_MockClient'").run();
  db.prepare(`
    INSERT INTO download_clients (name, type, host, port, username, password)
    VALUES ('E2E_MockClient', 'qbittorrent', '127.0.0.1', 8080, 'admin', 'admin')
  `).run();

  // Temporarily update library_paths to point to test directories
  const originalPaths = db.prepare("SELECT * FROM library_paths").all();
  db.prepare("DELETE FROM library_paths").run();
  db.prepare("INSERT INTO library_paths (path, type) VALUES (?, 'movies')").run(moviesDir);
  db.prepare("INSERT INTO library_paths (path, type) VALUES (?, 'tv')").run(tvDir);
  db.prepare("INSERT INTO library_paths (path, type) VALUES (?, 'downloads')").run(downloadsDir);

  t.after(() => {
    // Restore library paths
    try {
      db.prepare("DELETE FROM library_paths").run();
      const insertPath = db.prepare("INSERT INTO library_paths (id, path, type, added_at) VALUES (?, ?, ?, ?)");
      for (const p of originalPaths) {
        insertPath.run(p.id, p.path, p.type, p.added_at);
      }
    } catch { /* ignore */ }
  });

  await t.test('Lifecycle: Completed movie torrent is detected, imported, hardlinked/copied, and marked downloaded', async () => {
    // 1. Setup a test movie record in database
    const movieTitle = 'E2E Test Movie Matrix';
    const movieYear = 2024;
    const info = db.prepare(`
      INSERT INTO movies (title, year, status, monitored, tmdb_id)
      VALUES (?, ?, 'downloading', 1, 9999901)
    `).run(movieTitle, movieYear);
    const movieId = info.lastInsertRowid;

    // 2. Setup mock completed torrent files on disk
    const torrentName = 'E2E.Test.Movie.Matrix.2024.1080p.WEBRip.x264';
    const torrentContentDir = path.join(downloadsDir, torrentName);
    fs.mkdirSync(torrentContentDir, { recursive: true });
    const videoFile = path.join(torrentContentDir, 'E2E.Test.Movie.Matrix.2024.1080p.mkv');
    fs.writeFileSync(videoFile, Buffer.alloc(1024 * 64, 'fake-video-payload'));
    const subFile = path.join(torrentContentDir, 'E2E.Test.Movie.Matrix.2024.1080p.en.srt');
    fs.writeFileSync(subFile, '1\n00:00:01,000 --> 00:00:04,000\nHello World\n');

    // 3. Mock downloadClientService.getTorrents to return this torrent as 100% finished
    const originalGetTorrents = downloadClientService.getTorrents;
    downloadClientService.getTorrents = async () => [
      {
        hash: 'mockhash123movie',
        name: torrentName,
        progress: 100,
        savePath: downloadsDir,
        contentPath: torrentContentDir,
        state: 'uploading'
      }
    ];

    try {
      // 4. Run post-processing
      const result = await runMediaManagement();
      assert.notStrictEqual(result, 'skipped', 'Post-processing should not be skipped');

      // 5. Verify database was updated
      const updatedMovie = db.prepare('SELECT * FROM movies WHERE id = ?').get(movieId);
      assert.strictEqual(updatedMovie.status, 'downloaded', 'Movie status must be downloaded');
      assert.ok(updatedMovie.file_path, 'File path must be set');
      assert.ok(fs.existsSync(updatedMovie.file_path), 'Imported movie file must exist in media library');
      assert.ok(updatedMovie.file_path.startsWith(moviesDir), 'Imported movie must reside in movies library root');

      // Companion subtitle check
      const expectedSub = updatedMovie.file_path.replace(/\.mkv$/i, '.en.srt');
      assert.ok(fs.existsSync(expectedSub), 'Companion subtitle must be imported alongside movie file');
    } finally {
      downloadClientService.getTorrents = originalGetTorrents;
    }
  });

  await t.test('Lifecycle: Completed TV episode torrent is detected, imported into season folder, and marked downloaded', async () => {
    // 1. Setup a test show and episode record in database
    const showTitle = 'E2E Test Show Foundation';
    const showInfo = db.prepare(`
      INSERT INTO shows (title, status, monitored, tmdb_id)
      VALUES (?, 'monitored', 1, 9999902)
    `).run(showTitle);
    const showId = showInfo.lastInsertRowid;

    const epInfo = db.prepare(`
      INSERT INTO episodes (show_id, season_number, episode_number, title, status, monitored, air_date)
      VALUES (?, 1, 1, 'E2E Test Ep Pilot', 'downloading', 1, '2024-01-01')
    `).run(showId);
    const epId = epInfo.lastInsertRowid;

    // 2. Setup mock completed episode torrent files on disk
    const torrentName = 'E2E.Test.Show.Foundation.S01E01.1080p.WEB.H264-GRP';
    const torrentContentDir = path.join(downloadsDir, torrentName);
    fs.mkdirSync(torrentContentDir, { recursive: true });
    const videoFile = path.join(torrentContentDir, 'foundation.s01e01.1080p.mkv');
    fs.writeFileSync(videoFile, Buffer.alloc(1024 * 64, 'fake-episode-payload'));

    // 3. Mock getTorrents
    const originalGetTorrents = downloadClientService.getTorrents;
    downloadClientService.getTorrents = async () => [
      {
        hash: 'mockhash456show',
        name: torrentName,
        progress: 100,
        savePath: downloadsDir,
        contentPath: torrentContentDir,
        state: 'uploading'
      }
    ];

    try {
      // 4. Run post-processing
      const result = await runMediaManagement();
      assert.notStrictEqual(result, 'skipped', 'Post-processing should not be skipped');

      // 5. Verify database was updated
      const updatedEp = db.prepare('SELECT * FROM episodes WHERE id = ?').get(epId);
      assert.strictEqual(updatedEp.status, 'downloaded', 'Episode status must be downloaded');
      assert.ok(updatedEp.file_path, 'File path must be set');
      assert.ok(fs.existsSync(updatedEp.file_path), 'Imported episode file must exist');
      assert.ok(updatedEp.file_path.includes('Season 01') || updatedEp.file_path.includes('Season 1'), 'Episode must be organized into a Season folder');
      assert.ok(updatedEp.file_path.startsWith(tvDir), 'Episode must reside within TV library directory');

      // Verify show folder_path was updated
      const updatedShow = db.prepare('SELECT * FROM shows WHERE id = ?').get(showId);
      assert.ok(updatedShow.folder_path, 'Show folder_path must be populated');
      assert.ok(fs.existsSync(updatedShow.folder_path), 'Show library directory must exist');
    } finally {
      downloadClientService.getTorrents = originalGetTorrents;
    }
  });

  await t.test('Lifecycle: Multi-episode torrent (e.g. S01E01-E02) correctly imports and updates both episodes', async () => {
    const showTitle = 'E2E Test Show DoubleEp';
    const showInfo = db.prepare(`
      INSERT INTO shows (title, status, monitored, tmdb_id)
      VALUES (?, 'monitored', 1, 9999903)
    `).run(showTitle);
    const showId = showInfo.lastInsertRowid;

    const ep1 = db.prepare(`
      INSERT INTO episodes (show_id, season_number, episode_number, title, status, monitored)
      VALUES (?, 1, 1, 'E2E Test Ep Part 1', 'downloading', 1)
    `).run(showId).lastInsertRowid;

    const ep2 = db.prepare(`
      INSERT INTO episodes (show_id, season_number, episode_number, title, status, monitored)
      VALUES (?, 1, 2, 'E2E Test Ep Part 2', 'downloading', 1)
    `).run(showId).lastInsertRowid;

    const torrentName = 'E2E.Test.Show.DoubleEp.S01E01-E02.1080p.WEB.H264-GRP';
    const torrentContentDir = path.join(downloadsDir, torrentName);
    fs.mkdirSync(torrentContentDir, { recursive: true });
    const videoFile = path.join(torrentContentDir, 'double.ep.s01e01-e02.1080p.mkv');
    fs.writeFileSync(videoFile, Buffer.alloc(1024 * 64, 'fake-double-ep-payload'));

    const originalGetTorrents = downloadClientService.getTorrents;
    downloadClientService.getTorrents = async () => [
      {
        hash: 'mockhash789double',
        name: torrentName,
        progress: 100,
        savePath: downloadsDir,
        contentPath: torrentContentDir,
        state: 'uploading'
      }
    ];

    try {
      await runMediaManagement();

      const updated1 = db.prepare('SELECT * FROM episodes WHERE id = ?').get(ep1);
      const updated2 = db.prepare('SELECT * FROM episodes WHERE id = ?').get(ep2);

      assert.strictEqual(updated1.status, 'downloaded', 'Episode 1 must be marked downloaded');
      assert.strictEqual(updated2.status, 'downloaded', 'Episode 2 must be marked downloaded');
      assert.ok(fs.existsSync(updated1.file_path), 'Episode 1 file must exist');
      assert.ok(fs.existsSync(updated2.file_path), 'Episode 2 file must exist');
    } finally {
      downloadClientService.getTorrents = originalGetTorrents;
    }
  });
});
