const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const axios = require('axios');
const db = require('../../config/database');
const libraryService = require('../../services/libraryService');
const indexerService = require('../../services/indexerService');
const downloadClientService = require('../../services/downloadClientService');
const eventBus = require('../../services/eventBus');
const tmdbService = require('../../services/tmdbService');
const subtitleService = require('../../services/subtitles');
const { getMediaMetadata, parseAudioFromFileName } = require('../../utils/videoUtils');
const { isWatchedSyncEnabled, getSubtitlesInDir, extractLang, translateSrt, LANG_CODE } = require('./helpers');
const { USER_AGENT } = require('../../utils/constants');

// In-memory cache for network mount directory scans — movies are on a CIFS/SMB
// mount with actimeo=1, so every fresh request hits the NAS. Cache avoids that.
const dirCache = new Map();
const DIR_CACHE_TTL = 60_000; // 60 seconds
const MAX_DIR_CACHE = 200; // LRU eviction limit

const scanDirectory = async (dirPath) => {
  const cached = dirCache.get(dirPath);
  if (cached && Date.now() - cached.timestamp < DIR_CACHE_TTL) {
    return cached.data;
  }
  const items = await Promise.race([
    fsp.readdir(dirPath),
    new Promise((_, reject) => setTimeout(() => reject(new Error('readdir timeout')), 3000))
  ]);
  const result = [];
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    try {
      const stats = await Promise.race([
        fsp.stat(fullPath),
        new Promise((_, reject) => setTimeout(() => reject(new Error('stat timeout')), 2000))
      ]);
      if (stats.isFile()) result.push({ name: item, size: stats.size });
    } catch { /* skip unstatable files */ }
  }
  // LRU eviction
  if (dirCache.size >= MAX_DIR_CACHE) {
    const oldest = dirCache.keys().next().value;
    dirCache.delete(oldest);
  }
  dirCache.set(dirPath, { data: result, timestamp: Date.now() });
  return result;
};

router.get('/', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 0;
    const offset = parseInt(req.query.offset) || 0;
    const sort = req.query.sort || 'added_desc';
    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.qualityProfileId) filters.qualityProfileId = req.query.qualityProfileId;
    const movies = libraryService.getMovies(limit, offset, sort, filters);

    // Skip expensive subtitle scanning when paginating
    if (limit > 0) {
      return res.json({ status: 'success', data: movies });
    }

    // Skip expensive subtitle scanning when only badge data is needed
    if (req.query.badges === 'true') {
      return res.json({ status: 'success', data: movies });
    }

    res.json({ status: 'success', data: movies });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const movie = db.prepare('SELECT m.*, qp.name as quality_profile_name FROM movies m LEFT JOIN quality_profiles qp ON m.quality_profile_id = qp.id WHERE m.id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });
    if (!isWatchedSyncEnabled()) movie.watched = 0;
    
    let subtitles = [];
    if (movie.file_path) {
      const dir = path.dirname(movie.file_path);
      
      // Single cached directory scan — avoids multiple network round-trips to NAS
      const [scanResult, statResult] = await Promise.allSettled([
        scanDirectory(dir),
        // File stat — skip if file_size is already known
        (async () => {
          if (movie.file_size) return null;
          const stats = await Promise.race([
            fsp.stat(movie.file_path),
            new Promise((_, reject) => setTimeout(() => reject(new Error('stat timeout')), 3000))
          ]);
          movie.size = stats.size;
          db.prepare('UPDATE movies SET file_size = ? WHERE id = ?').run(movie.size, movie.id);
          return null;
        })(),
      ]);
      
      if (scanResult.status === 'fulfilled') {
        const files = scanResult.value;
        subtitles = files
          .filter(f => ['.srt', '.sub', '.vtt', '.ass', '.ssa', '.smi', '.idx'].includes(path.extname(f.name).toLowerCase()))
          .map(f => ({ file: f.name, lang: extractLang(f.name, path) }));
        movie.files = files; // same data the /files endpoint returns
        // Persist subtitle languages for stats
        const subLangs = [...new Set(subtitles.map(s => s.lang).filter(Boolean))];
        db.prepare('UPDATE movies SET subtitles = ? WHERE id = ?').run(JSON.stringify(subLangs), movie.id);
      }
      if (statResult.status === 'rejected' && (statResult.reason?.message === 'stat timeout' || statResult.reason?.code === 'ENOENT')) {
        db.prepare("UPDATE movies SET file_path = NULL, file_size = NULL, status = 'monitored' WHERE id = ?").run(movie.id);
        movie.file_path = null;
        movie.status = 'monitored';
      }
    }
    movie.subtitles = subtitles;

    res.json({ status: 'success', data: movie });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/files', async (req, res, next) => {
  try {
    const movie = db.prepare('SELECT file_path FROM movies WHERE id = ?').get(req.params.id);
    const dir = movie?.file_path ? path.dirname(movie.file_path) : null;
    if (!dir) return res.json({ status: 'success', data: [] });

    try {
      const files = await scanDirectory(dir);
      res.json({ status: 'success', data: files });
    } catch (e) {
      res.json({ status: 'success', data: [] });
    }
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/files/:filename', async (req, res, next) => {
  try {
    const movie = db.prepare('SELECT file_path FROM movies WHERE id = ?').get(req.params.id);

    const dir = movie?.file_path ? path.dirname(movie.file_path) : null;
    if (!dir) return res.status(404).json({ status: 'error', message: 'Movie folder not found' });

    // Prevent path traversal
    const safeFilename = path.basename(req.params.filename);
    const targetPath = path.join(dir, safeFilename);

    try {
      await fsp.unlink(targetPath);
      // Update database — clear the file reference only if the deleted file is the primary movie file
      if (movie.file_path && path.basename(movie.file_path) === safeFilename) {
        db.prepare("UPDATE movies SET file_path = NULL, file_size = 0, status = 'monitored' WHERE id = ?").run(req.params.id);
      }
      res.json({ status: 'success' });
    } catch (e) {
      next(e);
    }
  } catch (err) {
    next(err);
  }
});

router.post('/:id/refresh', async (req, res, next) => {
  try {
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);

    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

    // Recursively find the largest video file inside a directory
    const findBestFile = async (dirPath) => {
      let best = null;
      let max = -1;
      let items;
      try { items = await fsp.readdir(dirPath); } catch { return null; }
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        try {
          const stats = await fsp.stat(fullPath);
          if (stats.isDirectory()) {
            const sub = await findBestFile(fullPath);
            if (sub && sub.size > max) { max = sub.size; best = sub; }
          } else {
            const ext = path.extname(item).toLowerCase();
            if (['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.ts', '.m2ts'].includes(ext) && stats.size > max) {
              max = stats.size;
              best = { path: fullPath, name: item, size: stats.size, dir: dirPath };
            }
          }
        } catch { /* ignore */ }
      }
      return best;
    };

    // Collect candidate directories to scan
    const scanPaths = new Set();
    if (movie.file_path) {
      try { scanPaths.add(path.dirname(movie.file_path)); } catch { /* ignore */ }
    }

    // Fallback: when DB has no path info, search all configured library paths
    // for a folder whose name contains the movie title (and year).
    if (scanPaths.size === 0) {
      const libraryPaths = db.prepare('SELECT path FROM library_paths').all();
      const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const titleNorm = normalize(movie.title);
      const yearStr   = movie.year ? String(movie.year) : '';

      for (const lp of libraryPaths) {
        // Scan up to two levels deep (e.g. /library/<title> or /library/Movies/<title>)
        const scanLevel = async (basePath) => {
          let entries;
          try { entries = await fsp.readdir(basePath, { withFileTypes: true }); } catch { return; }
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const nameNorm = normalize(entry.name);
            if (nameNorm.includes(titleNorm) && (!yearStr || entry.name.includes(yearStr))) {
              scanPaths.add(path.join(basePath, entry.name));
            }
          }
        };

        await scanLevel(lp.path);
        // Also one level deeper
        let topLevel = [];
        try { topLevel = await fsp.readdir(lp.path, { withFileTypes: true }); } catch { /* ignore */ }
        for (const sub of topLevel) {
          if (sub.isDirectory()) await scanLevel(path.join(lp.path, sub.name));
        }
      }
    }

    let bestFile = null;
    for (const dirPath of scanPaths) {
      dirCache.delete(dirPath);
      const result = await findBestFile(dirPath);
      if (result && (!bestFile || result.size > bestFile.size)) bestFile = result;
    }

    if (bestFile) {
      // Preserve existing scene_name unless it's empty/missing/auto-generated
      let resName = movie.scene_name;
      
      // Always detect and update resolution
      let resolution = null;
      // First try to extract from filename
      const nameLower = bestFile.name.toLowerCase();
      if (nameLower.includes('2160p') || nameLower.includes('4k')) resolution = '2160p';
      else if (nameLower.includes('1080p')) resolution = '1080p';
      else if (nameLower.includes('720p')) resolution = '720p';
      else if (nameLower.includes('480p')) resolution = '480p';

      // Detect and update codec
      let codec = null;
      if (nameLower.includes('x265') || nameLower.includes('h265') || nameLower.includes('hevc')) codec = 'x265';
      else if (nameLower.includes('x264') || nameLower.includes('h264') || nameLower.includes('avc')) codec = 'x264';

      let audio = parseAudioFromFileName(bestFile.name);

      if (!resolution || !codec || !audio) {
        try {
          const meta = await getMediaMetadata(bestFile.path);
          if (!resolution) resolution = meta.resolution;
          if (!codec) codec = meta.codec;
          if (!audio) audio = meta.audio;
        } catch { /* ignore */ }
      }

      if (!resName || resName === '' || resName.startsWith('Unknown ')) {
        resName = bestFile.name;
        const t = resName.toLowerCase();
        const hasRes = t.includes('2160p') || t.includes('4k') || t.includes('1080p') || t.includes('720p') || t.includes('480p') || t.includes('sd');
        if (!hasRes) {
          if (resolution) resName = `Unknown ${resolution}`;
        }
      }

      db.prepare('UPDATE movies SET file_path = ?, file_size = ?, scene_name = ?, status = ?, resolution = ?, codec = ?, audio = ? WHERE id = ?')
        .run(bestFile.path, bestFile.size, resName, 'downloaded', resolution, codec, audio, movie.id);
    } else if (scanPaths.size > 0) {
      // Paths were found but contained no video — genuinely missing
      db.prepare(`UPDATE movies SET status = CASE WHEN status = 'downloaded' THEN 'missing' ELSE status END, file_path = NULL, file_size = 0, scene_name = NULL WHERE id = ?`).run(movie.id);
    }
    // If scanPaths is empty (no library configured), leave status untouched

    try {
      const data = await tmdbService.getMovieById(movie.tmdb_id);
      if (data) {
        let releaseDate = await tmdbService.getMovieReleaseDates(movie.tmdb_id);
        if (!releaseDate && data.release_date) {
          const theatrical = new Date(data.release_date);
          theatrical.setDate(theatrical.getDate() + 90);
          releaseDate = theatrical.toISOString().split('T')[0];
        }
        if (!releaseDate) releaseDate = data.release_date || null;
        db.prepare('UPDATE movies SET rating = ?, poster_path = ?, overview = ?, release_date = ? WHERE id = ?')
          .run(data.vote_average || 0, data.poster_path, data.overview, releaseDate, movie.id);
      }
    } catch (e) { console.error('TMDB refresh failed for movie:', e.message); }

    res.json({ status: 'success', message: 'Movie refreshed' });
  } catch (e) {
    next(e);
  }
});

router.get('/:id/search', async (req, res, next) => {
  try {
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

    const results = await indexerService.searchMovie(movie.title, movie.year, null, null, true, movie.tmdb_id);
    res.json({ status: 'success', data: results });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reset', async (req, res, next) => {
  try {
    db.prepare("UPDATE movies SET status = 'monitored' WHERE id = ?").run(req.params.id);
    res.json({ status: 'success', message: 'Movie reset to monitored' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/toggle-monitor', async (req, res, next) => {
  try {
    const movie = db.prepare('SELECT monitored, file_path, status FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });
    
    const newMonitored = movie.monitored ? 0 : 1;
    db.prepare('UPDATE movies SET monitored = ? WHERE id = ?').run(newMonitored, req.params.id);
    
    // If the movie has a file on disk and we're re-enabling monitoring, restore 'downloaded' status
    if (newMonitored && movie.file_path) {
      db.prepare("UPDATE movies SET status = 'downloaded' WHERE id = ?").run(req.params.id);
    }
    
    res.json({ status: 'success', data: { monitored: newMonitored }});
  } catch (err) {
    next(err);
  }
});

router.put('/:id/quality', (req, res, next) => {
  try {
    const { profileId } = req.body;
    // Validate profileId exists if provided
    if (profileId) {
      const profile = db.prepare('SELECT id FROM quality_profiles WHERE id = ?').get(profileId);
      if (!profile) return res.status(400).json({ status: 'error', message: 'Quality profile not found' });
    }
    db.prepare('UPDATE movies SET quality_profile_id = ? WHERE id = ?').run(profileId || null, req.params.id);
    res.json({ status: 'success', message: 'Quality profile updated' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/download', async (req, res, next) => {
  try {
    const { torrentUrl } = req.body;
    if (!torrentUrl || typeof torrentUrl !== 'string' || !/^https?:\/\//.test(torrentUrl)) {
      return res.status(400).json({ status: 'error', message: 'Valid torrent URL (http/https) is required' });
    }
    
    await downloadClientService.addTorrent(torrentUrl);
    db.prepare("UPDATE movies SET status = 'downloading', scene_name = ? WHERE id = ?").run(null, req.params.id);
    
    res.json({ status: 'success', message: 'Sent to download client' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/auto-search', async (req, res, next) => {
  try {
    
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

    const results = await indexerService.searchMovie(movie.title, movie.year, null, null, false, movie.tmdb_id);
    if (!results || results.length === 0) {
      return res.json({ status: 'error', message: 'No torrents found for this movie' });
    }

    const bestResult = results[0];
    await downloadClientService.addTorrent(bestResult.link, 'movie');
    db.prepare("UPDATE movies SET status = 'downloading', scene_name = ? WHERE id = ?").run(bestResult.title, req.params.id);
    
    res.json({ status: 'success', message: 'Best result sent to download client', data: bestResult });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { tmdbId, qualityProfileId, rootFolderPath } = req.body;
    if (!tmdbId) {
      return res.status(400).json({ status: 'error', message: 'tmdbId is required' });
    }
    const result = await libraryService.addMovie(tmdbId, rootFolderPath);
    if (qualityProfileId) {
      db.prepare('UPDATE movies SET quality_profile_id = ? WHERE id = ?').run(qualityProfileId, result.id);
    }
    res.json({ status: 'success', data: result });
  } catch (error) {
    if (error.message === 'Movie already in library') {
      return res.status(409).json({ status: 'error', message: error.message });
    }
    next(error);
  }
});

router.post('/:id/translate-subs', async (req, res, next) => {
  try {
    const targetLangRow = db.prepare("SELECT value FROM settings WHERE key = 'targetLang'").get();
    const targetLang = req.body.targetLang || (targetLangRow && targetLangRow.value ? targetLangRow.value : 'Dutch');
    const langCode = LANG_CODE[targetLang] || 'nl';

    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });
    if (!movie.file_path) return res.status(400).json({ status: 'error', message: 'Movie has no file path' });
    if (!fs.existsSync(movie.file_path)) return res.status(400).json({ status: 'error', message: 'Movie file not found on disk' });

    const parsedPath = path.parse(movie.file_path);
    const enSubPath = path.join(parsedPath.dir, `${parsedPath.name}.en.srt`);
    const targetSubPath = path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`);

    if (!fs.existsSync(enSubPath)) {
      return res.status(400).json({ status: 'error', message: 'No English subtitle found to translate. Download English subs first.' });
    }

    if (fs.existsSync(targetSubPath)) {
      return res.status(400).json({ status: 'error', message: 'Translated subtitle already exists.' });
    }

    const enSrtContent = await fsp.readFile(enSubPath, 'utf8');
    const translatedText = await translateSrt(enSrtContent, targetLang);
    await fsp.writeFile(targetSubPath, translatedText);

    eventBus.success('Subtitle translated', { title: movie.title, type: 'movie', language: targetLang });

    res.json({ status: 'success', message: `Translated to ${targetLang}`, data: { file: `${parsedPath.name}.${langCode}.srt` } });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/download-subs', async (req, res, next) => {
  try {
    const { langCode, url, fileId } = req.body;

    if (!langCode) return res.status(400).json({ status: 'error', message: 'langCode is required' });

    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

    // If a fileId is provided, download from OpenSubtitles
    if (fileId) {
      if (!movie.file_path || !fs.existsSync(movie.file_path)) {
        return res.status(400).json({ status: 'error', message: 'Movie file not found on disk' });
      }
      const parsedPath = path.parse(movie.file_path);
      const subPath = path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`);
      const osApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'osApiKey'").get();
      if (!osApiKeyRow?.value) throw new Error('OpenSubtitles API key not set');
      const downloadRes = await axios.post('https://api.opensubtitles.com/api/v1/download',
        { file_id: fileId },
        { headers: { 'Api-Key': osApiKeyRow.value, 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Atlas/1.0' } }
      );
      const srtRes = await axios.get(downloadRes.data.link, { responseType: 'text', headers: { 'User-Agent': 'Atlas/1.0' } });
      await fsp.writeFile(subPath, srtRes.data);
      return res.json({ status: 'success', message: `Downloaded "${langCode}" subtitle via OpenSubtitles` });
    }

    // If a direct URL is provided, download from there
    if (url) {
      if (!movie.file_path || !fs.existsSync(movie.file_path)) {
        return res.status(400).json({ status: 'error', message: 'Movie file not found on disk' });
      }
      const parsedPath = path.parse(movie.file_path);
      const subPath = path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`);
      const srtRes = await axios.get(url, { responseType: 'text' });
      await fsp.writeFile(subPath, srtRes.data);
      return res.json({ status: 'success', message: `Downloaded "${langCode}" subtitle from URL` });
    }

    const result = await subtitleService.downloadSubtitlesForMovie(movie, langCode);
    if (result.alreadyExists) {
      return res.json({ status: 'success', message: `Subtitle already exists for "${langCode}"` });
    }
    res.json({ status: 'success', message: `Downloaded "${langCode}" subtitle` });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/watched', (req, res, next) => {
  try {
    const { watched } = req.body;
    db.prepare('UPDATE movies SET watched = ? WHERE id = ?').run(watched ? 1 : 0, req.params.id);
    res.json({ status: 'success', message: watched ? 'Marked as watched' : 'Marked as unwatched' });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/remap', async (req, res, next) => {
  try {
    const { tmdbId, title, year: movieYear, poster_path, overview, vote_average } = req.body;
    if (!tmdbId) return res.status(400).json({ status: 'error', message: 'tmdbId is required' });

    // Check if another movie already has this tmdb_id
    const existing = db.prepare('SELECT id FROM movies WHERE tmdb_id = ? AND id != ?').get(tmdbId, req.params.id);
    if (existing) return res.status(409).json({ status: 'error', message: 'Another movie in your library already has this TMDB ID' });

    // Use data passed from frontend (from TMDB search results) so we don't need a second API call
    const releaseYear = movieYear || null;

    db.prepare(`
      UPDATE movies SET tmdb_id = ?, title = ?, year = ?, poster_path = ?, overview = ?, rating = ? WHERE id = ?
    `).run(tmdbId, title, releaseYear, poster_path, overview, vote_average || 0, req.params.id);

    res.json({ status: 'success', message: 'Movie remapped successfully' });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleteFiles = req.query.deleteFiles === 'true';
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

    if (deleteFiles) {
      try {
        const dir = movie.file_path ? path.dirname(movie.file_path) : movie.folder_path;
        if (dir) {
          await fsp.rm(dir, { recursive: true, force: true });
        }
      } catch (e) {
        console.warn('[movies] Could not delete folder:', e?.message);
      }
    }

    db.prepare('DELETE FROM movies WHERE id = ?').run(req.params.id);
    res.json({ status: 'success', message: 'Movie removed from library' });
  } catch (error) {
    next(error);
  }
});


router.get('/:id/search-subs', async (req, res, next) => {
  try {
    const { lang } = req.query;
    if (!lang) return res.status(400).json({ status: 'error', message: 'lang query param is required' });

    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

    const results = await subtitleService.searchSubtitlesForMovie(movie, lang);
    res.json({ status: 'success', data: results });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/wanted', (req, res, next) => {
  try {
    const movie = db.prepare('SELECT id FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });
    db.prepare("UPDATE movies SET status = 'wanted' WHERE id = ?").run(req.params.id);
    res.json({ status: 'success', message: 'Added to watchlist' });
  } catch (err) { next(err); }
});

router.post('/:id/grab', async (req, res, next) => {
  try {
    const { link, title } = req.body;
    if (!link) return res.status(400).json({ status: 'error', message: 'link is required' });
    await downloadClientService.addTorrent(link);
    db.prepare("UPDATE movies SET status = 'downloading', scene_name = ? WHERE id = ?").run(title || null, req.params.id);
    eventBus.info('Manual grab started', { title: title || 'Unknown', type: 'movie' });
    res.json({ status: 'success', message: 'Download started' });
  } catch (err) { next(err); }
});

router.get('/:id/collections', (req, res, next) => {
  try {
    const rows = db.prepare(
      'SELECT c.* FROM collections c JOIN movie_collections mc ON c.id = mc.collection_id WHERE mc.movie_id = ?'
    ).all(req.params.id);
    res.json({ status: 'success', data: rows });
  } catch (err) { next(err); }
});

router.post('/:id/collections', (req, res, next) => {
  try {
    const { collectionIds } = req.body; // array of collection ids
    if (!Array.isArray(collectionIds)) {
      return res.status(400).json({ status: 'error', message: 'collectionIds must be an array' });
    }
    // Replace all assignments within a transaction
    const updateCollections = db.transaction((movieId, cIds) => {
      db.prepare('DELETE FROM movie_collections WHERE movie_id = ?').run(movieId);
      const stmt = db.prepare('INSERT OR IGNORE INTO movie_collections (movie_id, collection_id) VALUES (?, ?)');
      for (const cid of cIds) stmt.run(movieId, cid);
    });
    updateCollections(req.params.id, collectionIds);
    res.json({ status: 'success', message: 'Collections updated' });
  } catch (err) { next(err); }
});

// Browse directories for manual folder import
router.get('/:id/browse', async (req, res, next) => {
  try {
    const dirPath = req.query.path || null;

    if (!dirPath) {
      // Return library root paths as starting points
      const paths = db.prepare('SELECT path FROM library_paths').all();
      const roots = [];
      for (const p of paths) {
        try {
          const stat = await fsp.stat(p.path);
          if (stat.isDirectory()) roots.push({ path: p.path, name: path.basename(p.path) || p.path });
        } catch {
          console.warn('[movies] Could not stat library path:', p.path);
        }
      }
      return res.json({ status: 'success', data: roots, parent: null });
    }

    // Security: resolve and verify the path is within allowed locations
    const resolved = path.resolve(dirPath);
    // Prevent traversal outside library paths
    const libraryPaths = db.prepare('SELECT path FROM library_paths').all().map(p => path.resolve(p.path));
    const isAllowed = libraryPaths.some(lp => resolved.startsWith(lp));
    if (!isAllowed) {
      return res.status(403).json({ status: 'error', message: 'Access denied' });
    }
    try {
      await fsp.access(resolved);
    } catch {
      return res.status(404).json({ status: 'error', message: 'Directory not found' });
    }

    const entries = await fsp.readdir(resolved, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({ path: path.join(resolved, e.name), name: e.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parentPath = path.dirname(resolved);
    res.json({
      status: 'success',
      data: dirs,
      parent: parentPath !== resolved ? parentPath : null,
    });
  } catch (err) {
    next(err);
  }
});

// Set folder path for a movie and trigger re-scan
router.post('/:id/set-path', async (req, res, next) => {
  try {
    const { folderPath } = req.body;
    if (!folderPath) return res.status(400).json({ status: 'error', message: 'folderPath is required' });

    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

    // Verify the folder exists
    try {
      await fsp.access(folderPath);
    } catch {
      return res.status(400).json({ status: 'error', message: 'Folder does not exist' });
    }

    // Update folder_path
    db.prepare('UPDATE movies SET folder_path = ? WHERE id = ?').run(folderPath, req.params.id);

    // Scan the folder for the largest video file
    const findBestFile = async (dirPath) => {
      let best = null;
      let max = -1;
      let items;
      try { items = await fsp.readdir(dirPath); } catch { return null; }
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        try {
          const stats = await fsp.stat(fullPath);
          if (stats.isDirectory()) {
            const sub = await findBestFile(fullPath);
            if (sub && sub.size > max) { max = sub.size; best = sub; }
          } else {
            const ext = path.extname(item).toLowerCase();
            if (['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.ts', '.m2ts'].includes(ext) && stats.size > max) {
              max = stats.size;
              best = { path: fullPath, name: item, size: stats.size, dir: dirPath };
            }
          }
        } catch { /* ignore */ }
      }
      return best;
    };

    const best = await findBestFile(folderPath);
    if (best) {
      db.prepare("UPDATE movies SET file_path = ?, file_size = ?, status = 'downloaded' WHERE id = ?")
        .run(best.path, best.size, req.params.id);
      res.json({
        status: 'success',
        message: `Found "${best.name}" (${(best.size / 1e6).toFixed(1)} MB). Folder imported.`,
        data: { file_path: best.path, file_name: best.name, file_size: best.size },
      });
    } else {
      // Folder set but no video found
      db.prepare("UPDATE movies SET file_path = NULL, file_size = NULL, status = 'monitored' WHERE id = ?")
        .run(req.params.id);
      res.json({
        status: 'success',
        message: 'Folder set but no video file found inside. It will be monitored.',
      });
    }
  } catch (err) {
    next(err);
  }
});

// Lightweight sibling navigation — avoids fetching entire library
router.get('/:id/siblings', (req, res, next) => {
  try {
    const ids = db.prepare('SELECT id FROM movies ORDER BY title ASC').all().map(r => r.id);
    const idx = ids.indexOf(Number(req.params.id));
    res.json({
      status: 'success',
      data: { prevId: ids[idx - 1] || null, nextId: ids[idx + 1] || null }
    });
  } catch (err) {
    next(err);
  }
});


module.exports = router;
