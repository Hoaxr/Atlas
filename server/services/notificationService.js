const path = require('path');
const fs = require('fs');
const axios = require('axios');
const eventBus = require('./eventBus');
const { getSetting } = require('../utils/settings');

class NotificationService {
  constructor() {
    this._logoBuffer = null;
    this.init();
  }

  getAtlasLogoBuffer() {
    if (this._logoBuffer) return this._logoBuffer;
    try {
      const logoPath = path.resolve(__dirname, '../../assets/logo.png');
      if (fs.existsSync(logoPath)) {
        this._logoBuffer = fs.readFileSync(logoPath);
        return this._logoBuffer;
      }
    } catch (e) {
      console.error('[NotificationService] Failed to read Atlas logo:', e.message);
    }
    return null;
  }

  init() {
    eventBus.on('event', this.handleEvent.bind(this));
  }

  async handleEvent(event) {
    const grabEvents = ['Download started', 'Manual grab started', 'Auto-search download started'];
    const downloadEvent = 'Download complete';

    // 1. Grab
    const notifyOnGrab = getSetting('notifyOnGrab') === 'true';
    if (grabEvents.includes(event.message) && notifyOnGrab) {
      console.log('[NotificationService] Grab notification triggered:', event.metadata?.title);
      await this.sendNotification('Media Grabbed', `Sent to download client`, event.metadata);
      return;
    }

    // 2. Download / Upgrade / Request Fulfillment
    if (event.message === downloadEvent) {
      const isUpgrade = Boolean(event.metadata?.isUpgrade);
      const notifyOnUpgrade = getSetting('notifyOnUpgrade') === 'true';
      const notifyOnDownload = getSetting('notifyOnDownload') === 'true';

      if (isUpgrade && notifyOnUpgrade) {
        console.log('[NotificationService] Upgrade notification triggered:', event.metadata?.title);
        await this.sendNotification('Media Upgraded', `Upgraded to higher quality release`, event.metadata);
      } else if (!isUpgrade && notifyOnDownload) {
        console.log('[NotificationService] Download notification triggered:', event.metadata?.title);
        await this.sendNotification('Download Complete', `Has been imported`, event.metadata);
      }

      // Check if this fulfills an active user request
      const notifyOnRequestAvailable = getSetting('notifyOnRequestAvailable') === 'true';
      if (notifyOnRequestAvailable && event.metadata?.title) {
        try {
          const db = require('../config/database');
          const cleanShowTitle = event.metadata.title.replace(/\s+S\d+E\d+.*$/i, '').trim();
          const reqItem = db.prepare(`
            SELECT r.*, u.username 
            FROM requests r 
            LEFT JOIN users u ON u.id = r.user_id 
            WHERE r.status IN ('pending', 'approved') 
              AND (r.title = ? COLLATE NOCASE OR r.title = ? COLLATE NOCASE)
            LIMIT 1
          `).get(event.metadata.title, cleanShowTitle);

          if (reqItem) {
            db.prepare("UPDATE requests SET status = 'available' WHERE id = ?").run(reqItem.id);
            const userMsg = reqItem.username ? ` (requested by ${reqItem.username})` : '';
            await this.sendNotification(
              'Requested Media Available',
              `"${reqItem.title}"${userMsg} has finished downloading and is now available to watch!`,
              { title: reqItem.title, poster: reqItem.poster_path || event.metadata.poster }
            );
          }
        } catch (reqErr) {
          console.error('[NotificationService] Request availability check error:', reqErr.message);
        }
      }
      return;
    }

    // 3. Security / Malware Quarantine
    const notifyOnQuarantine = getSetting('notifyOnQuarantine') === 'true';
    if (notifyOnQuarantine && (event.message === 'Malicious Download Quarantined' || event.message === 'Malicious Download Removed')) {
      const details = event.metadata?.message || 'Blocked fake release containing dangerous executable payload.';
      await this.sendNotification('Malicious Release Blocked', details, event.metadata);
      return;
    }

    // 4. Download / Import Failed
    const notifyOnDownloadFailed = getSetting('notifyOnDownloadFailed') === 'true';
    if (notifyOnDownloadFailed && (event.message === 'Download import failed' || event.message === 'Download failed')) {
      await this.sendNotification(
        'Download Failed',
        event.metadata?.error || 'A download failed or could not be imported.',
        event.metadata
      );
      return;
    }

    // 5. Subtitle Available
    const notifyOnSubtitle = getSetting('notifyOnSubtitle') === 'true';
    if (notifyOnSubtitle && (event.message?.startsWith('Subtitle downloaded') || event.message?.startsWith('Subtitle translated'))) {
      const action = event.message.includes('translated') ? 'Translated' : 'Downloaded';
      const lang = event.metadata?.language ? ` (${event.metadata.language.toUpperCase()})` : '';
      await this.sendNotification(
        'Subtitle Available',
        `Subtitle ${action}${lang} for ${event.metadata?.title || 'media'}`,
        event.metadata
      );
      return;
    }

    // 6. Low Disk Space Warning (throttled to at most once per 6 hours)
    const notifyOnLowDiskSpace = getSetting('notifyOnLowDiskSpace') === 'true';
    if (notifyOnLowDiskSpace && event.message === 'Low Disk Space Warning') {
      const diskKey = event.metadata?.path || 'root';
      const now = Date.now();
      if (!this._lastDiskWarning) this._lastDiskWarning = new Map();
      const lastWarn = this._lastDiskWarning.get(diskKey) || 0;
      if (now - lastWarn > 6 * 60 * 60 * 1000) {
        this._lastDiskWarning.set(diskKey, now);
        await this.sendNotification(
          'Low Disk Space Warning',
          event.metadata?.message || 'Storage volume is running low on free space.',
          event.metadata
        );
      }
      return;
    }

    // 7. Backup Complete / Failed
    const notifyOnBackup = getSetting('notifyOnBackup') === 'true';
    if (notifyOnBackup) {
      if (event.message === 'Database backup completed') {
        await this.sendNotification('Backup Complete', event.metadata?.message || 'Database backup created successfully.', event.metadata);
        return;
      }
      if (event.message === 'Database backup failed') {
        await this.sendNotification('Backup Failed', event.metadata?.error || 'Database backup failed.', event.metadata);
        return;
      }
    }

    // 8. System Health Issue (Circuit breaker / downloader disconnect)
    const notifyOnHealthIssue = getSetting('notifyOnHealthIssue') === 'true';
    if (notifyOnHealthIssue && (event.message === 'Indexer circuit breaker tripped' || event.message === 'Download client connection failed')) {
      await this.sendNotification(
        'System Health Issue',
        event.metadata?.message || event.message,
        event.metadata
      );
      return;
    }

    // 9. Scheduled Tasks (Automation tasks that ran)
    const notifyOnTaskRun = getSetting('notifyOnTaskRun') === 'true';
    if (notifyOnTaskRun && event.message === 'Scheduled task completed') {
      const taskName = event.metadata?.taskName || 'Automation Task';
      const duration = event.metadata?.duration ? ` (took ${event.metadata.duration})` : '';
      const detail = event.metadata?.message ? ` — ${event.metadata.message}` : '';
      await this.sendNotification(
        'Task Completed',
        `Task "${taskName}" completed successfully${duration}.${detail}`,
        event.metadata
      );
      return;
    }

    if (notifyOnTaskRun && (event.message === 'Scheduled task failed' || (typeof event.message === 'string' && event.message.startsWith('Task failed: ')))) {
      const taskName = event.metadata?.taskName || 'Automation Task';
      const err = event.metadata?.error || (typeof event.message === 'string' ? event.message.replace(/^Task failed:\s*/, '') : 'Unknown error');
      await this.sendNotification(
        'Task Failed',
        `Task "${taskName}" failed: ${err}`,
        event.metadata
      );
      return;
    }

    // 10. Failed Login Attempt
    const notifyOnFailedLogin = getSetting('notifyOnFailedLogin') === 'true';
    if (notifyOnFailedLogin && event.message === 'Failed login attempt') {
      const username = event.metadata?.username || 'Unknown';
      const ip = event.metadata?.ip ? ` from ${event.metadata.ip}` : '';
      const reason = event.metadata?.reason ? ` (${event.metadata.reason})` : '';
      const now = Date.now();
      const throttleKey = `${username}_${event.metadata?.ip || 'ip'}`;
      if (!this._lastFailedLoginTimes) this._lastFailedLoginTimes = {};
      const lastSent = this._lastFailedLoginTimes[throttleKey] || 0;
      if (now - lastSent < 60 * 1000) return; // 1 min throttle per user/IP
      this._lastFailedLoginTimes[throttleKey] = now;

      await this.sendNotification(
        'Failed Login Attempt',
        `Failed login attempt for user "${username}"${ip}${reason}.`,
        event.metadata
      );
      return;
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

    const pushoverAppToken = (overrides.pushoverAppToken !== undefined && !isMasked(overrides.pushoverAppToken)) 
      ? overrides.pushoverAppToken 
      : getSetting('pushoverAppToken');

    const pushoverUserKey = (overrides.pushoverUserKey !== undefined && !isMasked(overrides.pushoverUserKey)) 
      ? overrides.pushoverUserKey 
      : getSetting('pushoverUserKey');

    const itemTitle = metadata.title !== undefined ? metadata.title : null;
    const description = message;

    // Determine color for Discord embed
    let embedColor = 3447003; // Default blue
    if (title === 'Download Complete' || title === 'Backup Complete' || title === 'Request Approved' || title === 'Requested Media Available' || title === 'Task Completed') {
      embedColor = 3066993; // Green
    } else if (title === 'Media Grabbed') {
      embedColor = 15105570; // Orange
    } else if (title === 'Media Upgraded') {
      embedColor = 1752220; // Teal
    } else if (title === 'Playback Started' || title === 'Playback Finished') {
      embedColor = 5814783; // Purple
    } else if (title === 'New Request') {
      embedColor = 15277667; // Pink
    } else if (title === 'Subtitle Available') {
      embedColor = 10181046; // Cyan
    } else if (title === 'Low Disk Space Warning') {
      embedColor = 16705372; // Yellow
    } else if (title === 'Malicious Release Blocked' || title === 'Download Failed' || title === 'Request Denied' || title === 'Backup Failed' || title === 'System Health Issue' || title === 'Task Failed' || title === 'Failed Login Attempt') {
      embedColor = 15158332; // Red
    }

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
        if (title === 'Playback Started' || title === 'Playback Finished') {
          const fields = [];
          if (metadata.type) fields.push({ name: 'Type', value: metadata.type, inline: true });
          if (metadata.duration) fields.push({ name: 'Duration', value: metadata.duration, inline: true });
          if (metadata.player) fields.push({ name: 'Player', value: metadata.player, inline: true });
          if (metadata.server) fields.push({ name: 'Server', value: metadata.server, inline: true });
          if (fields.length > 0) embed.fields = fields;
        }

        let discordSent = false;
        // Try to attach poster image by downloading it internally
        if (metadata.poster && (title === 'Playback Started' || title === 'Playback Finished' || title === 'Download Complete' || title === 'Media Upgraded' || title === 'Requested Media Available')) {
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
                headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
                timeout: 10000
              });
              discordSent = true; // Sent with attachment, skip plain JSON post below
            }
          } catch (posterErr) {
            console.error('[NotificationService] Poster attachment failed, sending without:', posterErr.message);
          }
        } else if (title === 'Atlas' || title === 'Backup Complete' || title === 'Backup Failed' || title === 'Low Disk Space Warning' || title === 'System Health Issue') {
          try {
            const logoBuffer = this.getAtlasLogoBuffer();
            if (logoBuffer) {
              embed.thumbnail = { url: 'attachment://logo.png' };
              const boundary = `----AtlasDiscord${Date.now()}`;
              const payload = JSON.stringify({ embeds: [embed] });

              const parts = [];
              parts.push(Buffer.from(`--${boundary}\r\n`));
              parts.push(Buffer.from('Content-Disposition: form-data; name="payload_json"\r\n\r\n'));
              parts.push(Buffer.from(payload, 'utf-8'));
              parts.push(Buffer.from(`\r\n--${boundary}\r\n`));
              parts.push(Buffer.from('Content-Disposition: form-data; name="files[0]"; filename="logo.png"\r\n'));
              parts.push(Buffer.from('Content-Type: image/png\r\n\r\n'));
              parts.push(logoBuffer);
              parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

              const body = Buffer.concat(parts);
              await axios.post(discordUrl, body, {
                headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
                timeout: 10000
              });
              discordSent = true;
            }
          } catch (logoErr) {
            console.error('[NotificationService] Discord logo attachment failed, sending without:', logoErr.message);
          }
        }

        // Fallback: send without poster attachment
        if (!discordSent) {
          await axios.post(discordUrl, { embeds: [embed] }, { timeout: 10000 });
        }
      } catch (err) {
        console.error('[NotificationService] Discord error:', err.message);
      }
    }

    if (telegramToken && telegramChatId) {
      try {
        let caption = '';
        // Escape user-controlled text so Markdown parse errors can't break delivery
        const escMd = (t) => String(t ?? '').replace(/([_*`\\[])/g, '\\$1');

        if (title === 'Playback Started' && itemTitle) {
          caption = `🎬 *Playback Started*\n\n`;
          caption += `*${escMd(itemTitle)}*\n`;
          const cleanMessage = String(message || '').replace(/\*\*/g, '');
          caption += `${escMd(cleanMessage)}\n`;
          if (metadata.type) caption += `📺 ${metadata.type}`;
          if (metadata.duration) caption += ` · ⏱ ${metadata.duration}`;
          if (metadata.server) caption += `\n🖥 ${metadata.server}`;
        } else if (title === 'Playback Finished' && itemTitle) {
          caption = `⏹️ *Playback Finished*\n\n`;
          caption += `*${escMd(itemTitle)}*\n`;
          const cleanMessage = String(message || '').replace(/\*\*/g, '');
          caption += `${escMd(cleanMessage)}\n`;
          if (metadata.type) caption += `📺 ${metadata.type}`;
          if (metadata.server) caption += `\n🖥 ${metadata.server}`;
        } else if (title === 'Atlas') {
          caption = (itemTitle && itemTitle !== 'Atlas')
            ? `*Atlas — ${escMd(itemTitle)}*\n${escMd(description)}`
            : `*Atlas*\n${escMd(description)}`;
        } else {
          const emojiMap = {
            'Media Grabbed': '📥',
            'Download Complete': '✅',
            'Media Upgraded': '⚡',
            'Malicious Release Blocked': '🛡️',
            'Download Failed': '❌',
            'Subtitle Available': '💬',
            'New Request': '🙋',
            'Request Approved': '✨',
            'Request Denied': '🚫',
            'Requested Media Available': '🎉',
            'Low Disk Space Warning': '⚠️',
            'Backup Complete': '💾',
            'Backup Failed': '💾',
            'System Health Issue': '🚨',
            'Task Completed': '⏱️',
            'Task Failed': '❌',
            'Failed Login Attempt': '🔒'
          };
          const emoji = emojiMap[title] ? `${emojiMap[title]} ` : '';
          if (itemTitle) {
            caption = `${emoji}*${escMd(title)}*\n*${escMd(itemTitle)}*\n${escMd(description)}`;
          } else {
            caption = `${emoji}*${escMd(title)}*\n${escMd(description)}`;
          }
        }

        let telegramPhotoSent = false;
        let photoBuffer = null;
        let photoFilename = 'poster.png';

        // Try to attach poster for playback/downloads or Atlas logo for system messages
        const posterTitles = ['Playback Started', 'Playback Finished', 'Download Complete', 'Media Upgraded', 'Requested Media Available'];
        if (metadata.poster && posterTitles.includes(title)) {
          try {
            photoBuffer = await this.downloadPoster(metadata.poster);
            photoFilename = 'poster.png';
          } catch (posterErr) {
            console.error('[NotificationService] Telegram poster failed, sending text fallback:', posterErr.message);
          }
        } else if (title === 'Atlas' || title === 'Backup Complete' || title === 'Backup Failed' || title === 'Low Disk Space Warning' || title === 'System Health Issue' || title === 'Task Completed' || title === 'Task Failed' || title === 'Failed Login Attempt') {
          photoBuffer = this.getAtlasLogoBuffer();
          photoFilename = 'atlas-logo.png';
        }

        if (photoBuffer) {
          try {
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
            parts.push(Buffer.from(`Content-Disposition: form-data; name="photo"; filename="${photoFilename}"\r\n`));
            parts.push(Buffer.from('Content-Type: image/png\r\n\r\n'));
            parts.push(photoBuffer);
            parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

            const body = Buffer.concat(parts);
            await axios.post(`https://api.telegram.org/bot${telegramToken}/sendPhoto`, body, {
              headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
              timeout: 10000
            });
            telegramPhotoSent = true;
          } catch (photoErr) {
            console.error('[NotificationService] Telegram photo failed, sending text fallback:', photoErr.message);
          }
        }

        // Only send text fallback if photo was NOT sent
        if (!telegramPhotoSent) {
          await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            chat_id: telegramChatId,
            text: caption,
            parse_mode: 'Markdown'
          }, { timeout: 10000 });
        }
      } catch (err) {
        console.error('[NotificationService] Telegram notification failed:', err.response?.data || err.message);
      }
    }

    if (pushoverAppToken && pushoverUserKey) {
      try {
        const titleText = itemTitle || title;
        await axios.post('https://api.pushover.net/1/messages.json', null, {
          timeout: 10000,
          params: {
            token: pushoverAppToken,
            user: pushoverUserKey,
            title: titleText,
            message: description
          }
        });
      } catch (err) {
        console.error('[NotificationService] Pushover notification failed:', err.response?.data || err.message);
      }
    }
  }

  async downloadPoster(posterUrl) {
    const PORT = process.env.PORT || 3000;
    const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
    
    if (posterUrl.startsWith('http')) {
      const allowedDomains = ['image.tmdb.org'];
      try {
        const parsedUrl = new URL(posterUrl);
        if (!allowedDomains.includes(parsedUrl.hostname)) {
          throw new Error('Domain not allowed');
        }
        return await this.fetchBuffer(posterUrl);
      } catch (err) {
        throw new Error('Invalid poster URL', { cause: err });
      }
    } else {
      if (!posterUrl.startsWith('/api/watcher/image') && !posterUrl.startsWith('/api/images')) {
        throw new Error('Invalid relative poster path');
      }
      const url = `${BASE_URL}${posterUrl}`;
      return await this.fetchBuffer(url);
    }
  }

  async fetchBuffer(url) {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
    return Buffer.from(response.data);
  }

  async testNotification(triggerOrOverrides = 'default', maybeOverrides = {}) {
    let trigger = 'default';
    let overrides = {};

    if (typeof triggerOrOverrides === 'string') {
      trigger = triggerOrOverrides;
      overrides = maybeOverrides || {};
    } else if (typeof triggerOrOverrides === 'object' && triggerOrOverrides !== null) {
      overrides = triggerOrOverrides;
      trigger = overrides.trigger || 'default';
    }

    const samples = {
      notifyOnGrab: {
        title: 'Media Grabbed',
        message: 'Grabbed: Inception (2010) [1080p Bluray x264]',
        metadata: { title: 'Inception (2010)', type: 'movie' }
      },
      notifyOnDownload: {
        title: 'Download Complete',
        message: 'Imported: Stranger Things S04E01 into library',
        metadata: { title: 'Stranger Things S04E01', type: 'tv' }
      },
      notifyOnUpgrade: {
        title: 'Media Upgraded',
        message: 'Upgraded: Interstellar (2014) from 720p to 1080p REMUX',
        metadata: { title: 'Interstellar (2014)', type: 'movie' }
      },
      notifyOnDownloadFailed: {
        title: 'Download Failed',
        message: 'Download import failed: Dune (2021) — CRC mismatch in archive',
        metadata: { title: 'Dune (2021)', type: 'movie' }
      },
      notifyOnPlaybackStart: {
        title: 'Playback Started',
        message: 'alice started watching Breaking Bad S01E01 on Plex Web',
        metadata: { title: 'Breaking Bad S01E01', type: 'Episode', server: 'Plex', player: 'Plex Web' }
      },
      notifyOnPlaybackStop: {
        title: 'Playback Finished',
        message: 'alice stopped watching Breaking Bad S01E01 on Plex Web at 85%',
        metadata: { title: 'Breaking Bad S01E01', type: 'Episode', server: 'Plex', player: 'Plex Web' }
      },
      notifyOnRequest: {
        title: 'New Request',
        message: 'alice requested Oppenheimer (2023)',
        metadata: { title: 'Oppenheimer (2023)', type: 'movie' }
      },
      notifyOnRequestStatus: {
        title: 'Request Approved',
        message: 'Request for "The Matrix (1999)" by alice was approved',
        metadata: { title: 'The Matrix (1999)', type: 'movie' }
      },
      notifyOnRequestAvailable: {
        title: 'Requested Media Available',
        message: 'Requested media "The Batman (2022)" has finished downloading and is ready to watch!',
        metadata: { title: 'The Batman (2022)', type: 'movie' }
      },
      notifyOnFailedLogin: {
        title: 'Failed Login Attempt',
        message: 'Failed login attempt for user "admin" from 192.168.1.42 (Invalid credentials).',
        metadata: { username: 'admin', ip: '192.168.1.42' }
      },
      notifyOnQuarantine: {
        title: 'Malicious Release Blocked',
        message: 'Blocked release containing dangerous executable: setup.exe',
        metadata: { release: 'Movie.2024.1080p-FakeGroup', file: 'setup.exe' }
      },
      notifyOnSubtitle: {
        title: 'Subtitle Available',
        message: 'Downloaded English subtitles for Gladiator (2000)',
        metadata: { title: 'Gladiator (2000)' }
      },
      notifyOnLowDiskSpace: {
        title: 'Low Disk Space Warning',
        message: 'Storage volume /media is low on disk space: 14.2% remaining (42 GB free).',
        metadata: { path: '/media', freePercent: 14.2 }
      },
      notifyOnBackup: {
        title: 'Backup Complete',
        message: 'Atlas SQLite database backup created successfully: database-backup.sqlite',
        metadata: {}
      },
      notifyOnHealthIssue: {
        title: 'System Health Issue',
        message: 'Indexer circuit breaker tripped: 3 consecutive timeouts on Prowlarr',
        metadata: { message: 'Indexer circuit breaker tripped: 3 consecutive timeouts on Prowlarr' }
      },
      notifyOnTaskRun: {
        title: 'Task Completed',
        message: 'Task "Torrent Search Cycle" completed successfully (took 1.4s).',
        metadata: { taskName: 'Torrent Search Cycle', duration: '1.4s' }
      }
    };

    const target = samples[trigger] || {
      title: 'Atlas',
      message: 'This is a test notification from Atlas Media Manager.',
      metadata: { title: 'Test Notification' }
    };

    await this.sendNotification(target.title, target.message, target.metadata, overrides);
  }
}

module.exports = new NotificationService();
