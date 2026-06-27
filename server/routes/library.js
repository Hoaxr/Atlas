const express = require('express');
const router = express.Router();
const libraryService = require('../services/libraryService');
const scannerService = require('../services/scannerService');
const db = require('../config/database');

const isWatchedSyncEnabled = () => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'traktWatchedSync'").get();
  return row && row.value === 'true';
};

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

// Movies
router.get('/movies', (req, res, next) => {
  try {
    const movies = libraryService.getMovies();
    res.json({ status: 'success', data: movies });
  } catch (error) {
    next(error);
  }
});

router.get('/movies/:id', async (req, res, next) => {
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
        const files = await fs.readdir(dir);
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

router.get('/movies/:id/search', async (req, res, next) => {
  try {
    const indexerService = require('../services/indexerService');
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

    const results = await indexerService.searchMovie(movie.title, movie.year);
    res.json({ status: 'success', data: results });
  } catch (err) {
    next(err);
  }
});

router.post('/movies/:id/reset', async (req, res, next) => {
  try {
    db.prepare("UPDATE movies SET status = 'monitored' WHERE id = ?").run(req.params.id);
    res.json({ status: 'success', message: 'Movie reset to monitored' });
  } catch (err) {
    next(err);
  }
});

router.post('/movies/:id/toggle-monitor', async (req, res, next) => {
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

router.put('/movies/:id/quality', (req, res, next) => {
  try {
    const { profileId } = req.body;
    db.prepare('UPDATE movies SET quality_profile_id = ? WHERE id = ?').run(profileId || null, req.params.id);
    res.json({ status: 'success', message: 'Quality profile updated' });
  } catch (err) {
    next(err);
  }
});

router.post('/movies/:id/download', async (req, res, next) => {
  try {
    const downloadClientService = require('../services/downloadClientService');
    const { torrentUrl } = req.body;
    
    await downloadClientService.addTorrent(torrentUrl);
    db.prepare("UPDATE movies SET status = 'downloading' WHERE id = ?").run(req.params.id);
    
    res.json({ status: 'success', message: 'Sent to download client' });
  } catch (err) {
    next(err);
  }
});

router.post('/movies/:id/auto-search', async (req, res, next) => {
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
    db.prepare("UPDATE movies SET status = 'downloading' WHERE id = ?").run(req.params.id);
    
    res.json({ status: 'success', message: 'Best result sent to download client', data: bestResult });
  } catch (err) {
    next(err);
  }
});

router.post('/movies', async (req, res, next) => {
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

router.post('/movies/:id/translate-subs', async (req, res, next) => {
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

router.post('/movies/:id/download-subs', async (req, res, next) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { downloadSubtitlesForMovie } = require('../services/subtitleService');
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
      const axios = require('axios');
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

router.post('/movies/:id/watched', (req, res, next) => {
  try {
    const { watched } = req.body;
    db.prepare('UPDATE movies SET watched = ? WHERE id = ?').run(watched ? 1 : 0, req.params.id);
    res.json({ status: 'success', message: watched ? 'Marked as watched' : 'Marked as unwatched' });
  } catch (err) {
    next(err);
  }
});

router.post('/shows/:id/watched', (req, res, next) => {
  try {
    const { watched } = req.body;
    db.prepare('UPDATE shows SET watched = ? WHERE id = ?').run(watched ? 1 : 0, req.params.id);
    res.json({ status: 'success', message: watched ? 'Marked as watched' : 'Marked as unwatched' });
  } catch (err) {
    next(err);
  }
});

router.put('/movies/:id/remap', async (req, res, next) => {
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

// Shows
router.get('/shows', (req, res, next) => {
  try {
    const shows = libraryService.getShows();
    res.json({ status: 'success', data: shows });
  } catch (error) {
    next(error);
  }
});

router.get('/shows/:id', async (req, res, next) => {
  try {
    const fs = require('fs/promises');
    const path = require('path');
    
    const show = db.prepare('SELECT s.*, qp.name as quality_profile_name FROM shows s LEFT JOIN quality_profiles qp ON s.quality_profile_id = qp.id WHERE s.id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });
    if (!isWatchedSyncEnabled()) show.watched = 0;
    
    // folder_size is already loaded from the database via scannerService.
    

    res.json({ status: 'success', data: show });
  } catch (err) {
    next(err);
  }
});

router.get('/shows/:id/episodes', async (req, res, next) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const episodes = db.prepare('SELECT * FROM episodes WHERE show_id = ? ORDER BY season_number ASC, episode_number ASC').all(req.params.id);

    const fsp = require('fs/promises');
    
    // Group episodes by directory to avoid scanning the same directory multiple times
    const dirMap = {};
    for (const ep of episodes) {
      if (ep.file_path) {
        const dir = path.dirname(ep.file_path);
        if (!dirMap[dir]) dirMap[dir] = [];
        dirMap[dir].push(ep);
      }
    }

    // Read directories asynchronously and concurrently
    await Promise.all(Object.keys(dirMap).map(async (dir) => {
      let files = [];
      try {
        files = await fsp.readdir(dir);
      } catch (e) {
        // Directory might not exist, ignore
      }
      
      for (const ep of dirMap[dir]) {
        const subs = [];
        const baseName = path.basename(ep.file_path, path.extname(ep.file_path));
        const subFiles = files.filter(f => {
          const ext = path.extname(f).toLowerCase();
          return ['.srt', '.vtt', '.sub'].includes(ext) && f.startsWith(baseName);
        });
        subFiles.forEach(f => {
          const parsed = path.parse(f);
          const langMatch = parsed.name.match(/\.([a-z]{2})$/);
          subs.push({
            file: f,
            lang: langMatch ? langMatch[1] : 'unknown',
            path: path.join(dir, f)
          });
        });
        ep.subtitles = subs;
      }
    }));
    
    // Episodes that don't have a file_path still need empty subtitles array
    const episodesWithSubtitles = episodes.map(ep => ({ ...ep, subtitles: ep.subtitles || [] }));

    res.json({ status: 'success', data: episodesWithSubtitles });
  } catch (err) {
    next(err);
  }
});

router.post('/episodes/:id/translate-subs', async (req, res, next) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const targetLangRow = db.prepare("SELECT value FROM settings WHERE key = 'targetLang'").get();
    const targetLang = req.body.targetLang || (targetLangRow && targetLangRow.value ? targetLangRow.value : 'Dutch');
    const langCode = { 'Dutch': 'nl', 'French': 'fr', 'German': 'de', 'Spanish': 'es', 'Italian': 'it', 'Portuguese': 'pt' }[targetLang] || 'nl';

    const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });
    if (!episode.file_path) return res.status(400).json({ status: 'error', message: 'Episode has no file path' });
    if (!fs.existsSync(episode.file_path)) return res.status(400).json({ status: 'error', message: 'Episode file not found on disk' });

    const parsedPath = path.parse(episode.file_path);
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

router.post('/episodes/:id/download-subs', async (req, res, next) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { downloadSubtitlesForEpisode } = require('../services/subtitleService');
    const { langCode, url } = req.body;

    if (!langCode) return res.status(400).json({ status: 'error', message: 'langCode is required' });

    const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });

    // If a direct URL is provided, download from there
    if (url) {
      if (!episode.file_path || !fs.existsSync(episode.file_path)) {
        return res.status(400).json({ status: 'error', message: 'Episode file not found on disk' });
      }
      const parsedPath = path.parse(episode.file_path);
      const subPath = path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`);
      const axios = require('axios');
      const srtRes = await axios.get(url, { responseType: 'text' });
      fs.writeFileSync(subPath, srtRes.data);
      return res.json({ status: 'success', message: `Downloaded "${langCode}" subtitle from URL` });
    }

    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(episode.show_id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });

    const result = await downloadSubtitlesForEpisode(episode, show, langCode);
    if (result.alreadyExists) {
      return res.json({ status: 'success', message: `Subtitle already exists for "${langCode}"` });
    }
    res.json({ status: 'success', message: `Downloaded "${langCode}" subtitle` });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Subtitle search
router.get('/movies/:id/search-subs', async (req, res, next) => {
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

router.get('/episodes/:id/search-subs', async (req, res, next) => {
  try {
    const { searchSubtitlesForEpisode } = require('../services/subtitleService');
    const { lang } = req.query;
    if (!lang) return res.status(400).json({ status: 'error', message: 'lang query param is required' });

    const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });

    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(episode.show_id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });

    const results = await searchSubtitlesForEpisode(episode, show, lang);
    res.json({ status: 'success', data: results });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

router.get('/shows/:id/search', async (req, res, next) => {
  try {
    const indexerService = require('../services/indexerService');
    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });

    const results = await indexerService.searchShowPack(show.title);
    res.json({ status: 'success', data: results });
  } catch (err) {
    next(err);
  }
});

router.post('/shows/:id/auto-search', async (req, res, next) => {
  try {
    const indexerService = require('../services/indexerService');
    const downloadClientService = require('../services/downloadClientService');
    
    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });

    // Find all monitored episodes that are missing
    const episodes = db.prepare("SELECT * FROM episodes WHERE show_id = ? AND status = 'monitored'").all(req.params.id);
    
    // Run the search asynchronously in the background so the UI doesn't freeze
    (async () => {
      let sentCount = 0;
      for (const ep of episodes) {
        try {
          const results = await indexerService.searchEpisode(show.title, ep.season_number, ep.episode_number);
          if (results && results.length > 0) {
            const bestResult = results.sort((a, b) => b.seeders - a.seeders)[0];
            await downloadClientService.addTorrent(bestResult.link, 'tv');
            db.prepare("UPDATE episodes SET status = 'downloading' WHERE id = ?").run(ep.id);
            sentCount++;
          }
        } catch (e) {
          console.error(`Auto-search failed for ${show.title} S${ep.season_number}E${ep.episode_number}:`, e.message);
        }
      }
      
      if (sentCount > 0) {
        db.prepare("UPDATE shows SET status = 'downloading' WHERE id = ?").run(req.params.id);
      }
    })();
    
    res.json({ status: 'success', message: `Search started in the background for ${episodes.length} episodes.` });
  } catch (err) {
    next(err);
  }
});

router.post('/shows/:id/download', async (req, res, next) => {
  try {
    const downloadClientService = require('../services/downloadClientService');
    const { torrentUrl } = req.body;
    
    await downloadClientService.addTorrent(torrentUrl, 'tv');
    db.prepare("UPDATE shows SET status = 'downloading' WHERE id = ?").run(req.params.id);
    db.prepare("UPDATE episodes SET status = 'downloading' WHERE show_id = ? AND status = 'monitored'").run(req.params.id);
    
    res.json({ status: 'success', message: 'Season pack sent to download client' });
  } catch (err) {
    next(err);
  }
});

router.post('/shows', async (req, res, next) => {
  try {
    const { tmdbId } = req.body;
    if (!tmdbId) {
      return res.status(400).json({ status: 'error', message: 'tmdbId is required' });
    }
    const result = await libraryService.addShow(tmdbId);
    res.json({ status: 'success', data: result });
  } catch (error) {
    if (error.message === 'Show already in library') {
      return res.status(409).json({ status: 'error', message: error.message });
    }
    next(error);
  }
});

router.put('/shows/:id/remap', async (req, res, next) => {
  try {
    const { tmdbId, title, year: showYear, poster_path, overview, vote_average } = req.body;
    if (!tmdbId) return res.status(400).json({ status: 'error', message: 'tmdbId is required' });

    // Check if another show already has this tmdb_id
    const existing = db.prepare('SELECT id FROM shows WHERE tmdb_id = ? AND id != ?').get(tmdbId, req.params.id);
    if (existing) return res.status(409).json({ status: 'error', message: 'Another show in your library already has this TMDB ID' });

    // Use data passed from frontend (from TMDB search results) so we don't need a second API call
    const releaseYear = showYear || null;

    db.prepare(`
      UPDATE shows SET tmdb_id = ?, title = ?, year = ?, poster_path = ?, overview = ?, rating = ? WHERE id = ?
    `).run(tmdbId, title, releaseYear, poster_path, overview, vote_average || 0, req.params.id);

    res.json({ status: 'success', message: 'Show remapped successfully' });
  } catch (error) {
    next(error);
  }
});

router.put('/shows/:id/quality', (req, res, next) => {
  try {
    const { profileId } = req.body;
    db.prepare('UPDATE shows SET quality_profile_id = ? WHERE id = ?').run(profileId || null, req.params.id);
    res.json({ status: 'success', message: 'Quality profile updated' });
  } catch (err) {
    next(err);
  }
});

router.post('/shows/:id/toggle-monitor', async (req, res, next) => {
  try {
    const show = db.prepare('SELECT monitored, folder_path, status FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });
    
    const newMonitored = show.monitored ? 0 : 1;
    db.prepare('UPDATE shows SET monitored = ? WHERE id = ?').run(newMonitored, req.params.id);
    db.prepare('UPDATE episodes SET monitored = ? WHERE show_id = ?').run(newMonitored, req.params.id);
    
    // If the show has a folder on disk and we're re-enabling monitoring, restore 'downloaded' status
    if (newMonitored && show.folder_path) {
      db.prepare("UPDATE shows SET status = 'downloaded' WHERE id = ?").run(req.params.id);
    }
    
    res.json({ status: 'success', data: { monitored: newMonitored }});
  } catch (err) {
    next(err);
  }
});

router.post('/shows/:id/seasons/:season/toggle-monitor', async (req, res, next) => {
  try {
    const { id, season } = req.params;
    
    const monitoredCount = db.prepare('SELECT count(*) as count FROM episodes WHERE show_id = ? AND season_number = ? AND monitored = 1').get(id, season).count;
    const newMonitored = monitoredCount > 0 ? 0 : 1;
    
    db.prepare('UPDATE episodes SET monitored = ? WHERE show_id = ? AND season_number = ?').run(newMonitored, id, season);
    
    res.json({ status: 'success', data: { monitored: newMonitored }});
  } catch (err) {
    next(err);
  }
});

router.post('/episodes/:id/toggle-monitor', async (req, res, next) => {
  try {
    const episode = db.prepare('SELECT monitored FROM episodes WHERE id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });
    
    const newMonitored = episode.monitored ? 0 : 1;
    db.prepare('UPDATE episodes SET monitored = ? WHERE id = ?').run(newMonitored, req.params.id);
    
    res.json({ status: 'success', data: { monitored: newMonitored }});
  } catch (err) {
    next(err);
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

// Scan
router.post('/scan', async (req, res, next) => {
  try {
    const result = await scannerService.scanLibrary();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Scan Progress
router.get('/scan/progress', (req, res) => {
  res.json(scannerService.getScanProgress());
});

// Retry unreachable paths
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

router.get('/episodes/:id/search', async (req, res, next) => {
  try {
    const indexerService = require('../services/indexerService');
    const episode = db.prepare('SELECT e.*, s.title as show_title FROM episodes e JOIN shows s ON e.show_id = s.id WHERE e.id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });

    const results = await indexerService.searchEpisode(episode.show_title, episode.season_number, episode.episode_number);
    res.json({ status: 'success', data: results });
  } catch (err) {
    next(err);
  }
});

router.post('/episodes/:id/auto-search', async (req, res, next) => {
  try {
    const indexerService = require('../services/indexerService');
    const downloadClientService = require('../services/downloadClientService');
    
    const episode = db.prepare('SELECT e.*, s.title as show_title FROM episodes e JOIN shows s ON e.show_id = s.id WHERE e.id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });

    const results = await indexerService.searchEpisode(episode.show_title, episode.season_number, episode.episode_number);
    
    if (!results || results.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No torrents found for this episode' });
    }

    // Sort by seeders descending and pick top
    const bestResult = results.sort((a, b) => b.seeders - a.seeders)[0];
    
    await downloadClientService.addTorrent(bestResult.link, 'tv');
    db.prepare("UPDATE episodes SET status = 'downloading' WHERE id = ?").run(req.params.id);
    
    res.json({ status: 'success', message: 'Best result sent to download client', data: bestResult });
  } catch (err) {
    next(err);
  }
});

router.post('/episodes/:id/reset', async (req, res, next) => {
  try {
    db.prepare("UPDATE episodes SET status = 'monitored' WHERE id = ?").run(req.params.id);
    res.json({ status: 'success', message: 'Episode reset to monitored' });
  } catch (err) {
    next(err);
  }
});

router.post('/episodes/:id/download', async (req, res, next) => {
  try {
    const downloadClientService = require('../services/downloadClientService');
    const { torrentUrl } = req.body;
    
    await downloadClientService.addTorrent(torrentUrl, 'tv');
    db.prepare("UPDATE episodes SET status = 'downloading' WHERE id = ?").run(req.params.id);
    
    res.json({ status: 'success', message: 'Sent to download client' });
  } catch (err) {
    next(err);
  }
});

// Calendar - upcoming episodes from monitored shows
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

// Bulk operations
router.post('/bulk/status', (req, res, next) => {
  try {
    const { ids, status, type } = req.body; // type: 'movies' or 'shows'
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

// Delete a specific duplicate
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

// ─── Feature 1: Watchlist (wanted status) ───────────────────────────────────

router.post('/movies/:id/wanted', (req, res, next) => {
  try {
    const movie = db.prepare('SELECT id FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });
    db.prepare("UPDATE movies SET status = 'wanted' WHERE id = ?").run(req.params.id);
    res.json({ status: 'success', message: 'Added to watchlist' });
  } catch (err) { next(err); }
});

router.post('/shows/:id/wanted', (req, res, next) => {
  try {
    const show = db.prepare('SELECT id FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });
    db.prepare("UPDATE shows SET status = 'wanted' WHERE id = ?").run(req.params.id);
    res.json({ status: 'success', message: 'Added to watchlist' });
  } catch (err) { next(err); }
});

// ─── Feature 3: Season bulk watched ─────────────────────────────────────────

router.post('/shows/:id/seasons/:season/watched', (req, res, next) => {
  try {
    const { watched = 1 } = req.body;
    const result = db.prepare(
      'UPDATE episodes SET watched = ? WHERE show_id = ? AND season_number = ?'
    ).run(watched ? 1 : 0, req.params.id, req.params.season);
    res.json({ status: 'success', message: `${result.changes} episodes updated`, changes: result.changes });
  } catch (err) { next(err); }
});

// ─── Feature 4: Manual Search & Grab ────────────────────────────────────────

router.get('/movies/:id/search', async (req, res, next) => {
  try {
    const movie = db.prepare('SELECT * FROM movies').all().find(m => m.id === parseInt(req.params.id));
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });
    const indexerService = require('../services/indexerService');
    const results = await indexerService.searchMovie(movie.title, movie.year);
    res.json({ status: 'success', data: results });
  } catch (err) { next(err); }
});

router.post('/movies/:id/grab', async (req, res, next) => {
  try {
    const { link, title } = req.body;
    if (!link) return res.status(400).json({ status: 'error', message: 'link is required' });
    const downloadClientService = require('../services/downloadClientService');
    const eventBus = require('../services/eventBus');
    await downloadClientService.addTorrent(link);
    db.prepare("UPDATE movies SET status = 'downloading' WHERE id = ?").run(req.params.id);
    eventBus.info('Manual grab started', { title: title || 'Unknown', type: 'movie' });
    res.json({ status: 'success', message: 'Download started' });
  } catch (err) { next(err); }
});

router.get('/episodes/:id/search', async (req, res, next) => {
  try {
    const ep = db.prepare(
      'SELECT e.*, s.title as show_title FROM episodes e JOIN shows s ON e.show_id = s.id WHERE e.id = ?'
    ).get(req.params.id);
    if (!ep) return res.status(404).json({ status: 'error', message: 'Episode not found' });
    const indexerService = require('../services/indexerService');
    const results = await indexerService.searchEpisode(ep.show_title, ep.season_number, ep.episode_number);
    res.json({ status: 'success', data: results });
  } catch (err) { next(err); }
});

router.post('/episodes/:id/grab', async (req, res, next) => {
  try {
    const { link, title } = req.body;
    if (!link) return res.status(400).json({ status: 'error', message: 'link is required' });
    const downloadClientService = require('../services/downloadClientService');
    const eventBus = require('../services/eventBus');
    await downloadClientService.addTorrent(link);
    db.prepare("UPDATE episodes SET status = 'downloading' WHERE id = ?").run(req.params.id);
    eventBus.info('Manual grab started', { title: title || 'Unknown', type: 'episode' });
    res.json({ status: 'success', message: 'Download started' });
  } catch (err) { next(err); }
});

// ─── Feature 11: System Health ───────────────────────────────────────────────

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

// ─── Feature 12: Library Export ──────────────────────────────────────────────

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

// ─── Feature 9: Collections ──────────────────────────────────────────────────

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

router.get('/movies/:id/collections', (req, res, next) => {
  try {
    const rows = db.prepare(
      'SELECT c.* FROM collections c JOIN movie_collections mc ON c.id = mc.collection_id WHERE mc.movie_id = ?'
    ).all(req.params.id);
    res.json({ status: 'success', data: rows });
  } catch (err) { next(err); }
});

router.post('/movies/:id/collections', (req, res, next) => {
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
