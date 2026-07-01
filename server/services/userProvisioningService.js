const axios = require('axios');
const bcrypt = require('bcrypt');
const db = require('../config/database');
const { getSetting } = require('../utils/settings');

class UserProvisioningService {
  
  async provisionUser(username, password, email) {
    const jellyfinUrl = getSetting('jellyfinUrl');
    const jellyfinApiKey = getSetting('jellyfinApiKey');
    const embyUrl = getSetting('embyUrl');
    const embyApiKey = getSetting('embyApiKey');
    const plexUrl = getSetting('plexUrl');
    const plexToken = getSetting('plexToken');

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
    const jellyfinUrl = getSetting('jellyfinUrl');
    const jellyfinApiKey = getSetting('jellyfinApiKey');
    const embyUrl = getSetting('embyUrl');
    const embyApiKey = getSetting('embyApiKey');
    const plexToken = getSetting('plexToken');

    if ((!jellyfinUrl || !jellyfinApiKey) && (!embyUrl || !embyApiKey) && !plexToken) {
      throw new Error('No media servers configured. Please configure Jellyfin, Emby, or Plex in Settings.');
    }

    const importedUsers = new Map();
    let successCount = 0;
    const errors = [];

    // Fetch from Jellyfin
    if (jellyfinUrl && jellyfinApiKey) {
      try {
        const res = await axios.get(`${jellyfinUrl}/Users`, {
          headers: { 'X-Emby-Token': jellyfinApiKey },
          timeout: 5000
        });
        if (Array.isArray(res.data)) {
          res.data.forEach(u => {
            if (u.Name && !importedUsers.has(u.Name)) importedUsers.set(u.Name, 'jellyfin');
          });
          successCount++;
        }
      } catch (err) {
        errors.push(`Jellyfin: ${err.message}`);
        console.error('[UserProvisioning] Failed to fetch users from Jellyfin:', err.message);
      }
    }

    // Fetch from Emby
    if (embyUrl && embyApiKey) {
      try {
        const res = await axios.get(`${embyUrl}/Users`, {
          headers: { 'X-Emby-Token': embyApiKey },
          timeout: 5000
        });
        if (Array.isArray(res.data)) {
          res.data.forEach(u => {
            if (u.Name && !importedUsers.has(u.Name)) importedUsers.set(u.Name, 'emby');
          });
          successCount++;
        }
      } catch (err) {
        errors.push(`Emby: ${err.message}`);
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
          },
          timeout: 5000
        });
        
        // The Plex API returns JSON differently depending on the exact endpoint and Accept header.
        // Usually it's in res.data.MediaContainer.User array, but we need to check carefully.
        const users = res.data?.MediaContainer?.User || [];
        // Alternatively, if it returns XML and parses differently, we'll try to extract appropriately.
        // We look for 'username' or 'title'
        if (Array.isArray(users)) {
          users.forEach(u => {
            const name = u.username || u.title;
            if (name && !importedUsers.has(name)) importedUsers.set(name, 'plex');
          });
        } else if (res.data && Array.isArray(res.data)) {
            // fallback
            res.data.forEach(u => {
                const name = u.username || u.title || u.Name;
                if (name && !importedUsers.has(name)) importedUsers.set(name, 'plex');
            });
        }
        successCount++;
      } catch (err) {
        errors.push(`Plex: ${err.message}`);
        console.error('[UserProvisioning] Failed to fetch users from Plex:', err.message);
      }
    }

    if (successCount === 0 && errors.length > 0) {
      throw new Error(`Failed to connect to media servers: ${errors.join(', ')}`);
    }

    // Save to database
    let importCount = 0;
    const defaultPassword = await bcrypt.hash('atlas123', 12);

    for (const [username, origin] of importedUsers.entries()) {
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (!existing) {
        db.prepare('INSERT INTO users (username, password, role, origin) VALUES (?, ?, ?, ?)').run(
          username, defaultPassword, 'user', origin
        );
        importCount++;
      }
    }

    return { importedCount: importCount, totalDiscovered: importedUsers.size };
  }
}

module.exports = new UserProvisioningService();
