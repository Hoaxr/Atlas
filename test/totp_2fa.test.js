const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const bcrypt = require('../server/node_modules/bcrypt');
const jwt = require('../server/node_modules/jsonwebtoken');
const db = require('../server/config/database');
const totp = require('../server/utils/totp');

test('Two-Factor Authentication (2FA / TOTP) Engine & Flow', async (t) => {
  const express = require('../server/node_modules/express');
  const authRoutes = require('../server/routes/auth');

  const jwtSecret = process.env.JWT_SECRET || 'atlas_2fa_test_secret';
  process.env.JWT_SECRET = jwtSecret;

  const testUserId = 888101;
  const testUsername = 'admin_totp_tester';
  const testPassword = 'Password123!';
  const hashedPassword = bcrypt.hashSync(testPassword, 10);

  t.before(() => {
    db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
    db.prepare(`
      INSERT INTO users (id, username, password, role, jwt_version, totp_enabled, totp_secret, totp_backup_codes)
      VALUES (?, ?, ?, 'admin', 1, 0, NULL, NULL)
    `).run(testUserId, testUsername, hashedPassword);
  });

  t.after(() => {
    db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
  });

  await t.test('totp utility correctly encodes and decodes RFC 4648 Base32', () => {
    const raw = Buffer.from('AtlasSecurityTOTPSecret123');
    const encoded = totp.base32Encode(raw);
    const decoded = totp.base32Decode(encoded);
    assert.strictEqual(decoded.toString(), raw.toString());
  });

  await t.test('totp utility verifies generated tokens within allowed window', () => {
    const secret = totp.generateSecret();
    const currentCounter = Math.floor(Date.now() / 1000 / 30);
    const code = totp.generateTOTP(secret, currentCounter);

    assert.strictEqual(code.length, 6);
    assert.strictEqual(totp.verifyTOTP(code, secret), true);
    assert.strictEqual(totp.verifyTOTP('000000', secret), false);
    assert.strictEqual(totp.verifyTOTP('invalid', secret), false);
  });

  await t.test('totp utility generates and verifies single-use backup recovery codes', () => {
    const backupCodes = totp.generateBackupCodes(8);
    assert.strictEqual(backupCodes.length, 8);
    const hashedCodes = backupCodes.map(totp.hashBackupCode);

    // Verify first backup code matches
    const matchIndex = totp.findMatchingBackupCodeIndex(backupCodes[0], hashedCodes);
    assert.strictEqual(matchIndex, 0);

    // Verify non-existent code fails
    const badIndex = totp.findMatchingBackupCodeIndex('xxxx-yyyy', hashedCodes);
    assert.strictEqual(badIndex, -1);
  });

  await t.test('Full 2FA Lifecycle: Setup -> Enable -> Enforce on Login -> Backup Code Recovery -> Disable', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);

    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api/auth`;

    try {
      // 1. Initial Login before 2FA enabled returns token directly
      const initialLoginRes = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: testUsername, password: testPassword })
      });
      const initialLoginData = await initialLoginRes.json();
      assert.strictEqual(initialLoginRes.status, 200);
      assert.strictEqual(initialLoginData.status, 'success');
      assert.ok(initialLoginData.data.token, 'Must return session token when 2FA is off');
      const userToken = initialLoginData.data.token;

      // 2. Setup 2FA
      const setupRes = await fetch(`${baseUrl}/2fa/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`
        }
      });
      const setupData = await setupRes.json();
      assert.strictEqual(setupRes.status, 200);
      assert.ok(setupData.data.secret, 'Must generate secret');
      assert.ok(setupData.data.qr_code.startsWith('data:image/png;base64,'), 'Must return QR code data URL');
      const secret = setupData.data.secret;

      // 3. Enable 2FA with current valid TOTP token
      const currentCounter = Math.floor(Date.now() / 1000 / 30);
      const validCode = totp.generateTOTP(secret, currentCounter);

      const enableRes = await fetch(`${baseUrl}/2fa/enable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`
        },
        body: JSON.stringify({ code: validCode })
      });
      const enableData = await enableRes.json();
      assert.strictEqual(enableRes.status, 200);
      assert.strictEqual(enableData.status, 'success');
      assert.strictEqual(enableData.data.backup_codes.length, 8, 'Must return 8 emergency backup codes');
      const backupCodes = enableData.data.backup_codes;

      // 4. Verify 2FA status endpoint reports enabled
      const statusRes = await fetch(`${baseUrl}/2fa/status`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      const statusData = await statusRes.json();
      assert.strictEqual(statusData.data.enabled, true);

      // 5. Subsequent login without 2FA code returns status: 'totp_required' and temp_token
      const challengeLoginRes = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: testUsername, password: testPassword })
      });
      const challengeData = await challengeLoginRes.json();
      assert.strictEqual(challengeData.status, 'totp_required');
      assert.ok(challengeData.data.temp_token, 'Must return challenge temp_token');
      const tempToken = challengeData.data.temp_token;

      // 6. Submitting invalid code to /2fa/verify-login fails with 401
      const badVerifyRes = await fetch(`${baseUrl}/2fa/verify-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: tempToken, totp_code: '000000' })
      });
      assert.strictEqual(badVerifyRes.status, 401);

      // 7. Submitting valid TOTP code to /2fa/verify-login succeeds and issues session token
      const nextCounter = Math.floor(Date.now() / 1000 / 30);
      const nextValidCode = totp.generateTOTP(secret, nextCounter);

      const goodVerifyRes = await fetch(`${baseUrl}/2fa/verify-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: tempToken, totp_code: nextValidCode })
      });
      const goodVerifyData = await goodVerifyRes.json();
      assert.strictEqual(goodVerifyRes.status, 200);
      assert.strictEqual(goodVerifyData.status, 'success');
      assert.ok(goodVerifyData.data.token, 'Must return authenticated session JWT');

      // 8. Single-use backup code recovery
      const challenge2Res = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: testUsername, password: testPassword })
      });
      const challenge2Data = await challenge2Res.json();
      const tempToken2 = challenge2Data.data.temp_token;

      // Use first backup code
      const backupVerifyRes = await fetch(`${baseUrl}/2fa/verify-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: tempToken2, totp_code: backupCodes[0] })
      });
      const backupVerifyData = await backupVerifyRes.json();
      assert.strictEqual(backupVerifyRes.status, 200);
      assert.strictEqual(backupVerifyData.status, 'success');

      // Attempting to reuse the same backup code must fail (single-use consumption)
      const challenge3Res = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: testUsername, password: testPassword })
      });
      const challenge3Data = await challenge3Res.json();
      const tempToken3 = challenge3Data.data.temp_token;

      const reuseBackupRes = await fetch(`${baseUrl}/2fa/verify-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: tempToken3, totp_code: backupCodes[0] })
      });
      assert.strictEqual(reuseBackupRes.status, 401, 'Reused backup code must be rejected');

      // 9. Disable 2FA
      const activeSessionToken = backupVerifyData.data.token;
      const disableCounter = Math.floor(Date.now() / 1000 / 30);
      const disableCode = totp.generateTOTP(secret, disableCounter);

      const disableRes = await fetch(`${baseUrl}/2fa/disable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeSessionToken}`
        },
        body: JSON.stringify({ password: testPassword, code: disableCode })
      });
      const disableData = await disableRes.json();
      assert.strictEqual(disableRes.status, 200);
      assert.strictEqual(disableData.status, 'success');

      // 10. Check status is now disabled
      const finalStatusRes = await fetch(`${baseUrl}/2fa/status`, {
        headers: { Authorization: `Bearer ${activeSessionToken}` }
      });
      const finalStatusData = await finalStatusRes.json();
      assert.strictEqual(finalStatusData.data.enabled, false);
    } finally {
      server.close();
    }
  });
});
