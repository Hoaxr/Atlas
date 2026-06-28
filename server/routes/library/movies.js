const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const libraryService = require('../../services/libraryService');
const indexerService = require('../../services/indexerService');
const downloadClientService = require('../../services/downloadClientService');

router.get('/', (req, res, next) => {
  try {
    const movies = libraryService.getMovies();
    res.json({ status: 'success', data: movies });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const fs = require('fs/promises');
    const path = require('path');
    const movie = db.prepare('SELECT m.*, qp.name as quality_profile_name FROM movies m LEFT JOIN quality_profiles qp ON m.quality_profile_id = qp.id WHERE m.id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });
    if (!isWatchedSyncEnabled()) movie.watched = 0;
    
    let subtitles = [];
    if (movie.file_path) {
      try {
        const dir = path.dirname(movie.file_path);
        const subFiles = await getSubtitlesInDir(dir, fs, path);
        subtitles = subFiles.map(f => {
          return { file: f, lang: extractLang(f, path) };
        });
        const stats = await fs.stat(movie.file_path);
        movie.size = stats.size;
        // Persist size to DB so list view can use it
        db.prepare('UPDATE movies SET file_size = ? WHERE id = ?').run(movie.size, movie.id);
      } catch (err) {
        // Ignore if directory cannot be read
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
    const fs = require('fs/promises');
    const path = require('path');
    const movie = db.prepare('SELECT file_path FROM movies WHERE id = ?').get(req.params.id);

    const dir = movie?.file_path ? path.dirname(movie.file_path) : null;
    if (!dir) return res.json({ status: 'success', data: [] });

    try {
      const items = await fs.readdir(dir);
      const files = [];
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stats = await fs.stat(fullPath);
        if (stats.isFile()) files.push({ name: item, size: stats.size });
      }
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
    const fs = require('fs/promises');
    const path = require('path');
    const movie = db.prepare('SELECT file_path FROM movies WHERE id = ?').get(req.params.id);

    const dir = movie?.file_path ? path.dirname(movie.file_path) : null;
    if (!dir) return res.status(404).json({ status: 'error', message: 'Movie folder not found' });

    // Prevent path traversal
    const safeFilename = path.basename(req.params.filename);
    const targetPath = path.join(dir, safeFilename);

    try {
      await fs.unlink(targetPath);
      res.json({ status: 'success' });
    } catch (e) {
      res.status(500).json({ status: 'error', message: 'Failed to delete file' });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/:id/refresh', async (req, res, next) => {
  try {
    const fs = require('fs/promises');
    const path = require('path');
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);

    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

    // Recursively find the largest video file inside a directory
    const findBestFile = async (dirPath) => {
      let best = null;
      let max = -1;
      let items;
      try { items = await fs.readdir(dirPath); } catch { return null; }
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        try {
          const stats = await fs.stat(fullPath);
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
        } catch (e) {}
      }
      return best;
    };

    // Collect candidate directories to scan
    const scanPaths = new Set();
    if (movie.file_path) {
      try { scanPaths.add(path.dirname(movie.file_path)); } catch (e) {}
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
          try { entries = await fs.readdir(basePath, { withFileTypes: true }); } catch { return; }
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
        try { topLevel = await fs.readdir(lp.path, { withFileTypes: true }); } catch (e) {}
        for (const sub of topLevel) {
          if (sub.isDirectory()) await scanLevel(path.join(lp.path, sub.name));
        }
      }
    }

    let bestFile = null;
    for (const dirPath of scanPaths) {
      const result = await findBestFile(dirPath);
      if (result && (!bestFile || result.size > bestFile.size)) bestFile = result;
    }

    if (bestFile) {
      const { getResolution } = require('../utils/videoUtils');
      let resName = bestFile.name;
      const t = resName.toLowerCase();
      const hasRes = t.includes('2160p') || t.includes('4k') || t.includes('1080p') || t.includes('720p') || t.includes('480p') || t.includes('sd');
      if (!hasRes) {
        const res = await getResolution(bestFile.path);
        if (res) resName = `Unknown ${res}`;
      }
      db.prepare('UPDATE movies SET file_path = ?, file_size = ?, scene_name = ?, status = ? WHERE id = ?')
        .run(bestFile.path, bestFile.size, resName, 'downloaded', movie.id);
    } else if (scanPaths.size > 0) {
      // Paths were found but contained no video — genuinely missing
      db.prepare(`UPDATE movies SET status = CASE WHEN status = 'downloaded' THEN 'missing' ELSE status END, file_path = NULL, file_size = 0, scene_name = NULL WHERE id = ?`).run(movie.id);
    }
    // If scanPaths is empty (no library configured), leave status untouched

    try {
      const tmdbService = require('../services/tmdbService');
      const data = await tmdbService.getMovieById(movie.tmdb_id);
      if (data) db.prepare('UPDATE movies SET rating = ?, poster_path = ?, overview = ? WHERE id = ?').run(data.vote_average || 0, data.poster_path, data.overview, movie.id);
    } catch (e) { console.error('TMDB refresh failed for movie:', e.message); }

    res.json({ status: 'success', message: 'Movie refreshed' });
  } catch (e) {
    next(e);
  }
});

router.get('/:id/search', async (req, res, next) => {
  try {
    const indexerService = require('../services/indexerService');
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

    const results = await indexerService.searchMovie(movie.title, movie.year, null, null, true);
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
    db.prepare('UPDATE movies SET quality_profile_id = ? WHERE id = ?').run(profileId || null, req.params.id);
    res.json({ status: 'success', message: 'Quality profile updated' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/download', async (req, res, next) => {
  try {
    const downloadClientService = require('../services/downloadClientService');
    const { torrentUrl } = req.body;
    
    await downloadClientService.addTorrent(torrentUrl);
    db.prepare("UPDATE movies SET status = 'downloading', scene_name = ? WHERE id = ?").run(null, req.params.id);
    
    res.json({ status: 'success', message: 'Sent to download client' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/auto-search', async (req, res, next) => {
  try {
    const indexerService = require('../services/indexerService');
    const downloadClientService = require('../services/downloadClientService');
    
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

    const results = await indexerService.searchMovie(movie.title, movie.year);
    if (!results || results.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No torrents found for this movie' });
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

const translateSrt = async (enSrtContent, targetLang) => {
  const provider = db.prepare("SELECT value FROM settings WHERE key = 'translationProvider'").get();
  const activeProvider = (provider && provider.value) || 'googleTranslate';
  const { translateWithGemini, translateWithGoogleTranslate, translateWithDeepSeek, translateWithClaude } = require('../services/aiTranslationWorker');

  if (activeProvider === 'gemini') {
    const geminiApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'geminiApiKey'").get();
    if (!geminiApiKeyRow || !geminiApiKeyRow.value) throw new Error('Gemini API Key missing. Set it in Settings.');
    return await translateWithGemini(enSrtContent, targetLang, geminiApiKeyRow.value);
  } else if (activeProvider === 'deepseek') {
    const deepseekApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'deepseekApiKey'").get();
    if (!deepseekApiKeyRow || !deepseekApiKeyRow.value) throw new Error('DeepSeek API Key missing. Set it in Settings.');
    return await translateWithDeepSeek(enSrtContent, targetLang, deepseekApiKeyRow.value);
  } else if (activeProvider === 'claude') {
    const claudeApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'claudeApiKey'").get();
    if (!claudeApiKeyRow || !claudeApiKeyRow.value) throw new Error('Claude API Key missing. Set it in Settings.');
    return await translateWithClaude(enSrtContent, targetLang, claudeApiKeyRow.value);
  } else {
    return await translateWithGoogleTranslate(enSrtContent, targetLang);
  }
};

router.post('/:id/translate-subs', async (req, res, next) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const targetLangRow = db.prepare("SELECT value FROM settings WHERE key = 'targetLang'").get();
    const targetLang = req.body.targetLang || (targetLangRow && targetLangRow.value ? targetLangRow.value : 'Dutch');
    const langCode = { 'Dutch': 'nl', 'French': 'fr', 'German': 'de', 'Spanish': 'es', 'Italian': 'it', 'Portuguese': 'pt' }[targetLang] || 'nl';

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

    const enSrtContent = fs.readFileSync(enSubPath, 'utf8');
    const translatedText = await translateSrt(enSrtContent, targetLang);
    fs.writeFileSync(targetSubPath, translatedText);

    res.json({ status: 'success', message: `Translated to ${targetLang}`, data: { file: `${parsedPath.name}.${langCode}.srt` } });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/download-subs', async (req, res, next) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { downloadSubtitlesForMovie } = require('../services/subtitleService');
    const axios = require('axios');
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
        { headers: { 'Api-Key': osApiKeyRow.value, 'Content-Type': 'application/json', 'Accept': 'application/json' } }
      );
      const srtRes = await axios.get(downloadRes.data.link, { responseType: 'text' });
      fs.writeFileSync(subPath, srtRes.data);
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
      fs.writeFileSync(subPath, srtRes.data);
      return res.json({ status: 'success', message: `Downloaded "${langCode}" subtitle from URL` });
    }

    const result = await downloadSubtitlesForMovie(movie, langCode);
    if (result.alreadyExists) {
      return res.json({ status: 'success', message: `Subtitle already exists for "${langCode}"` });
    }
    res.json({ status: 'success', message: `Downloaded "${langCode}" subtitle` });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
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
    const fs = require('fs/promises');
    const path = require('path');
    const deleteFiles = req.query.deleteFiles === 'true';
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

    if (deleteFiles) {
      try {
        const dir = movie.file_path ? path.dirname(movie.file_path) : null;
        if (dir) {
          const files = await fs.readdir(dir).catch(() => []);
          await Promise.all(files.map(f => fs.unlink(path.join(dir, f)).catch(() => {})));
          await fs.rmdir(dir).catch(() => {});
        }
      } catch { /* ignore fs errors */ }
    }

    db.prepare('DELETE FROM movies WHERE id = ?').run(req.params.id);
    res.json({ status: 'success', message: 'Movie removed from library' });
  } catch (error) {
    next(error);
  }
});


router.get('/:id/search-subs', async (req, res, next) => {
  try {
    const { searchSubtitlesForMovie } = require('../services/subtitleService');
    const { lang } = req.query;
    if (!lang) return res.status(400).json({ status: 'error', message: 'lang query param is required' });

    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

    const results = await searchSubtitlesForMovie(movie, lang);
    res.json({ status: 'success', data: results });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
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
    const downloadClientService = require('../services/downloadClientService');
    const eventBus = require('../services/eventBus');
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
    // Replace all assignments
    db.prepare('DELETE FROM movie_collections WHERE movie_id = ?').run(req.params.id);
    const stmt = db.prepare('INSERT OR IGNORE INTO movie_collections (movie_id, collection_id) VALUES (?, ?)');
    for (const cid of collectionIds) stmt.run(req.params.id, cid);
    res.json({ status: 'success', message: 'Collections updated' });
  } catch (err) { next(err); }
});


module.exports = router;
