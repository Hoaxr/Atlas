const express = require('express');
const router = express.Router();
const fs = require('fs');
const { deleteFolderRecursive } = require('../../utils/fileUtils');
const { USER_AGENT } = require('../../utils/constants');
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

router.post('/shows/:id/watched', (req, res, next) => {
  try {
    const { watched } = req.body;
    db.prepare('UPDATE shows SET watched = ?, watched_at = CURRENT_TIMESTAMP WHERE id = ?').run(watched ? 1 : 0, req.params.id);
    res.json({ status: 'success', message: watched ? 'Marked as watched' : 'Marked as unwatched' });
  } catch (err) {
    next(err);
  }
});

router.get('/shows', (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 0;
    const offset = parseInt(req.query.offset) || 0;
    const sort = req.query.sort || 'added_desc';
    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.qualityProfileId) filters.qualityProfileId = req.query.qualityProfileId;
    const shows = libraryService.getShows(limit, offset, sort, filters);
    res.json({ status: 'success', data: shows });
  } catch (error) {
    next(error);
  }
});

router.get('/shows/:id', async (req, res, next) => {
  try {
    
    const show = db.prepare('SELECT s.*, qp.name as quality_profile_name FROM shows s LEFT JOIN quality_profiles qp ON s.quality_profile_id = qp.id WHERE s.id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });
    if (!isWatchedSyncEnabled()) show.watched = 0;
    
    // folder_size is already loaded from the database via scannerService.
    

    res.json({ status: 'success', data: show });
  } catch (err) {
    next(err);
  }
});

const refreshShowData = async (id) => {
  const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(id);
  if (!show) return null;

  let totalSize = 0;
  
  if (show.folder_path) {
    const calculateSize = async (dirPath) => {
      try {
        const items = await fsp.readdir(dirPath, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(dirPath, item.name);
          if (item.isDirectory()) {
            await calculateSize(fullPath);
          } else if (item.isFile()) {
            const ext = path.extname(item.name).toLowerCase();
            if (['.mp4', '.mkv', '.avi', '.mov', '.wmv'].includes(ext)) {
              const stats = await fsp.stat(fullPath);
              totalSize += stats.size;
              
              const match = item.name.match(/[sS](\d+)[eE](\d+)/) || item.name.match(/(?:^|[ .-])(\d{1,2})x(\d{2})(?:[ .-]|$)/);
              if (match) {
                const s = parseInt(match[1], 10);
                const firstE = parseInt(match[2], 10);
                // Extract all numbers after the season prefix for multi-episode support
                // Only match the contiguous episode block (stops at whitespace)
                const epMatch = item.name.match(/[sS]\d+[eE](\d+(?:[-][eE]?\d+)*)/i);
                let lastE = firstE;
                if (epMatch) {
                  const epBlock = epMatch[0].replace(/^[sS]\d+[eE]/i, '');
                  const allEps = [...epBlock.matchAll(/(\d+)/g)].map(m => parseInt(m[1], 10));
                  if (allEps.length > 1) {
                    lastE = allEps[allEps.length - 1];
                  }
                }
                // Extracted getMediaMetadata, parseAudioFromFileName above
                // Always detect resolution — file name first, ffprobe as fallback
                let resolution = null;
                const nameLower = item.name.toLowerCase();
                if (nameLower.includes('2160p') || nameLower.includes('4k')) resolution = '2160p';
                else if (nameLower.includes('1080p')) resolution = '1080p';
                else if (nameLower.includes('720p')) resolution = '720p';
                else if (nameLower.includes('480p')) resolution = '480p';

                let codec = null;
                if (nameLower.includes('x265') || nameLower.includes('h265') || nameLower.includes('hevc')) codec = 'x265';
                else if (nameLower.includes('x264') || nameLower.includes('h264') || nameLower.includes('avc')) codec = 'x264';

                let audio = parseAudioFromFileName(item.name);

                if (!resolution || !codec || !audio) {
                  try {
                    const meta = await getMediaMetadata(fullPath);
                    if (!resolution) resolution = meta.resolution;
                    if (!codec) codec = meta.codec;
                    if (!audio) audio = meta.audio;
                  } catch { /* ignore */ }
                }

                const saveEpisodes = db.transaction((startEp, endEp) => {
                  for (let ep = startEp; ep <= endEp; ep++) {
                    db.prepare(`
                      UPDATE episodes 
                      SET status = 'downloaded', file_path = ?, file_size = ?, scene_name = ?, resolution = ?, codec = ?, audio = ?
                      WHERE show_id = ? AND season_number = ? AND episode_number = ?
                    `).run(fullPath, stats.size, item.name, resolution, codec, audio, show.id, s, ep);
                  }
                });
                saveEpisodes(firstE, lastE);
              }
            }
          }
        }
      } catch (e) {
        // Ignore read errors
      }
    };

    // Reset all downloaded/downloading episodes to missing/monitored and clear their paths before scanning
    db.prepare(`
      UPDATE episodes 
      SET status = CASE WHEN status = 'downloaded' THEN 'missing'
                        WHEN status = 'downloading' THEN 'monitored'
                        ELSE status END,
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

    // Scan subtitles for this show's episodes
    const subExtensions = ['.srt', '.sub', '.vtt', '.ass', '.ssa', '.smi', '.idx'];
    const subEps = db.prepare(
      "SELECT id, file_path, season_number, episode_number FROM episodes WHERE show_id = ? AND file_path IS NOT NULL"
    ).all(show.id);

    const subDirMap = {};
    for (const ep of subEps) {
      const dir = path.dirname(ep.file_path);
      if (!subDirMap[dir]) subDirMap[dir] = [];
      subDirMap[dir].push(ep);
    }

    for (const [dir, episodes] of Object.entries(subDirMap)) {
      let subFiles = [];
      try {
        const items = await fsp.readdir(dir);
        subFiles = items.filter(f => subExtensions.includes(path.extname(f).toLowerCase()));
      } catch { /* skip */ }

        const updateSubs = db.transaction((episodeList) => {
          const stmt = db.prepare('UPDATE episodes SET subtitles = ? WHERE id = ?');
          for (const ep of episodeList) {
            const baseName = path.basename(ep.file_path, path.extname(ep.file_path));
            const s = ep.season_number;
            const e = ep.episode_number;
            const matchStr1 = `s${String(s).padStart(2, '0')}e${String(e).padStart(2, '0')}`;
            const matchStr2 = `${s}x${String(e).padStart(2, '0')}`;

            const matchingSubs = subFiles.filter(f =>
              f.startsWith(baseName) || f.toLowerCase().includes(matchStr1) || f.toLowerCase().includes(matchStr2)
            );

            const langs = [...new Set(
              matchingSubs.map(f => {
                const name = path.basename(f, path.extname(f));
                const m = name.match(/[._-]([a-z]{2,3})(?:\.[a-z0-9]+)?$/i);
                return m ? m[1].toLowerCase() : null;
              }).filter(Boolean)
            )];

            stmt.run(JSON.stringify(langs), ep.id);
          }
        });
        updateSubs(episodes);
    }
  }

  // Fire TMDB re-sync in background to avoid blocking the response
  (async () => {
    try {
      const data = await tmdbService.getShowById(show.tmdb_id);
      if (data) {
        db.prepare('UPDATE shows SET rating = ?, poster_path = ?, overview = ?, tmdb_status = ? WHERE id = ?')
          .run(data.vote_average || 0, data.poster_path, data.overview, data.status || '', show.id);

        const seasons = await tmdbService.getShowSeasons(show.tmdb_id);
        const insertEp = db.prepare(`
          INSERT INTO episodes (show_id, season_number, episode_number, title, overview, status, air_date)
          VALUES (?, ?, ?, ?, ?, 'monitored', ?)
          ON CONFLICT(show_id, season_number, episode_number) DO UPDATE SET
            title = excluded.title,
            overview = excluded.overview,
            air_date = excluded.air_date
        `);
        const tmdbEpisodeKeys = new Set();
        for (const s of seasons) {
          if (s.season_number === 0) continue;
          const episodes = await tmdbService.getSeasonEpisodes(show.tmdb_id, s.season_number);
          for (const ep of episodes) {
            const key = `${ep.season_number}|${ep.episode_number}`;
            tmdbEpisodeKeys.add(key);
            insertEp.run(show.id, ep.season_number, ep.episode_number, ep.name, ep.overview, ep.air_date);
          }
        }

        const allDbEpisodes = db.prepare(
          'SELECT id, season_number, episode_number, status FROM episodes WHERE show_id = ?'
        ).all(show.id);
        const runStaleDeletion = db.transaction(() => {
          const deleteStale = db.prepare('DELETE FROM episodes WHERE id = ?');
          let removedCount = 0;
          for (const ep of allDbEpisodes) {
            const key = `${ep.season_number}|${ep.episode_number}`;
            if (!tmdbEpisodeKeys.has(key) && ep.status !== 'downloaded') {
              deleteStale.run(ep.id);
              removedCount++;
            }
          }
          return removedCount;
        });
        const removedCount = runStaleDeletion();
        if (removedCount > 0) {
          console.log(`[ShowRefresh] Removed ${removedCount} stale episode(s) from "${show.title}"`);
        }
      }
    } catch (e) {
      console.error('TMDB refresh failed for show:', e.message);
    }
  })();

  return db.prepare('SELECT * FROM shows WHERE id = ?').get(id);
};

router.post('/shows/:id/refresh', async (req, res, next) => {
  try {
    const show = await refreshShowData(req.params.id);
    res.json({ status: 'success', message: 'Show refreshed', folder_size: show.folder_size });
  } catch (e) {
    next(e);
  }
});

router.get('/shows/:id/episodes', async (req, res, next) => {
  try {
    const episodes = db.prepare('SELECT * FROM episodes WHERE show_id = ? ORDER BY season_number ASC, episode_number ASC').all(req.params.id);

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
    const targetLangRow = db.prepare("SELECT value FROM settings WHERE key = 'targetLang'").get();
    const targetLang = req.body.targetLang || (targetLangRow && targetLangRow.value ? targetLangRow.value : 'Dutch');
    const langCode = LANG_CODE[targetLang] || 'nl';

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

    const enSrtContent = await fsp.readFile(enSubPath, 'utf8');
    const translatedText = await translateSrt(enSrtContent, targetLang);
    await fsp.writeFile(targetSubPath, translatedText);

    eventBus.success('Subtitle translated', { title: `${episode.title}`, type: 'episode', language: targetLang });

    res.json({ status: 'success', message: `Translated to ${targetLang}`, data: { file: `${parsedPath.name}.${langCode}.srt` } });
  } catch (err) {
    next(err);
  }
});

router.post('/episodes/:id/download-subs', async (req, res, next) => {
  try {
    const { langCode, url, fileId, provider } = req.body;

    if (!langCode) return res.status(400).json({ status: 'error', message: 'langCode is required' });

    const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });

    if (!episode.file_path || !fs.existsSync(episode.file_path)) {
      return res.status(400).json({ status: 'error', message: 'Episode file not found on disk' });
    }

    const parsedPath = path.parse(episode.file_path);
    const subPath = path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`);

    // If a direct URL is provided, download from there (used by SubDL unpack files)
    if (url) {
      const srtRes = await axios.get(url, { responseType: 'text' });
      await fsp.writeFile(subPath, srtRes.data);
      return res.json({ status: 'success', message: `Downloaded "${langCode}" subtitle` });
    }

    // If a fileId is provided (OpenSubtitles), download by file ID
    if (fileId && provider === 'OpenSubtitles') {
      const osApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'osApiKey'").get();
      if (osApiKeyRow?.value) {
        const downloadRes = await axios.post('https://api.opensubtitles.com/api/v1/download',
          { file_id: fileId },
          { headers: { 'Api-Key': osApiKeyRow.value, 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Atlas/1.0' } }
        );
        const srtRes = await axios.get(downloadRes.data.link, { responseType: 'text', headers: { 'User-Agent': 'Atlas/1.0' } });
        await fsp.writeFile(subPath, srtRes.data);
        return res.json({ status: 'success', message: `Downloaded "${langCode}" subtitle` });
      }
    }

    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(episode.show_id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });

    const result = await subtitleService.downloadSubtitlesForEpisode(episode, show, langCode);
    if (result.alreadyExists) {
      return res.json({ status: 'success', message: `Subtitle already exists for "${langCode}"` });
    }
    res.json({ status: 'success', message: `Downloaded "${langCode}" subtitle` });
  } catch (err) {
    next(err);
  }
});


router.get('/episodes/:id/search-subs', async (req, res, next) => {
  try {
    const { lang } = req.query;
    if (!lang) return res.status(400).json({ status: 'error', message: 'lang query param is required' });

    const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });

    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(episode.show_id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });

    const results = await subtitleService.searchSubtitlesForEpisode(episode, show, lang);
    res.json({ status: 'success', data: results });
  } catch (err) {
    next(err);
  }
});

router.get('/shows/:id/search', async (req, res, next) => {
  try {
    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });

    const results = await indexerService.searchShowPack(show.title, null, null, true, show.tmdb_id);
    res.json({ status: 'success', data: results });
  } catch (err) {
    next(err);
  }
});

router.post('/shows/:id/auto-search', async (req, res, next) => {
  try {
    await refreshShowData(req.params.id);
    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });

    // Find all monitored episodes that are missing and have aired
    const episodes = db.prepare(`
      SELECT * FROM episodes 
      WHERE show_id = ? AND status = 'monitored' 
        AND (air_date IS NULL OR date(air_date) <= date('now'))
    `).all(req.params.id);
    
    // Run the search asynchronously in the background so the UI doesn't freeze
    (async () => {
      let sentCount = 0;
      for (const ep of episodes) {
        try {
          const results = await indexerService.searchEpisode(show.title, ep.season_number, ep.episode_number, null, null, false, show.tmdb_id);
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
    })().catch(err => console.error('[auto-search] Background search failed:', err.message));
    
    res.json({ status: 'success', message: `Search started in the background for ${episodes.length} episodes.` });
  } catch (err) {
    next(err);
  }
});

router.post('/shows/:id/download', async (req, res, next) => {
  try {
    const { torrentUrl } = req.body;
    if (!torrentUrl || typeof torrentUrl !== 'string' || !/^https?:\/\//.test(torrentUrl)) {
      return res.status(400).json({ status: 'error', message: 'Valid torrent URL (http/https) is required' });
    }
    
    await downloadClientService.addTorrent(torrentUrl, 'tv');
    db.prepare("UPDATE shows SET status = 'downloading' WHERE id = ?").run(req.params.id);
    db.prepare("UPDATE episodes SET status = 'downloading' WHERE show_id = ? AND status = 'monitored'").run(req.params.id);
    
    res.json({ status: 'success', message: 'Season pack sent to download client' });
  } catch (err) {
    next(err);
  }
});

// ─── Season Pack Search & Download ───────────────────────────────────────────

router.get('/shows/:id/seasons/:season/search', async (req, res, next) => {
  try {
    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });

    const seasonNumber = parseInt(req.params.season, 10);
    if (isNaN(seasonNumber)) return res.status(400).json({ status: 'error', message: 'Invalid season number' });

    const results = await indexerService.searchSeasonPack(show.title, seasonNumber, null, null, true, show.tmdb_id);
    res.json({ status: 'success', data: results });
  } catch (err) {
    next(err);
  }
});

router.post('/shows/:id/seasons/:season/download', async (req, res, next) => {
  try {
    const torrentUrl = req.body.link || req.body.torrentUrl;
    if (!torrentUrl) return res.status(400).json({ status: 'error', message: 'torrentUrl is required' });

    const seasonNumber = parseInt(req.params.season, 10);
    
    await downloadClientService.addTorrent(torrentUrl, 'tv');
    db.prepare("UPDATE episodes SET status = 'downloading' WHERE show_id = ? AND season_number = ? AND status = 'monitored'").run(req.params.id, seasonNumber);
    
    res.json({ status: 'success', message: `Season ${seasonNumber} pack sent to download client` });
  } catch (err) {
    next(err);
  }
});

router.post('/shows', async (req, res, next) => {
  try {
    const { tmdbId, qualityProfileId, autoSearch, rootFolderPath, monitorLevel } = req.body;
    if (!tmdbId) {
      return res.status(400).json({ status: 'error', message: 'tmdbId is required' });
    }
    const result = await libraryService.addShow(tmdbId, rootFolderPath, monitorLevel || 'all');
    if (qualityProfileId) {
      db.prepare('UPDATE shows SET quality_profile_id = ? WHERE id = ?').run(qualityProfileId, result.id);
    }
    
    // Auto-Search
    if (autoSearch) {
      // Need to wait slightly for episodes to be populated by libraryService background fetch
      setTimeout(() => {
        (async () => {
          try {
            const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(result.id);
            const episodes = db.prepare(`
              SELECT * FROM episodes 
              WHERE show_id = ? AND status = 'monitored' 
                AND (air_date IS NULL OR date(air_date) <= date('now'))
            `).all(result.id);
            eventBus.info('Auto-search started', { title: show.title, type: 'show', episodes: episodes.length });
            let sentCount = 0;
            let totalCamFiltered = 0;
            
            for (const ep of episodes) {
              try {
                const results = await indexerService.searchEpisode(show.title, ep.season_number, ep.episode_number, null, null, false, show.tmdb_id);
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
    const deleteFiles = req.query.deleteFiles === 'true';
    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });

    if (deleteFiles && show.folder_path) {
      try {
        await deleteFolderRecursive(show.folder_path);
      } catch {
        console.warn('[shows] Could not delete files for show:', show.title);
      }
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
    const deleteFiles = req.query.deleteFiles === 'true';
    const episode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });

    if (deleteFiles && episode.file_path) {
      await fsp.unlink(episode.file_path).catch(() => {});
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
    const episode = db.prepare('SELECT e.*, s.title as show_title, s.tmdb_id as show_tmdb_id FROM episodes e JOIN shows s ON e.show_id = s.id WHERE e.id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });

    const results = await indexerService.searchEpisode(episode.show_title, episode.season_number, episode.episode_number, null, null, true, episode.show_tmdb_id);
    res.json({ status: 'success', data: results });
  } catch (err) {
    next(err);
  }
});

router.post('/episodes/:id/auto-search', async (req, res, next) => {
  try {
    let episode = db.prepare('SELECT e.*, s.title as show_title, s.tmdb_id as show_tmdb_id FROM episodes e JOIN shows s ON e.show_id = s.id WHERE e.id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });

    await refreshShowData(episode.show_id);
    episode = db.prepare('SELECT e.*, s.title as show_title, s.tmdb_id as show_tmdb_id FROM episodes e JOIN shows s ON e.show_id = s.id WHERE e.id = ?').get(req.params.id);
    
    if (episode.status === 'downloaded' && episode.file_path) {
      return res.json({ status: 'success', message: 'Episode is already downloaded on disk. Skipping search.' });
    }

    const results = await indexerService.searchEpisode(episode.show_title, episode.season_number, episode.episode_number, null, null, false, episode.show_tmdb_id);
    
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
      'UPDATE episodes SET watched = ?, watched_at = CURRENT_TIMESTAMP WHERE show_id = ? AND season_number = ?'
    ).run(watched ? 1 : 0, req.params.id, req.params.season);
    res.json({ status: 'success', message: `${result.changes} episodes updated`, changes: result.changes });
  } catch (err) { next(err); }
});


router.post('/episodes/:id/grab', async (req, res, next) => {
  try {
    const { link, title } = req.body;
    if (!link) return res.status(400).json({ status: 'error', message: 'link is required' });
    await downloadClientService.addTorrent(link);
    db.prepare("UPDATE episodes SET status = 'downloading', scene_name = ? WHERE id = ?").run(title || null, req.params.id);
    eventBus.info('Manual grab started', { title: title || 'Unknown', type: 'episode' });
    res.json({ status: 'success', message: 'Download started' });
  } catch (err) { next(err); }
});

// Lightweight sibling navigation — avoids fetching entire library
router.get('/shows/:id/siblings', (req, res, next) => {
  try {
    const ids = db.prepare('SELECT id FROM shows ORDER BY title ASC').all().map(r => r.id);
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
