const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('../server/node_modules/bcrypt');
const db = require('../server/config/database');
const { getSetting, setSetting, isAuthEnabled, invalidateSettingsCache } = require('../server/utils/settings');

test('Authentication System & Defaults', async (t) => {
  // Preserve original authEnabled setting
  const originalAuthSetting = getSetting('authEnabled');

  t.after(() => {
    // Restore original state
    if (originalAuthSetting === null) {
      db.prepare('DELETE FROM settings WHERE key = ?').run('authEnabled');
    } else {
      setSetting('authEnabled', originalAuthSetting);
    }
    invalidateSettingsCache();
  });

  await t.test('isAuthEnabled returns true when explicitly set to "true"', () => {
    setSetting('authEnabled', 'true');
    invalidateSettingsCache();
    assert.strictEqual(isAuthEnabled(), true);
  });

  await t.test('isAuthEnabled returns false when explicitly set to "false"', () => {
    setSetting('authEnabled', 'false');
    invalidateSettingsCache();
    assert.strictEqual(isAuthEnabled(), false);
  });

  await t.test('isAuthEnabled defaults to true (secure by default) when setting is absent', () => {
    db.prepare('DELETE FROM settings WHERE key = ?').run('authEnabled');
    invalidateSettingsCache();
    assert.strictEqual(getSetting('authEnabled'), null);
    assert.strictEqual(isAuthEnabled(), true);
  });

  await t.test('Password hashing and verification with bcrypt', async () => {
    const plainPassword = 'SuperSecretPassword123!';
    const saltRounds = 10;
    const hash = await bcrypt.hash(plainPassword, saltRounds);

    assert.notStrictEqual(hash, plainPassword);
    const isValid = await bcrypt.compare(plainPassword, hash);
    assert.strictEqual(isValid, true);

    const isInvalid = await bcrypt.compare('WrongPassword456', hash);
    assert.strictEqual(isInvalid, false);
  });
});
