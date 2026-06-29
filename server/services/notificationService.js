const axios = require('axios');
const db = require('../config/database');
const eventBus = require('./eventBus');

class NotificationService {
  constructor() {
    this.init();
  }

  init() {
    eventBus.on('event', this.handleEvent.bind(this));
  }

  getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  async handleEvent(event) {
    const notifyOnGrab = this.getSetting('notifyOnGrab') === 'true';
    const notifyOnDownload = this.getSetting('notifyOnDownload') === 'true';

    if (event.message === 'Download started' && notifyOnGrab) {
      await this.sendNotification('Media Grabbed', event.message || 'Started downloading an item', event.metadata);
    } else if (event.message === 'Download complete' && notifyOnDownload) {
      await this.sendNotification('Download Complete', event.message || 'Finished downloading an item', event.metadata);
    }
  }

  async sendNotification(title, message, metadata = {}, overrides = {}) {
    const isMasked = (val) => typeof val === 'string' && /^\*+$/.test(val);
    
    const discordUrl = (overrides.discordWebhookUrl !== undefined && !isMasked(overrides.discordWebhookUrl)) 
      ? overrides.discordWebhookUrl 
      : this.getSetting('discordWebhookUrl');
      
    const telegramToken = (overrides.telegramBotToken !== undefined && !isMasked(overrides.telegramBotToken)) 
      ? overrides.telegramBotToken 
      : this.getSetting('telegramBotToken');
      
    const telegramChatId = (overrides.telegramChatId !== undefined && !isMasked(overrides.telegramChatId)) 
      ? overrides.telegramChatId 
      : this.getSetting('telegramChatId');

    const itemTitle = metadata.title || 'Unknown Title';
    const description = message;

    if (discordUrl) {
      try {
        await axios.post(discordUrl, {
          embeds: [{
            title: `${title}: ${itemTitle}`,
            description: description,
            color: title === 'Download Complete' ? 3066993 : 15105570, // Green / Orange
            timestamp: new Date().toISOString()
          }]
        });
      } catch (err) {
        console.error('[NotificationService] Discord error:', err.message);
      }
    }

    if (telegramToken && telegramChatId) {
      try {
        const text = `*${title}*\n${itemTitle}\n${description}`;
        await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          chat_id: telegramChatId,
          text: text,
          parse_mode: 'Markdown'
        });
      } catch (err) {
        console.error('[NotificationService] Telegram error:', err.message);
        if (err.response) {
          require('fs').writeFileSync('telegram-debug.log', JSON.stringify(err.response.data));
        } else {
          require('fs').writeFileSync('telegram-debug.log', err.message);
        }
      }
    }
  }

  async testNotification(overrides = {}) {
    await this.sendNotification('Atlas', 'This is a test notification from Atlas Media Manager.', { title: 'Test Notification' }, overrides);
  }
}

module.exports = new NotificationService();
