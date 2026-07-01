const axios = require('axios');
const db = require('../config/database');
const eventBus = require('./eventBus');
const { getSetting } = require('../utils/settings');

class NotificationService {
  constructor() {
    this.init();
  }

  init() {
    eventBus.on('event', this.handleEvent.bind(this));
  }

  async handleEvent(event) {
    const notifyOnGrab = getSetting('notifyOnGrab') === 'true';
    const notifyOnDownload = getSetting('notifyOnDownload') === 'true';

    const grabEvents = ['Download started', 'Manual grab started', 'Auto-search download started'];
    
    if (grabEvents.includes(event.message) && notifyOnGrab) {
      console.log('[NotificationService] Grab notification triggered:', event.metadata?.title);
      await this.sendNotification('Media Grabbed', `${event.metadata?.title || 'Unknown'} sent to download client`, event.metadata);
    } else if (event.message === 'Download complete' && notifyOnDownload) {
      console.log('[NotificationService] Download notification triggered:', event.metadata?.title);
      await this.sendNotification('Download Complete', `${event.metadata?.title || 'Unknown'} has been imported`, event.metadata);
    }
  }

  async sendNotification(title, message, metadata = {}, overrides = {}) {
    const isMasked = (val) => typeof val === 'string' && /^\*+$/.test(val);
    
    const discordUrl = (overrides.discordWebhookUrl !== undefined && !isMasked(overrides.discordWebhookUrl)) 
      ? overrides.discordWebhookUrl 
      : getSetting('discordWebhookUrl');
      
    const telegramToken = (overrides.telegramBotToken !== undefined && !isMasked(overrides.telegramBotToken)) 
      ? overrides.telegramBotToken 
      : getSetting('telegramBotToken');
      
    const telegramChatId = (overrides.telegramChatId !== undefined && !isMasked(overrides.telegramChatId)) 
      ? overrides.telegramChatId 
      : getSetting('telegramChatId');

    const itemTitle = metadata.title !== undefined ? metadata.title : null;
    const description = message;

    // Determine color for Discord embed
    let embedColor = 3447003; // Default blue
    if (title === 'Download Complete') embedColor = 3066993; // Green
    else if (title === 'Media Grabbed') embedColor = 15105570; // Orange
    else if (title === 'Playback Started') embedColor = 5814783; // Purple-ish

    if (discordUrl) {
      try {
        const embed = {
          title: itemTitle || title,
          description: description,
          color: embedColor,
          timestamp: new Date().toISOString(),
          footer: { text: 'Atlas Media Manager' }
        };

        // Add fields for playback notifications
        if (title === 'Playback Started') {
          const fields = [];
          if (metadata.type) fields.push({ name: 'Type', value: metadata.type, inline: true });
          if (metadata.duration) fields.push({ name: 'Duration', value: metadata.duration, inline: true });
          if (metadata.player) fields.push({ name: 'Player', value: metadata.player, inline: true });
          if (metadata.server) fields.push({ name: 'Server', value: metadata.server, inline: true });
          if (fields.length > 0) embed.fields = fields;
        }

        // Try to attach poster image by downloading it internally
        if (metadata.poster && title === 'Playback Started') {
          try {
            const posterBuffer = await this.downloadPoster(metadata.poster);
            if (posterBuffer) {
              embed.thumbnail = { url: 'attachment://poster.png' };
              const boundary = `----AtlasDiscord${Date.now()}`;
              const payload = JSON.stringify({ embeds: [embed] });
              
              const parts = [];
              parts.push(Buffer.from(`--${boundary}\r\n`));
              parts.push(Buffer.from('Content-Disposition: form-data; name="payload_json"\r\n\r\n'));
              parts.push(Buffer.from(payload, 'utf-8'));
              parts.push(Buffer.from(`\r\n--${boundary}\r\n`));
              parts.push(Buffer.from('Content-Disposition: form-data; name="files[0]"; filename="poster.png"\r\n'));
              parts.push(Buffer.from('Content-Type: image/png\r\n\r\n'));
              parts.push(posterBuffer);
              parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
              
              const body = Buffer.concat(parts);
              await axios.post(discordUrl, body, {
                headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }
              });
              return; // Sent with attachment, skip the plain JSON post below
            }
          } catch (posterErr) {
            console.error('[NotificationService] Poster attachment failed, sending without:', posterErr.message);
          }
        }

        // Fallback: send without poster attachment
        await axios.post(discordUrl, { embeds: [embed] });
      } catch (err) {
        console.error('[NotificationService] Discord error:', err.message);
      }
    }

    if (telegramToken && telegramChatId) {
      try {
        let caption = '';
        if (title === 'Playback Started' && itemTitle) {
          caption = `🎬 *Playback Started*\n\n`;
          caption += `*${itemTitle}*\n`;
          caption += `${message}\n`;
          if (metadata.type) caption += `📺 ${metadata.type}`;
          if (metadata.duration) caption += ` · ⏱ ${metadata.duration}`;
          if (metadata.server) caption += `\n🖥 ${metadata.server}`;
        } else if (itemTitle) {
          caption = `*${title}*\n${itemTitle}\n${description}`;
        } else {
          caption = `*${title}*\n${description}`;
        }

        // Try to send as photo with poster for playback notifications
        if (metadata.poster && title === 'Playback Started') {
          try {
            const posterBuffer = await this.downloadPoster(metadata.poster);
            if (posterBuffer) {
              const boundary = `----AtlasTelegram${Date.now()}`;
              const parts = [];
              parts.push(Buffer.from(`--${boundary}\r\n`));
              parts.push(Buffer.from('Content-Disposition: form-data; name="chat_id"\r\n\r\n'));
              parts.push(Buffer.from(telegramChatId, 'utf-8'));
              parts.push(Buffer.from(`\r\n--${boundary}\r\n`));
              parts.push(Buffer.from('Content-Disposition: form-data; name="caption"\r\n\r\n'));
              parts.push(Buffer.from(caption, 'utf-8'));
              parts.push(Buffer.from(`\r\n--${boundary}\r\n`));
              parts.push(Buffer.from('Content-Disposition: form-data; name="parse_mode"\r\n\r\n'));
              parts.push(Buffer.from('Markdown', 'utf-8'));
              parts.push(Buffer.from(`\r\n--${boundary}\r\n`));
              parts.push(Buffer.from('Content-Disposition: form-data; name="photo"; filename="poster.png"\r\n'));
              parts.push(Buffer.from('Content-Type: image/png\r\n\r\n'));
              parts.push(posterBuffer);
              parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

              const body = Buffer.concat(parts);
              await axios.post(`https://api.telegram.org/bot${telegramToken}/sendPhoto`, body, {
                headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }
              });
              return; // Sent with photo, skip text-only below
            }
          } catch (posterErr) {
            console.error('[NotificationService] Telegram poster failed, sending text-only:', posterErr.message);
          }
        }

        // Fallback: text-only message
        await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          chat_id: telegramChatId,
          text: caption,
          parse_mode: 'Markdown'
        });
      } catch (err) {
        console.error('[NotificationService] Telegram error:', err.message);
      }
    }
  }

  async downloadPoster(posterUrl) {
    const PORT = process.env.PORT || 3000;
    // Handle both relative paths (/api/watcher/image...) and full URLs (TMDB)
    const url = posterUrl.startsWith('http') ? posterUrl : `http://localhost:${PORT}${posterUrl}`;
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
    return Buffer.from(response.data);
  }

  async testNotification(overrides = {}) {
    await this.sendNotification('Atlas', 'This is a test notification from Atlas Media Manager.', { title: 'Test Notification' }, overrides);
  }
}

module.exports = new NotificationService();
