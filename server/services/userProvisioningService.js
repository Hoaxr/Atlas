const axios = require('axios');
const db = require('../config/database');

class UserProvisioningService {
  
  getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  async provisionUser(username, password, email) {
    const jellyfinUrl = this.getSetting('jellyfinUrl');
    const jellyfinApiKey = this.getSetting('jellyfinApiKey');
    const embyUrl = this.getSetting('embyUrl');
    const embyApiKey = this.getSetting('embyApiKey');
    const plexUrl = this.getSetting('plexUrl');
    const plexToken = this.getSetting('plexToken');

    const results = {
      jellyfin: 'skipped',
      emby: 'skipped',
      plex: 'skipped'
    };

    if (jellyfinUrl && jellyfinApiKey) {
      try {
        await axios.post(`${jellyfinUrl}/Users/New`, {
          Name: username,
          Password: password
        }, {
          headers: { 'X-Emby-Token': jellyfinApiKey }
        });
        results.jellyfin = 'success';
        console.log(`[UserProvisioning] Created user ${username} in Jellyfin.`);
      } catch (err) {
        console.error(`[UserProvisioning] Failed to create user in Jellyfin:`, err.response?.data || err.message);
        results.jellyfin = 'failed';
      }
    }

    if (embyUrl && embyApiKey) {
      try {
        await axios.post(`${embyUrl}/Users/New`, {
          Name: username,
          Password: password
        }, {
          headers: { 'X-Emby-Token': embyApiKey }
        });
        results.emby = 'success';
        console.log(`[UserProvisioning] Created user ${username} in Emby.`);
      } catch (err) {
        console.error(`[UserProvisioning] Failed to create user in Emby:`, err.response?.data || err.message);
        results.emby = 'failed';
      }
    }

    if (plexUrl && plexToken) {
      if (!email) {
        results.plex = 'failed (email required)';
      } else {
        try {
          // 1. Get machineIdentifier
          const identityRes = await axios.get(`${plexUrl}/identity`, {
            headers: { 'Accept': 'application/json' }
          });
          const machineIdentifier = identityRes.data?.MediaContainer?.machineIdentifier;

          if (!machineIdentifier) throw new Error('Could not retrieve machineIdentifier from Plex');

          // 2. Get all library sections
          const sectionsRes = await axios.get(`${plexUrl}/library/sections`, {
            headers: { 'X-Plex-Token': plexToken, 'Accept': 'application/json' }
          });
          const directories = sectionsRes.data?.MediaContainer?.Directory || [];
          const sectionIds = directories.map(d => d.key || d.ratingKey).filter(Boolean);

          // 3. Send invite to plex.tv
          await axios.post('https://plex.tv/api/v2/shared_servers', {
            server_id: machineIdentifier,
            shared_server: {
              library_section_ids: sectionIds,
              invited_email: email
            }
          }, {
            headers: {
              'X-Plex-Token': plexToken,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          });

          results.plex = 'success';
          console.log(`[UserProvisioning] Invited ${email} to Plex server.`);
        } catch (err) {
          console.error(`[UserProvisioning] Failed to invite user to Plex:`, err.response?.data || err.message);
          results.plex = 'failed';
        }
      }
    }

    return results;
  }

  async importUsers() {
    const jellyfinUrl = this.getSetting('jellyfinUrl');
    const jellyfinApiKey = this.getSetting('jellyfinApiKey');
    const embyUrl = this.getSetting('embyUrl');
    const embyApiKey = this.getSetting('embyApiKey');
    const plexToken = this.getSetting('plexToken');

    if ((!jellyfinUrl || !jellyfinApiKey) && (!embyUrl || !embyApiKey) && !plexToken) {
      throw new Error('No media servers configured. Please configure Jellyfin, Emby, or Plex in Settings.');
    }

    const importedUsers = new Set();

    // Fetch from Jellyfin
    if (jellyfinUrl && jellyfinApiKey) {
      try {
        const res = await axios.get(`${jellyfinUrl}/Users`, {
          headers: { 'X-Emby-Token': jellyfinApiKey }
        });
        if (Array.isArray(res.data)) {
          res.data.forEach(u => u.Name && importedUsers.add(u.Name));
        }
      } catch (err) {
        console.error('[UserProvisioning] Failed to fetch users from Jellyfin:', err.message);
      }
    }

    // Fetch from Emby
    if (embyUrl && embyApiKey) {
      try {
        const res = await axios.get(`${embyUrl}/Users`, {
          headers: { 'X-Emby-Token': embyApiKey }
        });
        if (Array.isArray(res.data)) {
          res.data.forEach(u => u.Name && importedUsers.add(u.Name));
        }
      } catch (err) {
        console.error('[UserProvisioning] Failed to fetch users from Emby:', err.message);
      }
    }

    // Fetch from Plex
    if (plexToken) {
      try {
        const res = await axios.get('https://plex.tv/api/users', {
          headers: {
            'X-Plex-Token': plexToken,
            'Accept': 'application/json'
          }
        });
        
        // The Plex API returns JSON differently depending on the exact endpoint and Accept header.
        // Usually it's in res.data.MediaContainer.User array, but we need to check carefully.
        const users = res.data?.MediaContainer?.User || [];
        // Alternatively, if it returns XML and parses differently, we'll try to extract appropriately.
        // We look for 'username' or 'title'
        if (Array.isArray(users)) {
          users.forEach(u => {
            const name = u.username || u.title;
            if (name) importedUsers.add(name);
          });
        } else if (res.data && Array.isArray(res.data)) {
            // fallback
            res.data.forEach(u => {
                const name = u.username || u.title || u.Name;
                if (name) importedUsers.add(name);
            });
        }
      } catch (err) {
        console.error('[UserProvisioning] Failed to fetch users from Plex:', err.message);
      }
    }

    // Save to database
    let importCount = 0;
    const defaultPassword = 'atlas123';

    for (const username of importedUsers) {
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (!existing) {
        db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(
          username, defaultPassword, 'user'
        );
        importCount++;
      }
    }

    return { importedCount: importCount, totalDiscovered: importedUsers.size };
  }
}

module.exports = new UserProvisioningService();
