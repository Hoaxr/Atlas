const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const axios = require('axios');
const libraryService = require('../../services/libraryService');
const indexerService = require('../../services/indexerService');
const downloadClientService = require('../../services/downloadClientService');
const { downloadSubtitlesForMovie, searchSubtitlesForMovie } = require('../../services/subtitleService');
const { isWatchedSyncEnabled, translateSrt } = require('./helpers');

// GET /movies
router.get('/', (req, res, next) => {
  try {
    const movies = libraryService.getMovies();
    res.json({ status: 'success', data: movies });
  } catch (error) {
    next(error);
  }
});

// GET /movies/:id
router.get('/:id', async (req, res, next) => {
  try {
    const movie = db.prepare('SELECT m.*, qp.name as quality_profile_name FROM movies m LEFT JOIN quality_profiles qp ON m.quality_profile_id = qp.id WHERE m.id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });
    if (!isWatchedSyncEnabled()) movie.watched = 0;
    
    let subtitles = [];
    if (movie.file_path) {
      try {
        const dir = path.dirname(movie.file_path);
        const files = await fsp.readdir(dir);
        const baseName = path.basename(movie.file_path, path.extname(movie.file_path));
        const subFiles = files.filter(f => {
          const ext = path.extname(f).toLowerCase();
          return ['.srt', '.vtt', '.sub'].includes(ext) && f.startsWith(baseName);
        });
        subtitles = subFiles.map(f => {
          const parsed = path.parse(f);
          const langMatch = parsed.name.match(/\.([a-z]{2})$/);
          return { file: f, lang: langMatch ? langMatch[1] : 'unknown' };
        });
        const stats = await fsp.stat(movie.file_path);
        movie.size = stats.size;
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

// GET /movies/:id/search
router.get('/:id/search', async (req, res, next) => {
  try {
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });
    const results = await indexerService.searchMovie(movie.title, movie.year);
    res.json({ status: 'success', data: results });
  } catch (err) {
    next(err);
  }
});

// POST /movies/:id/reset
router.post('/:id/reset', async (req, res, next) => {
  try {
    db.prepare("UPDATE movies SET status = 'monitored' WHERE id = ?").run(req.params.id);
    res.json({ status: 'success', message: 'Movie reset to monitored' });
  } catch (err) {
    next(err);
  }
});

// POST /movies/:id/toggle-monitor
router.post('/:id/toggle-monitor', async (req, res, next) => {
  try {
    const movie = db.prepare('SELECT monitored, file_path, status FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });
    
    const newMonitored = movie.monitored ? 0 : 1;
    db.prepare('UPDATE movies SET monitored = ? WHERE id = ?').run(newMonitored, req.params.id);
    
    if (newMonitored && movie.file_path) {
      db.prepare("UPDATE movies SET status = 'downloaded' WHERE id = ?").run(req.params.id);
    }
    
    res.json({ status: 'success', data: { monitored: newMonitored }});
  } catch (err) {
    next(err);
  }
});

// PUT /movies/:id/quality
router.put('/:id/quality', (req, res, next) => {
  try {
    const { profileId } = req.body;
    db.prepare('UPDATE movies SET quality_profile_id = ? WHERE id = ?').run(profileId || null, req.params.id);
    res.json({ status: 'success', message: 'Quality profile updated' });
  } catch (err) {
    next(err);
  }
});

// POST /movies/:id/download
router.post('/:id/download', async (req, res, next) => {
  try {
    const { torrentUrl } = req.body;
    await downloadClientService.addTorrent(torrentUrl);
    db.prepare("UPDATE movies SET status = 'downloading' WHERE id = ?").run(req.params.id);
    res.json({ status: 'success', message: 'Sent to download client' });
  } catch (err) {
    next(err);
  }
});

// POST /movies/:id/auto-search
router.post('/:id/auto-search', async (req, res, next) => {
  try {
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

    const results = await indexerService.searchMovie(movie.title, movie.year);
    if (!results || results.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No torrents found for this movie' });
    }

    const bestResult = results[0];
    await downloadClientService.addTorrent(bestResult.link, 'movie');
    db.prepare("UPDATE movies SET status = 'downloading' WHERE id = ?").run(req.params.id);
    
    res.json({ status: 'success', message: 'Best result sent to download client', data: bestResult });
  } catch (err) {
    next(err);
  }
});

// POST /movies (add movie)
router.post('/', async (req, res, next) => {
  try {
    const { tmdbId } = req.body;
    if (!tmdbId) {
      return res.status(400).json({ status: 'error', message: 'tmdbId is required' });
    }
    const result = await libraryService.addMovie(tmdbId);
    res.json({ status: 'success', data: result });
  } catch (error) {
    if (error.message === 'Movie already in library') {
      return res.status(409).json({ status: 'error', message: error.message });
    }
    next(error);
  }
});

// POST /movies/:id/translate-subs
router.post('/:id/translate-subs', async (req, res, next) => {
  try {
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

// POST /movies/:id/download-subs
router.post('/:id/download-subs', async (req, res, next) => {
  try {
    const { langCode, url, fileId } = req.body;
    if (!langCode) return res.status(400).json({ status: 'error', message: 'langCode is required' });

    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

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

// POST /movies/:id/watched
router.post('/:id/watched', (req, res, next) => {
  try {
    const { watched } = req.body;
    db.prepare('UPDATE movies SET watched = ? WHERE id = ?').run(watched ? 1 : 0, req.params.id);
    res.json({ status: 'success', message: watched ? 'Marked as watched' : 'Marked as unwatched' });
  } catch (err) {
    next(err);
  }
});

// PUT /movies/:id/remap
router.put('/:id/remap', async (req, res, next) => {
  try {
    const { tmdbId, title, year: movieYear, poster_path, overview, vote_average } = req.body;
    if (!tmdbId) return res.status(400).json({ status: 'error', message: 'tmdbId is required' });

    const existing = db.prepare('SELECT id FROM movies WHERE tmdb_id = ? AND id != ?').get(tmdbId, req.params.id);
    if (existing) return res.status(409).json({ status: 'error', message: 'Another movie in your library already has this TMDB ID' });

    const releaseYear = movieYear || null;
    db.prepare(`
      UPDATE movies SET tmdb_id = ?, title = ?, year = ?, poster_path = ?, overview = ?, rating = ? WHERE id = ?
    `).run(tmdbId, title, releaseYear, poster_path, overview, vote_average || 0, req.params.id);

    res.json({ status: 'success', message: 'Movie remapped successfully' });
  } catch (error) {
    next(error);
  }
});

// GET /movies/:id/search-subs
router.get('/:id/search-subs', async (req, res, next) => {
  try {
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

module.exports = router;
