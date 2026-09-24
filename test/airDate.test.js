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

test('AirDate Timezone Shift & Localization', async (t) => {
  const originalTz = getUserTimezone();

  t.after(() => {
    if (originalTz) {
      setSetting('timezone', originalTz);
    } else {
      db.prepare('DELETE FROM settings WHERE key = ?').run('timezone');
    }
    invalidateTimezoneCache();
  });

  await t.test('No timezone configured returns unshifted date and 0 shift days', () => {
    db.prepare('DELETE FROM settings WHERE key = ?').run('timezone');
    invalidateTimezoneCache();

    assert.strictEqual(getUserTimezone(), '');
    assert.strictEqual(getAirDateShiftDays(), 0);
    assert.strictEqual(localizeAirDate('2026-09-24'), '2026-09-24');
    assert.strictEqual(getAiredCutoffSql(), "date('now', 'localtime')");
  });

  await t.test('US Eastern timezone returns unshifted date and 0 shift days', () => {
    setSetting('timezone', 'America/New_York');
    invalidateTimezoneCache();

    assert.strictEqual(getUserTimezone(), 'America/New_York');
    assert.strictEqual(getAirDateShiftDays(), 0);
    assert.strictEqual(localizeAirDate('2026-09-24'), '2026-09-24');
    assert.strictEqual(getAiredCutoffSql(), "date('now', 'localtime')");
  });

  await t.test('Europe/Amsterdam converts US Thursday primetime to Friday (+1 day)', () => {
    setSetting('timezone', 'Europe/Amsterdam');
    invalidateTimezoneCache();

    assert.strictEqual(getUserTimezone(), 'Europe/Amsterdam');
    assert.strictEqual(getAirDateShiftDays(), 1);
    assert.strictEqual(localizeAirDate('2026-09-24'), '2026-09-25');
    assert.strictEqual(getAiredCutoffSql(), "date('now', 'localtime', '-1 day')");
  });

  await t.test('Europe/London converts US Thursday primetime to Friday (+1 day)', () => {
    setSetting('timezone', 'Europe/London');
    invalidateTimezoneCache();

    assert.strictEqual(getAirDateShiftDays(), 1);
    assert.strictEqual(localizeAirDate('2026-09-24'), '2026-09-25');
  });

  await t.test('Asia/Tokyo converts US Thursday primetime to Friday (+1 day)', () => {
    setSetting('timezone', 'Asia/Tokyo');
    invalidateTimezoneCache();

    assert.strictEqual(getAirDateShiftDays(), 1);
    assert.strictEqual(localizeAirDate('2026-09-24'), '2026-09-25');
  });

  await t.test('SQLite date shift correctly shifts episodes and keeps movies unshifted', () => {
    const memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE episodes (id INTEGER, air_date TEXT);
      CREATE TABLE movies (id INTEGER, release_date TEXT);
      INSERT INTO episodes VALUES (1, '2026-09-24');
      INSERT INTO movies VALUES (1, '2026-09-24');
    `);

    const shift = 1;
    const shiftSql = shift === 0 ? 'e.air_date' : `date(e.air_date, '+${shift} days')`;
    const shiftSqlM = 'm.release_date';

    const epRow = memDb.prepare(`SELECT ${shiftSql} AS date FROM episodes e WHERE id = 1`).get();
    const movieRow = memDb.prepare(`SELECT ${shiftSqlM} AS date FROM movies m WHERE id = 1`).get();

    assert.strictEqual(epRow.date, '2026-09-25');
    assert.strictEqual(movieRow.date, '2026-09-24');
  });
});
