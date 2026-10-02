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

  await t.test('Password hashing and verification with bcrypt (cost 12)', async () => {
    const plainPassword = 'SuperSecretPassword123!';
    const saltRounds = 12;
    const hash = await bcrypt.hash(plainPassword, saltRounds);

    assert.notStrictEqual(hash, plainPassword);
    assert.match(hash, /^\$2[aby]\$12\$/);
    const isValid = await bcrypt.compare(plainPassword, hash);
    assert.strictEqual(isValid, true);

    const isInvalid = await bcrypt.compare('WrongPassword456', hash);
    assert.strictEqual(isInvalid, false);
  });

  await t.test('verifyUserSession checks jwt_version revocation and handles cache', () => {
    const { verifyUserSession, invalidateUserCache } = require('../server/middleware/authMiddleware');

    // Create a temporary user with jwt_version = 1
    const testUsername = `test_revocation_${Date.now()}`;
    const insertRes = db.prepare("INSERT INTO users (username, password, role, jwt_version) VALUES (?, 'hash', 'user', 1)").run(testUsername);
    const userId = Number(insertRes.lastInsertRowid);

    try {
      invalidateUserCache(userId);

      // Matching jwt_version succeeds
      const session = verifyUserSession(userId, 1);
      assert.ok(session, 'Session with jwt_version 1 should be valid');
      assert.strictEqual(session.id, userId);

      // Mismatched jwt_version fails
      const revoked = verifyUserSession(userId, 0);
      assert.strictEqual(revoked, null, 'Session with old jwt_version 0 should be null');

      // Update user jwt_version to 2 in DB (e.g. password change / logout)
      db.prepare('UPDATE users SET jwt_version = 2 WHERE id = ?').run(userId);
      invalidateUserCache(userId);

      // Old token with version 1 is now rejected
      assert.strictEqual(verifyUserSession(userId, 1), null, 'Old token version 1 should now be rejected');

      // New token with version 2 is accepted
      const updatedSession = verifyUserSession(userId, 2);
      assert.ok(updatedSession, 'Token with version 2 should be valid');
      assert.strictEqual(updatedSession.jwt_version, 2);
    } finally {
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      invalidateUserCache(userId);
    }
  });
});

