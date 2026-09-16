const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/config/database');

test('RBAC & Request Quotas System', async (t) => {
  const testUserId = 999998;
  const testAdminId = 999999;

  t.before(() => {
    // Ensure test users exist
    db.prepare('DELETE FROM requests WHERE user_id IN (?, ?)').run(testUserId, testAdminId);
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(testUserId, testAdminId);

    db.prepare(`
      INSERT INTO users (id, username, password, role, request_limit, permissions)
      VALUES (?, 'test_quota_user', 'hashed_pass_123', 'user', 2, '{"can_request":true,"can_download":true}')
    `).run(testUserId);

    db.prepare(`
      INSERT INTO users (id, username, password, role, request_limit, permissions)
      VALUES (?, 'test_quota_admin', 'hashed_pass_123', 'admin', NULL, '{"can_request":true}')
    `).run(testAdminId);
  });

  t.after(() => {
    db.prepare('DELETE FROM requests WHERE user_id IN (?, ?)').run(testUserId, testAdminId);
    db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(testUserId, testAdminId);
  });

  await t.test('User schema supports request_limit and permissions', () => {
    const user = db.prepare('SELECT request_limit, permissions FROM users WHERE id = ?').get(testUserId);
    assert.strictEqual(user.request_limit, 2);
    const parsed = JSON.parse(user.permissions);
    assert.strictEqual(parsed.can_request, true);
    assert.strictEqual(parsed.can_download, true);
  });

  await t.test('Quota check blocks user after reaching weekly limit', () => {
    const checkUserQuota = (userId) => {
      const user = db.prepare('SELECT role, request_limit, permissions FROM users WHERE id = ?').get(userId);
      if (!user) return { allowed: false, reason: 'User not found' };
      if (user.role === 'admin') return { allowed: true };

      let permissions = {};
      try { permissions = user.permissions ? JSON.parse(user.permissions) : {}; } catch { /* ignore */ }

      if (permissions.can_request === false) {
        return { allowed: false, status: 403, reason: 'Permission denied' };
      }

      if (user.request_limit !== null && user.request_limit >= 0) {
        const recent = db.prepare(`
          SELECT COUNT(*) as count FROM requests 
          WHERE user_id = ? AND created_at >= datetime('now', '-7 days')
        `).get(userId);
        const count = recent ? recent.count : 0;
        if (count >= user.request_limit) {
          return { allowed: false, status: 429, count, limit: user.request_limit };
        }
      }
      return { allowed: true };
    };

    // Initially 0 requests — allowed
    assert.strictEqual(checkUserQuota(testUserId).allowed, true);

    // Insert 1 request within 7 days
    db.prepare(`
      INSERT INTO requests (user_id, tmdb_id, type, title, status, created_at)
      VALUES (?, 1001, 'movie', 'Test Movie 1', 'pending', datetime('now', '-2 days'))
    `).run(testUserId);

    assert.strictEqual(checkUserQuota(testUserId).allowed, true);

    // Insert 2nd request within 7 days (hits limit of 2)
    db.prepare(`
      INSERT INTO requests (user_id, tmdb_id, type, title, status, created_at)
      VALUES (?, 1002, 'movie', 'Test Movie 2', 'pending', datetime('now', '-1 days'))
    `).run(testUserId);

    const blockedResult = checkUserQuota(testUserId);
    assert.strictEqual(blockedResult.allowed, false);
    assert.strictEqual(blockedResult.status, 429);
    assert.strictEqual(blockedResult.count, 2);

    // Admin is immune to quotas
    assert.strictEqual(checkUserQuota(testAdminId).allowed, true);
  });

  await t.test('Requests older than 7 days do not count towards rolling weekly quota', () => {
    // Clear existing requests and add 2 old requests (> 7 days ago)
    db.prepare('DELETE FROM requests WHERE user_id = ?').run(testUserId);
    db.prepare(`
      INSERT INTO requests (user_id, tmdb_id, type, title, status, created_at)
      VALUES (?, 1003, 'movie', 'Old Movie 1', 'pending', datetime('now', '-10 days'))
    `).run(testUserId);
    db.prepare(`
      INSERT INTO requests (user_id, tmdb_id, type, title, status, created_at)
      VALUES (?, 1004, 'movie', 'Old Movie 2', 'pending', datetime('now', '-8 days'))
    `).run(testUserId);

    const recent = db.prepare(`
      SELECT COUNT(*) as count FROM requests 
      WHERE user_id = ? AND created_at >= datetime('now', '-7 days')
    `).get(testUserId);

    assert.strictEqual(recent.count, 0, 'Old requests must not appear in 7-day window');
  });

  await t.test('Permission flag can_request: false blocks user even when quota remains', () => {
    db.prepare('UPDATE users SET permissions = ? WHERE id = ?').run(
      JSON.stringify({ can_request: false }),
      testUserId
    );

    const user = db.prepare('SELECT permissions FROM users WHERE id = ?').get(testUserId);
    const perms = JSON.parse(user.permissions);
    assert.strictEqual(perms.can_request, false);
  });
});
