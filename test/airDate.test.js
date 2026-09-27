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
  getAirDateShiftDays,
  isSameDayRelease,
  getAirDateShiftSql
} = require('../server/utils/airDate');

test('AirDate Timezone & Smart Network-Aware Release Date Localization', async (t) => {
  const originalTz = getUserTimezone();

  t.after(() => {
    if (originalTz) {
      setSetting('timezone', originalTz);
    } else {
      db.prepare('DELETE FROM settings WHERE key = ?').run('timezone');
    }
    invalidateTimezoneCache();
  });

  await t.test('isSameDayRelease correctly identifies streaming and non-US shows', () => {
    // Streaming platforms (release morning in Europe)
    assert.strictEqual(isSameDayRelease('Paramount+', 'US'), true);
    assert.strictEqual(isSameDayRelease('Netflix', 'US'), true);
    assert.strictEqual(isSameDayRelease('Apple TV+', 'US'), true);
    assert.strictEqual(isSameDayRelease('Amazon Prime Video', 'US'), true);
    assert.strictEqual(isSameDayRelease('Disney+', 'US'), true);
    assert.strictEqual(isSameDayRelease('Hulu, FX', 'US'), true);

    // Non-US productions (air in local UK/European time)
    assert.strictEqual(isSameDayRelease('BBC One', 'GB'), true);
    assert.strictEqual(isSameDayRelease('Paramount+', 'GB, US'), true); // MobLand
    assert.strictEqual(isSameDayRelease('NPO 1', 'NL'), true);

    // US evening broadcast networks (air 8-10 PM ET = 2-4 AM next day in Europe)
    assert.strictEqual(isSameDayRelease('HBO', 'US'), false);
    assert.strictEqual(isSameDayRelease('CBS', 'US'), false);
    assert.strictEqual(isSameDayRelease('NBC', 'US'), false);
    assert.strictEqual(isSameDayRelease('ABC', 'US'), false);
    assert.strictEqual(isSameDayRelease('AMC', 'US'), false);
  });

  await t.test('Europe/Amsterdam: streaming & non-US shows stay on Friday, US broadcast shifts to next day', () => {
    setSetting('timezone', 'Europe/Amsterdam');
    invalidateTimezoneCache();

    assert.strictEqual(getUserTimezone(), 'Europe/Amsterdam');
    assert.strictEqual(getAirDateShiftDays(), 1);

    // MobLand: Paramount+ / UK production -> stays Friday (downloadable on Friday morning)
    assert.strictEqual(
      localizeAirDate('2026-09-25', 'Paramount+', 'GB, US'),
      '2026-09-25',
      'MobLand must remain on Friday 2026-09-25 in Amsterdam'
    );

    // Netflix show: stays Friday
    assert.strictEqual(
      localizeAirDate('2026-09-25', 'Netflix', 'US'),
      '2026-09-25'
    );

    // US Broadcast (HBO Sunday night / Friday night): airs 8-10 PM ET = early next morning in Europe
    assert.strictEqual(
      localizeAirDate('2026-09-25', 'HBO', 'US'),
      '2026-09-26',
      'US evening broadcast show should shift to Saturday when it actually becomes downloadable in Europe'
    );
  });

  await t.test('US Eastern timezone: no shifts for any shows', () => {
    setSetting('timezone', 'America/New_York');
    invalidateTimezoneCache();

    assert.strictEqual(getAirDateShiftDays(), 0);
    assert.strictEqual(localizeAirDate('2026-09-25', 'Paramount+', 'GB, US'), '2026-09-25');
    assert.strictEqual(localizeAirDate('2026-09-25', 'HBO', 'US'), '2026-09-25');
  });

  await t.test('SQLite date query shifts US evening broadcast shows and keeps streaming shows on release date', () => {
    setSetting('timezone', 'Europe/Amsterdam');
    invalidateTimezoneCache();

    const memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE shows (id INTEGER, network TEXT, origin_country TEXT);
      CREATE TABLE episodes (id INTEGER, show_id INTEGER, air_date TEXT);
      CREATE TABLE movies (id INTEGER, release_date TEXT);

      -- Show 1: MobLand (Paramount+, GB/US)
      INSERT INTO shows VALUES (1, 'Paramount+', 'GB, US');
      INSERT INTO episodes VALUES (101, 1, '2026-09-25');

      -- Show 2: HBO show (HBO, US)
      INSERT INTO shows VALUES (2, 'HBO', 'US');
      INSERT INTO episodes VALUES (102, 2, '2026-09-25');

      -- Movie
      INSERT INTO movies VALUES (201, '2026-09-25');
    `);

    const shiftSql = getAirDateShiftSql('e.air_date');

    const moblandRow = memDb.prepare(`
      SELECT ${shiftSql} AS date 
      FROM episodes e 
      JOIN shows s ON e.show_id = s.id 
      WHERE e.id = 101
    `).get();

    const hboRow = memDb.prepare(`
      SELECT ${shiftSql} AS date 
      FROM episodes e 
      JOIN shows s ON e.show_id = s.id 
      WHERE e.id = 102
    `).get();

    assert.strictEqual(moblandRow.date, '2026-09-25', 'MobLand must show on Friday 2026-09-25');
    assert.strictEqual(hboRow.date, '2026-09-26', 'HBO show must show on Saturday 2026-09-26 when downloadable in Europe');
  });
});
