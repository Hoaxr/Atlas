const axios = require('axios');
const db = require('../config/database');
const eventBus = require('./eventBus');

class MediaServerService {
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
    if (event.message === 'Download complete') {
      // Trigger media server scans
      const path = event.metadata?.destinationPath; // We'll need to make sure mediaManagementService emits this
      await this.triggerScans(path);
    }
  }

  async triggerScans(path) {
    const plexUrl = this.getSetting('plexUrl');
    const plexToken = this.getSetting('plexToken');
    const jellyfinUrl = this.getSetting('jellyfinUrl');
    const jellyfinApiKey = this.getSetting('jellyfinApiKey');
    const embyUrl = this.getSetting('embyUrl');
    const embyApiKey = this.getSetting('embyApiKey');

    if (plexUrl && plexToken) {
      try {
        // Simple partial scan if path is provided, otherwise full scan.
        // The Plex API for partial scan is: GET /library/sections/all/refresh?path=<encoded_path>&X-Plex-Token=<token>
        let url = `${plexUrl}/library/sections/all/refresh?X-Plex-Token=${plexToken}`;
        if (path) {
          url += `&path=${encodeURIComponent(path)}`;
        }
        await axios.get(url);
        console.log('[MediaServerService] Triggered Plex scan');
      } catch (err) {
        console.error('[MediaServerService] Plex scan failed:', err.message);
      }
    }

    if (jellyfinUrl && jellyfinApiKey) {
      try {
        // Jellyfin API: POST /Library/Refresh
        await axios.post(`${jellyfinUrl}/Library/Refresh`, {}, {
          headers: {
            'X-Emby-Token': jellyfinApiKey
          }
        });
        console.log('[MediaServerService] Triggered Jellyfin scan');
      } catch (err) {
        console.error('[MediaServerService] Jellyfin scan failed:', err.message);
      }
    }

    if (embyUrl && embyApiKey) {
      try {
        // Emby API: POST /Library/Refresh
        await axios.post(`${embyUrl}/Library/Refresh`, {}, {
          headers: {
            'X-Emby-Token': embyApiKey
          }
        });
        console.log('[MediaServerService] Triggered Emby scan');
      } catch (err) {
        console.error('[MediaServerService] Emby scan failed:', err.message);
      }
    }
  }
}

module.exports = new MediaServerService();
