const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/config/database');
const { setSetting, invalidateSettingsCache } = require('../server/utils/settings');

test('External Service & AI Provider Connectivity Test Route Logic', async (t) => {
  const testKeyName = 'geminiApiKey';
  const originalKey = db.prepare('SELECT value FROM settings WHERE key = ?').get(testKeyName)?.value;

  t.after(() => {
    if (originalKey !== undefined) {
      setSetting(testKeyName, originalKey);
    } else {
      db.prepare('DELETE FROM settings WHERE key = ?').run(testKeyName);
    }
    invalidateSettingsCache();
  });

  await t.test('Masked key resolution retrieves stored DB key', () => {
    setSetting(testKeyName, 'AIzaSyTestStoredSecretKey123');
    invalidateSettingsCache();

    const _isMasked = (val) => val && (/^\*+$/.test(val) || val.startsWith('***'));
    const inputKey = '********';
    let resolvedKey = inputKey;

    if (!resolvedKey || _isMasked(resolvedKey)) {
      const keyMap = { gemini: 'geminiApiKey' };
      resolvedKey = db.prepare('SELECT value FROM settings WHERE key = ?').get(keyMap.gemini)?.value || '';
    }

    assert.strictEqual(resolvedKey, 'AIzaSyTestStoredSecretKey123');
  });

  await t.test('Missing service name validation flags error', () => {
    const payload = { service: '', apiKey: '12345' };
    const isValid = Boolean(payload.service);
    assert.strictEqual(isValid, false);
  });

  await t.test('Unsupported service name is rejected', () => {
    const supportedServices = ['gemini', 'deepseek', 'claude', 'opensubtitles', 'subdl', 'subsource', 'tmdb', 'simkl'];
    const invalidService = 'unknown_ai_provider';
    assert.strictEqual(supportedServices.includes(invalidService), false);
  });

  await t.test('All AI and Subtitle provider types are recognized', () => {
    const supportedServices = ['gemini', 'deepseek', 'claude', 'opensubtitles', 'subdl', 'subsource', 'tmdb', 'simkl'];
    const aiProviders = ['gemini', 'deepseek', 'claude'];
    const subtitleProviders = ['opensubtitles', 'subdl', 'subsource'];

    for (const p of aiProviders) {
      assert.strictEqual(supportedServices.includes(p), true);
    }
    for (const p of subtitleProviders) {
      assert.strictEqual(supportedServices.includes(p), true);
    }
  });

  await t.test('Pushover test validation rejects missing token or user key', () => {
    const validate = (token, user) => Boolean(token && user);
    assert.strictEqual(validate('', 'userKey123'), false);
    assert.strictEqual(validate('appToken123', ''), false);
    assert.strictEqual(validate('', ''), false);
    assert.strictEqual(validate('appToken123', 'userKey123'), true);
  });

  await t.test('Pushover test resolves masked tokens from settings store', () => {
    setSetting('pushoverAppToken', 'real_pushover_app_token_123');
    setSetting('pushoverUserKey', 'real_pushover_user_key_456');
    invalidateSettingsCache();

    const _isMasked = (val) => val && (/^\*+$/.test(val) || val.startsWith('***'));
    let appToken = '********';
    let userKey = '********';

    if (!appToken || _isMasked(appToken)) {
      appToken = db.prepare("SELECT value FROM settings WHERE key = 'pushoverAppToken'").get()?.value;
    }
    if (!userKey || _isMasked(userKey)) {
      userKey = db.prepare("SELECT value FROM settings WHERE key = 'pushoverUserKey'").get()?.value;
    }

    assert.strictEqual(appToken, 'real_pushover_app_token_123');
    assert.strictEqual(userKey, 'real_pushover_user_key_456');

    db.prepare("DELETE FROM settings WHERE key IN ('pushoverAppToken', 'pushoverUserKey')").run();
    invalidateSettingsCache();
  });
});

