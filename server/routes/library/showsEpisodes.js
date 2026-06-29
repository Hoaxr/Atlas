const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const libraryService = require('../../services/libraryService');
const indexerService = require('../../services/indexerService');
const downloadClientService = require('../../services/downloadClientService');
const { isWatchedSyncEnabled, getSubtitlesInDir, extractLang, translateSrt } = require('./helpers');

router.post('/shows/:id/watched', (req, res, next) => {
  try {
    const { watched } = req.body;
    db.prepare('UPDATE shows SET watched = ? WHERE id = ?').run(watched ? 1 : 0, req.params.id);
    res.json({ status: 'success', message: watched ? 'Marked as watched' : 'Marked as unwatched' });
  } catch (err) {
    next(err);
  }
});

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

router.post('/shows/:id/refresh', async (req, res, next) => {
  try {
    const fs = require('fs/promises');
    const path = require('path');
    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id);
    
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });
    
    let totalSize = 0;
    
    if (show.folder_path) {
      const calculateSize = async (dirPath) => {
        try {
          const items = await fs.readdir(dirPath, { withFileTypes: true });
          for (const item of items) {
            const fullPath = path.join(dirPath, item.name);
            if (item.isDirectory()) {
              await calculateSize(fullPath);
            } else if (item.isFile()) {
              const ext = path.extname(item.name).toLowerCase();
              if (['.mp4', '.mkv', '.avi', '.mov', '.wmv'].includes(ext)) {
                const stats = await fs.stat(fullPath);
                totalSize += stats.size;
                
                const match = item.name.match(/[sS](\d+)[eE](\d+)/) || item.name.match(/(?:^|[ \.\-])(\d{1,2})x(\d{2})(?:[ \.\-]|$)/);
                if (match) {
                  const s = parseInt(match[1], 10);
                  const e = parseInt(match[2], 10);
                  const { getResolution } = require('../utils/videoUtils');
                  let resName = item.name;
                  const t = resName.toLowerCase();
                  const hasRes = t.includes('2160p') || t.includes('4k') || t.includes('1080p') || t.includes('720p') || t.includes('480p') || t.includes('sd');
                  if (!hasRes) {
                    const res = await getResolution(fullPath);
                    if (res) resName = `Unknown ${res}`;
                  }
                  
                  db.prepare(`
                    UPDATE episodes 
                    SET file_path = ?, file_size = ?, scene_name = ?, status = 'downloaded' 
                    WHERE show_id = ? AND season_number = ? AND episode_number = ?
                  `).run(fullPath, stats.size, resName, show.id, s, e);
                }
              }
            }
          }
        } catch (e) {
          // Ignore read errors
        }
      };

      // Reset all downloaded episodes to missing and clear their paths before scanning
      db.prepare(`
        UPDATE episodes 
        SET status = CASE WHEN status = 'downloaded' THEN 'missing' ELSE status END,
            file_path = NULL,
            file_size = 0,
            scene_name = NULL
        WHERE show_id = ?
      `).run(show.id);

      await calculateSize(show.folder_path);

      db.prepare(`
        UPDATE shows 
        SET folder_size = ?, 
            status = CASE 
              WHEN ? > 0 THEN 'downloaded'
              WHEN status = 'downloaded' THEN 'missing'
              ELSE status
            END 
        WHERE id = ?
      `).run(totalSize, totalSize, show.id);
    }

    try {
      const tmdbService = require('../services/tmdbService');
      const data = await tmdbService.getShowById(show.tmdb_id);
      if (data) {
        db.prepare('UPDATE shows SET rating = ?, poster_path = ?, overview = ? WHERE id = ?')
          .run(data.vote_average || 0, data.poster_path, data.overview, show.id);
      }
    } catch (e) {
      console.error('TMDB refresh failed for show:', e.message);
    }

    res.json({ status: 'success', message: 'Show refreshed', folder_size: totalSize });
  } catch (e) {
    next(e);
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
      let subFiles = [];
      try {
        subFiles = await getSubtitlesInDir(dir, fsp, path);
      } catch (e) {
        // Directory might not exist, ignore
      }
      
      for (const ep of dirMap[dir]) {
        const subs = [];
        const baseName = path.basename(ep.file_path, path.extname(ep.file_path));
        const s = ep.season_number;
        const e = ep.episode_number;
        const matchStr1 = `s${s.toString().padStart(2, '0')}e${e.toString().padStart(2, '0')}`;
        const matchStr2 = `${s}x${e.toString().padStart(2, '0')}`;
        
        const epSubs = subFiles.filter(f => {
          if (f.startsWith(baseName)) return true;
          const fLower = f.toLowerCase();
          return fLower.includes(matchStr1) || fLower.includes(matchStr2);
        });
        
        epSubs.forEach(f => {
          subs.push({
            file: f,
            lang: extractLang(f, path),
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

    const eventBus = require('../services/eventBus');
    eventBus.success('Subtitle translated', { title: `${episode.title}`, type: 'episode', language: targetLang });

    res.json({ status: 'success', message: `Translated to ${targetLang}`, data: { file: `${parsedPath.name}.${langCode}.srt` } });
  } catch (err) {
    next(err);
  }
});

router.post('/episodes/:id/download-subs', async (req, res, next) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { downloadSubtitlesForEpisode } = require('../../services/subtitleService');
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


router.get('/episodes/:id/search-subs', async (req, res, next) => {
  try {
    const { searchSubtitlesForEpisode } = require('../../services/subtitleService');
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

    const results = await indexerService.searchShowPack(show.title, null, null, true);
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
            db.prepare("UPDATE episodes SET status = 'downloading', scene_name = ? WHERE id = ?").run(bestResult.title, ep.id);
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
    const { tmdbId, qualityProfileId, autoSearch, rootFolderPath } = req.body;
    if (!tmdbId) {
      return res.status(400).json({ status: 'error', message: 'tmdbId is required' });
    }
    const result = await libraryService.addShow(tmdbId, rootFolderPath);
    if (qualityProfileId) {
      db.prepare('UPDATE shows SET quality_profile_id = ? WHERE id = ?').run(qualityProfileId, result.id);
    }
    
    // Auto-Search
    if (autoSearch) {
      // Need to wait slightly for episodes to be populated by libraryService background fetch
      setTimeout(() => {
        (async () => {
          try {
            const indexerService = require('../services/indexerService');
            const downloadClientService = require('../services/downloadClientService');
            const eventBus = require('../services/eventBus');
            const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(result.id);
            const episodes = db.prepare("SELECT * FROM episodes WHERE show_id = ? AND status = 'monitored'").all(result.id);
            eventBus.info('Auto-search started', { title: show.title, type: 'show', episodes: episodes.length });
            let sentCount = 0;
            let totalCamFiltered = 0;
            
            for (const ep of episodes) {
              try {
                const results = await indexerService.searchEpisode(show.title, ep.season_number, ep.episode_number);
                totalCamFiltered += results._camFiltered || 0;
                if (results && results.length > 0) {
                  const bestResult = results[0];
                  await downloadClientService.addTorrent(bestResult.link);
                  db.prepare("UPDATE episodes SET status = 'downloading', scene_name = ? WHERE id = ?").run(typeof bestResult !== "undefined" ? bestResult.title : (typeof result !== "undefined" ? result.title : null), ep.id);
                  sentCount++;
                }
              } catch (e) {
                console.error(`[AutoSearch] Failed for ${show.title} S${ep.season_number}E${ep.episode_number}:`, e.message);
              }
            }
            if (sentCount > 0) {
              db.prepare("UPDATE shows SET status = 'downloading' WHERE id = ?").run(result.id);
              eventBus.success('Auto-search download started', { title: show.title, type: 'show', count: sentCount });
            } else if (totalCamFiltered > 0) {
              eventBus.warn(`Auto-search: only CAM/TS releases found (${totalCamFiltered} across episodes) — waiting for proper release`, { title: show.title, type: 'show' });
            } else {
              eventBus.warn('Auto-search: no results found', { title: show.title, type: 'show' });
            }
          } catch (e) {
            console.error(`[AutoSearch] Failed for show ${result.title}:`, e.message);
            const eventBus = require('../services/eventBus');
            eventBus.error('Auto-search failed', { title: result.title, type: 'show', error: e.message });
          }
        })();
      }, 5000); // 5 second delay to let episodes populate
    }

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

router.delete('/shows/:id', async (req, res, next) => {
  try {
    const fs = require('fs/promises');
    const path = require('path');
    const deleteFiles = req.query.deleteFiles === 'true';
    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });

    if (deleteFiles && show.folder_path) {
      try {
        const deleteFolderRecursive = async (folderPath) => {
          const entries = await fs.readdir(folderPath, { withFileTypes: true });
          await Promise.all(entries.map(entry => {
            const full = path.join(folderPath, entry.name);
            return entry.isDirectory() ? deleteFolderRecursive(full) : fs.unlink(full).catch(() => {});
          }));
          await fs.rmdir(folderPath).catch(() => {});
        };
        await deleteFolderRecursive(show.folder_path);
      } catch { /* ignore fs errors */ }
    }

    db.prepare('DELETE FROM episodes WHERE show_id = ?').run(req.params.id);
    db.prepare('DELETE FROM shows WHERE id = ?').run(req.params.id);
    res.json({ status: 'success', message: 'Show removed from library' });
  } catch (error) {
    next(error);
  }
});


router.delete('/episodes/:id/file', async (req, res, next) => {
  try {
    const fs = require('fs/promises');
    const deleteFiles = req.query.deleteFiles === 'true';
    const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });

    if (deleteFiles && episode.file_path) {
      await fs.unlink(episode.file_path).catch(() => {});
    }

    db.prepare('UPDATE episodes SET file_path = NULL, scene_name = NULL, file_size = NULL, status = ? WHERE id = ?')
      .run('missing', req.params.id);
    res.json({ status: 'success', message: 'Episode file removed' });
  } catch (error) {
    next(error);
  }
});


router.get('/episodes/:id/search', async (req, res, next) => {
  try {
    const indexerService = require('../services/indexerService');
    const episode = db.prepare('SELECT e.*, s.title as show_title FROM episodes e JOIN shows s ON e.show_id = s.id WHERE e.id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });

    const results = await indexerService.searchEpisode(episode.show_title, episode.season_number, episode.episode_number, null, null, true);
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
    db.prepare("UPDATE episodes SET status = 'downloading', scene_name = ? WHERE id = ?").run(bestResult.title, req.params.id);
    
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
    db.prepare("UPDATE episodes SET status = 'downloading', scene_name = ? WHERE id = ?").run(null, req.params.id);
    
    res.json({ status: 'success', message: 'Sent to download client' });
  } catch (err) {
    next(err);
  }
});


router.post('/shows/:id/wanted', (req, res, next) => {
  try {
    const show = db.prepare('SELECT id FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });
    db.prepare("UPDATE shows SET status = 'wanted' WHERE id = ?").run(req.params.id);
    res.json({ status: 'success', message: 'Added to watchlist' });
  } catch (err) { next(err); }
});


router.post('/shows/:id/seasons/:season/watched', (req, res, next) => {
  try {
    const { watched = 1 } = req.body;
    const result = db.prepare(
      'UPDATE episodes SET watched = ? WHERE show_id = ? AND season_number = ?'
    ).run(watched ? 1 : 0, req.params.id, req.params.season);
    res.json({ status: 'success', message: `${result.changes} episodes updated`, changes: result.changes });
  } catch (err) { next(err); }
});


router.post('/episodes/:id/grab', async (req, res, next) => {
  try {
    const { link, title } = req.body;
    if (!link) return res.status(400).json({ status: 'error', message: 'link is required' });
    const downloadClientService = require('../services/downloadClientService');
    const eventBus = require('../services/eventBus');
    await downloadClientService.addTorrent(link);
    db.prepare("UPDATE episodes SET status = 'downloading', scene_name = ? WHERE id = ?").run(title || null, req.params.id);
    eventBus.info('Manual grab started', { title: title || 'Unknown', type: 'episode' });
    res.json({ status: 'success', message: 'Download started' });
  } catch (err) { next(err); }
});


module.exports = router;
