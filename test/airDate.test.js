const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const db = require('../server/config/database');
const { setSetting } = require('../server/utils/settings');
const {
  localizeAirDate,
  getUserTimezone,
  invalidateTimezoneCache,
  getAiredCutoffSql,
  getAirDateShiftDays
} = require('../server/utils/airDate');

test('AirDate Timezone & Release Date Consistency', async (t) => {
  const originalTz = getUserTimezone();

  t.after(() => {
    if (originalTz) {
      setSetting('timezone', originalTz);
    } else {
      db.prepare('DELETE FROM settings WHERE key = ?').run('timezone');
    }
    invalidateTimezoneCache();
  });

  await t.test('Air dates remain unshifted regardless of timezone to match official release timing', () => {
    // Test with Europe/Amsterdam
    setSetting('timezone', 'Europe/Amsterdam');
    invalidateTimezoneCache();

    assert.strictEqual(getUserTimezone(), 'Europe/Amsterdam');
    assert.strictEqual(getAirDateShiftDays(), 0);
    assert.strictEqual(localizeAirDate('2026-09-25'), '2026-09-25', 'Friday release date must remain Friday');
    assert.strictEqual(getAiredCutoffSql(), "date('now', 'localtime')");

    // Test with US Eastern
    setSetting('timezone', 'America/New_York');
    invalidateTimezoneCache();
    assert.strictEqual(getAirDateShiftDays(), 0);
    assert.strictEqual(localizeAirDate('2026-09-25'), '2026-09-25');

    // Test without timezone
    db.prepare('DELETE FROM settings WHERE key = ?').run('timezone');
    invalidateTimezoneCache();
    assert.strictEqual(getAirDateShiftDays(), 0);
    assert.strictEqual(localizeAirDate('2026-09-25'), '2026-09-25');
  });

  await t.test('SQLite date query keeps both episodes and movies on official release date', () => {
    const memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE episodes (id INTEGER, air_date TEXT);
      CREATE TABLE movies (id INTEGER, release_date TEXT);
      INSERT INTO episodes VALUES (1, '2026-09-25');
      INSERT INTO movies VALUES (1, '2026-09-25');
    `);

    const shift = getAirDateShiftDays();
    const shiftSql = shift === 0 ? 'e.air_date' : `date(e.air_date, '+${shift} days')`;
    const shiftSqlM = 'm.release_date';

    const epRow = memDb.prepare(`SELECT ${shiftSql} AS date FROM episodes e WHERE id = 1`).get();
    const movieRow = memDb.prepare(`SELECT ${shiftSqlM} AS date FROM movies m WHERE id = 1`).get();

    assert.strictEqual(epRow.date, '2026-09-25', 'Episode date must remain Friday 2026-09-25');
    assert.strictEqual(movieRow.date, '2026-09-25', 'Movie date must remain Friday 2026-09-25');
  });
});
