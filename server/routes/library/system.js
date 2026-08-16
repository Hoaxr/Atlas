const express = require('express');
const router = express.Router();
const path = require('path');
const fsp = require('fs/promises');
const db = require('../../config/database');
const libraryService = require('../../services/libraryService');
const scannerService = require('../../services/scanner');
const downloadClientService = require('../../services/downloadClientService');
const tmdbService = require('../../services/tmdbService');
const concurrency = require('../../utils/concurrency');
const { deleteFolderRecursive } = require('../../utils/fileUtils');
const { parseResolution } = require('../../utils/mediaParsing');
const cleanupWorker = require('../../services/cleanupWorker');

// ── Stats cache — avoids 20+ DB queries on every dashboard load ──
let _statsCache = null;
let _statsCacheTimestamp = 0;
const STATS_CACHE_TTL = 60_000; // 60 seconds

// Called by scan/import/delete handlers to invalidate
const invalidateStatsCache = () => { _statsCache = null; _statsCacheTimestamp = 0; };

router.get('/health', (req, res, next) => {
  try {
    const movies = db.prepare(`
      SELECT m.id, m.title, m.status, m.scene_name, m.file_path, qp.cutoff, qp.qualities
      FROM movies m
      LEFT JOIN quality_profiles qp ON m.quality_profile_id = qp.id
      WHERE m.status IN ('monitored', 'downloaded') AND m.monitored = 1
      AND m.release_date IS NOT NULL AND m.release_date <= date('now')
    `).all();

    const missingMovies = [];
    const cutoffUnmetMovies = [];
    const cutoffMetMovies = [];

    for (const m of movies) {
      const item = { id: m.id, title: m.title, status: m.status, scene_name: m.scene_name, file_path: m.file_path, cutoff: m.cutoff, currentQuality: null };
      if (!m.file_path || m.status !== 'downloaded') {
        missingMovies.push(item);
        continue;
      }

      let currentQuality = parseResolution(m.scene_name);
      if (currentQuality === 'Unknown' && m.file_path) {
        currentQuality = parseResolution(m.file_path);
      }
      item.currentQuality = currentQuality;

      if (!m.cutoff || !m.qualities) {
        cutoffUnmetMovies.push(item);
        continue;
      }

      let qualities = [];
      try { qualities = JSON.parse(m.qualities); } catch (_) { /* ignore parse error */ }
      const currentIdx = qualities.indexOf(currentQuality);
      const cutoffIdx = qualities.indexOf(m.cutoff);

      if (currentIdx !== -1 && cutoffIdx !== -1 && currentIdx <= cutoffIdx) {
        cutoffMetMovies.push(item);
      } else {
        cutoffUnmetMovies.push(item);
      }
    }

    const eps = db.prepare(`
      SELECT e.id, s.id as show_id, s.title || ' - S' || printf('%02d', e.season_number) || 'E' || printf('%02d', e.episode_number) as title, e.status, e.scene_name, e.file_path, qp.cutoff, qp.qualities
      FROM episodes e
      JOIN shows s ON e.show_id = s.id
      LEFT JOIN quality_profiles qp ON s.quality_profile_id = qp.id
      WHERE e.status IN ('monitored', 'downloaded') AND e.monitored = 1 AND s.monitored = 1
      AND e.air_date IS NOT NULL AND e.air_date <= date('now')
    `).all();

    const missingEps = [];
    const cutoffUnmetEps = [];
    const cutoffMetEps = [];

    for (const e of eps) {
      const item = { id: e.id, show_id: e.show_id, title: e.title, status: e.status, scene_name: e.scene_name, file_path: e.file_path, cutoff: e.cutoff, currentQuality: null };
      if (!e.file_path || e.status !== 'downloaded') {
        missingEps.push(item);
        continue;
      }
      
      let currentQuality = parseResolution(e.scene_name);
      if (currentQuality === 'Unknown' && e.file_path) {
        currentQuality = parseResolution(e.file_path);
      }
      item.currentQuality = currentQuality;

      if (!e.cutoff || !e.qualities) {
        cutoffUnmetEps.push(item);
        continue;
      }

      let qualities = [];
      try { qualities = JSON.parse(e.qualities); } catch (_) { /* ignore parse error */ }
      const currentIdx = qualities.indexOf(currentQuality);
      const cutoffIdx = qualities.indexOf(e.cutoff);

      if (currentIdx !== -1 && cutoffIdx !== -1 && currentIdx <= cutoffIdx) {
        cutoffMetEps.push(item);
      } else {
        cutoffUnmetEps.push(item);
      }
    }

    res.json({
      status: 'success',
      data: {
        movies: { missing: missingMovies, cutoffMet: cutoffMetMovies, cutoffUnmet: cutoffUnmetMovies },
        episodes: { missing: missingEps, cutoffMet: cutoffMetEps, cutoffUnmet: cutoffUnmetEps }
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/cleanup-candidates', async (req, res, next) => {
  try {
    const data = cleanupWorker.getCandidates();
    if (!data) {
      return res.json({ status: 'success', data: { all: [], highPriority: [], mediumPriority: [], lowPriority: [], total: 0 } });
    }
    res.json({
      status: 'success',
      data
    });
  } catch (err) {
    next(err);
  }
});

router.post('/cleanup-candidates/:id/ignore', async (req, res, next) => {
  try {
    const movieId = req.params.id;
    db.prepare('UPDATE movies SET ignore_cleanup = 1 WHERE id = ?').run(movieId);
    cleanupWorker.removeItem(movieId);
    res.json({ status: 'success' });
  } catch (err) {
    next(err);
  }
});

router.post('/cleanup-candidates/unignore-all', async (req, res, next) => {
  try {
    db.prepare('UPDATE movies SET ignore_cleanup = 0 WHERE ignore_cleanup = 1').run();
    await cleanupWorker.calculateDeletable();
    const data = cleanupWorker.getCandidates();
    res.json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
});

router.post('/cleanup-candidates', async (req, res, next) => {
  try {
    const { items } = req.body; 
    let freedSpace = 0;
    
    for (const item of items) {
      if (item.type === 'movie') {
        const movie = db.prepare('SELECT id, file_path, file_size FROM movies WHERE id = ?').get(item.id);
        if (movie && movie.file_path) {
          try {
            await fsp.unlink(movie.file_path);
          } catch (e) {
            console.error(`Failed to delete file ${movie.file_path}`, e);
          }
          db.prepare("UPDATE movies SET status = 'unmonitored', file_path = NULL, file_size = 0, search_state = 'PENDING' WHERE id = ?").run(item.id);
          freedSpace += movie.file_size || 0;
          cleanupWorker.removeItem(item.id);
        }
      } else if (item.type === 'episode') {
        const ep = db.prepare('SELECT id, file_path, file_size FROM episodes WHERE id = ?').get(item.id);
        if (ep && ep.file_path) {
          try {
            await fsp.unlink(ep.file_path);
          } catch (e) {
            console.error(`Failed to delete file ${ep.file_path}`, e);
          }
          db.prepare("UPDATE episodes SET status = 'unmonitored', file_path = NULL, file_size = 0, search_state = 'PENDING' WHERE id = ?").run(item.id);
          freedSpace += ep.file_size || 0;
        }
      }
    }
    
    invalidateStatsCache();
    
    res.json({
      status: 'success',
      message: `Cleaned up ${items.length} items.`,
      freedSpace
    });
  } catch (err) {
    next(err);
  }
});

router.get('/stats', (req, res, next) => {
  try {
    // Serve from cache when available
    if (_statsCache && Date.now() - _statsCacheTimestamp < STATS_CACHE_TTL) {
      return res.json({ status: 'success', data: _statsCache });
    }

    // ── Consolidated query 1: movie aggregates (count, statuses, size, downloaded, avg size) ──
    const movieAgg = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(COALESCE(file_size, 0)), 0) as totalSize,
        COUNT(CASE WHEN status = 'downloaded' THEN 1 END) as downloaded,
        COUNT(CASE WHEN file_path IS NOT NULL THEN 1 END) as withFiles,
        COUNT(CASE WHEN file_path IS NOT NULL AND subtitles IS NOT NULL AND subtitles != '[]' THEN 1 END) as withSubs,
        COALESCE(ROUND(AVG(CASE WHEN status = 'downloaded' THEN COALESCE(file_size, 0) END)), 0) as avgSize
      FROM movies
    `).get();

    // ── Consolidated query 2: show aggregates ──
    const showAgg = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(COALESCE(folder_size, 0)), 0) as totalSize,
        COUNT(CASE WHEN status = 'downloaded' THEN 1 END) as downloaded
      FROM shows
    `).get();

    // ── Query 3: episode aggregates ──
    const epAgg = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(COALESCE(file_size, 0)), 0) as totalSize,
        COUNT(CASE WHEN file_path IS NOT NULL AND file_path != '' THEN 1 END) as withFiles,
        COUNT(CASE WHEN file_path IS NOT NULL AND file_path != '' AND subtitles IS NOT NULL AND subtitles != '[]' THEN 1 END) as withSubs,
        COUNT(CASE WHEN file_path IS NOT NULL AND file_path != '' AND (subtitles IS NULL OR subtitles = '[]') THEN 1 END) as missingSubs
      FROM episodes
    `).get();

    // ── Query 4: movie status breakdown ──
    const movieStatuses = db.prepare('SELECT status, COUNT(*) as count FROM movies GROUP BY status').all();
    const showStatuses  = db.prepare('SELECT status, COUNT(*) as count FROM shows GROUP BY status').all();

    // ── Query 5: rating stats (avg + buckets) ──
    const ratingStats = db.prepare(`
      SELECT
        ROUND(AVG(rating), 1) as avg,
        SUM(CASE WHEN CAST(rating AS INTEGER) = 1  THEN 1 ELSE 0 END) as "r1",
        SUM(CASE WHEN CAST(rating AS INTEGER) = 2  THEN 1 ELSE 0 END) as "r2",
        SUM(CASE WHEN CAST(rating AS INTEGER) = 3  THEN 1 ELSE 0 END) as "r3",
        SUM(CASE WHEN CAST(rating AS INTEGER) = 4  THEN 1 ELSE 0 END) as "r4",
        SUM(CASE WHEN CAST(rating AS INTEGER) = 5  THEN 1 ELSE 0 END) as "r5",
        SUM(CASE WHEN CAST(rating AS INTEGER) = 6  THEN 1 ELSE 0 END) as "r6",
        SUM(CASE WHEN CAST(rating AS INTEGER) = 7  THEN 1 ELSE 0 END) as "r7",
        SUM(CASE WHEN CAST(rating AS INTEGER) = 8  THEN 1 ELSE 0 END) as "r8",
        SUM(CASE WHEN CAST(rating AS INTEGER) = 9  THEN 1 ELSE 0 END) as "r9",
        SUM(CASE WHEN CAST(rating AS INTEGER) >= 10 THEN 1 ELSE 0 END) as "r10"
      FROM (SELECT rating FROM movies WHERE rating > 0 UNION ALL SELECT rating FROM shows WHERE rating > 0)
    `).get();

    // ── Query 6: recent items, genres, years, subtitle stats ──
    const recentMovies = db.prepare(
      "SELECT id, tmdb_id, title, year, added_at, status, 'movie' as mediaType FROM movies ORDER BY added_at DESC LIMIT 6"
    ).all();
    const recentShows = db.prepare(
      "SELECT id, tmdb_id, title, year, added_at, status, 'show' as mediaType FROM shows ORDER BY added_at DESC LIMIT 6"
    ).all();
    const recentItems = [...recentMovies, ...recentShows]
      .sort((a, b) => new Date(b.added_at) - new Date(a.added_at))
      .slice(0, 6);

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

    const yearRows = db.prepare(
      "SELECT year, COUNT(*) as count FROM (SELECT year FROM movies WHERE year IS NOT NULL UNION ALL SELECT year FROM shows WHERE year IS NOT NULL) GROUP BY year ORDER BY year ASC"
    ).all();
    const yearData = yearRows.map(r => [String(r.year), r.count]);

    // Shows with episodes missing subtitles
    const showsMissingSubs = db.prepare(`
      SELECT COUNT(DISTINCT s.id) as count FROM shows s
      JOIN episodes e ON e.show_id = s.id
      WHERE e.file_path IS NOT NULL AND (e.subtitles IS NULL OR e.subtitles = '[]')
    `).get().count;

    // Subtitle languages
    const subLangRows = db.prepare(`
      SELECT subtitles FROM movies WHERE file_path IS NOT NULL AND subtitles IS NOT NULL AND subtitles != '[]'
      UNION ALL
      SELECT subtitles FROM episodes WHERE file_path IS NOT NULL AND subtitles IS NOT NULL AND subtitles != '[]'
    `).all();
    const subLangCount = {};
    for (const row of subLangRows) {
      try {
        const langs = JSON.parse(row.subtitles);
        for (const lang of langs) {
          if (lang) subLangCount[lang] = (subLangCount[lang] || 0) + 1;
        }
      } catch { /* ignore */ }
    }
    const topSubLanguages = Object.entries(subLangCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([lang, count]) => ({ lang, count }));

    // Build status objects
    const movieStatusObj = {};
    for (const s of movieStatuses) movieStatusObj[s.status] = s.count;
    const showStatusObj = {};
    for (const s of showStatuses) showStatusObj[s.status] = s.count;

    const moviesCount = movieAgg.total;
    const showsCount = showAgg.total;
    const totalFileSize = movieAgg.totalSize + showAgg.totalSize + epAgg.totalSize;
    const totalDownloaded = movieAgg.downloaded + showAgg.downloaded;
    const totalItems = moviesCount + showsCount;

    const data = {
      movies: moviesCount,
      shows: showsCount,
      totalMovies: moviesCount,
      totalShows: showsCount,
      totalEpisodes: epAgg.total,
      movieStatuses: movieStatusObj,
      showStatuses: showStatusObj,
      totalFileSize,
      downloadedMovies: movieAgg.downloaded,
      downloadedShows: showAgg.downloaded,
      totalDownloaded,
      totalItems,
      downloadPct: totalItems > 0 ? Math.round((totalDownloaded / totalItems) * 100) : 0,
      averageRating: ratingStats.avg !== null ? String(ratingStats.avg) : 'N/A',
      topGenres,
      yearData,
      ratingBuckets: { 1: ratingStats.r1, 2: ratingStats.r2, 3: ratingStats.r3, 4: ratingStats.r4, 5: ratingStats.r5, 6: ratingStats.r6, 7: ratingStats.r7, 8: ratingStats.r8, 9: ratingStats.r9, 10: ratingStats.r10 },
      recentItems,
      avgMovieSize: movieAgg.avgSize,
      moviesWithFiles: movieAgg.withFiles,
      moviesWithSubtitles: movieAgg.withSubs,
      moviesMissingSubtitles: movieAgg.withFiles - movieAgg.withSubs,
      showsMissingSubtitles: showsMissingSubs,
      episodesWithFiles: epAgg.withFiles,
      episodesWithSubtitles: epAgg.withSubs,
      episodesMissingSubtitles: epAgg.missingSubs,
      topSubLanguages,
    };

    _statsCache = data;
    _statsCacheTimestamp = Date.now();

    res.json({ status: 'success', data });
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

    // Shows with episodes missing subtitles — consolidated with COUNT in one query
    const showsWithCounts = db.prepare(`
      SELECT s.id, s.tmdb_id, s.title, s.folder_path, s.added_at,
        COUNT(e.id) as missing_episode_count
      FROM shows s
      JOIN episodes e ON e.show_id = s.id
      WHERE e.file_path IS NOT NULL AND (e.subtitles IS NULL OR e.subtitles = '[]')
      GROUP BY s.id
      ORDER BY s.title ASC
    `).all();

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
    const validModes = ['full', 'movies', 'shows', 'new', 'refresh', 'rematch', 'subtitles'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ status: 'error', message: `Invalid scan mode. Must be one of: ${validModes.join(', ')}` });
    }
    const result = await scannerService.scanLibrary(mode);
    invalidateStatsCache();
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
        e.air_date AS date, 
        e.overview, 
        s.title as show_title, 
        s.id as show_id, 
        s.tmdb_id,
        s.poster_path,
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
        m.poster_path,
        'movie' as type
      FROM movies m
      WHERE m.release_date IS NOT NULL
        AND m.status != 'unmonitored'
      ORDER BY date ASC
    `).all();

    const formatted = upcoming.map(item => {
      let dateStr = item.date;
      if (dateStr && dateStr.includes('T')) {
        dateStr = dateStr.split('T')[0];
      }
      return { ...item, date: dateStr };
    });

    res.json({ status: 'success', data: formatted });
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
      const { isRootLibraryPath } = require('../../utils/fileUtils');

      for (const item of items) {
        try {
          const dir = type === 'shows' ? item.folder_path : (item.file_path ? path.dirname(item.file_path) : item.folder_path);
          if (dir) {
            if (isRootLibraryPath(dir)) {
               // Only delete the file itself if the directory is a root library path
               if (item.file_path) await fsp.unlink(item.file_path).catch(() => {});
            } else {
               await deleteFolderRecursive(dir);
            }
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
    invalidateStatsCache();

    res.json({ status: 'success', message: `Deleted ${ids.length} item(s)` });
  } catch (err) {
    next(err);
  }
});


router.get('/duplicates', (req, res, next) => {
  try {
    const duplicates = { movies: [], shows: [] };

    // Consolidated: join duplicate TMDB IDs with full row data in one query
    const movieRows = db.prepare(`
      SELECT m.*, d.cnt as dup_count
      FROM movies m
      JOIN (SELECT tmdb_id, COUNT(*) as cnt FROM movies WHERE tmdb_id IS NOT NULL GROUP BY tmdb_id HAVING COUNT(*) > 1) d
        ON m.tmdb_id = d.tmdb_id
      ORDER BY m.tmdb_id, m.id
    `).all();

    const movieGroups = {};
    for (const row of movieRows) {
      if (!movieGroups[row.tmdb_id]) movieGroups[row.tmdb_id] = { tmdb_id: row.tmdb_id, count: row.dup_count, items: [] };
      movieGroups[row.tmdb_id].items.push({ ...row, displayTitle: row.title });
    }
    duplicates.movies = Object.values(movieGroups);

    const showRows = db.prepare(`
      SELECT s.*, d.cnt as dup_count
      FROM shows s
      JOIN (SELECT tmdb_id, COUNT(*) as cnt FROM shows WHERE tmdb_id IS NOT NULL GROUP BY tmdb_id HAVING COUNT(*) > 1) d
        ON s.tmdb_id = d.tmdb_id
      ORDER BY s.tmdb_id, s.id
    `).all();

    const showGroups = {};
    for (const row of showRows) {
      if (!showGroups[row.tmdb_id]) showGroups[row.tmdb_id] = { tmdb_id: row.tmdb_id, count: row.dup_count, items: [] };
      showGroups[row.tmdb_id].items.push({ ...row, displayTitle: row.title });
    }
    duplicates.shows = Object.values(showGroups);

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


const getSystemHealth = async (req, res, next) => {
  try {
    const fs = require('fs/promises');
    const path = require('path');
    const os = require('os');

    // DB file size
    let dbSize = 0;
    try {
      const dbPath = path.join(__dirname, '../../data/database.sqlite');
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
};

router.get('/system-health', getSystemHealth);
router.get('/health', getSystemHealth);


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


// ─── Junk File Cleanup ───────────────────────────────────────────────────────
// Walks all configured library paths and removes any file that is not a
// video, subtitle, poster.jpg, or the first .nfo found in the folder.
// Handles both flat movie folders and show → season subfolder structures.
router.post('/cleanup-junk', async (req, res, next) => {
  try {
    const { VIDEO_EXTENSIONS, SUBTITLE_EXTENSIONS } = require('../../utils/fileUtils');

    const isKeepable = (filename) => {
      const lower = filename.toLowerCase();
      const ext = path.extname(lower);
      if (VIDEO_EXTENSIONS.has(ext)) return true;
      if (SUBTITLE_EXTENSIONS.has(ext)) return true;
      return false;
    };

    // Walk a single folder (non-recursive) and delete all junk files.
    // Junk = anything that is not a video or subtitle file.
    const cleanFolder = async (folderPath) => {
      const deleted = [];

      let entries;
      try {
        entries = await fsp.readdir(folderPath);
      } catch {
        return deleted;
      }

      for (const entry of entries) {
        const fullPath = path.join(folderPath, entry);
        let stat;
        try { stat = await fsp.stat(fullPath); } catch { continue; }
        if (stat.isDirectory()) continue;

        if (!isKeepable(entry)) {
          try {
            await fsp.unlink(fullPath);
            deleted.push(fullPath);
          } catch (e) {
            console.warn(`[CleanupJunk] Could not delete ${fullPath}:`, e.message);
          }
        }
      }

      return deleted;
    };

    // Walk a library root: iterate top-level entries.
    // For a movie library: LibraryRoot/<MovieFolder>/ → clean directly
    // For a show library: LibraryRoot/<ShowFolder>/<SeasonFolder>/ → recurse one more level
    const processLibraryPath = async (libraryRoot) => {
      const allDeleted = [];
      let topEntries;
      try {
        topEntries = await fsp.readdir(libraryRoot, { withFileTypes: true });
      } catch {
        return allDeleted;
      }

      for (const topEntry of topEntries) {
        if (!topEntry.isDirectory()) continue;
        const topFolder = path.join(libraryRoot, topEntry.name);

        // Check if this folder itself contains video files → it's a movie folder
        let subEntries;
        try {
          subEntries = await fsp.readdir(topFolder, { withFileTypes: true });
        } catch { continue; }

        const hasVideo = subEntries.some(e => e.isFile() && VIDEO_EXTENSIONS.has(path.extname(e.name).toLowerCase()));
        const hasSubDirs = subEntries.some(e => e.isDirectory());

        if (hasVideo || !hasSubDirs) {
          // Movie folder — clean it directly
          const deleted = await cleanFolder(topFolder);
          allDeleted.push(...deleted);
        } else {
          // Show folder — iterate season subfolders
          for (const subEntry of subEntries) {
            if (!subEntry.isDirectory()) continue;
            const seasonFolder = path.join(topFolder, subEntry.name);
            const deleted = await cleanFolder(seasonFolder);
            allDeleted.push(...deleted);
          }
          // Also clean the show root folder itself (may have show-level artwork)
          const deleted = await cleanFolder(topFolder);
          allDeleted.push(...deleted);
        }
      }

      return allDeleted;
    };

    const configuredPaths = db.prepare('SELECT path, type FROM library_paths').all();
    const allDeleted = [];

    for (const libPath of configuredPaths) {
      if (libPath.type === 'downloads') continue;
      const deleted = await processLibraryPath(libPath.path);
      allDeleted.push(...deleted);
    }

    console.log(`[CleanupJunk] Cleanup complete. Deleted ${allDeleted.length} junk file(s).`);

    res.json({
      status: 'success',
      deletedCount: allDeleted.length,
      deleted: allDeleted,
    });
  } catch (err) {
    next(err);
  }
});

router.invalidateStatsCache = invalidateStatsCache;

module.exports = router;
