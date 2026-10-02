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
          headers: {
            'Authorization': `MediaBrowser Token="${jellyfinApiKey}"`,
            'X-Emby-Token': jellyfinApiKey
          }
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
        const cleanUrl = jellyfinUrl.trim().replace(/\/$/, '');
        const res = await axios.get(`${cleanUrl}/Users`, {
          headers: {
            'Authorization': `MediaBrowser Token="${jellyfinApiKey}"`,
            'X-Emby-Token': jellyfinApiKey
          },
          timeout: 5000
        });
        if (Array.isArray(res.data)) {
          res.data.forEach(u => {
            if (u.Name && !importedUsers.has(u.Name)) {
              importedUsers.set(u.Name, { origin: 'jellyfin', email: null });
            }
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
        const cleanUrl = embyUrl.trim().replace(/\/$/, '');
        const res = await axios.get(`${cleanUrl}/Users`, {
          headers: { 'X-Emby-Token': embyApiKey },
          timeout: 5000
        });
        if (Array.isArray(res.data)) {
          res.data.forEach(u => {
            if (u.Name && !importedUsers.has(u.Name)) {
              importedUsers.set(u.Name, { origin: 'emby', email: null });
            }
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
        
        if (typeof res.data === 'string') {
          // XML fallback: extract username/title and email from <User ...> tags
          const userMatches = res.data.matchAll(/<User\b[^>]*(?:\busername="([^"]+)"|\btitle="([^"]+)")(?:\s+[^>]*\bemail="([^"]+)")?/gi);
          for (const m of userMatches) {
            const name = m[1] || m[2];
            const email = m[3] || null;
            if (name && !importedUsers.has(name)) {
              importedUsers.set(name, { origin: 'plex', email });
            }
          }
        } else if (res.data) {
          const users = res.data?.MediaContainer?.User || (Array.isArray(res.data) ? res.data : []);
          if (Array.isArray(users)) {
            users.forEach(u => {
              const name = u.username || u.title || u.Name;
              if (name && !importedUsers.has(name)) {
                importedUsers.set(name, { origin: 'plex', email: u.email || null });
              }
            });
          }
        }

        // Also fetch the Plex account owner
        try {
          const ownerRes = await axios.get('https://plex.tv/api/v2/user', {
            headers: { 'X-Plex-Token': plexToken, 'Accept': 'application/json' },
            timeout: 5000
          });
          const ownerName = ownerRes.data?.username || ownerRes.data?.title;
          if (ownerName && !importedUsers.has(ownerName)) {
            importedUsers.set(ownerName, { origin: 'plex', email: ownerRes.data?.email || null });
          }
        } catch { /* non-critical */ }

        // Also fetch local Plex server accounts if plexUrl is configured
        const plexUrl = getSetting('plexUrl')?.trim()?.replace(/\/$/, '');
        if (plexUrl) {
          try {
            const localRes = await axios.get(`${plexUrl}/accounts`, {
              headers: { 'X-Plex-Token': plexToken, 'Accept': 'application/json' },
              timeout: 5000
            });
            const localAccounts = localRes.data?.MediaContainer?.Account || [];
            if (Array.isArray(localAccounts)) {
              localAccounts.forEach(a => {
                const name = a.name || a.title;
                if (name && !importedUsers.has(name)) {
                  importedUsers.set(name, { origin: 'plex', email: null });
                }
              });
            }
          } catch { /* non-critical */ }
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
    const crypto = require('crypto');

    for (const [username, info] of importedUsers.entries()) {
      const origin = typeof info === 'string' ? info : info.origin;
      const email = typeof info === 'object' ? info.email : null;

      try {
        const existing = db.prepare('SELECT id, username, origin, email FROM users WHERE LOWER(username) = LOWER(?)').get(username);
        if (!existing) {
          // Random unguessable hash ensures account can only authenticate via media server SSO / OAuth
          const randomPass = crypto.randomBytes(32).toString('hex');
          const defaultPassword = await bcrypt.hash(randomPass, 12);
          db.prepare('INSERT INTO users (username, password, email, role, origin) VALUES (?, ?, ?, ?, ?)').run(
            username, defaultPassword, email || null, 'user', origin
          );
          importCount++;
        } else {
          // If the user already exists locally in Atlas without a media server origin, link their origin
          if (existing.origin === 'atlas' || !existing.origin) {
            db.prepare('UPDATE users SET origin = ?, email = COALESCE(email, ?) WHERE id = ?').run(origin, email, existing.id);
          }
        }
      } catch (userErr) {
        console.error(`[UserProvisioning] Failed to import user "${username}":`, userErr.message);
      }
    }

    return { importedCount: importCount, totalDiscovered: importedUsers.size };
  }
}

module.exports = new UserProvisioningService();
