const express = require('express');
const router = express.Router();
const path = require('path');
const fsp = require('fs/promises');
const db = require('../../config/database');
const libraryService = require('../../services/libraryService');
const scannerService = require('../../services/scannerService');
const downloadClientService = require('../../services/downloadClientService');
const tmdbService = require('../../services/tmdbService');
const concurrency = require('../../utils/concurrency');

router.get('/stats', (req, res, next) => {
  try {
    const moviesCount = db.prepare('SELECT count(*) as count FROM movies').get().count;
    const showsCount  = db.prepare('SELECT count(*) as count FROM shows').get().count;
    const episodesCount = db.prepare('SELECT COUNT(*) as count FROM episodes').get().count;

    // Status breakdowns
    const movieStatuses = db.prepare('SELECT status, COUNT(*) as count FROM movies GROUP BY status').all();
    const showStatuses  = db.prepare('SELECT status, COUNT(*) as count FROM shows GROUP BY status').all();

    // Storage
    const movieSize   = db.prepare("SELECT COALESCE(SUM(COALESCE(file_size, 0)), 0) as total FROM movies").get().total;
    const showSize    = db.prepare("SELECT COALESCE(SUM(COALESCE(folder_size, 0)), 0) as total FROM shows").get().total;
    const episodeSize = db.prepare("SELECT COALESCE(SUM(COALESCE(file_size, 0)), 0) as total FROM episodes").get().total;
    const totalFileSize = movieSize + showSize + episodeSize;

    // Downloaded counts
    const downloadedMovies = db.prepare("SELECT COUNT(*) as count FROM movies WHERE status = 'downloaded'").get().count;
    const downloadedShows  = db.prepare("SELECT COUNT(*) as count FROM shows WHERE status = 'downloaded'").get().count;

    // Average rating
    const avgRow = db.prepare(
      "SELECT ROUND(AVG(rating), 1) as avg FROM (SELECT rating FROM movies WHERE rating > 0 UNION ALL SELECT rating FROM shows WHERE rating > 0)"
    ).get();
    const averageRating = avgRow?.avg ?? null;

    // Rating distribution buckets — individual scores 1 through 10
    const ratingBuckets = db.prepare(`
      SELECT
        SUM(CASE WHEN CAST(rating AS INTEGER) = 1  THEN 1 ELSE 0 END) as "1",
        SUM(CASE WHEN CAST(rating AS INTEGER) = 2  THEN 1 ELSE 0 END) as "2",
        SUM(CASE WHEN CAST(rating AS INTEGER) = 3  THEN 1 ELSE 0 END) as "3",
        SUM(CASE WHEN CAST(rating AS INTEGER) = 4  THEN 1 ELSE 0 END) as "4",
        SUM(CASE WHEN CAST(rating AS INTEGER) = 5  THEN 1 ELSE 0 END) as "5",
        SUM(CASE WHEN CAST(rating AS INTEGER) = 6  THEN 1 ELSE 0 END) as "6",
        SUM(CASE WHEN CAST(rating AS INTEGER) = 7  THEN 1 ELSE 0 END) as "7",
        SUM(CASE WHEN CAST(rating AS INTEGER) = 8  THEN 1 ELSE 0 END) as "8",
        SUM(CASE WHEN CAST(rating AS INTEGER) = 9  THEN 1 ELSE 0 END) as "9",
        SUM(CASE WHEN CAST(rating AS INTEGER) >= 10 THEN 1 ELSE 0 END) as "10"
      FROM (SELECT rating FROM movies UNION ALL SELECT rating FROM shows)
    `).get();

    // Average downloaded movie size
    const avgSizeRow = db.prepare(
      "SELECT COALESCE(ROUND(AVG(COALESCE(file_size, 0))), 0) as avg FROM movies WHERE status = 'downloaded'"
    ).get();

    // Recent items (6 most recently added across movies + shows)
    const recentMovies = db.prepare(
      "SELECT id, tmdb_id, title, year, added_at, status, 'movie' as mediaType FROM movies ORDER BY added_at DESC LIMIT 6"
    ).all();
    const recentShows = db.prepare(
      "SELECT id, tmdb_id, title, year, added_at, status, 'show' as mediaType FROM shows ORDER BY added_at DESC LIMIT 6"
    ).all();
    const recentItems = [...recentMovies, ...recentShows]
      .sort((a, b) => new Date(b.added_at) - new Date(a.added_at))
      .slice(0, 6);

    // Top genres (parse comma-separated genres server-side)
    const genreRows = db.prepare(
      "SELECT genres FROM movies WHERE genres IS NOT NULL AND genres != '' UNION ALL SELECT genres FROM shows WHERE genres IS NOT NULL AND genres != ''"
    ).all();
    const genreCount = {};
    for (const row of genreRows) {
      for (const g of row.genres.split(',')) {
        const t = g.trim();
        if (t) genreCount[t] = (genreCount[t] || 0) + 1;
      }
    }
    const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Year distribution
    const yearRows = db.prepare(
      "SELECT year, COUNT(*) as count FROM (SELECT year FROM movies WHERE year IS NOT NULL UNION ALL SELECT year FROM shows WHERE year IS NOT NULL) GROUP BY year ORDER BY year ASC"
    ).all();
    const yearData = yearRows.map(r => [String(r.year), r.count]);

    // Format statuses as plain objects
    const movieStatusObj = {};
    for (const s of movieStatuses) movieStatusObj[s.status] = s.count;
    const showStatusObj = {};
    for (const s of showStatuses) showStatusObj[s.status] = s.count;

    const totalDownloaded = downloadedMovies + downloadedShows;
    const totalItems = moviesCount + showsCount;

    // ── Subtitle stats ──
    const moviesWithFiles = db.prepare("SELECT COUNT(*) as count FROM movies WHERE file_path IS NOT NULL").get().count;
    const moviesWSubs = db.prepare("SELECT COUNT(*) as count FROM movies WHERE file_path IS NOT NULL AND subtitles IS NOT NULL AND subtitles != '[]'").get().count;
    const moviesMissingSubs = moviesWithFiles - moviesWSubs;

    // Shows with episodes missing subtitles
    const showsMissingSubs = db.prepare(`
      SELECT COUNT(DISTINCT s.id) as count FROM shows s
      JOIN episodes e ON e.show_id = s.id
      WHERE e.file_path IS NOT NULL AND (e.subtitles IS NULL OR e.subtitles = '[]')
    `).get().count;

    const episodesMissingSubs = db.prepare(`
      SELECT COUNT(*) as count FROM episodes
      WHERE file_path IS NOT NULL AND (subtitles IS NULL OR subtitles = '[]')
    `).get().count;
    
    // Aggregate all subtitle languages across movies
    const subLangRows = db.prepare("SELECT subtitles FROM movies WHERE file_path IS NOT NULL AND subtitles IS NOT NULL AND subtitles != '[]'").all();
    const subLangCount = {};
    for (const row of subLangRows) {
      try {
        const langs = JSON.parse(row.subtitles);
        for (const lang of langs) {
          if (lang) subLangCount[lang] = (subLangCount[lang] || 0) + 1;
        }
      } catch { /* ignore parse errors */ }
    }
    const topSubLanguages = Object.entries(subLangCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([lang, count]) => ({ lang, count }));

    res.json({
      status: 'success',
      data: {
        // Backward-compat fields (used by Layout sidebar)
        movies: moviesCount,
        shows: showsCount,
        // Extended stats
        totalMovies: moviesCount,
        totalShows: showsCount,
        totalEpisodes: episodesCount,
        movieStatuses: movieStatusObj,
        showStatuses: showStatusObj,
        totalFileSize,
        downloadedMovies,
        downloadedShows,
        totalDownloaded,
        totalItems,
        downloadPct: totalItems > 0 ? Math.round((totalDownloaded / totalItems) * 100) : 0,
        averageRating: averageRating !== null ? String(averageRating) : 'N/A',
        topGenres,
        yearData,
        ratingBuckets,
        recentItems,
        avgMovieSize: avgSizeRow?.avg ?? 0,
        // Subtitle stats
        moviesWithFiles,
        moviesWithSubtitles: moviesWSubs,
        moviesMissingSubtitles: moviesMissingSubs,
        showsMissingSubtitles: showsMissingSubs,
        episodesMissingSubtitles: episodesMissingSubs,
        topSubLanguages,
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/missing-subs', (req, res, next) => {
  try {
    // Movies with files but no subtitles
    const movies = db.prepare(`
      SELECT id, tmdb_id, title, year, file_path, added_at FROM movies 
      WHERE file_path IS NOT NULL AND (subtitles IS NULL OR subtitles = '[]')
      ORDER BY title ASC
    `).all();

    // Shows with files but no subtitles (episodes without subs)
    const shows = db.prepare(`
      SELECT DISTINCT s.id, s.tmdb_id, s.title, s.folder_path, s.added_at
      FROM shows s
      JOIN episodes e ON e.show_id = s.id
      WHERE e.file_path IS NOT NULL AND (e.subtitles IS NULL OR e.subtitles = '[]')
      ORDER BY s.title ASC
    `).all();

    // Also get the episode counts for each show
    const showsWithCounts = shows.map(show => {
      const missingCount = db.prepare(`
        SELECT COUNT(*) as count FROM episodes 
        WHERE show_id = ? AND file_path IS NOT NULL AND (subtitles IS NULL OR subtitles = '[]')
      `).get(show.id).count;
      return { ...show, missing_episode_count: missingCount };
    });

    res.json({ status: 'success', data: { movies, shows: showsWithCounts } });
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
    const { path, type } = req.body;
    if (!path) {
      return res.status(400).json({ status: 'error', message: 'path is required' });
    }
    if (type && !['movies', 'tv', 'downloads'].includes(type)) {
      return res.status(400).json({ status: 'error', message: 'type must be movies, tv, or downloads' });
    }
    const result = libraryService.addPath(path, type || 'movies');
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


router.get('/watched-tmdb', (req, res, next) => {
  try {
    const entries = db.prepare('SELECT tmdb_id, type FROM watched_tmdb').all();
    res.json({ status: 'success', data: entries });
  } catch (err) {
    next(err);
  }
});


router.post('/scan', async (req, res, next) => {
  try {
    const mode = req.body?.mode || 'full';
    const validModes = ['full', 'new', 'refresh', 'rematch', 'subtitles'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ status: 'error', message: `Invalid scan mode. Must be one of: ${validModes.join(', ')}` });
    }
    const result = await scannerService.scanLibrary(mode);
    res.json(result);
  } catch (error) {
    next(error);
  }
});


router.post('/scan/stop', (req, res) => {
  const stopped = scannerService.stopScan();
  res.json({ status: 'success', message: stopped ? 'Scan cancelled' : 'No scan in progress' });
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
        date(e.air_date, '+1 day') AS date, 
        e.overview, 
        s.title as show_title, 
        s.id as show_id, 
        s.tmdb_id,
        'episode' as type
      FROM episodes e
      JOIN shows s ON e.show_id = s.id
      WHERE e.air_date IS NOT NULL 
        AND s.status != 'unmonitored'
      UNION ALL
      SELECT 
        m.title,
        NULL as season_number,
        NULL as episode_number,
        m.release_date AS date,
        m.overview,
        NULL as show_title,
        m.id as show_id,
        m.tmdb_id,
        'movie' as type
      FROM movies m
      WHERE m.release_date IS NOT NULL
        AND m.status != 'unmonitored'
      ORDER BY date ASC
    `).all();

    res.json({ status: 'success', data: upcoming });
  } catch (err) {
    next(err);
  }
});


const VALID_BULK_TYPES = ['movies', 'shows'];

router.post('/bulk/status', (req, res, next) => {
  try {
    const { ids, status, type } = req.body; // type: 'movies' or 'shows'
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ status: 'error', message: 'ids array is required' });
    }
    if (!VALID_BULK_TYPES.includes(type)) {
      return res.status(400).json({ status: 'error', message: 'Invalid type. Must be movies or shows.' });
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
    if (!VALID_BULK_TYPES.includes(type)) {
      return res.status(400).json({ status: 'error', message: 'Invalid type. Must be movies or shows.' });
    }
    
    const table = type === 'shows' ? 'shows' : 'movies';
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE ${table} SET quality_profile_id = ? WHERE id IN (${placeholders})`).run(profileId, ...ids);
    
    res.json({ status: 'success', message: `Updated ${ids.length} item(s)` });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk/delete', async (req, res, next) => {
  try {
    const { ids, type, deleteFiles } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ status: 'error', message: 'ids array is required' });
    }
    if (!VALID_BULK_TYPES.includes(type)) {
      return res.status(400).json({ status: 'error', message: 'Invalid type. Must be movies or shows.' });
    }
    
    const table = type === 'shows' ? 'shows' : 'movies';
    const placeholders = ids.map(() => '?').join(',');

    if (deleteFiles) {
      const items = db.prepare(`SELECT * FROM ${table} WHERE id IN (${placeholders})`).all(...ids);
      const deleteFolderRecursive = async (folderPath) => {
        const entries = await fsp.readdir(folderPath, { withFileTypes: true });
        await Promise.all(entries.map(entry => {
          const full = path.join(folderPath, entry.name);
          return entry.isDirectory() ? deleteFolderRecursive(full) : fsp.unlink(full).catch(() => {});
        }));
        await fsp.rmdir(folderPath).catch(() => {});
      };

      for (const item of items) {
        try {
          const dir = type === 'shows' ? item.folder_path : (item.file_path ? path.dirname(item.file_path) : item.folder_path);
          if (dir) {
            await deleteFolderRecursive(dir);
          }
        } catch (e) {
          console.warn(`[bulk/delete] Could not delete folder for ${item.title}:`, e?.message);
        }
      }
    }

    db.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).run(...ids);
    if (type === 'shows') {
      db.prepare(`DELETE FROM episodes WHERE show_id IN (${placeholders})`).run(...ids);
    }

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

    // Download client health
    const downloadClients = db.prepare('SELECT * FROM download_clients').all();
    const clientHealth = await Promise.all(downloadClients.map(async (c) => {
      try {
        const result = await downloadClientService.testClientConnection(c);
        return {
          id: c.id,
          name: c.name,
          type: c.type,
          status: result.status === 'connected' ? 'healthy' : 'unhealthy',
          message: result.message || null
        };
      } catch {
        return { id: c.id, name: c.name, type: c.type, status: 'unhealthy', message: 'Unreachable' };
      }
    }));

    // System info
    const uptimeSec = process.uptime();
    const memUsage = process.memoryUsage();

    res.json({
      status: 'success',
      data: {
        db: { sizeBytes: dbSize },
        library: { movies: movieCount, shows: showCount, episodes: epCount },
        paths: pathHealth,
        downloadClients: clientHealth,
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

// Get deletable movies (movies not part of any TMDB collection/franchise)
router.get('/deletable', async (req, res, next) => {
  try {
    const now = Date.now();
    const DAY = 86400000;
    const useTmdb = req.query.tmdb === 'true';

    const movies = db.prepare(`
      SELECT id, tmdb_id, title, year, file_size, added_at, file_path, watched, rating as db_rating
      FROM movies WHERE status = 'downloaded' AND tmdb_id IS NOT NULL
      ORDER BY added_at DESC
    `).all();

    // ── Detect franchises: title-based grouping (instant, no API calls) ──
    const stripSequels = (title) => {
      let base = title
        .replace(/\s*\(\d{4}\)\s*/g, '')
        .replace(/\bPart\s+(?:II|III|IV|V|VI|VII|VIII|IX|X|[2-9])\b/gi, '')
        .replace(/\b(?:II|III|IV|V|VI|VII|VIII|IX|X)\b/g, '')
        .replace(/\s+\d+\s*$/, '')
        .replace(/\s*:\s*[^:]+$/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (base.length < 3) base = title.replace(/\s*\(\d{4}\)\s*/g, '').trim().toLowerCase();
      return base;
    };

    // Generate candidate base titles by removing leading words (for suffix matching)
    // e.g. "Dawn of the Planet of the Apes" -> ["dawn of the planet of the apes", "of the planet of the apes", "the planet of the apes", "planet of the apes"]
    const getBaseCandidates = (title) => {
      const base = stripSequels(title);
      const words = base.split(/\s+/);
      const candidates = [];
      // Generate suffixes by stripping up to N leading words, keep at least 2 words
      const maxStrip = Math.max(0, words.length - 2);
      for (let i = 0; i <= maxStrip; i++) {
        const suffix = words.slice(i).join(' ');
        if (suffix.length >= 3) candidates.push(suffix);
      }
      return candidates;
    };

    // Group by each candidate and merge overlapping groups
    const candidateMap = new Map(); // candidate_base -> Set of movie IDs
    for (const m of movies) {
      for (const cand of getBaseCandidates(m.title)) {
        if (!candidateMap.has(cand)) candidateMap.set(cand, new Set());
        candidateMap.get(cand).add(m.id);
      }
    }

    // Union-find: movies that share ANY candidate base are in the same franchise
    const parent = new Map();
    const find = (id) => {
      if (!parent.has(id)) parent.set(id, id);
      if (parent.get(id) !== id) parent.set(id, find(parent.get(id)));
      return parent.get(id);
    };
    const union = (a, b) => { parent.set(find(a), find(b)); };

    for (const [, ids] of candidateMap) {
      if (ids.size > 1) {
        const arr = [...ids];
        for (let i = 1; i < arr.length; i++) union(arr[0], arr[i]);
      }
    }

    // Build franchise groups from union-find
    const franchiseGroups = new Map(); // root -> Set of movie IDs
    for (const m of movies) {
      const root = find(m.id);
      if (!franchiseGroups.has(root)) franchiseGroups.set(root, new Set());
      franchiseGroups.get(root).add(m.id);
    }

    const franchiseIds = new Set();
    const franchiseNames = new Map();

    for (const [, ids] of franchiseGroups) {
      if (ids.size > 1) {
        for (const id of ids) {
          franchiseIds.add(id);
          const others = movies.filter(m => ids.has(m.id) && m.id !== id).map(m => m.title);
          franchiseNames.set(id, others);
        }
      }
    }

    // ── Optional: TMDB enrichment (ratings + collection-based grouping) ──
    const tmdbCache = new Map();

    if (useTmdb) {
      await concurrency.runWithConcurrency(movies, 10, async (movie) => {
        try {
          const data = await tmdbService.getMovieById(movie.tmdb_id);
          if (data) {
            tmdbCache.set(movie.tmdb_id, {
              rating: data.vote_average ? Math.round(data.vote_average * 10) / 10 : null,
              collectionId: data.belongs_to_collection?.id || null,
              collectionName: data.belongs_to_collection?.name || null
            });
          }
        } catch { /* skip */ }
      });

      // TMDB collection-based grouping
      const collectionGroups = new Map();
      for (const m of movies) {
        const cached = tmdbCache.get(m.tmdb_id);
        if (cached?.collectionId) {
          if (!collectionGroups.has(cached.collectionId)) collectionGroups.set(cached.collectionId, []);
          collectionGroups.get(cached.collectionId).push(m.id);
        }
      }

      for (const [, ids] of collectionGroups) {
        if (ids.length > 1) {
          for (const id of ids) {
            franchiseIds.add(id);
            const others = movies.filter(m => ids.includes(m.id) && m.id !== id).map(m => m.title);
            franchiseNames.set(id, [...(franchiseNames.get(id) || []), ...others]);
          }
        }
      }
    }

    // ── Score each movie ──
    const scored = [];

    for (const movie of movies) {
      const cached = tmdbCache.get(movie.tmdb_id);
      const tmdbRating = cached?.rating || null;
      const ageDays = (now - new Date(movie.added_at + 'Z').getTime()) / DAY;
      const isWatched = movie.watched === 1;
      const fileSizeGB = (movie.file_size || 0) / (1024 * 1024 * 1024);
      const hasSequelsInLibrary = franchiseIds.has(movie.id);

      let score = 0;
      const reasons = [];

      if (hasSequelsInLibrary) {
        // Skip franchise movies — user likely wants to keep the collection intact
        continue;
      }

      score += 15;
      reasons.push('Standalone (no sequels in library)');

      // Skip highly rated movies (if TMDB data available)
      if (tmdbRating !== null && tmdbRating >= 6.5) {
        continue;
      }

      if (tmdbRating !== null && tmdbRating < 5) {
        score += 25;
        reasons.push(`Low TMDB rating (${tmdbRating}/10)`);
      } else if (tmdbRating !== null && tmdbRating < 6) {
        score += 15;
        reasons.push(`Mediocre TMDB rating (${tmdbRating}/10)`);
      }

      if (!isWatched) {
        score += 15;
        reasons.push('Unwatched');

        if (ageDays > 90) {
          score += 20;
          reasons.push('Added 90+ days ago, still unwatched');
        } else if (ageDays > 30) {
          score += 10;
          reasons.push('Added 30+ days ago, still unwatched');
        }
      }

      if (fileSizeGB > 10) {
        score += 10;
        reasons.push(`Large file (${fileSizeGB.toFixed(1)} GB)`);
      }

      scored.push({
        id: movie.id,
        tmdb_id: movie.tmdb_id,
        title: movie.title,
        year: movie.year,
        file_size: movie.file_size,
        added_at: movie.added_at,
        watched: isWatched,
        db_rating: movie.db_rating,
        tmdb_rating: tmdbRating,
        has_sequels_in_library: hasSequelsInLibrary,
        sequel_titles: [...new Set(franchiseNames.get(movie.id) || [])],
        score: Math.max(0, score),
        reasons
      });
    }

    // Sort by score descending (most deletable first)
    scored.sort((a, b) => b.score - a.score);

    const highPriority = scored.filter(m => m.score >= 35);
    const mediumPriority = scored.filter(m => m.score >= 15 && m.score < 35);
    const lowPriority = scored.filter(m => m.score < 15);

    res.json({
      status: 'success',
      data: {
        all: scored,
        highPriority,
        mediumPriority,
        lowPriority,
        total: scored.length,
        franchiseCount: franchiseIds.size
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
