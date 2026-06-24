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
    const geminiApiKey = getSetting('geminiApiKey');
    
    const mask = (val) => val ? '*'.repeat(val.length) : '';
    
    // Fetch indexers and clients, excluding sensitive data
    const indexers = db.prepare('SELECT id, name, url, type FROM indexers').all();
    const clients = db.prepare('SELECT id, name, host, port, type, username FROM download_clients').all();
    const profiles = db.prepare('SELECT * FROM quality_profiles').all();

    res.json({
      status: 'success',
      data: {
        tmdbApiKey: mask(tmdbApiKey),
        traktClientId: mask(traktClientId),
        osApiKey: mask(osApiKey),
        geminiApiKey: mask(geminiApiKey),
        indexers,
        clients,
        profiles
      }
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', (req, res, next) => {
  try {
    const { tmdbApiKey, traktClientId, osApiKey, geminiApiKey } = req.body;
    
    const isMasked = (val) => val && /^\*+$/.test(val);
    
    if (tmdbApiKey !== undefined && !isMasked(tmdbApiKey)) setSetting('tmdbApiKey', tmdbApiKey);
    if (traktClientId !== undefined && !isMasked(traktClientId)) setSetting('traktClientId', traktClientId);
    if (osApiKey !== undefined && !isMasked(osApiKey)) setSetting('osApiKey', osApiKey);
    if (geminiApiKey !== undefined && !isMasked(geminiApiKey)) setSetting('geminiApiKey', geminiApiKey);
    
    res.json({ status: 'success', message: 'Settings saved successfully' });
  } catch (e) {
    next(e);
  }
});

// Indexers
router.post('/indexers', (req, res) => {
  const { name, url, api_key, type } = req.body;
  const result = db.prepare('INSERT INTO indexers (name, url, api_key, type) VALUES (?, ?, ?, ?)').run(name, url, api_key, type);
  res.json({ status: 'success', data: { id: result.lastInsertRowid } });
});

router.delete('/indexers/:id', (req, res) => {
  db.prepare('DELETE FROM indexers WHERE id = ?').run(req.params.id);
  res.json({ status: 'success' });
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

    // Check Indexers
    const indexers = db.prepare('SELECT count(*) as count FROM indexers').get();
    if (indexers.count === 0) {
      issues.push({
        id: 'no_indexers',
        type: 'warning',
        message: 'No indexers configured. You will not be able to search for torrents.',
        actionText: 'Add Indexer',
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

    res.json({ status: 'success', data: issues });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
