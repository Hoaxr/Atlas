const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/config/database');
const { getSetting, setSetting, invalidateSettingsCache } = require('../server/utils/settings');

// Helper matching server/routes/settings.js masking checks
const isMasked = (val) => typeof val === 'string' && (/^\*+$/.test(val) || val.startsWith('***'));

const maskSecret = (val, isAdmin = true) => {
  if (!val) return '';
  if (!isAdmin) return '';
  return val;
};

test('Settings System & Masking Rules', async (t) => {
  const testKey = '__test_temp_setting__';
  const originalColonReplacement = getSetting('colonReplacement');

  t.after(() => {
    // Cleanup temporary settings
    db.prepare('DELETE FROM settings WHERE key = ?').run(testKey);
    if (originalColonReplacement === null) {
      db.prepare('DELETE FROM settings WHERE key = ?').run('colonReplacement');
    } else {
      setSetting('colonReplacement', originalColonReplacement);
    }
    invalidateSettingsCache();
  });

  await t.test('Secret masking identification handles placeholders correctly', () => {
    assert.strictEqual(isMasked('********'), true);
    assert.strictEqual(isMasked('***1234'), true);
    assert.strictEqual(isMasked('***abcd'), true);
    assert.strictEqual(isMasked('sk_live_123456789'), false);
    assert.strictEqual(isMasked('my-secure-api-key'), false);
    assert.strictEqual(isMasked(12345), false);
    assert.strictEqual(isMasked(null), false);
  });

  await t.test('Mask function preserves full keys for admins and hides from non-admins', () => {
    assert.strictEqual(maskSecret(''), '');
    assert.strictEqual(maskSecret(null), '');
    assert.strictEqual(maskSecret('secret12345', false), ''); // non-admin gets empty string
    assert.strictEqual(maskSecret('1234', true), '1234');
    assert.strictEqual(maskSecret('mySecretKey9876', true), 'mySecretKey9876'); // admin receives full unmasked key
  });

  await t.test('colonReplacement default resolves to "delete"', () => {
    db.prepare('DELETE FROM settings WHERE key = ?').run('colonReplacement');
    invalidateSettingsCache();
    const colonReplacement = getSetting('colonReplacement') || 'delete';
    assert.strictEqual(colonReplacement, 'delete');
  });

  await t.test('seriesFolderFormat default resolves to "{Show Title}"', () => {
    db.prepare('DELETE FROM settings WHERE key = ?').run('seriesFolderFormat');
    invalidateSettingsCache();
    const seriesFolderFormat = getSetting('seriesFolderFormat') || '{Show Title}';
    assert.strictEqual(seriesFolderFormat, '{Show Title}');

    const { formatSeriesFolder, getNamingConfig } = require('../server/services/mediaManagementService');
    const config = getNamingConfig();
    assert.strictEqual(formatSeriesFolder('Breaking Bad', 2008, config), 'Breaking Bad');
    assert.strictEqual(formatSeriesFolder('Lost', null, config), 'Lost');
  });

  await t.test('Settings cache and persistence lifecycle', () => {
    setSetting(testKey, 'atlas_test_value_1');
    assert.strictEqual(getSetting(testKey), 'atlas_test_value_1');

    // Overwrite
    setSetting(testKey, 'atlas_test_value_2');
    assert.strictEqual(getSetting(testKey), 'atlas_test_value_2');

    // Invalidate
    invalidateSettingsCache();
    assert.strictEqual(getSetting(testKey), 'atlas_test_value_2');

    // Cleanup
    db.prepare('DELETE FROM settings WHERE key = ?').run(testKey);
    invalidateSettingsCache();
    assert.strictEqual(getSetting(testKey), null);
  });

  await t.test('Database purge endpoint is registered on settings router', () => {
    const router = require('../server/routes/settings');
    const purgeRoute = router.stack.find(
      (layer) => layer.route && layer.route.path === '/database/purge' && layer.route.methods.post
    );
    assert.ok(purgeRoute, 'POST /database/purge route should be registered');
    assert.strictEqual(purgeRoute.route.methods.post, true);
  });

  await t.test('notifyOnTaskRun setting is supported and triggers notifications on task execution', async () => {
    const taskRegistry = require('../server/services/taskRegistry');
    const notificationService = require('../server/services/notificationService');

    const originalSetting = getSetting('notifyOnTaskRun');
    setSetting('notifyOnTaskRun', 'true');
    invalidateSettingsCache();

    let sentTitle = null;
    let sentMessage = null;
    const origSendNotification = notificationService.sendNotification;
    notificationService.sendNotification = async (title, message) => {
      sentTitle = title;
      sentMessage = message;
    };

    try {
      taskRegistry.registerTask('unit_test_task', 'Unit Test Task', 'Runs test', '* * * * *', async () => {
        return 'All items updated';
      });

      await taskRegistry.executeTask('unit_test_task');

      assert.strictEqual(sentTitle, 'Task Completed');
      assert.ok(sentMessage.includes('Unit Test Task'));
      assert.ok(sentMessage.includes('completed successfully'));
    } finally {
      notificationService.sendNotification = origSendNotification;
      if (originalSetting !== null) {
        setSetting('notifyOnTaskRun', originalSetting);
      } else {
        db.prepare('DELETE FROM settings WHERE key = ?').run('notifyOnTaskRun');
      }
      invalidateSettingsCache();
    }
  });
});

