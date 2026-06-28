const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const libraryService = require('../../services/libraryService');
const scannerService = require('../../services/scannerService');
const downloadClientService = require('../../services/downloadClientService');

router.get('/stats', (req, res, next) => {
  try {
    const moviesCount = db.prepare('SELECT count(*) as count FROM movies').get().count;
    const showsCount = db.prepare('SELECT count(*) as count FROM shows').get().count;
    res.json({ status: 'success', data: { movies: moviesCount, shows: showsCount } });
  } catch (error) {
    next(error);
  }
});


router.get('/paths', (req, res, next) => {
  try {
    const paths = libraryService.getPaths();
    res.json({ status: 'success', data: paths });
  } catch (error) {
    next(error);
  }
});

router.get('/downloads', async (req, res, next) => {
  try {
    const downloadClientService = require('../services/downloadClientService');
    const torrents = await downloadClientService.getTorrents();
    res.json({ status: 'success', data: torrents });
  } catch (error) {
    next(error);
  }
});

router.post('/paths', (req, res, next) => {
  try {
    const { path } = req.body;
    if (!path) {
      return res.status(400).json({ status: 'error', message: 'path is required' });
    }
    const result = libraryService.addPath(path);
    res.json({ status: 'success', data: result });
  } catch (error) {
    if (error.message === 'Path already exists in library') {
      return res.status(409).json({ status: 'error', message: error.message });
    }
    next(error);
  }
});

router.delete('/paths/:id', (req, res, next) => {
  try {
    libraryService.removePath(req.params.id);
    res.json({ status: 'success' });
  } catch (error) {
    next(error);
  }
});


router.post('/scan', async (req, res, next) => {
  try {
    const result = await scannerService.scanLibrary();
    res.json(result);
  } catch (error) {
    next(error);
  }
});


router.get('/scan/progress', (req, res) => {
  res.json(scannerService.getScanProgress());
});


router.post('/scan/retry-paths', async (req, res, next) => {
  try {
    const fs = require('fs/promises');
    const { paths } = req.body;
    if (!Array.isArray(paths)) {
      return res.status(400).json({ status: 'error', message: 'paths must be an array' });
    }
    const results = [];
    for (const p of paths) {
      try {
        await fs.stat(p);
        results.push({ path: p, reachable: true });
      } catch (err) {
        results.push({ path: p, reachable: false, error: err.message });
      }
    }
    res.json({ status: 'success', data: results });
  } catch (error) {
    next(error);
  }
});

router.get('/calendar', async (req, res, next) => {
  try {
    const upcoming = db.prepare(`
      SELECT 
        e.title, 
        e.season_number, 
        e.episode_number, 
        e.air_date, 
        e.overview, 
        s.title as show_title, 
        s.id as show_id, 
        s.tmdb_id
      FROM episodes e
      JOIN shows s ON e.show_id = s.id
      WHERE e.air_date IS NOT NULL 
        AND e.air_date >= date('now', 'localtime')
        AND s.status != 'unmonitored'
      ORDER BY e.air_date ASC
    `).all();

    res.json({ status: 'success', data: upcoming });
  } catch (err) {
    next(err);
  }
});


router.post('/bulk/status', (req, res, next) => {
  try {
    const { ids, status, type } = req.body; // type: 'movies' or 'shows'
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ status: 'error', message: 'ids array is required' });
    }
    
    const table = type === 'shows' ? 'shows' : 'movies';
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE ${table} SET status = ? WHERE id IN (${placeholders})`).run(status, ...ids);
    
    res.json({ status: 'success', message: `Updated ${ids.length} item(s)` });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk/quality', (req, res, next) => {
  try {
    const { ids, profileId, type } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ status: 'error', message: 'ids array is required' });
    }
    
    const table = type === 'shows' ? 'shows' : 'movies';
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE ${table} SET quality_profile_id = ? WHERE id IN (${placeholders})`).run(profileId, ...ids);
    
    res.json({ status: 'success', message: `Updated ${ids.length} item(s)` });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk/delete', (req, res, next) => {
  try {
    const { ids, type } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ status: 'error', message: 'ids array is required' });
    }
    
    const table = type === 'shows' ? 'shows' : 'movies';
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).run(...ids);
    
    res.json({ status: 'success', message: `Deleted ${ids.length} item(s)` });
  } catch (err) {
    next(err);
  }
});


router.get('/duplicates', (req, res, next) => {
  try {
    const duplicates = { movies: [], shows: [] };

    // Find duplicate movies by TMDB ID
    const movieDupes = db.prepare(`
      SELECT tmdb_id, COUNT(*) as count, GROUP_CONCAT(id) as ids, GROUP_CONCAT(title) as titles
      FROM movies WHERE tmdb_id IS NOT NULL
      GROUP BY tmdb_id HAVING COUNT(*) > 1
    `).all();

    for (const dupe of movieDupes) {
      const idList = dupe.ids.split(',').map(Number);
      const titleList = dupe.titles.split(',');
      const items = idList.map((id, i) => {
        const m = db.prepare('SELECT * FROM movies WHERE id = ?').get(id);
        return { ...m, displayTitle: titleList[i] };
      });
      duplicates.movies.push({ tmdb_id: dupe.tmdb_id, count: dupe.count, items });
    }

    // Find duplicate shows by TMDB ID
    const showDupes = db.prepare(`
      SELECT tmdb_id, COUNT(*) as count, GROUP_CONCAT(id) as ids, GROUP_CONCAT(title) as titles
      FROM shows WHERE tmdb_id IS NOT NULL
      GROUP BY tmdb_id HAVING COUNT(*) > 1
    `).all();

    for (const dupe of showDupes) {
      const idList = dupe.ids.split(',').map(Number);
      const titleList = dupe.titles.split(',');
      const items = idList.map((id, i) => {
        const s = db.prepare('SELECT * FROM shows WHERE id = ?').get(id);
        return { ...s, displayTitle: titleList[i] };
      });
      duplicates.shows.push({ tmdb_id: dupe.tmdb_id, count: dupe.count, items });
    }

    res.json({ status: 'success', data: duplicates });
  } catch (err) {
    next(err);
  }
});


router.post('/duplicates/delete', (req, res, next) => {
  try {
    const { id, type } = req.body; // type: 'movie' or 'show'
    if (!id || !type) {
      return res.status(400).json({ status: 'error', message: 'id and type are required' });
    }
    
    const table = type === 'show' ? 'shows' : 'movies';
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    
    res.json({ status: 'success', message: 'Duplicate removed' });
  } catch (err) {
    next(err);
  }
});


router.get('/health', async (req, res, next) => {
  try {
    const fs = require('fs/promises');
    const path = require('path');
    const os = require('os');

    // DB file size
    let dbSize = 0;
    try {
      const dbPath = path.join(__dirname, '../data/database.sqlite');
      const stat = await fs.stat(dbPath);
      dbSize = stat.size;
    } catch { /* ignore */ }

    // Library path disk usage
    const paths = db.prepare('SELECT * FROM library_paths').all();
    const pathHealth = await Promise.all(paths.map(async (p) => {
      try {
        const items = await fs.readdir(p.path);
        return { path: p.path, accessible: true, itemCount: items.length };
      } catch {
        return { path: p.path, accessible: false, itemCount: 0 };
      }
    }));

    // Last scan time from settings
    const lastScanRow = db.prepare("SELECT value FROM settings WHERE key = 'lastScanTime'").get();
    const lastScan = lastScanRow ? lastScanRow.value : null;

    // Counts
    const movieCount = db.prepare('SELECT COUNT(*) as c FROM movies').get().c;
    const showCount  = db.prepare('SELECT COUNT(*) as c FROM shows').get().c;
    const epCount    = db.prepare('SELECT COUNT(*) as c FROM episodes').get().c;
    const logCount   = db.prepare('SELECT COUNT(*) as c FROM logs').get().c;

    // System info
    const uptimeSec = process.uptime();
    const memUsage = process.memoryUsage();

    res.json({
      status: 'success',
      data: {
        db: { sizeBytes: dbSize },
        library: { movies: movieCount, shows: showCount, episodes: epCount },
        paths: pathHealth,
        lastScan,
        logs: { count: logCount },
        process: {
          uptimeSeconds: Math.floor(uptimeSec),
          heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
          rssMemMB: Math.round(memUsage.rss / 1024 / 1024),
        },
        system: {
          freeMemMB: Math.round(os.freemem() / 1024 / 1024),
          totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
          cpuCount: os.cpus().length,
          platform: os.platform(),
        }
      }
    });
  } catch (err) { next(err); }
});


router.get('/export', (req, res, next) => {
  try {
    const format = req.query.format === 'csv' ? 'csv' : 'json';
    const movies = db.prepare(
      'SELECT id, tmdb_id, title, year, status, genres, rating, file_path, added_at FROM movies'
    ).all();
    const shows = db.prepare(
      'SELECT id, tmdb_id, title, year, status, genres, rating, folder_path, added_at FROM shows'
    ).all();

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="atlas-library.json"');
      return res.json({ exportedAt: new Date().toISOString(), movies, shows });
    }

    // CSV
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const movieHeader = 'type,id,tmdb_id,title,year,status,genres,rating,path,added_at';
    const movieRows = movies.map(m =>
      ['movie', m.id, m.tmdb_id, m.title, m.year, m.status, m.genres, m.rating, m.file_path, m.added_at]
        .map(escape).join(',')
    );
    const showRows = shows.map(s =>
      ['show', s.id, s.tmdb_id, s.title, s.year, s.status, s.genres, s.rating, s.folder_path, s.added_at]
        .map(escape).join(',')
    );
    const csv = [movieHeader, ...movieRows, ...showRows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="atlas-library.csv"');
    return res.send(csv);
  } catch (err) { next(err); }
});


router.get('/collections', (req, res, next) => {
  try {
    const collections = db.prepare('SELECT * FROM collections ORDER BY name ASC').all();
    const withCounts = collections.map(c => ({
      ...c,
      movieCount: db.prepare('SELECT COUNT(*) as c FROM movie_collections WHERE collection_id = ?').get(c.id).c,
    }));
    res.json({ status: 'success', data: withCounts });
  } catch (err) { next(err); }
});

router.post('/collections', (req, res, next) => {
  try {
    const { name, color = '#06b6d4' } = req.body;
    if (!name) return res.status(400).json({ status: 'error', message: 'name is required' });
    const result = db.prepare('INSERT INTO collections (name, color) VALUES (?, ?)').run(name.trim(), color);
    res.json({ status: 'success', data: { id: result.lastInsertRowid, name, color } });
  } catch (err) { next(err); }
});

router.put('/collections/:id', (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (name) db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
    if (color) db.prepare('UPDATE collections SET color = ? WHERE id = ?').run(color, req.params.id);
    res.json({ status: 'success', message: 'Collection updated' });
  } catch (err) { next(err); }
});

router.delete('/collections/:id', (req, res, next) => {
  try {
    db.prepare('DELETE FROM movie_collections WHERE collection_id = ?').run(req.params.id);
    db.prepare('DELETE FROM collections WHERE id = ?').run(req.params.id);
    res.json({ status: 'success', message: 'Collection deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
