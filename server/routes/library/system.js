const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const fsp = require('fs/promises');
const libraryService = require('../../services/libraryService');
const scannerService = require('../../services/scannerService');
const downloadClientService = require('../../services/downloadClientService');
const tmdbService = require('../../services/tmdbService');

// Stats
router.get('/stats', (req, res, next) => {
  try {
    const moviesCount = db.prepare('SELECT count(*) as count FROM movies').get().count;
    const showsCount = db.prepare('SELECT count(*) as count FROM shows').get().count;
    res.json({ status: 'success', data: { movies: moviesCount, shows: showsCount } });
  } catch (error) {
    next(error);
  }
});

// Downloads
router.get('/downloads', async (req, res, next) => {
  try {
    const torrents = await downloadClientService.getTorrents();
    res.json({ status: 'success', data: torrents });
  } catch (error) {
    next(error);
  }
});

// Paths
router.get('/paths', (req, res, next) => {
  try {
    const paths = libraryService.getPaths();
    res.json({ status: 'success', data: paths });
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

// Scan
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
    const { paths } = req.body;
    if (!Array.isArray(paths)) {
      return res.status(400).json({ status: 'error', message: 'paths must be an array' });
    }
    const results = [];
    for (const p of paths) {
      try {
        await fsp.stat(p);
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

// Simple in-memory cache for calendar data
const calendarCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_UPCOMING_DAYS = 90; // Only show episodes within next 90 days

// Calendar
router.get('/calendar', async (req, res, next) => {
  try {
    // Check cache
    const cached = calendarCache.get('calendar');
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json({ status: 'success', data: cached.data, cached: true });
    }

    const shows = db.prepare("SELECT * FROM shows WHERE status != 'unmonitored'").all();
    if (shows.length === 0) {
      return res.json({ status: 'success', data: [] });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + MAX_UPCOMING_DAYS);

    // Step 1: Fetch all show details in parallel to get season lists
    const showDetailsResults = await Promise.allSettled(
      shows.map(show => tmdbService.getShowById(show.tmdb_id).catch(() => null))
    );

    // Step 2: Collect which seasons to fetch (only seasons that could have future episodes)
    const seasonFetches = [];
    const showMap = new Map(); // tmdb_id -> show DB row

    for (let i = 0; i < shows.length; i++) {
      const show = shows[i];
      const result = showDetailsResults[i];
      if (result.status !== 'fulfilled' || !result.value) continue;
      
      const tmdbData = result.value;
      if (!tmdbData.seasons) continue;
      
      showMap.set(show.tmdb_id, show);

      for (const season of tmdbData.seasons) {
        if (!season.season_number || season.season_number === 0) continue;
        // Skip seasons whose air_date is in the past and has no upcoming episodes
        // TMDB provides episode_count — we'll fetch to be safe but skip obviously completed seasons
        // by checking if season aired years ago (very likely no upcoming episodes)
        const seasonAirYear = season.air_date ? new Date(season.air_date).getFullYear() : 0;
        const currentYear = today.getFullYear();
        
        // Skip seasons that aired more than 2 years ago (very unlikely to have upcoming episodes)
        if (seasonAirYear > 0 && seasonAirYear < currentYear - 2 && today.getFullYear() > seasonAirYear + 2) {
          continue;
        }
        
        seasonFetches.push({
          show,
          tmdbId: show.tmdb_id,
          seasonNumber: season.season_number,
        });
      }
    }

    // Step 3: Fetch all season details in parallel
    const seasonResults = await Promise.allSettled(
      seasonFetches.map(sf =>
        tmdbService.getSeasonById(sf.tmdbId, sf.seasonNumber).catch(() => null)
      )
    );

    // Step 4: Collect upcoming episodes
    const upcoming = [];

    for (let i = 0; i < seasonFetches.length; i++) {
      const sf = seasonFetches[i];
      const result = seasonResults[i];
      if (result.status !== 'fulfilled' || !result.value) continue;
      
      const seasonData = result.value;
      if (!seasonData.episodes) continue;

      for (const ep of seasonData.episodes) {
        if (!ep.air_date) continue;
        const airDate = new Date(ep.air_date);
        
        if (airDate >= today && airDate <= maxDate) {
          upcoming.push({
            show_title: sf.show.title,
            show_id: sf.show.id,
            tmdb_id: sf.show.tmdb_id,
            season_number: sf.seasonNumber,
            episode_number: ep.episode_number,
            title: ep.name,
            air_date: ep.air_date,
            overview: ep.overview,
          });
        }
      }
    }

    upcoming.sort((a, b) => new Date(a.air_date) - new Date(b.air_date));

    // Cache the result
    calendarCache.set('calendar', { data: upcoming, timestamp: Date.now() });

    res.json({ status: 'success', data: upcoming });
  } catch (err) {
    next(err);
  }
});

// Bulk operations
router.post('/bulk/status', (req, res, next) => {
  try {
    const { ids, status, type } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ status: 'error', message: 'ids array is required' });
    }
    
    const table = type === 'shows' ? 'shows' : 'movies';
    const stmt = db.prepare(`UPDATE ${table} SET status = ? WHERE id = ?`);
    const updateMany = db.transaction((items) => {
      for (const id of items) stmt.run(status, id);
    });
    updateMany(ids);
    
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
    const stmt = db.prepare(`UPDATE ${table} SET quality_profile_id = ? WHERE id = ?`);
    const updateMany = db.transaction((items) => {
      for (const id of items) stmt.run(profileId, id);
    });
    updateMany(ids);
    
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
    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
    const deleteMany = db.transaction((items) => {
      for (const id of items) stmt.run(id);
    });
    deleteMany(ids);
    
    res.json({ status: 'success', message: `Deleted ${ids.length} item(s)` });
  } catch (err) {
    next(err);
  }
});

// Duplicate detection
router.get('/duplicates', (req, res, next) => {
  try {
    const duplicates = { movies: [], shows: [] };

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
    const { id, type } = req.body;
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

module.exports = router;
