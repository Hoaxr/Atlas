const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/database');
const { getSetting, setSetting } = require('../utils/settings');
const downloadClientService = require('../services/downloadClientService');

router.get('/', (req, res, next) => {
  try {
    const tmdbApiKey = getSetting('tmdbApiKey');
    const traktClientId = getSetting('traktClientId');
    const osApiKey = getSetting('osApiKey');
    const subdlApiKey = getSetting('subdlApiKey');
    const subsourceApiKey = getSetting('subsourceApiKey');
    const geminiApiKey = getSetting('geminiApiKey');
    const deepseekApiKey = getSetting('deepseekApiKey');
    const claudeApiKey = getSetting('claudeApiKey');
    const prowlarrUrl = getSetting('prowlarrUrl');
    const prowlarrApiKey = getSetting('prowlarrApiKey');
    const translationProvider = getSetting('translationProvider') || 'googleTranslate';
    const targetLang = getSetting('targetLang') || 'Dutch';
    let targetLangs = [];
    try { targetLangs = JSON.parse(getSetting('targetLangs') || '[]'); } catch { /* ignore */ }
    let providerLangs = ['en'];
    try { providerLangs = JSON.parse(getSetting('providerLangs') || '["en"]'); } catch { /* ignore */ }
    const autoTranslate = getSetting('autoTranslate') === 'true';
    const preferNativeBeforeTranslate = getSetting('preferNativeBeforeTranslate') === 'true';
    const traktWatchedSync = getSetting('traktWatchedSync') === 'true';
    const traktAccessToken = getSetting('traktAccessToken');
    const traktClientSecret = getSetting('traktClientSecret');
    
    // Naming config
    const renameMovies = getSetting('renameMovies') !== 'false'; // default true
    const replaceIllegalCharacters = getSetting('replaceIllegalCharacters') !== 'false'; // default true
    const colonReplacement = getSetting('colonReplacement') || 'dash';
    const standardMovieFormat = getSetting('standardMovieFormat') || '{Movie Title} ({Release Year})';
    const renameEpisodes = getSetting('renameEpisodes') !== 'false';
    const standardEpisodeFormat = getSetting('standardEpisodeFormat') || '{Show Title} - S{Season}E{Episode} - {Episode Title}';
    const seasonFolderFormat = getSetting('seasonFolderFormat') || 'Season {Season Number}';
    
    // Download Client Preferences
    const removeCompletedDownloads = getSetting('removeCompletedDownloads') === 'true'; // default false
    const deleteTorrentFiles = getSetting('deleteTorrentFiles') === 'true'; // default false
    const hideCompletedDownloads = getSetting('hideCompletedDownloads') !== 'false'; // default true
    
    let downloadPathMapping = ['', ''];
    try { downloadPathMapping = JSON.parse(getSetting('downloadPathMapping') || '["", ""]'); } catch { /* ignore */ }
    
    const defaultQualityProfileId = getSetting('defaultQualityProfileId');
    
    const mask = (val) => val ? '*'.repeat(val.length) : '';
    
    const clients = db.prepare('SELECT id, name, host, port, type, username FROM download_clients').all();
    const profiles = db.prepare('SELECT * FROM quality_profiles').all();
    const libraryPaths = db.prepare('SELECT * FROM library_paths').all();

    res.json({
      status: 'success',
      data: {
        tmdbApiKey: mask(tmdbApiKey),
        traktClientId: mask(traktClientId),
        osApiKey: mask(osApiKey),
        subdlApiKey: mask(subdlApiKey),
        subsourceApiKey: mask(subsourceApiKey),
        geminiApiKey: mask(geminiApiKey),
        deepseekApiKey: mask(deepseekApiKey),
        claudeApiKey: mask(claudeApiKey),
        prowlarrUrl,
        prowlarrApiKey: mask(prowlarrApiKey),
        translationProvider,
        targetLang,
        targetLangs,
        providerLangs,
        autoTranslate,
        preferNativeBeforeTranslate,
        traktWatchedSync,
        traktAccessToken: mask(traktAccessToken),
        traktClientSecret: mask(traktClientSecret),
        renameMovies,
        replaceIllegalCharacters,
        colonReplacement,
        standardMovieFormat,
        renameEpisodes,
        standardEpisodeFormat,
        seasonFolderFormat,
        removeCompletedDownloads,
        deleteTorrentFiles,
        hideCompletedDownloads,
        downloadPathMapping,
        defaultQualityProfileId: defaultQualityProfileId ? parseInt(defaultQualityProfileId) : null,
        clients,
        profiles,
        libraryPaths,
        authEnabled: getSetting('authEnabled') || 'false',
        authBypassLocalhost: getSetting('authBypassLocalhost') || 'true',
        authUsername: getSetting('authUsername'),
        plexUrl: getSetting('plexUrl'),
        plexToken: mask(getSetting('plexToken')),
        jellyfinUrl: getSetting('jellyfinUrl'),
        jellyfinApiKey: mask(getSetting('jellyfinApiKey')),
        embyUrl: getSetting('embyUrl'),
        embyApiKey: mask(getSetting('embyApiKey')),
        discordWebhookUrl: getSetting('discordWebhookUrl'),
        telegramBotToken: mask(getSetting('telegramBotToken')),
        telegramChatId: getSetting('telegramChatId'),
        notifyOnGrab: getSetting('notifyOnGrab') || 'false',
        notifyOnDownload: getSetting('notifyOnDownload') || 'false',
        notifyOnPlaybackStart: getSetting('notifyOnPlaybackStart') || 'false'
      }
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { tmdbApiKey, traktClientId, osApiKey, subdlApiKey, subsourceApiKey, geminiApiKey, deepseekApiKey, claudeApiKey, prowlarrUrl, prowlarrApiKey, translationProvider, targetLang, targetLangs, providerLangs, autoTranslate, preferNativeBeforeTranslate, traktWatchedSync, traktAccessToken, traktClientSecret, renameMovies, replaceIllegalCharacters, colonReplacement, standardMovieFormat, renameEpisodes, standardEpisodeFormat, seasonFolderFormat, removeCompletedDownloads, deleteTorrentFiles, hideCompletedDownloads, downloadPathMapping, defaultQualityProfileId, authEnabled, authBypassLocalhost, authUsername, authPassword, plexUrl, plexToken, jellyfinUrl, jellyfinApiKey, embyUrl, embyApiKey, discordWebhookUrl, telegramBotToken, telegramChatId, notifyOnGrab, notifyOnDownload, notifyOnPlaybackStart } = req.body;
    
    const isMasked = (val) => val && /^\*+$/.test(val);
    
    if (tmdbApiKey !== undefined && !isMasked(tmdbApiKey)) setSetting('tmdbApiKey', tmdbApiKey);
    if (traktClientId !== undefined && !isMasked(traktClientId)) setSetting('traktClientId', traktClientId);
    
    if (defaultQualityProfileId !== undefined) {
      setSetting('defaultQualityProfileId', defaultQualityProfileId);
      if (defaultQualityProfileId !== null) {
        db.prepare('UPDATE movies SET quality_profile_id = ? WHERE quality_profile_id IS NULL').run(defaultQualityProfileId);
        db.prepare('UPDATE shows SET quality_profile_id = ? WHERE quality_profile_id IS NULL').run(defaultQualityProfileId);
      }
    }
    if (osApiKey !== undefined && !isMasked(osApiKey)) setSetting('osApiKey', osApiKey);
    if (subdlApiKey !== undefined && !isMasked(subdlApiKey)) setSetting('subdlApiKey', subdlApiKey);
    if (subsourceApiKey !== undefined && !isMasked(subsourceApiKey)) setSetting('subsourceApiKey', subsourceApiKey);
    if (geminiApiKey !== undefined && !isMasked(geminiApiKey)) setSetting('geminiApiKey', geminiApiKey);
    if (deepseekApiKey !== undefined && !isMasked(deepseekApiKey)) setSetting('deepseekApiKey', deepseekApiKey);
    if (claudeApiKey !== undefined && !isMasked(claudeApiKey)) setSetting('claudeApiKey', claudeApiKey);
    if (prowlarrUrl !== undefined) setSetting('prowlarrUrl', prowlarrUrl);
    if (prowlarrApiKey !== undefined && !isMasked(prowlarrApiKey)) setSetting('prowlarrApiKey', prowlarrApiKey);
    if (translationProvider !== undefined) setSetting('translationProvider', translationProvider);
    if (targetLang !== undefined) setSetting('targetLang', targetLang);
    if (targetLangs !== undefined) setSetting('targetLangs', JSON.stringify(targetLangs));
    if (providerLangs !== undefined) setSetting('providerLangs', JSON.stringify(providerLangs));
    if (autoTranslate !== undefined) setSetting('autoTranslate', autoTranslate ? 'true' : 'false');
    if (preferNativeBeforeTranslate !== undefined) setSetting('preferNativeBeforeTranslate', preferNativeBeforeTranslate ? 'true' : 'false');
    if (traktWatchedSync !== undefined) setSetting('traktWatchedSync', traktWatchedSync ? 'true' : 'false');
    if (traktAccessToken !== undefined && !isMasked(traktAccessToken)) setSetting('traktAccessToken', traktAccessToken);
    if (traktClientSecret !== undefined && !isMasked(traktClientSecret)) setSetting('traktClientSecret', traktClientSecret);
    
    if (renameMovies !== undefined) setSetting('renameMovies', renameMovies ? 'true' : 'false');
    if (replaceIllegalCharacters !== undefined) setSetting('replaceIllegalCharacters', replaceIllegalCharacters ? 'true' : 'false');
    if (colonReplacement !== undefined) setSetting('colonReplacement', colonReplacement);
    if (standardMovieFormat !== undefined) setSetting('standardMovieFormat', standardMovieFormat);
    if (renameEpisodes !== undefined) setSetting('renameEpisodes', renameEpisodes ? 'true' : 'false');
    if (standardEpisodeFormat !== undefined) setSetting('standardEpisodeFormat', standardEpisodeFormat);
    if (seasonFolderFormat !== undefined) setSetting('seasonFolderFormat', seasonFolderFormat);
    
    if (removeCompletedDownloads !== undefined) setSetting('removeCompletedDownloads', removeCompletedDownloads ? 'true' : 'false');
    if (deleteTorrentFiles !== undefined) setSetting('deleteTorrentFiles', deleteTorrentFiles ? 'true' : 'false');
    if (hideCompletedDownloads !== undefined) setSetting('hideCompletedDownloads', hideCompletedDownloads ? 'true' : 'false');
    if (downloadPathMapping !== undefined) setSetting('downloadPathMapping', JSON.stringify(downloadPathMapping));

    if (authEnabled !== undefined) setSetting('authEnabled', authEnabled);
    if (authBypassLocalhost !== undefined) setSetting('authBypassLocalhost', authBypassLocalhost);
    if (authUsername !== undefined) setSetting('authUsername', authUsername);
    if (authPassword !== undefined) {
      setSetting('authPassword', authPassword);
      // Create or update the admin user with a hashed password
      const existingUser = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
      const hashed = await bcrypt.hash(authPassword, 10);
      if (existingUser) {
        const username = authUsername !== undefined ? authUsername : getSetting('authUsername');
        db.prepare('UPDATE users SET password = ?, username = ? WHERE id = ?').run(hashed, username, existingUser.id);
      } else {
        const username = authUsername !== undefined ? authUsername : 'admin';
        db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')").run(username, hashed);
      }
    }
    
    if (plexUrl !== undefined) setSetting('plexUrl', plexUrl);
    if (plexToken !== undefined && !isMasked(plexToken)) setSetting('plexToken', plexToken);
    if (jellyfinUrl !== undefined) setSetting('jellyfinUrl', jellyfinUrl);
    if (jellyfinApiKey !== undefined && !isMasked(jellyfinApiKey)) setSetting('jellyfinApiKey', jellyfinApiKey);
    if (embyUrl !== undefined) setSetting('embyUrl', embyUrl);
    if (embyApiKey !== undefined && !isMasked(embyApiKey)) setSetting('embyApiKey', embyApiKey);
    
    if (discordWebhookUrl !== undefined) setSetting('discordWebhookUrl', discordWebhookUrl);
    if (telegramBotToken !== undefined && !isMasked(telegramBotToken)) setSetting('telegramBotToken', telegramBotToken);
    if (telegramChatId !== undefined) setSetting('telegramChatId', telegramChatId);
    if (notifyOnGrab !== undefined) setSetting('notifyOnGrab', notifyOnGrab);
    if (notifyOnDownload !== undefined) setSetting('notifyOnDownload', notifyOnDownload);
    if (notifyOnPlaybackStart !== undefined) setSetting('notifyOnPlaybackStart', notifyOnPlaybackStart);
    
    res.json({ status: 'success', message: 'Settings saved successfully' });
  } catch (e) {
    next(e);
  }
});

router.post('/prowlarr/test', async (req, res) => {
  try {
    const { url, apiKey } = req.body;
    if (!url || !apiKey) return res.status(400).json({ status: 'error', message: 'Missing URL or API Key' });

    let finalApiKey = apiKey;
    const isMasked = (val) => val && /^\*+$/.test(val);
    if (isMasked(apiKey)) {
      finalApiKey = getSetting('prowlarrApiKey') || apiKey;
    }

    const axios = require('axios');
    const base = url.replace(/\/$/, '');
    const result = await axios.get(`${base}/api/v1/system/status`, {
      headers: { 'X-Api-Key': finalApiKey },
      signal: AbortSignal.timeout(5000)
    });
    
    if (result.status === 200) {
      res.json({ status: 'success', message: 'Connected to Prowlarr successfully' });
    } else {
      res.status(400).json({ status: 'error', message: 'Failed to connect to Prowlarr' });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/media-server/test', async (req, res) => {
  try {
    const { type, url, apiKey } = req.body;
    if (!type || !url || !apiKey) return res.status(400).json({ status: 'error', message: 'Missing type, URL, or API Key' });

    let finalApiKey = apiKey;
    const isMasked = (val) => val && /^\*+$/.test(val);
    if (isMasked(apiKey)) {
      if (type === 'plex') finalApiKey = getSetting('plexToken') || apiKey;
      else if (type === 'jellyfin') finalApiKey = getSetting('jellyfinApiKey') || apiKey;
      else if (type === 'emby') finalApiKey = getSetting('embyApiKey') || apiKey;
    }

    const axios = require('axios');
    const base = url.replace(/\/$/, '');
    
    if (type === 'plex') {
      const result = await axios.get(`${base}/identity`, {
        headers: { 'X-Plex-Token': finalApiKey, 'Accept': 'application/json' },
        timeout: 5000
      });
      if (result.status === 200) {
        return res.json({ status: 'success', message: 'Connected to Plex successfully' });
      }
    } else if (type === 'jellyfin' || type === 'emby') {
      const result = await axios.get(`${base}/System/Info`, {
        headers: { 'X-Emby-Token': finalApiKey },
        timeout: 5000
      });
      if (result.status === 200) {
        return res.json({ status: 'success', message: `Connected to ${type === 'jellyfin' ? 'Jellyfin' : 'Emby'} successfully` });
      }
    }
    
    res.status(400).json({ status: 'error', message: `Failed to connect to ${type}` });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Plex OAuth PIN flow
const crypto = require('crypto');

function getPlexClientId() {
  let clientId = getSetting('plexClientId');
  if (!clientId) {
    clientId = crypto.randomUUID();
    setSetting('plexClientId', clientId);
  }
  return clientId;
}

router.post('/plex/pin', async (req, res, next) => {
  try {
    const axios = require('axios');
    const clientId = getPlexClientId();

    const response = await axios.post('https://plex.tv/api/v2/pins', null, {
      headers: {
        'Accept': 'application/json',
        'X-Plex-Product': 'Atlas',
        'X-Plex-Client-Identifier': clientId
      },
      params: {
        strong: true
      },
      timeout: 10000
    });

    const { id, code } = response.data;

    // Store the pin ID temporarily so we can poll it
    res.json({
      status: 'success',
      data: {
        pinId: id,
        code: code,
        clientId: clientId,
        authUrl: `https://app.plex.tv/auth#?clientID=${encodeURIComponent(clientId)}&code=${encodeURIComponent(code)}&context%5Bdevice%5D%5Bproduct%5D=Atlas`
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/plex/pin/:pinId', async (req, res, next) => {
  try {
    const axios = require('axios');
    const clientId = getPlexClientId();
    const { pinId } = req.params;

    const response = await axios.get(`https://plex.tv/api/v2/pins/${pinId}`, {
      headers: {
        'Accept': 'application/json',
        'X-Plex-Client-Identifier': clientId
      },
      timeout: 5000
    });

    const { authToken, expiresAt } = response.data;

    if (authToken) {
      // Auto-discover the Plex server URL using the token
      try {
        const resourcesRes = await axios.get('https://plex.tv/api/v2/resources?includeHttps=1', {
          headers: {
            'Accept': 'application/json',
            'X-Plex-Token': authToken,
            'X-Plex-Client-Identifier': clientId
          },
          timeout: 5000
        });

        const servers = resourcesRes.data || [];
        // Find the first owned Plex Media Server (owned can be 1, "1", or true)
        const server = servers.find(s =>
          s.provides?.includes('server') &&
          (s.owned === true || s.owned === 1 || s.owned === '1')
        );
        // Prefer local connection, fall back to first available
        const connections = server?.connections || [];
        const localConn = connections.find(c => c.local);
        const plexUrl = (localConn || connections[0])?.uri || '';

        console.log('[PlexOAuth] Discovered Plex server URL:', plexUrl || '(none found)');

        return res.json({
          status: 'success',
          data: {
            authorized: true,
            authToken,
            plexUrl
          }
        });
      } catch (discoverErr) {
        // Still return token even if we can't discover the server URL
        return res.json({
          status: 'success',
          data: {
            authorized: true,
            authToken,
            plexUrl: ''
          }
        });
      }
    }

    res.json({
      status: 'success',
      data: {
        authorized: false,
        expiresAt
      }
    });
  } catch (err) {
    const status = err.response?.status;
    if (status === 404) {
      // PIN expired or invalid — gracefully return unauthorized
      return res.json({
        status: 'success',
        data: { authorized: false, expired: true }
      });
    }
    if (status === 429) {
      // Rate limited — tell frontend to try again later
      return res.json({
        status: 'success',
        data: { authorized: false, retryAfter: parseInt(err.response.headers['retry-after'] || '10', 10) }
      });
    }
    next(err);
  }
});

// Download Clients
router.post('/clients', (req, res) => {
  const { name, host, port, username, password, type } = req.body;
  const result = db.prepare('INSERT INTO download_clients (name, host, port, username, password, type) VALUES (?, ?, ?, ?, ?, ?)').run(name, host, port, username, password, type);
  res.json({ status: 'success', data: { id: result.lastInsertRowid } });
});

router.delete('/clients/:id', (req, res) => {
  db.prepare('DELETE FROM download_clients WHERE id = ?').run(req.params.id);
  res.json({ status: 'success' });
});

router.get('/clients/test', async (req, res) => {
  try {
    const clients = db.prepare('SELECT * FROM download_clients').all();
    const statuses = {};
    for (const c of clients) {
      try {
        const result = await downloadClientService.testClientConnection(c);
        statuses[c.id] = result.status === 'connected' ? 'live' : 'offline';
      } catch {
        statuses[c.id] = 'offline';
      }
    }
    res.json({ status: 'success', data: statuses });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.get('/clients/detect-mapping', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const axios = require('axios');
    const clients = db.prepare('SELECT * FROM download_clients').all();
    
    // Build probes: specific paths first, generic fallbacks last
    const libraryPaths = db.prepare('SELECT path FROM library_paths').all().map(p => p.path);
    const parentPaths = libraryPaths.map(p => path.dirname(p)).filter(p => p !== '/');
    const probes = [...parentPaths, ...libraryPaths, '/data', '/media', '/mnt', '/downloads', '/volume1', '/volume2'];

    const tryMapping = (remotePath) => {
      if (!remotePath) return null;
      // Strip trailing slash
      const cleanRemote = remotePath.replace(/\/+$/, '');
      // Extract the last path component as the subdirectory to match
      const parts = cleanRemote.split('/').filter(Boolean);
      if (!parts.length) return null;
      const remoteRoot = '/' + parts[0];
      const subPath = cleanRemote.slice(remoteRoot.length);
      for (const localRoot of probes) {
        const fullLocalPath = localRoot + subPath;
        if (fs.existsSync(fullLocalPath)) {
          return [cleanRemote, fullLocalPath];
        }
      }
      return null;
    };

    for (const c of clients) {
      try {
        let remotePath = '';

        if (c.type === 'qbittorrent') {
          const qb = require('../services/clients/qbittorrent');
          const cookie = await qb.login(c);
          if (cookie) {
            const prefs = await axios.get(`${c.host}:${c.port}/api/v2/app/preferences`, {
              headers: { 'Cookie': cookie }, timeout: 5000
            });
            remotePath = prefs.data?.save_path || '';
            if (!remotePath) {
              const info = await axios.get(`${c.host}:${c.port}/api/v2/torrents/info?limit=1&filter=completed`, {
                headers: { 'Cookie': cookie }, timeout: 5000
              });
              remotePath = info.data?.[0]?.save_path || '';
            }
          }
        } else if (c.type === 'transmission') {
          const sess = await axios.post(`${c.host}:${c.port}/transmission/rpc`, {
            method: 'session-get'
          }, { timeout: 5000 });
          const cookie = sess.headers['x-transmission-session-id'];
          const res2 = await axios.post(`${c.host}:${c.port}/transmission/rpc`, {
            method: 'session-get'
          }, { headers: { 'X-Transmission-Session-Id': cookie }, timeout: 5000 });
          remotePath = res2.data?.arguments?.['download-dir'] || '';
        } else if (c.type === 'deluge') {
          const res2 = await axios.post(`${c.host}:${c.port}/json`, {
            method: 'core.get_config',
            params: [c.password]
          }, { timeout: 5000 });
          remotePath = res2.data?.result?.download_location || '';
        } else if (c.type === 'sabnzbd') {
          const res2 = await axios.get(`${c.host}:${c.port}/api`, {
            params: { mode: 'get_config', section: 'misc', apikey: c.password, output: 'json' },
            timeout: 5000
          });
          remotePath = res2.data?.config?.misc?.complete_dir || '';
        } else if (c.type === 'nzbget') {
          const res2 = await axios.post(`${c.host}:${c.port}/jsonrpc`, {
            method: 'config'
          }, { timeout: 5000 });
          const cfg = res2.data?.result || [];
          const destDir = cfg.find(o => o.Name === 'DestDir');
          remotePath = destDir?.Value || '';
        }

        // Preference-based mapping
        let mapping = tryMapping(remotePath);
        
        // Fallback: check completed torrent
        if (!mapping) {
          const adapter = require('../services/downloadClientService');
          const torrents = await adapter.getTorrents();
          const completed = (torrents || []).find(t => t.progress === 1);
          if (completed) mapping = tryMapping(completed.save_path || completed.content_path || '');
        }
        
        // DB fallback always takes priority if it exists and is more specific
        const downloadsLibPath = db.prepare("SELECT path FROM library_paths WHERE type = 'downloads' LIMIT 1").get();
        if (downloadsLibPath) {
          let remote = (remotePath || '/data').replace(/\/+$/, '');
          // If qBittorrent only reported a root (e.g., /data), append /downloads
          const parts = remote.split('/').filter(Boolean);
          if (parts.length === 1 && parts[0] !== 'downloads') {
            remote += '/downloads';
          }
          mapping = [remote, downloadsLibPath.path];
        }

        if (mapping) {
          return res.json({ status: 'success', data: mapping });
        }
      } catch {}
    }
    res.json({ status: 'success', data: null, message: 'Could not detect path mapping automatically. Set it manually.' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Quality Profiles
router.post('/profiles', (req, res) => {
  const { name, preferred_resolution, qualities, cutoff, upgrade_allowed } = req.body;
  const qStr = qualities ? JSON.stringify(qualities) : JSON.stringify(['1080p']);
  const result = db.prepare('INSERT INTO quality_profiles (name, preferred_resolution, qualities, cutoff, upgrade_allowed) VALUES (?, ?, ?, ?, ?)').run(
    name, preferred_resolution || '1080p', qStr, cutoff || '1080p', upgrade_allowed === undefined ? 1 : upgrade_allowed ? 1 : 0
  );
  res.json({ status: 'success', data: { id: result.lastInsertRowid } });
});

router.put('/profiles/:id', (req, res) => {
  const { name, preferred_resolution, qualities, cutoff, upgrade_allowed } = req.body;
  const qStr = qualities ? JSON.stringify(qualities) : JSON.stringify(['1080p']);
  db.prepare('UPDATE quality_profiles SET name = ?, preferred_resolution = ?, qualities = ?, cutoff = ?, upgrade_allowed = ? WHERE id = ?').run(
    name, preferred_resolution || '1080p', qStr, cutoff || '1080p', upgrade_allowed === undefined ? 1 : upgrade_allowed ? 1 : 0, req.params.id
  );
  res.json({ status: 'success' });
});

router.delete('/profiles/:id', (req, res) => {
  db.prepare('DELETE FROM quality_profiles WHERE id = ?').run(req.params.id);
  res.json({ status: 'success' });
});
// Issues Endpoint
router.get('/issues', async (req, res) => {
  try {
    const issues = [];
    
    // Check TMDB
    const tmdbApiKey = getSetting('tmdbApiKey');
    if (!tmdbApiKey) {
      issues.push({
        id: 'tmdb_key_missing',
        type: 'error',
        message: 'TMDB API Key is missing. Media metadata and searches will not work.',
        actionText: 'Configure TMDB',
        actionLink: '/settings'
      });
    }

    // Check Indexers (Prowlarr)
    const prowlarrUrl = getSetting('prowlarrUrl');
    const prowlarrApiKey = getSetting('prowlarrApiKey');
    if (!prowlarrUrl || !prowlarrApiKey) {
      issues.push({
        id: 'no_indexers',
        type: 'warning',
        message: 'Prowlarr is not configured. You will not be able to search for torrents.',
        actionText: 'Configure Prowlarr',
        actionLink: '/settings'
      });
    }

    // Check Clients
    const clients = db.prepare('SELECT * FROM download_clients').all();
    if (clients.length === 0) {
      issues.push({
        id: 'no_clients',
        type: 'error',
        message: 'No download client configured. Media cannot be downloaded.',
        actionText: 'Add Download Client',
        actionLink: '/settings'
      });
    } else {
      // Check Client Connectivity
      for (const c of clients) {
        try {
          const result = await downloadClientService.testClientConnection(c);
          if (result.status !== 'connected') {
            issues.push({
              id: `client_offline_${c.id}`,
              type: 'error',
              message: `Download client "${c.name}" (${c.type}) is unreachable. Please check the URL and port.`,
              actionText: 'Check Settings',
              actionLink: '/settings'
            });
          }
        } catch {
          issues.push({
            id: `client_offline_${c.id}`,
            type: 'error',
            message: `Download client "${c.name}" (${c.type}) is unreachable. Please check the URL and port.`,
            actionText: 'Check Settings',
            actionLink: '/settings'
          });
        }
      }
    }

    // Check Library Paths
    const fs = require('fs/promises');
    const path = require('path');
    const libraryPaths = db.prepare('SELECT * FROM library_paths').all();
    
    if (libraryPaths.length > 0) {
      const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.wmv'];
      const isVideoFile = (name) => videoExts.includes(path.extname(name).toLowerCase());

      // Recursive check for video files up to 3 levels deep (handles Show/Season 1/ files)
      const hasVideoFilesRecursive = async (dirPath, depth = 0) => {
        if (depth > 3) return false;
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && isVideoFile(entry.name)) return true;
            if (entry.isDirectory()) {
              const found = await hasVideoFilesRecursive(path.join(dirPath, entry.name), depth + 1);
              if (found) return true;
            }
          }
        } catch {
          /* ignore */
        }
        return false;
      };

      for (const lp of libraryPaths) {
        try {
          const stat = await fs.stat(lp.path);
          if (!stat.isDirectory()) {
            issues.push({
              id: `mount_not_dir_${lp.id}`,
              type: 'error',
              message: `Library path "${lp.path}" is not a directory. Check your configuration.`,
              actionText: 'Fix Path',
              actionLink: '/settings'
            });
            continue;
          }

          // Downloads path is expected to be empty — skip empty check
          if (lp.type === 'downloads') continue;

          const hasVideoFiles = await hasVideoFilesRecursive(lp.path);

          if (!hasVideoFiles) {
            issues.push({
              id: `mount_empty_${lp.id}`,
              type: 'warning',
              message: `Library path "${lp.path}" appears empty or disconnected — no video files found. Check that your mount is connected and has media files.`,
              actionText: 'View Paths',
              actionLink: '/settings'
            });
          }
        } catch (err) {
          issues.push({
            id: `mount_unreachable_${lp.id}`,
            type: 'error',
            message: `Library path "${lp.path}" is unreachable: ${err.message}. Make sure the mount is connected and accessible.`,
            actionText: 'Check Mounts',
            actionLink: '/settings'
          });
        }
      }
    }

    res.json({ status: 'success', data: issues });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Combined system status — API keys, client connections, and service health
router.get('/status', async (req, res) => {
  const axios = require('axios');
  const services = {};
  const errors = [];

  // Helper: test a service and record result
  const test = async (name, label, testFn) => {
    try {
      const result = await testFn();
      services[name] = result;
    } catch (e) {
      services[name] = { status: 'error', message: e.message };
      errors.push({ name: label, message: e.message });
    }
  };

  // ---- API Key checks ----

  // TMDB
  const tmdbKey = getSetting('tmdbApiKey');
  if (tmdbKey) {
    await test('tmdb', 'TMDB', async () => {
      const r = await axios.get('https://api.themoviedb.org/3/configuration', {
        params: { api_key: tmdbKey }, timeout: 5000
      });
      return { status: r.status === 200 ? 'connected' : 'error' };
    });
  } else {
    services.tmdb = { status: 'unconfigured' };
  }

  // Trakt
  const traktId = getSetting('traktClientId');
  if (traktId) {
    await test('trakt', 'Trakt', async () => {
      const r = await axios.get('https://api.trakt.tv/movies/trending', {
        headers: { 'trakt-api-version': '2', 'trakt-api-key': traktId },
        timeout: 5000
      });
      return { status: r.status === 200 ? 'connected' : 'error' };
    });
  } else {
    services.trakt = { status: 'unconfigured' };
  }

  // OpenSubtitles
  const osKey = getSetting('osApiKey');
  if (osKey) {
    await test('opensubtitles', 'OpenSubtitles', async () => {
      const r = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
        headers: { 'Api-Key': osKey, 'User-Agent': 'Atlas/1.0' },
        params: { tmdb_id: 27205, languages: 'en', limit: 1 },
        timeout: 5000
      });
      return { status: r.status === 200 ? 'connected' : 'error' };
    });
  } else {
    services.opensubtitles = { status: 'unconfigured' };
  }

  // SubDL
  const subdlKey = getSetting('subdlApiKey');
  if (subdlKey) {
    await test('subdl', 'SubDL', async () => {
      const r = await axios.get('https://api.subdl.com/api/v1/me', { params: { api_key: subdlKey }, timeout: 5000 });
      return { status: r.data?.status ? 'connected' : 'error' };
    });
  } else {
    services.subdl = { status: 'unconfigured' };
  }

  // SubSource
  const subsourceKey = getSetting('subsourceApiKey');
  if (subsourceKey) {
    await test('subsource', 'SubSource', async () => {
      const r = await axios.get('https://api.subsource.net/api/v1/movies/search', {
        params: { api_key: subsourceKey, searchType: 'text', q: 'Inception' },
        validateStatus: () => true,
        timeout: 5000
      });
      return { status: r.status === 200 ? 'connected' : 'error' };
    });
  } else {
    services.subsource = { status: 'unconfigured' };
  }

  // Gemini
  const geminiKey = getSetting('geminiApiKey');
  if (geminiKey) {
    await test('gemini', 'Gemini', async () => {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      await model.generateContent('Reply with just the word OK');
      return { status: 'connected' };
    });
  } else {
    services.gemini = { status: 'unconfigured' };
  }

  // DeepSeek
  const deepseekKey = getSetting('deepseekApiKey');
  if (deepseekKey) {
    await test('deepseek', 'DeepSeek', async () => {
      const r = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Reply with just OK' }],
        max_tokens: 5
      }, { headers: { Authorization: `Bearer ${deepseekKey}`, 'Content-Type': 'application/json' }, timeout: 10000 });
      return { status: r.status === 200 ? 'connected' : 'error' };
    });
  } else {
    services.deepseek = { status: 'unconfigured' };
  }

  // Claude
  const claudeKey = getSetting('claudeApiKey');
  if (claudeKey) {
    await test('claude', 'Claude', async () => {
      const r = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-3-haiku-20240307',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Reply: OK' }]
      }, { headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 10000 });
      return { status: r.status === 200 ? 'connected' : 'error' };
    });
  } else {
    services.claude = { status: 'unconfigured' };
  }

  // ---- Download Clients ----
  const clients = db.prepare('SELECT * FROM download_clients').all();
  services.downloadClients = [];
  for (const c of clients) {
    try {
      const result = await downloadClientService.testClientConnection(c);
      if (result.status === 'connected') {
        services.downloadClients.push({ name: c.name, status: 'connected' });
      } else {
        services.downloadClients.push({ name: c.name, status: 'error', message: result.message });
      }
    } catch {
      services.downloadClients.push({ name: c.name, status: 'error', message: 'Unreachable' });
    }
  }

  // ---- Indexers (Prowlarr) ----
  const prowlUrl = getSetting('prowlarrUrl');
  const prowlKey = getSetting('prowlarrApiKey');
  const indexerConfigured = prowlUrl && prowlKey;
  services.indexers = { 
    count: indexerConfigured ? 1 : 0, 
    status: indexerConfigured ? 'connected' : 'unconfigured',
    isProwlarr: true
  };

  // ---- Library ----
  const movieCount = db.prepare('SELECT count(*) as count FROM movies').get().count;
  const showCount = db.prepare('SELECT count(*) as count FROM shows').get().count;
  services.library = { movies: movieCount, shows: showCount };

  // ---- System Issues ----
  const fs = require('fs/promises');
  const path = require('path');
  const libraryPaths = db.prepare('SELECT * FROM library_paths').all();
  const mountEntries = [];
  const mountIssues = [];

  if (libraryPaths.length > 0) {
    const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.wmv'];
    const isVideoFile = (name) => videoExts.includes(path.extname(name).toLowerCase());
    const hasVideoFilesRecursive = async (dirPath, depth = 0) => {
      if (depth > 3) return false;
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && isVideoFile(entry.name)) return true;
          if (entry.isDirectory()) {
            const found = await hasVideoFilesRecursive(path.join(dirPath, entry.name), depth + 1);
            if (found) return found;
          }
        }
      } catch {
        /* ignore */
      }
      return false;
    };

    for (const lp of libraryPaths) {
      let status = 'healthy';
      let issue = null;
      try {
        const stat = await fs.stat(lp.path);
        if (!stat.isDirectory()) {
          status = 'error';
          issue = 'Not a directory';
          mountIssues.push({ path: lp.path, issue });
        } else {
          const hasFiles = await hasVideoFilesRecursive(lp.path);
          if (!hasFiles) {
            status = 'warning';
            issue = 'Empty or disconnected';
            mountIssues.push({ path: lp.path, issue });
          }
        }
      } catch (err) {
        status = 'error';
        issue = `Unreachable: ${err.message}`;
        mountIssues.push({ path: lp.path, issue });
      }
      mountEntries.push({ path: lp.path, status, issue });
    }
  }
  services.mounts = { paths: libraryPaths.length, entries: mountEntries, issues: mountIssues };

  res.json({ status: 'success', data: { services, errors } });
});

// Database Backup - download the SQLite database file
router.get('/backup', (req, res, next) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(__dirname, '../data/database.sqlite');
    
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ status: 'error', message: 'Database file not found' });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="atlas-backup-${timestamp}.sqlite"`);
    
    const stream = fs.createReadStream(dbPath);
    stream.pipe(res);
  } catch (e) {
    next(e);
  }
});

// Database Restore - upload a SQLite file
router.post('/restore', (req, res, next) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Express file upload handling - check for raw body or multer
    // Simple approach: accept base64 encoded file in JSON body
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ status: 'error', message: 'No database data provided' });
    }
    
    const dbPath = path.join(__dirname, '../data/database.sqlite');
    const backupPath = path.join(__dirname, `../data/database-backup-${Date.now()}.sqlite`);
    
    // Backup current database first
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
    }
    
    // Write uploaded data
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(dbPath, buffer);
    
    res.json({ status: 'success', message: 'Database restored successfully. Previous database backed up.' });
  } catch (e) {
    next(e);
  }
});

// ─── Feature 5: Task Schedule Editor ─────────────────────────────────────────

const DEFAULT_SCHEDULES = {
  search_cycle:      '0 * * * *',     // Every hour
  update_ratings:    '0 0 * * *',     // Daily midnight
  update_air_dates:  '0 1 * * *',     // Daily 1 AM
  trakt_watched_sync:'0 */6 * * *',   // Every 6 hours
  library_scan:      '0 3 * * *',     // Daily 3 AM
};

router.get('/schedules', (req, res, next) => {
  try {
    const schedules = {};
    for (const [taskId, defaultCron] of Object.entries(DEFAULT_SCHEDULES)) {
      const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(`schedule_${taskId}`);
      schedules[taskId] = row ? row.value : defaultCron;
    }
    res.json({ status: 'success', data: schedules });
  } catch (e) { next(e); }
});

router.post('/schedules', (req, res, next) => {
  try {
    const { schedules } = req.body; // { taskId: cronString, ... }
    if (!schedules || typeof schedules !== 'object') {
      return res.status(400).json({ status: 'error', message: 'schedules object required' });
    }
    const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const [taskId, cron] of Object.entries(schedules)) {
      if (DEFAULT_SCHEDULES[taskId]) {
        stmt.run(`schedule_${taskId}`, cron);
      }
    }
    // Hot-reload schedules in automation service
    try {
      const automationService = require('../services/automationService');
      if (typeof automationService.rescheduleAll === 'function') {
        automationService.rescheduleAll(schedules);
      }
    } catch { /* service may not be loaded yet */ }
    res.json({ status: 'success', message: 'Schedules saved' });
  } catch (e) { next(e); }
});

router.post('/test-notification', async (req, res) => {
  try {
    const notificationService = require('../services/notificationService');
    await notificationService.testNotification(req.body || {});
    res.json({ status: 'success', message: 'Test notification sent' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to send test notification' });
  }
});

module.exports = router;
