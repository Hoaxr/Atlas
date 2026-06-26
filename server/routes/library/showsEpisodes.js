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
const { downloadSubtitlesForEpisode, searchSubtitlesForEpisode } = require('../../services/subtitleService');
const { isWatchedSyncEnabled, translateSrt } = require('./helpers');

// ===================== SHOWS =====================

// GET /shows
router.get('/shows', (req, res, next) => {
  try {
    const shows = libraryService.getShows();
    res.json({ status: 'success', data: shows });
  } catch (error) {
    next(error);
  }
});

// GET /shows/:id
router.get('/shows/:id', async (req, res, next) => {
  try {
    const show = db.prepare('SELECT s.*, qp.name as quality_profile_name FROM shows s LEFT JOIN quality_profiles qp ON s.quality_profile_id = qp.id WHERE s.id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });
    if (!isWatchedSyncEnabled()) show.watched = 0;
    
    let folderSize = 0;
    if (show.folder_path) {
      try {
        const getFolderSize = async (dir) => {
          let size = 0;
          try {
            const files = await fsp.readdir(dir, { withFileTypes: true });
            for (const file of files) {
              const filePath = path.join(dir, file.name);
              try {
                if (file.isDirectory()) {
                  size += await getFolderSize(filePath);
                } else {
                  const stats = await fsp.stat(filePath);
                  size += stats.size;
                }
              } catch (e) {
                // Ignore individual file errors
              }
            }
          } catch (e) {
            // Ignore directory read errors
          }
          return size;
        };
        folderSize = await getFolderSize(show.folder_path);
      } catch (err) {
        // Folder might not exist yet
      }
    }
    show.folder_size = folderSize;
    if (show.folder_path) {
      db.prepare('UPDATE shows SET folder_size = ? WHERE id = ?').run(folderSize, show.id);
    }
    
    res.json({ status: 'success', data: show });
  } catch (err) {
    next(err);
  }
});

// GET /shows/:id/episodes
router.get('/shows/:id/episodes', async (req, res, next) => {
  try {
    const episodes = db.prepare('SELECT * FROM episodes WHERE show_id = ? ORDER BY season_number ASC, episode_number ASC').all(req.params.id);

    const episodesWithSubtitles = episodes.map(ep => {
      const subs = [];
      if (ep.file_path && fs.existsSync(ep.file_path)) {
        const dir = path.dirname(ep.file_path);
        try {
          const files = fs.readdirSync(dir);
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
        } catch (e) {
          // Directory might not exist
        }
      }
      return { ...ep, subtitles: subs };
    });

    res.json({ status: 'success', data: episodesWithSubtitles });
  } catch (err) {
    next(err);
  }
});

// GET /shows/:id/search
router.get('/shows/:id/search', async (req, res, next) => {
  try {
    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });
    const results = await indexerService.searchShowPack(show.title);
    res.json({ status: 'success', data: results });
  } catch (err) {
    next(err);
  }
});

// POST /shows/:id/auto-search
router.post('/shows/:id/auto-search', async (req, res, next) => {
  try {
    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });

    const episodes = db.prepare("SELECT * FROM episodes WHERE show_id = ? AND status = 'monitored'").all(req.params.id);
    
    let sentCount = 0;
    for (const ep of episodes) {
      const results = await indexerService.searchEpisode(show.title, ep.season_number, ep.episode_number);
      if (results && results.length > 0) {
        const bestResult = results.sort((a, b) => b.seeders - a.seeders)[0];
        await downloadClientService.addTorrent(bestResult.link, 'tv');
        db.prepare("UPDATE episodes SET status = 'downloading' WHERE id = ?").run(ep.id);
        sentCount++;
      }
    }
    
    if (sentCount > 0) {
      db.prepare("UPDATE shows SET status = 'downloading' WHERE id = ?").run(req.params.id);
    }
    
    res.json({ status: 'success', message: `Sent ${sentCount} episodes to download client` });
  } catch (err) {
    next(err);
  }
});

// POST /shows/:id/download
router.post('/shows/:id/download', async (req, res, next) => {
  try {
    const { torrentUrl } = req.body;
    await downloadClientService.addTorrent(torrentUrl, 'tv');
    db.prepare("UPDATE shows SET status = 'downloading' WHERE id = ?").run(req.params.id);
    db.prepare("UPDATE episodes SET status = 'downloading' WHERE show_id = ? AND status = 'monitored'").run(req.params.id);
    res.json({ status: 'success', message: 'Season pack sent to download client' });
  } catch (err) {
    next(err);
  }
});

// POST /shows (add show)
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

// PUT /shows/:id/remap
router.put('/shows/:id/remap', async (req, res, next) => {
  try {
    const { tmdbId, title, year: showYear, poster_path, overview, vote_average } = req.body;
    if (!tmdbId) return res.status(400).json({ status: 'error', message: 'tmdbId is required' });

    const existing = db.prepare('SELECT id FROM shows WHERE tmdb_id = ? AND id != ?').get(tmdbId, req.params.id);
    if (existing) return res.status(409).json({ status: 'error', message: 'Another show in your library already has this TMDB ID' });

    const releaseYear = showYear || null;
    db.prepare(`
      UPDATE shows SET tmdb_id = ?, title = ?, year = ?, poster_path = ?, overview = ?, rating = ? WHERE id = ?
    `).run(tmdbId, title, releaseYear, poster_path, overview, vote_average || 0, req.params.id);

    res.json({ status: 'success', message: 'Show remapped successfully' });
  } catch (error) {
    next(error);
  }
});

// PUT /shows/:id/quality
router.put('/shows/:id/quality', (req, res, next) => {
  try {
    const { profileId } = req.body;
    db.prepare('UPDATE shows SET quality_profile_id = ? WHERE id = ?').run(profileId || null, req.params.id);
    res.json({ status: 'success', message: 'Quality profile updated' });
  } catch (err) {
    next(err);
  }
});

// POST /shows/:id/toggle-monitor
router.post('/shows/:id/toggle-monitor', async (req, res, next) => {
  try {
    const show = db.prepare('SELECT monitored, folder_path, status FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });
    
    const newMonitored = show.monitored ? 0 : 1;
    db.prepare('UPDATE shows SET monitored = ? WHERE id = ?').run(newMonitored, req.params.id);
    db.prepare('UPDATE episodes SET monitored = ? WHERE show_id = ?').run(newMonitored, req.params.id);
    
    if (newMonitored && show.folder_path) {
      db.prepare("UPDATE shows SET status = 'downloaded' WHERE id = ?").run(req.params.id);
    }
    
    res.json({ status: 'success', data: { monitored: newMonitored }});
  } catch (err) {
    next(err);
  }
});

// POST /shows/:id/seasons/:season/toggle-monitor
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

// POST /shows/:id/watched
router.post('/shows/:id/watched', (req, res, next) => {
  try {
    const { watched } = req.body;
    db.prepare('UPDATE shows SET watched = ? WHERE id = ?').run(watched ? 1 : 0, req.params.id);
    res.json({ status: 'success', message: watched ? 'Marked as watched' : 'Marked as unwatched' });
  } catch (err) {
    next(err);
  }
});

// ===================== EPISODES =====================

// POST /episodes/:id/translate-subs
router.post('/episodes/:id/translate-subs', async (req, res, next) => {
  try {
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

// POST /episodes/:id/download-subs
router.post('/episodes/:id/download-subs', async (req, res, next) => {
  try {
    const { langCode, url } = req.body;
    if (!langCode) return res.status(400).json({ status: 'error', message: 'langCode is required' });

    const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });

    if (url) {
      if (!episode.file_path || !fs.existsSync(episode.file_path)) {
        return res.status(400).json({ status: 'error', message: 'Episode file not found on disk' });
      }
      const parsedPath = path.parse(episode.file_path);
      const subPath = path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`);
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

// GET /episodes/:id/search
router.get('/episodes/:id/search', async (req, res, next) => {
  try {
    const episode = db.prepare('SELECT e.*, s.title as show_title FROM episodes e JOIN shows s ON e.show_id = s.id WHERE e.id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });
    const results = await indexerService.searchEpisode(episode.show_title, episode.season_number, episode.episode_number);
    res.json({ status: 'success', data: results });
  } catch (err) {
    next(err);
  }
});

// POST /episodes/:id/auto-search
router.post('/episodes/:id/auto-search', async (req, res, next) => {
  try {
    const episode = db.prepare('SELECT e.*, s.title as show_title FROM episodes e JOIN shows s ON e.show_id = s.id WHERE e.id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });

    const results = await indexerService.searchEpisode(episode.show_title, episode.season_number, episode.episode_number);
    
    if (!results || results.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No torrents found for this episode' });
    }

    const bestResult = results.sort((a, b) => b.seeders - a.seeders)[0];
    await downloadClientService.addTorrent(bestResult.link, 'tv');
    db.prepare("UPDATE episodes SET status = 'downloading' WHERE id = ?").run(req.params.id);
    
    res.json({ status: 'success', message: 'Best result sent to download client', data: bestResult });
  } catch (err) {
    next(err);
  }
});

// POST /episodes/:id/reset
router.post('/episodes/:id/reset', async (req, res, next) => {
  try {
    db.prepare("UPDATE episodes SET status = 'monitored' WHERE id = ?").run(req.params.id);
    res.json({ status: 'success', message: 'Episode reset to monitored' });
  } catch (err) {
    next(err);
  }
});

// POST /episodes/:id/download
router.post('/episodes/:id/download', async (req, res, next) => {
  try {
    const { torrentUrl } = req.body;
    await downloadClientService.addTorrent(torrentUrl, 'tv');
    db.prepare("UPDATE episodes SET status = 'downloading' WHERE id = ?").run(req.params.id);
    res.json({ status: 'success', message: 'Sent to download client' });
  } catch (err) {
    next(err);
  }
});

// POST /episodes/:id/toggle-monitor
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

// GET /episodes/:id/search-subs
router.get('/episodes/:id/search-subs', async (req, res, next) => {
  try {
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

module.exports = router;
