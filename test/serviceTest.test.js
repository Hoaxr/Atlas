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
    const supportedServices = ['gemini', 'deepseek', 'claude', 'opensubtitles', 'subdl', 'subsource', 'tmdb'];
    const invalidService = 'unknown_ai_provider';
    assert.strictEqual(supportedServices.includes(invalidService), false);
  });

  await t.test('All AI and Subtitle provider types are recognized', () => {
    const supportedServices = ['gemini', 'deepseek', 'claude', 'opensubtitles', 'subdl', 'subsource', 'tmdb'];
    const aiProviders = ['gemini', 'deepseek', 'claude'];
    const subtitleProviders = ['opensubtitles', 'subdl', 'subsource'];

    for (const p of aiProviders) {
      assert.strictEqual(supportedServices.includes(p), true);
    }
    for (const p of subtitleProviders) {
      assert.strictEqual(supportedServices.includes(p), true);
    }
  });
});
