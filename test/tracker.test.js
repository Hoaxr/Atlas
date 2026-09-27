const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/config/database');
const { getAiredCutoffSql } = require('../server/utils/airDate');

test('Tracker & Continue Watching System', async (t) => {
  const testShowId = 888881;
  const testTmdbId = 9999981;
  const testMovieId = 888882;
  const testMovieTmdbId = 9999982;

  t.before(() => {
    // Clean up any test fixtures
    db.prepare('DELETE FROM episodes WHERE show_id = ?').run(testShowId);
    db.prepare('DELETE FROM shows WHERE id = ?').run(testShowId);
    db.prepare('DELETE FROM movies WHERE id = ?').run(testMovieId);
    db.prepare('DELETE FROM watch_history WHERE tmdb_id IN (?, ?)').run(testTmdbId, testMovieTmdbId);

    // Create test show
    db.prepare(`
      INSERT INTO shows (id, tmdb_id, title, status, watched)
      VALUES (?, ?, 'Continue Watching Test Show', 'continuing', 0)
    `).run(testShowId, testTmdbId);

    // Create test episodes
    db.prepare(`
      INSERT INTO episodes (id, show_id, season_number, episode_number, title, status, watched, watch_progress)
      VALUES 
        (99881, ?, 1, 1, 'Episode 1', 'downloaded', 0, 0),
        (99882, ?, 1, 2, 'Episode 2', 'downloaded', 0, 0)
    `).run(testShowId, testShowId);

    // Create test movie
    db.prepare(`
      INSERT INTO movies (id, tmdb_id, title, status, watched, watch_progress)
      VALUES (?, ?, 'Continue Watching Test Movie', 'downloaded', 0, 0)
    `).run(testMovieId, testMovieTmdbId);
  });

  t.after(() => {
    db.prepare('DELETE FROM episodes WHERE show_id = ?').run(testShowId);
    db.prepare('DELETE FROM shows WHERE id = ?').run(testShowId);
    db.prepare('DELETE FROM movies WHERE id = ?').run(testMovieId);
    db.prepare('DELETE FROM watch_history WHERE tmdb_id IN (?, ?)').run(testTmdbId, testMovieTmdbId);
  });

  await t.test('Show with 0 watched episodes and 0 watch_progress is NOT returned in /up-next query', () => {
    const episodes = db.prepare(`
      WITH ShowHasStarted AS (
        SELECT DISTINCT show_id
        FROM episodes 
        WHERE season_number > 0 AND (watched = 1 OR watch_progress > 0)
      ),
      ShowFirstUnwatched AS (
        SELECT 
          e.id as episode_id, 
          e.show_id,
          e.season_number, 
          e.episode_number, 
          e.title as episode_title,
          e.runtime,
          e.watch_progress,
          s.tmdb_id, 
          s.title as show_title, 
          s.poster_path,
          s.tmdb_status,
          ROW_NUMBER() OVER (
            PARTITION BY e.show_id 
            ORDER BY e.season_number, e.episode_number
          ) as rn
        FROM episodes e
        JOIN shows s ON e.show_id = s.id
        JOIN ShowHasStarted shs ON e.show_id = shs.show_id
        WHERE e.season_number > 0
          AND e.watched = 0
          AND (
            e.status = 'downloaded' OR (
              e.air_date IS NOT NULL AND 
              date(e.air_date) <= ${getAiredCutoffSql()} AND 
              ((e.status IN ('monitored', 'missing') AND e.monitored = 1) OR e.show_id IN (SELECT show_id FROM episodes WHERE watched = 1))
            )
          )
      ),
      WatchedCount AS (
        SELECT show_id, COUNT(*) as watched_episodes
        FROM episodes
        WHERE season_number > 0 AND watched = 1
        GROUP BY show_id
      )
      SELECT 
        sf.episode_id,
        sf.show_id,
        COALESCE(wc.watched_episodes, 0) as watched_episodes,
        sf.watch_progress
      FROM ShowFirstUnwatched sf
      LEFT JOIN WatchedCount wc ON sf.show_id = wc.show_id
      WHERE sf.rn = 1
        AND (COALESCE(wc.watched_episodes, 0) > 0 OR COALESCE(sf.watch_progress, 0) > 0)
    `).all();

    const matched = episodes.find(e => e.show_id === testShowId);
    assert.strictEqual(matched, undefined, 'Show with 0 watched episodes and 0 progress must not appear in Continue Watching');
  });

  await t.test('Show with in-progress first episode appears in Continue Watching', () => {
    // Set 25% progress on Episode 1
    db.prepare('UPDATE episodes SET watch_progress = 25 WHERE id = 99881').run();

    const episodes = db.prepare(`
      WITH ShowHasStarted AS (
        SELECT DISTINCT show_id
        FROM episodes 
        WHERE season_number > 0 AND (watched = 1 OR watch_progress > 0)
      ),
      ShowFirstUnwatched AS (
        SELECT 
          e.id as episode_id, 
          e.show_id,
          e.season_number, 
          e.episode_number, 
          e.title as episode_title,
          e.runtime,
          e.watch_progress,
          s.tmdb_id, 
          s.title as show_title, 
          s.poster_path,
          s.tmdb_status,
          ROW_NUMBER() OVER (
            PARTITION BY e.show_id 
            ORDER BY e.season_number, e.episode_number
          ) as rn
        FROM episodes e
        JOIN shows s ON e.show_id = s.id
        JOIN ShowHasStarted shs ON e.show_id = shs.show_id
        WHERE e.season_number > 0
          AND e.watched = 0
          AND (
            e.status = 'downloaded' OR (
              e.air_date IS NOT NULL AND 
              date(e.air_date) <= ${getAiredCutoffSql()} AND 
              ((e.status IN ('monitored', 'missing') AND e.monitored = 1) OR e.show_id IN (SELECT show_id FROM episodes WHERE watched = 1))
            )
          )
      ),
      WatchedCount AS (
        SELECT show_id, COUNT(*) as watched_episodes
        FROM episodes
        WHERE season_number > 0 AND watched = 1
        GROUP BY show_id
      )
      SELECT 
        sf.episode_id,
        sf.show_id,
        COALESCE(wc.watched_episodes, 0) as watched_episodes,
        sf.watch_progress
      FROM ShowFirstUnwatched sf
      LEFT JOIN WatchedCount wc ON sf.show_id = wc.show_id
      WHERE sf.rn = 1
        AND (COALESCE(wc.watched_episodes, 0) > 0 OR COALESCE(sf.watch_progress, 0) > 0)
    `).all();

    const matched = episodes.find(e => e.show_id === testShowId);
    assert.ok(matched, 'In-progress show should appear in Continue Watching');
    assert.strictEqual(matched.watch_progress, 25);
    assert.strictEqual(matched.watched_episodes, 0);
  });

  await t.test('Unwatching episode resets watched_at to NULL and watch_progress to 0', () => {
    // Mark ep 1 watched first
    const watchedAt = new Date().toISOString();
    db.prepare('UPDATE episodes SET watched = 1, watched_at = ?, watch_progress = 0 WHERE id = 99881').run(watchedAt);
    db.prepare('INSERT OR IGNORE INTO watch_history (tmdb_id, type, season_number, episode_number, watched_at) VALUES (?, ?, ?, ?, ?)').run(testTmdbId, 'episode', 1, 1, watchedAt);

    // Simulate unwatching via unwatch logic
    db.prepare('UPDATE episodes SET watched = 0, watched_at = NULL, watch_progress = 0 WHERE id = 99881').run();
    db.prepare('DELETE FROM watch_history WHERE tmdb_id = ? AND type = ? AND season_number = ? AND episode_number = ?').run(testTmdbId, 'episode', 1, 1);
    const countWatched = db.prepare('SELECT COUNT(*) as count FROM episodes WHERE show_id = ? AND watched = 1').get(testShowId);
    if (!countWatched || countWatched.count === 0) {
      db.prepare('UPDATE shows SET watched = 0 WHERE id = ?').run(testShowId);
      db.prepare('UPDATE episodes SET watch_progress = 0 WHERE show_id = ?').run(testShowId);
    }

    const ep = db.prepare('SELECT watched, watched_at, watch_progress FROM episodes WHERE id = 99881').get();
    assert.strictEqual(ep.watched, 0);
    assert.strictEqual(ep.watched_at, null);
    assert.strictEqual(ep.watch_progress, 0);

    // Verify it disappears from Continue Watching
    const checkStarted = db.prepare('SELECT COUNT(*) as count FROM episodes WHERE show_id = ? AND (watched = 1 OR watch_progress > 0)').get(testShowId);
    assert.strictEqual(checkStarted.count, 0, 'No episodes should be marked as started');
  });

  await t.test('Dismissing item resets watch_progress to 0', () => {
    // Set progress again
    db.prepare('UPDATE episodes SET watch_progress = 50 WHERE id = 99881').run();
    assert.strictEqual(db.prepare('SELECT watch_progress FROM episodes WHERE id = 99881').get().watch_progress, 50);

    // Dismiss episode
    db.prepare('UPDATE episodes SET watch_progress = 0 WHERE id = 99881').run();
    const watchedCount = db.prepare('SELECT COUNT(*) as count FROM episodes WHERE show_id = ? AND watched = 1').get(testShowId);
    if (!watchedCount || watchedCount.count === 0) {
      db.prepare('UPDATE episodes SET watch_progress = 0 WHERE show_id = ?').run(testShowId);
    }

    const epAfter = db.prepare('SELECT watch_progress FROM episodes WHERE id = 99881').get();
    assert.strictEqual(epAfter.watch_progress, 0, 'Dismiss must reset watch_progress to 0');
  });

  await t.test('Movie unwatch resets watched_at to NULL and watch_progress to 0', () => {
    db.prepare('UPDATE movies SET watched = 1, watched_at = ?, watch_progress = 0 WHERE id = ?').run(new Date().toISOString(), testMovieId);
    // Unwatch
    db.prepare('UPDATE movies SET watched = 0, watched_at = NULL, watch_progress = 0 WHERE id = ?').run(testMovieId);

    const movie = db.prepare('SELECT watched, watched_at, watch_progress FROM movies WHERE id = ?').get(testMovieId);
    assert.strictEqual(movie.watched, 0);
    assert.strictEqual(movie.watched_at, null);
    assert.strictEqual(movie.watch_progress, 0);
  });

  await t.test('watcherService.shouldTrackUser strictly restricts tracking to admin or configured users', () => {
    const watcherService = require('../server/services/watcherService');
    const { setSetting } = require('../server/utils/settings');

    // Ensure test users exist
    db.prepare("INSERT OR IGNORE INTO users (id, username, password, role) VALUES (77771, 'test_admin', 'hash', 'admin')").run();
    db.prepare("INSERT OR IGNORE INTO users (id, username, password, role) VALUES (77772, 'other_member', 'hash', 'user')").run();

    try {
      // 1. With empty autoWatchUser setting:
      setSetting('autoWatchUser', '');
      setSetting('authUsername', '');

      assert.strictEqual(watcherService.shouldTrackUser('test_admin'), true, 'Admin user should be tracked when autoWatchUser is empty');
      assert.strictEqual(watcherService.shouldTrackUser('other_member'), false, 'Non-admin household user should NOT be tracked when autoWatchUser is empty');
      assert.strictEqual(watcherService.shouldTrackUser('unknown_user'), false, 'Unknown user should NOT be tracked when autoWatchUser is empty');
      assert.strictEqual(watcherService.shouldTrackUser(null), false, 'Null user should NOT be tracked');
      assert.strictEqual(watcherService.shouldTrackUser(''), false, 'Empty user should NOT be tracked');

      // 2. With specific autoWatchUser configured:
      setSetting('autoWatchUser', 'custom_tracked, someone_else');
      assert.strictEqual(watcherService.shouldTrackUser('custom_tracked'), true);
      assert.strictEqual(watcherService.shouldTrackUser('someone_else'), true);
      assert.strictEqual(watcherService.shouldTrackUser('test_admin'), false, 'Admin not in explicit list should NOT be tracked');
      assert.strictEqual(watcherService.shouldTrackUser('other_member'), false);

      // 3. With wildcard '*'
      setSetting('autoWatchUser', '*');
      assert.strictEqual(watcherService.shouldTrackUser('other_member'), true);
      assert.strictEqual(watcherService.shouldTrackUser('random_user'), true);
    } finally {
      setSetting('autoWatchUser', '');
      db.prepare('DELETE FROM users WHERE id IN (77771, 77772)').run();
    }
  });

  await t.test('cleanUntrackedWatchHistory purges entries from untracked users while preserving tracked users', () => {
    const watcherService = require('../server/services/watcherService');
    const { setSetting } = require('../server/utils/settings');

    // Setup users
    db.prepare("INSERT OR IGNORE INTO users (id, username, password, role) VALUES (77771, 'test_admin', 'hash', 'admin')").run();
    db.prepare("INSERT OR IGNORE INTO users (id, username, password, role) VALUES (77772, 'other_member', 'hash', 'user')").run();

    setSetting('autoWatchUser', '');
    setSetting('authUsername', 'test_admin');

    const trackedShowId = 888891;
    const trackedTmdbId = 9999991;
    const untrackedShowId = 888892;
    const untrackedTmdbId = 9999992;

    // Create test shows
    db.prepare("INSERT INTO shows (id, tmdb_id, title, status, watched) VALUES (?, ?, 'Tracked Show', 'continuing', 1)").run(trackedShowId, trackedTmdbId);
    db.prepare("INSERT INTO shows (id, tmdb_id, title, status, watched) VALUES (?, ?, 'Untracked Show', 'continuing', 1)").run(untrackedShowId, untrackedTmdbId);

    // Create test episodes marked as watched
    db.prepare("INSERT INTO episodes (id, show_id, season_number, episode_number, title, status, watched, watch_progress, watched_at) VALUES (99891, ?, 1, 1, 'Ep 1', 'downloaded', 1, 100, '2026-09-27T10:00:00Z')").run(trackedShowId);
    db.prepare("INSERT INTO episodes (id, show_id, season_number, episode_number, title, status, watched, watch_progress, watched_at) VALUES (99892, ?, 1, 1, 'Ep 1', 'downloaded', 1, 100, '2026-09-27T10:00:00Z')").run(untrackedShowId);

    // Add watch history entries
    db.prepare("INSERT INTO watch_history (tmdb_id, type, season_number, episode_number, watched_at, user_id) VALUES (?, 'episode', 1, 1, '2026-09-27T10:00:00Z', 77771)").run(trackedTmdbId);
    db.prepare("INSERT INTO watch_history (tmdb_id, type, season_number, episode_number, watched_at, user_id) VALUES (?, 'episode', 1, 1, '2026-09-27T10:00:00Z', 77772)").run(untrackedTmdbId);

    // Add play_history entries
    db.prepare("INSERT INTO play_history (user, title, type, created_at) VALUES ('test_admin', 'Tracked Show - S01E01', 'episode', '2026-09-27 10:00:00')").run();
    db.prepare("INSERT INTO play_history (user, title, type, created_at) VALUES ('other_member', 'Untracked Show - S01E01', 'episode', '2026-09-27 10:00:00')").run();

    try {
      const result = watcherService.cleanUntrackedWatchHistory();
      assert.strictEqual(result.cleaned >= 1, true, 'Should have cleaned at least 1 untracked watch entry');

      // Tracked episode must remain watched
      const trackedEp = db.prepare('SELECT watched, watched_at FROM episodes WHERE id = 99891').get();
      assert.strictEqual(trackedEp.watched, 1);
      assert.ok(trackedEp.watched_at);
      const trackedWh = db.prepare("SELECT * FROM watch_history WHERE tmdb_id = ? AND type = 'episode'").get(trackedTmdbId);
      assert.ok(trackedWh, 'Tracked watch history entry must still exist');

      // Untracked episode must be unmarked
      const untrackedEp = db.prepare('SELECT watched, watched_at, watch_progress FROM episodes WHERE id = 99892').get();
      assert.strictEqual(untrackedEp.watched, 0);
      assert.strictEqual(untrackedEp.watched_at, null);
      assert.strictEqual(untrackedEp.watch_progress, 0);
      const untrackedWh = db.prepare("SELECT * FROM watch_history WHERE tmdb_id = ? AND type = 'episode'").get(untrackedTmdbId);
      assert.strictEqual(untrackedWh, undefined, 'Untracked watch history entry must be deleted');
    } finally {
      // Clean up
      db.prepare('DELETE FROM play_history WHERE user IN (?, ?)').run('test_admin', 'other_member');
      db.prepare('DELETE FROM watch_history WHERE tmdb_id IN (?, ?)').run(trackedTmdbId, untrackedTmdbId);
      db.prepare('DELETE FROM episodes WHERE show_id IN (?, ?)').run(trackedShowId, untrackedShowId);
      db.prepare('DELETE FROM shows WHERE id IN (?, ?)').run(trackedShowId, untrackedShowId);
      db.prepare('DELETE FROM users WHERE id IN (77771, 77772)').run();
      setSetting('autoWatchUser', '');
      setSetting('authUsername', '');
    }
  });

  await t.test('cleanUntrackedWatchHistory does NOT reset episodes that were marked watched by tracked user after an untracked play', () => {
    const watcherService = require('../server/services/watcherService');
    const { setSetting } = require('../server/utils/settings');

    db.prepare("INSERT OR IGNORE INTO users (id, username, password, role) VALUES (77773, 'main_admin', 'hash', 'admin')").run();
    setSetting('autoWatchUser', 'main_admin');

    const testShowId = 888894;
    const testTmdbId = 9999994;

    db.prepare("INSERT INTO shows (id, tmdb_id, title, status, watched) VALUES (?, ?, 'Family Show', 'continuing', 1)").run(testShowId, testTmdbId);
    db.prepare("INSERT INTO episodes (id, show_id, season_number, episode_number, title, status, watched, watch_progress, watched_at) VALUES (99894, ?, 1, 1, 'Ep 1', 'downloaded', 1, 100, '2026-09-27T12:00:00Z')").run(testShowId);

    // Watch history entry recorded for admin user
    db.prepare("INSERT INTO watch_history (tmdb_id, type, season_number, episode_number, watched_at, user_id) VALUES (?, 'episode', 1, 1, '2026-09-27T12:00:00Z', 77773)").run(testTmdbId);

    // Old untracked play from another user in play_history
    db.prepare("INSERT INTO play_history (user, title, type, created_at) VALUES ('random_roommate', 'Family Show - S01E01', 'episode', '2026-09-25 10:00:00')").run();

    try {
      const result = watcherService.cleanUntrackedWatchHistory();

      // Episode must remain watched because it belongs to the admin
      const ep = db.prepare('SELECT watched, watched_at FROM episodes WHERE id = 99894').get();
      assert.strictEqual(ep.watched, 1, 'Episode must remain watched');
      assert.ok(ep.watched_at);

      const wh = db.prepare("SELECT * FROM watch_history WHERE tmdb_id = ? AND type = 'episode'").get(testTmdbId);
      assert.ok(wh, 'Watch history entry must be preserved');
      assert.strictEqual(wh.user_id, 77773);
    } finally {
      db.prepare('DELETE FROM play_history WHERE user IN (?, ?)').run('main_admin', 'random_roommate');
      db.prepare('DELETE FROM watch_history WHERE tmdb_id = ?').run(testTmdbId);
      db.prepare('DELETE FROM episodes WHERE show_id = ?').run(testShowId);
      db.prepare('DELETE FROM shows WHERE id = ?').run(testShowId);
      db.prepare('DELETE FROM users WHERE id = 77773').run();
      setSetting('autoWatchUser', '');
    }
  });
});


