const express = require('express');
const router = express.Router();
const db = require('../config/database');

const getSetting = (key) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
};

const setSetting = (key, value) => {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
};

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
        defaultQualityProfileId: defaultQualityProfileId ? parseInt(defaultQualityProfileId) : null,
        clients,
        profiles,
        libraryPaths
      }
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', (req, res, next) => {
  try {
    const { tmdbApiKey, traktClientId, osApiKey, subdlApiKey, subsourceApiKey, geminiApiKey, deepseekApiKey, claudeApiKey, prowlarrUrl, prowlarrApiKey, translationProvider, targetLang, targetLangs, providerLangs, autoTranslate, traktWatchedSync, traktAccessToken, traktClientSecret, renameMovies, replaceIllegalCharacters, colonReplacement, standardMovieFormat, renameEpisodes, standardEpisodeFormat, seasonFolderFormat, removeCompletedDownloads, deleteTorrentFiles, hideCompletedDownloads, defaultQualityProfileId } = req.body;
    
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
    const axios = require('axios');
    for (const c of clients) {
      if (c.type === 'qbittorrent') {
        try {
          await axios.get(`${c.host}:${c.port}/api/v2/app/webapiVersion`, { timeout: 2000 });
          statuses[c.id] = 'live';
        } catch(e) {
          if (e.response && (e.response.status === 401 || e.response.status === 403)) {
            statuses[c.id] = 'live';
          } else {
            statuses[c.id] = 'offline';
          }
        }
      }
    }
    res.json({ status: 'success', data: statuses });
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
      const axios = require('axios');
      for (const c of clients) {
        if (c.type === 'qbittorrent') {
          try {
            await axios.get(`${c.host}:${c.port}/api/v2/app/webapiVersion`, { timeout: 2000 });
          } catch(e) {
            if (!(e.response && (e.response.status === 401 || e.response.status === 403))) {
              issues.push({
                id: `client_offline_${c.id}`,
                type: 'error',
                message: `Download client "${c.name}" is unreachable. Please check the URL and port.`,
                actionText: 'Check Settings',
                actionLink: '/settings'
              });
            }
          }
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
        headers: { 'Api-Key': osKey },
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
    if (c.type === 'qbittorrent') {
      try {
        await axios.get(`${c.host}:${c.port}/api/v2/app/webapiVersion`, { timeout: 3000 });
        services.downloadClients.push({ name: c.name, status: 'connected' });
      } catch (e) {
        if (e.response && (e.response.status === 401 || e.response.status === 403)) {
          services.downloadClients.push({ name: c.name, status: 'connected' });
        } else {
          services.downloadClients.push({ name: c.name, status: 'error', message: 'Unreachable' });
        }
      }
    } else {
      services.downloadClients.push({ name: c.name, status: 'unknown' });
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

module.exports = router;
