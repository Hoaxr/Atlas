const test = require('node:test');
const assert = require('node:assert/strict');
const telegramBotService = require('../server/services/telegramBotService');
const { setSetting, invalidateSettingsCache } = require('../server/utils/settings');
const db = require('../server/config/database');

test('Telegram Bot Service Lifecycle & Routing', async (t) => {
  const originalToken = db.prepare("SELECT value FROM settings WHERE key = 'telegramBotToken'").get()?.value;
  const originalChatId = db.prepare("SELECT value FROM settings WHERE key = 'telegramChatId'").get()?.value;

  t.after(() => {
    if (originalToken !== undefined) setSetting('telegramBotToken', originalToken);
    else db.prepare("DELETE FROM settings WHERE key = 'telegramBotToken'").run();

    if (originalChatId !== undefined) setSetting('telegramChatId', originalChatId);
    else db.prepare("DELETE FROM settings WHERE key = 'telegramChatId'").run();

    invalidateSettingsCache();
  });

  await t.test('TelegramBotService is instantiated as a singleton', () => {
    assert.ok(telegramBotService);
    assert.strictEqual(typeof telegramBotService.init, 'function');
    assert.strictEqual(typeof telegramBotService.handleSearch, 'function');
  });

  await t.test('init() gracefully handles missing token or chatId without throwing', () => {
    db.prepare("DELETE FROM settings WHERE key = 'telegramBotToken'").run();
    db.prepare("DELETE FROM settings WHERE key = 'telegramChatId'").run();
    invalidateSettingsCache();

    // Must not throw
    assert.doesNotThrow(() => {
      telegramBotService.init();
    });
    assert.strictEqual(telegramBotService.bot, null);
  });

  await t.test('handleSearch returns early on empty or whitespace query', async () => {
    let replied = false;
    const mockCtx = {
      reply: async () => {
        replied = true;
      }
    };

    await telegramBotService.handleSearch(mockCtx, '');
    assert.strictEqual(replied, false);

    await telegramBotService.handleSearch(mockCtx, '   ');
    assert.strictEqual(replied, false);
  });
});
