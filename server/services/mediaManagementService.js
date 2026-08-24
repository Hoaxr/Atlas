const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const db = require('../config/database');
const downloadClientService = require('./downloadClientService');
const taskRegistry = require('./taskRegistry');
const { registerJob } = require('../utils/cronRegistry');
const eventBus = require('./eventBus');
const tmdbService = require('./tmdbService');
const imageService = require('./imageService');

const { getSetting } = require('../utils/settings');
const { isVideoFile, findLargestVideoFile } = require('../utils/fileUtils');
const { getMediaMetadata, parseAudioFromFileName } = require('../utils/videoUtils');
const subtitleService = require('./subtitles');


const getNamingConfig = () => {
  return {
    renameMovies: getSetting('renameMovies') !== 'false',
    replaceIllegalCharacters: getSetting('replaceIllegalCharacters') !== 'false',
    colonReplacement: getSetting('colonReplacement') || 'delete',
    standardMovieFormat: getSetting('standardMovieFormat') || '{Movie Title} ({Release Year})',
    renameEpisodes: getSetting('renameEpisodes') !== 'false',
    standardEpisodeFormat: getSetting('standardEpisodeFormat') || '{Show Title} - S{Season}E{Episode} - {Episode Title}',
    seasonFolderFormat: getSetting('seasonFolderFormat') || 'Season {Season Number}'
  };
};

const sanitizeTitle = (title, config) => {
  if (!title) return '';
  let sanitized = title;

  // Handle colons
  if (config.colonReplacement === 'dash') {
    sanitized = sanitized.replace(/:/g, ' - ');
  } else if (config.colonReplacement === 'space') {
    sanitized = sanitized.replace(/:/g, ' ');
  } else {
    // default 'delete'
    sanitized = sanitized.replace(/:/g, '');
  }

  // Handle illegal characters
  if (config.replaceIllegalCharacters) {
    sanitized = sanitized.replace(/[<>"/\\|?*]/g, '');
  }

  return sanitized.trim().replace(/\s+/g, ' ');
};


// Find ALL video files in a directory tree — used for season pack imports
const findAllVideoFiles = async (dirPath) => {
  const results = [];
  try {
    const stats = await fs.promises.stat(dirPath);
    if (stats.isFile()) {
      if (isVideoFile(dirPath)) results.push(dirPath);
      return results;
    }
    const files = await fs.promises.readdir(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      try {
        const fileStats = await fs.promises.stat(fullPath);
        if (fileStats.isDirectory()) {
          const nested = await findAllVideoFiles(fullPath);
          results.push(...nested);
        } else if (fileStats.isFile() && isVideoFile(fullPath)) {
          results.push(fullPath);
        }
      } catch { /* skip unreadable */ }
    }
  } catch { /* skip */ }
  return results;
};

// Parse season/episode numbers from a filename like "Show.Name.S01E02.mkv" or "Show.Name.S01E01-E02.mkv"
const parseEpisodeFromFilename = (filePath) => {
  const name = path.basename(filePath).toLowerCase();
  // Multi-episode: S01E01-E04, S01E01-E02, S01E01-02, S01E01E02, etc.
  const multiMatch = name.match(/\bs(\d{1,2})[._\s-]*e(\d{1,3})(?:[-_e\s]+(?:s\d{1,2})?e?(\d{1,3}))+\b/i);
  if (multiMatch) {
    const season = parseInt(multiMatch[1], 10);
    const eStart = parseInt(multiMatch[2], 10);
    const extra = [...multiMatch[0].matchAll(/(\d{1,3})/g)].map(m => parseInt(m[1], 10));
    const eEnd = extra[extra.length - 1];
    const episodes = [];
    for (let ep = eStart; ep <= eEnd; ep++) episodes.push(ep);
    return { season, episode: eStart, episodes };
  }
  // Try S01E02 pattern
  let match = name.match(/s(\d{1,2})e(\d{1,2})/i);
  if (match) return { season: parseInt(match[1], 10), episode: parseInt(match[2], 10), episodes: [parseInt(match[2], 10)] };
  // Try 01x02 pattern
  match = name.match(/(\d{1,2})x(\d{1,2})/i);
  if (match) return { season: parseInt(match[1], 10), episode: parseInt(match[2], 10), episodes: [parseInt(match[2], 10)] };
  return null;
};

const normalizeForMatching = (s) => (s || '').toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

// Strip quality, audio, resolution, and release group tags to extract clean candidate title
const stripReleaseTags = (rawName) => {
  return (rawName || '')
    .replace(/\.(mp4|mkv|avi|mov|wmv|webm|ts|m2ts|mpg|mpeg)$/i, '')
    .replace(/(?:\[|\{)?\btmdb(?:id)?[-=:\s]+\d+(?:\]|\})?/gi, '')
    .replace(/(?:\[|\{)?\b(?:imdb[-=:\s]+)?tt\d{7,10}\b(?:\]|\})?/gi, '')
    .replace(/\b(2160p|1080p|1080i|720p|576p|480p|4k|uhd|bluray|bdrip|brrip|web-?dl|webrip|web|hdtv|hdrip|dvdrip|dvd|remux|proper|repack|rerip)\b.*/i, '')
    .replace(/\b(x264|x265|h\.?264|h\.?265|hevc|avc|xvid|divx|10bit|hdr(?:10(?:\+)?)?|dv|dolby\s*vision|atmos|truehd|dts(?:-hd)?|ddp?\+?(?:5\.1|7\.1)?|ac3|aac|flac|mp3)\b.*/i, '')
    .replace(/[._()[\]-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const isTvTorrentName = (rawName) => {
  if (!rawName) return false;
  if (/\bS\d{1,2}(?:[._\s-]*E\d{1,3})?\b/i.test(rawName)) return true;
  if (/\b\d{1,2}x\d{1,3}\b/i.test(rawName)) return true;
  if (/\b(?:Complete\s*)?Season\s*\d{1,2}\b/i.test(rawName)) return true;
  if (/\b(?:Complete\s*)?Series\b/i.test(rawName)) return true;
  if (/\bEpisode\s*\d+\b/i.test(rawName)) return true;
  if (/\bEP\d{1,4}\b/i.test(rawName)) return true;
  return false;
};

const matchMovieToTorrent = (torrent, movie) => {
  const rawName = torrent.name || '';
  if (!rawName) return false;

  // Never match TV releases as movies
  if (isTvTorrentName(rawName)) return false;

  const normRaw = normalizeForMatching(rawName);

  // 1. Direct scene_name match (stored when download was triggered)
  if (movie.scene_name && normalizeForMatching(movie.scene_name) === normRaw) {
    return true;
  }

  const normMovieTitle = normalizeForMatching(movie.title);
  if (!normMovieTitle) return false;

  // Extract year from raw torrent name
  const yearMatches = [...rawName.matchAll(/\b(19\d{2}|20\d{2})\b/g)];
  const torrentYear = yearMatches.length > 0 ? parseInt(yearMatches[0][1], 10) : null;

  // Strip release tags to find clean title stem
  const strippedTitlePart = stripReleaseTags(rawName);
  const normTitlePart = normalizeForMatching(strippedTitlePart.replace(/\b(19\d{2}|20\d{2})\b/g, ''));

  // Exact title stem match (e.g. "x" vs "x", "inception" vs "inception")
  if (normTitlePart === normMovieTitle) {
    if (movie.year && torrentYear && Math.abs(movie.year - torrentYear) > 1) {
      return false;
    }
    return true;
  }

  // Token boundary prefix match (torrent starts with full movie title)
  const movieWords = normMovieTitle.split(/\s+/).filter(Boolean);
  const torrentWords = normTitlePart.split(/\s+/).filter(Boolean);

  if (torrentWords.length >= movieWords.length) {
    const startWords = torrentWords.slice(0, movieWords.length).join(' ');
    if (startWords === normMovieTitle) {
      // Must verify year if movie has a year
      if (movie.year && torrentYear) {
        return Math.abs(movie.year - torrentYear) <= 1;
      }
      // For short titles (<= 3 chars, e.g. "X", "IT", "UP", "HER", "US", "X2", "9", "RRR"),
      // require exact title match or matching year to avoid false matches on codec words
      if (normMovieTitle.length <= 3) {
        return false;
      }
      return true;
    }
  }

  return false;
};

const matchEpisodeToTorrent = (torrent, ep) => {
  const rawName = torrent.name || '';
  if (!rawName) return false;

  const normRaw = normalizeForMatching(rawName);

  // 1. Direct scene_name match
  if (ep.scene_name && normalizeForMatching(ep.scene_name) === normRaw) {
    return true;
  }

  const normShowTitle = normalizeForMatching(ep.show_title);
  if (!normShowTitle) return false;

  // Must match show title on word boundary
  const showWords = normShowTitle.split(/\s+/).filter(Boolean);
  const rawWords = normRaw.split(/\s+/).filter(Boolean);
  
  let hasShowTitle = false;
  for (let i = 0; i <= rawWords.length - showWords.length; i++) {
    if (rawWords.slice(i, i + showWords.length).join(' ') === normShowTitle) {
      hasShowTitle = true;
      break;
    }
  }
  if (!hasShowTitle) return false;

  // S01E02 or 01x02 or S1E2 or multi-episode ranges S01E01-E04
  const sxxExxRegex = new RegExp(`\\bS0?${ep.season_number}[._\\s-]*E0?${ep.episode_number}\\b`, 'i');
  const sceneRegex = new RegExp(`\\b0?${ep.season_number}x0?${ep.episode_number}\\b`, 'i');
  
  if (sxxExxRegex.test(rawName) || sceneRegex.test(rawName)) {
    return true;
  }

  // Multi-episode regex: e.g. S01E01-E05
  const multiMatch = rawName.match(/\bS(\d{1,2})[._\s-]*E(\d{1,3})(?:[-_E\s]+(?:S\d{1,2})?E?(\d{1,3}))+\b/i);
  if (multiMatch) {
    const sNum = parseInt(multiMatch[1], 10);
    const eStart = parseInt(multiMatch[2], 10);
    const extra = [...multiMatch[0].matchAll(/(\d{1,3})/g)].map(m => parseInt(m[1], 10));
    const eEnd = extra[extra.length - 1];
    if (sNum === ep.season_number && ep.episode_number >= eStart && ep.episode_number <= eEnd) {
      return true;
    }
  }

  return false;
};

const matchSeasonPackToTorrent = (torrent, showTitle, seasonNumber) => {
  const rawName = torrent.name || '';
  if (!rawName) return false;

  // Must NOT have individual episode IDs
  const hasEpisodeIds = /\bS\d{1,2}[._\s-]*E\d{1,3}\b/i.test(rawName) || /\b\d{1,2}x\d{1,3}\b/i.test(rawName);
  if (hasEpisodeIds) return false;

  // Must match season pattern: S04, Season 4, Season 04, Complete Season 4
  const s = String(seasonNumber).padStart(2, '0');
  const seasonRegex = new RegExp(`\\b(S${s}|S${seasonNumber}|Season[._\\s]*0?${seasonNumber}|Complete[._\\s]*Season[._\\s]*0?${seasonNumber})\\b`, 'i');
  if (!seasonRegex.test(rawName)) return false;

  // Check show title on word boundary
  const normShowTitle = normalizeForMatching(showTitle);
  const normRaw = normalizeForMatching(rawName);
  const showWords = normShowTitle.split(/\s+/).filter(Boolean);
  const rawWords = normRaw.split(/\s+/).filter(Boolean);

  for (let i = 0; i <= rawWords.length - showWords.length; i++) {
    if (rawWords.slice(i, i + showWords.length).join(' ') === normShowTitle) {
      return true;
    }
  }

  return false;
};

// Reset any 'downloading' movies/episodes that are no longer present in the
// download client. If the item already had a file on disk (e.g. a cancelled
// upgrade) it is restored to 'downloaded'; otherwise it goes back to
// 'monitored'. Used after a torrent is removed and by the periodic
// post-processing cycle. Also recalculates show status when a show has no more
// active downloads.
const resetDownloadsNotInClient = async (torrentList) => {
  let list = torrentList;
  if (!list) {
    try {
      list = await downloadClientService.getTorrents() || [];
    } catch {
      list = [];
    }
  }

  const downloadingMovies = db.prepare("SELECT * FROM movies WHERE status = 'downloading'").all();
  const downloadingEpisodes = db.prepare(`
    SELECT e.*, s.title as show_title 
    FROM episodes e 
    JOIN shows s ON e.show_id = s.id 
    WHERE e.status = 'downloading'
  `).all();

  for (const movie of downloadingMovies) {
    const isStillInQueue = list.some(t => matchMovieToTorrent(t, movie));
    if (!isStillInQueue) {
      if (movie.file_path && fs.existsSync(movie.file_path)) {
        console.log(`[MediaManagement] Movie ${movie.title} removed from client but its file exists. Restoring to downloaded.`);
        db.prepare("UPDATE movies SET status = 'downloaded' WHERE id = ?").run(movie.id);
      } else {
        console.log(`[MediaManagement] Movie ${movie.title} no longer in download client. Resetting to monitored.`);
        db.prepare("UPDATE movies SET status = 'monitored', file_path = NULL, file_size = 0, scene_name = NULL WHERE id = ?").run(movie.id);
      }
    }
  }

  for (const ep of downloadingEpisodes) {
    const isStillInQueue = list.some(t => {
      return matchEpisodeToTorrent(t, ep) || matchSeasonPackToTorrent(t, ep.show_title, ep.season_number);
    });

    if (!isStillInQueue) {
      if (ep.file_path && fs.existsSync(ep.file_path)) {
        console.log(`[MediaManagement] Episode ${ep.show_title} S${String(ep.season_number).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')} removed from client but its file exists. Restoring to downloaded.`);
        db.prepare("UPDATE episodes SET status = 'downloaded' WHERE id = ?").run(ep.id);
      } else {
        console.log(`[MediaManagement] Episode ${ep.show_title} S${String(ep.season_number).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')} no longer in download client. Resetting to monitored.`);
        db.prepare("UPDATE episodes SET status = 'monitored', file_path = NULL, file_size = NULL, scene_name = NULL WHERE id = ?").run(ep.id);
      }
    }
  }

  // Recalculate status for shows that were marked as downloading
  const downloadingShows = db.prepare("SELECT id FROM shows WHERE status = 'downloading'").all();
  for (const show of downloadingShows) {
    const activeEps = db.prepare("SELECT COUNT(*) as count FROM episodes WHERE show_id = ? AND status = 'downloading'").get(show.id).count;
    if (activeEps === 0) {
      const missingMonitored = db.prepare("SELECT COUNT(*) as count FROM episodes WHERE show_id = ? AND monitored = 1 AND (file_path IS NULL OR file_path = '')").get(show.id).count;
      const newStatus = missingMonitored > 0 ? 'monitored' : 'downloaded';
      db.prepare("UPDATE shows SET status = ? WHERE id = ?").run(newStatus, show.id);
      console.log(`[MediaManagement] Show ID ${show.id} all downloads finished. Status updated to ${newStatus}.`);
    }
  }
};

const runMediaManagement = async () => {
  const pendingMoviesCount = db.prepare("SELECT COUNT(*) as count FROM movies WHERE status IN ('downloading', 'monitored', 'missing')").get().count;
  const pendingEpisodesCount = db.prepare(`
    SELECT COUNT(*) as count FROM episodes 
    WHERE (status = 'downloading') 
       OR (status IN ('monitored', 'missing') AND (file_path IS NULL OR file_path = ''))
  `).get().count;

  console.log(`[MediaManagement] Checking: ${pendingMoviesCount} pending movies, ${pendingEpisodesCount} pending episodes`);

  if (pendingMoviesCount === 0 && pendingEpisodesCount === 0) {
    return 'skipped';
  }

  console.log('[MediaManagement] Starting post-processing check...');
  
  let importedAnything = false;

  try {
    let torrentList;
    try {
      torrentList = await downloadClientService.getTorrents() || [];
    } catch (clientErr) {
      console.warn('[MediaManagement] Download client unreachable — skipping this run:', clientErr.message);
      return 'skipped';
    }
    
    // Filter finished torrents
    const finishedTorrents = torrentList.filter(t => t.progress >= 100);

    const pendingMovies = db.prepare("SELECT * FROM movies WHERE status IN ('downloading', 'monitored')").all();
    const pendingEpisodes = db.prepare(`
      SELECT e.*, s.title as show_title 
      FROM episodes e 
      JOIN shows s ON e.show_id = s.id 
      WHERE e.status IN ('downloading', 'monitored')
    `).all();

    for (const torrent of finishedTorrents) {
      let torrentHandled = false;

      // 1. If torrent is a TV release, match episodes and season packs
      if (isTvTorrentName(torrent.name)) {
        // Individual episode match
        for (const ep of pendingEpisodes) {
          if (matchEpisodeToTorrent(torrent, ep)) {
            const success = await importEpisode(torrent, ep);
            if (success) {
              importedAnything = true;
              torrentHandled = true;
              break;
            }
          }
        }

        // Season pack match (if not matched to an individual episode)
        if (!torrentHandled) {
          for (const ep of pendingEpisodes) {
            if (matchSeasonPackToTorrent(torrent, ep.show_title, ep.season_number)) {
              const success = await importSeasonPack(torrent, { showId: ep.show_id, showTitle: ep.show_title, seasonNumber: ep.season_number });
              if (success) {
                importedAnything = true;
                torrentHandled = true;
                break;
              }
            }
          }
        }
      } else {
        // 2. Movie match (only for non-TV releases)
        for (const movie of pendingMovies) {
          if (matchMovieToTorrent(torrent, movie)) {
            const success = await importMovie(torrent, movie);
            if (success) {
              importedAnything = true;
              torrentHandled = true;
              break; // One import per torrent
            }
          }
        }
      }
    }

    // Re-fetch what's STILL downloading after imports and reset anything no
    // longer in the torrent client back to monitored (also fixes show status).
    await resetDownloadsNotInClient(torrentList);

    if (importedAnything) {
      console.log('[MediaManagement] New media imported. Triggering subtitle downloader task immediately.');
      taskRegistry.executeTask('subtitle_downloader').catch(e => console.error('[MediaManagement] Failed to trigger subtitle_downloader', e.message));
    }

  } catch (err) {
    console.error('[MediaManagement] Error during post-processing:', err.message);
  }
};


const importMovie = async (torrent, movie) => {
  console.log(`[MediaManagement] Importing movie: ${movie.title}`);
  
  try {
    const paths = db.prepare('SELECT path FROM library_paths').all();
    if (paths.length === 0) {
      console.warn('[MediaManagement] No library paths configured to import to!');
      return;
    }

    let contentPath = torrent.content_path || path.join(torrent.save_path, torrent.name);
    
    const pathMapping = db.prepare("SELECT value FROM settings WHERE key = 'downloadPathMapping'").get();
    const applyMapping = (p) => {
      if (!pathMapping?.value) return p;
      try {
        const [from, to] = JSON.parse(pathMapping.value);
        return p.startsWith(from) ? p.replace(from, to) : p;
      } catch { return p; }
    };
    contentPath = applyMapping(contentPath);

    if (!fs.existsSync(contentPath) && torrent.save_path) {
      const altPath = applyMapping(path.join(torrent.save_path, torrent.name));
      if (fs.existsSync(altPath)) {
        console.log(`[MediaManagement] content_path ${contentPath} not found, using ${altPath} instead`);
        contentPath = altPath;
      }
    }
    
    const videoFile = await findLargestVideoFile(contentPath);
    
    if (!videoFile) {
      console.warn(`[MediaManagement] No video file found in ${contentPath}`);
      return;
    }

    const ext = path.extname(videoFile.path);
    const libraryRoot = paths.find(p => p.path.toLowerCase().includes('movie'))?.path || paths[0].path;
    const isDedicatedPath = libraryRoot.toLowerCase().includes('movie');
    const config = getNamingConfig();
    
    // Build folder and file names from the naming format
    let folderName, fileName;
    if (config.renameMovies) {
      let format = config.standardMovieFormat || '{Movie Title} ({Release Year})';
      format = format.replace('{Movie Title}', sanitizeTitle(movie.title, config));
      format = format.replace('{Release Year}', movie.year);
      folderName = format;
      fileName = format;
    } else {
      folderName = sanitizeTitle(`${movie.title} (${movie.year})`, config);
      fileName = path.basename(videoFile.path, ext);
    }
    
    const destFolder = isDedicatedPath 
      ? path.join(libraryRoot, folderName) 
      : path.join(libraryRoot, 'Movies', folderName);
    
    await fs.promises.mkdir(destFolder, { recursive: true });
    const destFile = path.join(destFolder, `${fileName}${ext}`);

    // Clean up any existing video files in the destination folder (from previous imports)
    if (fs.existsSync(destFolder)) {
      try {
        const existingFiles = await fs.promises.readdir(destFolder);
        for (const existing of existingFiles) {
          if (isVideoFile(existing)) {
            const oldPath = path.join(destFolder, existing);
            console.log(`[MediaManagement] Removing old video file: ${oldPath}`);
            await fs.promises.unlink(oldPath).catch(() => {});
          }
        }
      } catch { /* ignore cleanup errors */ }
    }
    
    if (movie.file_path && movie.file_path !== destFile && fs.existsSync(movie.file_path)) {
      console.log(`[MediaManagement] Deleting old file at ${movie.file_path}.`);
      await fs.promises.unlink(movie.file_path).catch(() => {});
    }

    if (fs.existsSync(destFile)) {
      console.log(`[MediaManagement] File ${destFile} already exists. Overwriting with new import.`);
      await fs.promises.unlink(destFile);
    }

    try {
      console.log(`[MediaManagement] Hardlinking ${videoFile.path} to ${destFile}`);
      await fs.promises.link(videoFile.path, destFile);
      console.log(`[MediaManagement] Hardlink complete for ${movie.title}`);
    } catch (linkErr) {
      if (linkErr.code === 'EXDEV') {
        console.log(`[MediaManagement] Cross-device link failed. Falling back to copy for ${movie.title}`);
        await fs.promises.copyFile(videoFile.path, destFile);
        console.log(`[MediaManagement] Copy complete for ${movie.title}. Deleting original file.`);
        await fs.promises.unlink(videoFile.path).catch(e => {
          if (e.code !== 'ENOENT') throw e;
        });
      } else {
        throw linkErr;
      }
    }

    // Remove torrent from client first (if enabled), so failed removal keeps status as 'downloading' for retry
    const removeSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('removeCompletedDownloads');
    const deleteFilesSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('deleteTorrentFiles');
    if (removeSetting && removeSetting.value === 'true') {
      const deleteFiles = deleteFilesSetting && deleteFilesSetting.value === 'true';
      console.log(`[MediaManagement] Removing torrent ${torrent.name} from client (deleteFiles: ${deleteFiles})`);
      try {
        await downloadClientService.deleteTorrent(torrent.hash, deleteFiles);
        console.log(`[MediaManagement] Torrent ${torrent.name} removed successfully.`);
      } catch (delErr) {
        console.error(`[MediaManagement] Failed to remove torrent ${torrent.name}, will retry next cycle:`, delErr.message);
        return; // Keep status as 'downloading' so it retries next cycle
      }
    }

    db.prepare("UPDATE movies SET status = 'downloaded', file_path = ?, scene_name = ? WHERE id = ?").run(destFile, torrent.name, movie.id);
    console.log(`[MediaManagement] Movie ${movie.title} marked as downloaded.`);
    eventBus.success('Download complete', { title: movie.title, type: 'movie', destinationPath: destFile });

    // Immediately search for subtitles without waiting for the scheduler
    try {
      const providerLangs = (() => {
        try {
          const row = db.prepare("SELECT value FROM settings WHERE key = 'providerLangs'").get();
          return row ? JSON.parse(row.value) : ['en'];
        } catch { return ['en']; }
      })();
      const freshMovie = db.prepare('SELECT * FROM movies WHERE id = ?').get(movie.id);
      for (const langCode of providerLangs) {
        subtitleService.downloadSubtitlesForMovie(freshMovie, langCode).catch(e =>
          console.log(`[MediaManagement] Subtitle fetch (${langCode}) for ${movie.title}: ${e.message}`)
        );
      }
    } catch (subErr) {
      console.error(`[MediaManagement] Failed to trigger subtitle search for ${movie.title}:`, subErr.message);
    }


    // Auto-refresh: detect resolution, codec & audio and update TMDB metadata
    try {
      let sceneName = torrent.name;
      let resolution = null;
      let codec = null;
      let audio = null;
      const t = sceneName.toLowerCase();
      if (t.includes('2160p') || t.includes('4k')) resolution = '2160p';
      else if (t.includes('1080p')) resolution = '1080p';
      else if (t.includes('720p')) resolution = '720p';
      else if (t.includes('480p')) resolution = '480p';
      
      if (t.includes('x265') || t.includes('h265') || t.includes('hevc')) codec = 'x265';
      else if (t.includes('x264') || t.includes('h264') || t.includes('avc')) codec = 'x264';

      audio = parseAudioFromFileName(sceneName);

      if (!resolution || !codec || !audio) {
        const meta = await getMediaMetadata(destFile);
        if (!resolution) resolution = meta.resolution;
        if (!codec) codec = meta.codec;
        if (!audio) audio = meta.audio;
      }

      if (resolution && !t.includes('2160p') && !t.includes('4k') && !t.includes('1080p') && !t.includes('720p') && !t.includes('480p') && !t.includes('sd')) {
        sceneName = `${torrent.name} ${resolution}`;
      }

      db.prepare('UPDATE movies SET scene_name = ?, file_size = ?, resolution = ?, codec = ?, audio = ? WHERE id = ?')
        .run(sceneName, fs.statSync(destFile).size, resolution, codec, audio, movie.id);
    } catch (resErr) {
      console.error(`[MediaManagement] Failed to detect metadata for ${movie.title}:`, resErr.message);
    }

    // Refresh TMDB metadata in DB
    try {
      const tmdbData = await tmdbService.getMovieById(movie.tmdb_id);
      if (tmdbData) {
        db.prepare('UPDATE movies SET rating = ?, poster_path = ?, overview = ? WHERE id = ?')
          .run(tmdbData.vote_average || 0, tmdbData.poster_path, tmdbData.overview, movie.id);
      }
    } catch (tmdbErr) {
      console.error(`[MediaManagement] Failed to refresh TMDB metadata for ${movie.title}:`, tmdbErr.message);
    }

    // Cache poster in server/data/images (never written to library folder)
    try {
      const posterTmdbPath = movie.poster_path || (await tmdbService.getMovieById(movie.tmdb_id).catch(() => null))?.poster_path;
      if (posterTmdbPath) {
        await imageService.ensurePoster('movies', movie.tmdb_id, posterTmdbPath);
        console.log(`[MediaManagement] Poster cached for ${movie.title}`);
      }
    } catch (metaErr) {
      console.error(`[MediaManagement] Failed to cache poster for movie ${movie.title}:`, metaErr.message);
    }
    
    return true;

  } catch (err) {
    console.error(`[MediaManagement] Failed to import movie ${movie.title}:`, err);
    return false;
  }
};

const importEpisode = async (torrent, episode) => {
  console.log(`[MediaManagement] Importing episode: ${episode.show_title} S${episode.season_number}E${episode.episode_number}`);
  
  try {
    const paths = db.prepare('SELECT path FROM library_paths').all();
    if (paths.length === 0) {
      console.warn('[MediaManagement] No library paths configured to import to!');
      return;
    }

    let contentPath = torrent.content_path || path.join(torrent.save_path, torrent.name);
    
    // Apply download path mapping from settings
    const pathMapping = db.prepare("SELECT value FROM settings WHERE key = 'downloadPathMapping'").get();
    const applyMapping = (p) => {
      if (!pathMapping?.value) return p;
      try {
        const [from, to] = JSON.parse(pathMapping.value);
        return p.startsWith(from) ? p.replace(from, to) : p;
      } catch { return p; }
    };
    contentPath = applyMapping(contentPath);

    // Fallback: if content_path doesn't exist, try save_path + name with mapping
    if (!fs.existsSync(contentPath) && torrent.save_path) {
      const altPath = applyMapping(path.join(torrent.save_path, torrent.name));
      if (fs.existsSync(altPath)) {
        console.log(`[MediaManagement] content_path ${contentPath} not found, using ${altPath} instead`);
        contentPath = altPath;
      }
    }
    
    const videoFile = await findLargestVideoFile(contentPath);
    
    if (!videoFile) {
      console.warn(`[MediaManagement] No video file found in ${contentPath}`);
      return;
    }

    const ext = path.extname(videoFile.path);
    const libraryRoot = paths.find(p => p.path.toLowerCase().includes('tv') || p.path.toLowerCase().includes('show'))?.path || paths[0].path;
    const isDedicatedPath = libraryRoot.toLowerCase().includes('tv') || libraryRoot.toLowerCase().includes('show');
    const config = getNamingConfig();
    
    const s = episode.season_number.toString().padStart(2, '0');
    const e = episode.episode_number.toString().padStart(2, '0');
    
    const showFolder = sanitizeTitle(episode.show_title, config);
    let fileName = `${showFolder} - S${s}E${e}`;
    
    if (config.renameEpisodes) {
      let format = config.standardEpisodeFormat;
      format = format.replace('{Show Title}', showFolder);
      format = format.replace('{Season}', s);
      format = format.replace('{Episode}', e);
      format = format.replace('{Episode Title}', sanitizeTitle(episode.title || '', config));
      fileName = format;
    } else {
      fileName = path.basename(videoFile.path, ext);
    }

    let seasonFolder = config.seasonFolderFormat || 'Season {Season Number}';
    seasonFolder = seasonFolder.replace(/{Show Title}/gi, showFolder);
    seasonFolder = seasonFolder.replace(/{Season}/gi, s);
    seasonFolder = seasonFolder.replace(/{Season Number}/gi, episode.season_number.toString());
    
    if (!seasonFolder) seasonFolder = `Season ${s}`;

    const destFolder = isDedicatedPath
      ? path.join(libraryRoot, showFolder, seasonFolder)
      : path.join(libraryRoot, 'TV Shows', showFolder, seasonFolder);
    
    await fs.promises.mkdir(destFolder, { recursive: true });
    
    const destFile = path.join(destFolder, `${fileName}${ext}`);
    
    if (episode.file_path && episode.file_path !== destFile && fs.existsSync(episode.file_path)) {
      console.log(`[MediaManagement] Deleting old file at ${episode.file_path}.`);
      await fs.promises.unlink(episode.file_path).catch(() => {});
    }

    if (fs.existsSync(destFile)) {
      console.log(`[MediaManagement] File ${destFile} already exists. Overwriting with new import.`);
      await fs.promises.unlink(destFile);
    }

    try {
      console.log(`[MediaManagement] Hardlinking ${videoFile.path} to ${destFile}`);
      await fs.promises.link(videoFile.path, destFile);
      console.log(`[MediaManagement] Hardlink complete for episode.`);
    } catch (linkErr) {
      if (linkErr.code === 'EXDEV') {
        console.log(`[MediaManagement] Cross-device link failed. Falling back to copy for episode.`);
        await fs.promises.copyFile(videoFile.path, destFile);
        console.log(`[MediaManagement] Copy complete for episode. Deleting original file.`);
        await fs.promises.unlink(videoFile.path).catch(e => {
          if (e.code !== 'ENOENT') throw e;
        });
      } else {
        throw linkErr;
      }
    }

    // Remove torrent from client first (if enabled and has a hash — skip for season pack sub-imports)
    const removeSettingEp = db.prepare('SELECT value FROM settings WHERE key = ?').get('removeCompletedDownloads');
    const deleteFilesSettingEp = db.prepare('SELECT value FROM settings WHERE key = ?').get('deleteTorrentFiles');
    if (torrent.hash && removeSettingEp && removeSettingEp.value === 'true') {
      const deleteFiles = deleteFilesSettingEp && deleteFilesSettingEp.value === 'true';
      console.log(`[MediaManagement] Removing torrent ${torrent.name} from client (deleteFiles: ${deleteFiles})`);
      try {
        await downloadClientService.deleteTorrent(torrent.hash, deleteFiles);
        console.log(`[MediaManagement] Torrent ${torrent.name} removed successfully.`);
      } catch (delErr) {
        console.error(`[MediaManagement] Failed to remove torrent ${torrent.name}, will retry next cycle:`, delErr.message);
        return; // Keep status as 'downloading' so it retries next cycle
      }
    }

    db.prepare("UPDATE episodes SET status = 'downloaded', file_path = ?, scene_name = ? WHERE id = ?").run(destFile, torrent.name, episode.id);
    console.log(`[MediaManagement] Episode marked as downloaded.`);
    const formattedSE = `S${String(episode.season_number).padStart(2, '0')}E${String(episode.episode_number).padStart(2, '0')}`;
    eventBus.success('Download complete', { title: `${episode.show_title} ${formattedSE}`, type: 'episode', destinationPath: destFile });

    // Immediately search for subtitles without waiting for the scheduler
    try {
      const providerLangs = (() => {
        try {
          const row = db.prepare("SELECT value FROM settings WHERE key = 'providerLangs'").get();
          return row ? JSON.parse(row.value) : ['en'];
        } catch { return ['en']; }
      })();
      const freshEpisode = db.prepare('SELECT * FROM episodes WHERE id = ?').get(episode.id);
      const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(episode.show_id);
      for (const langCode of providerLangs) {
        subtitleService.downloadSubtitlesForEpisode(freshEpisode, show, langCode).catch(e =>
          console.log(`[MediaManagement] Subtitle fetch (${langCode}) for ${episode.show_title} ${formattedSE}: ${e.message}`)
        );
      }
    } catch (subErr) {
      console.error(`[MediaManagement] Failed to trigger subtitle search for ${episode.show_title}:`, subErr.message);
    }


    // Auto-refresh: detect resolution, codec & audio and update TMDB metadata
    try {
      let sceneName = torrent.name;
      const t = sceneName.toLowerCase();
      let resolution = null;
      let codec = null;
      let audio = null;
      if (t.includes('2160p') || t.includes('4k')) resolution = '2160p';
      else if (t.includes('1080p')) resolution = '1080p';
      else if (t.includes('720p')) resolution = '720p';
      else if (t.includes('480p')) resolution = '480p';

      if (t.includes('x265') || t.includes('h265') || t.includes('hevc')) codec = 'x265';
      else if (t.includes('x264') || t.includes('h264') || t.includes('avc')) codec = 'x264';

      audio = parseAudioFromFileName(sceneName);

      if (!resolution || !codec || !audio) {
        const meta = await getMediaMetadata(destFile);
        if (!resolution) resolution = meta.resolution;
        if (!codec) codec = meta.codec;
        if (!audio) audio = meta.audio;
      }

      if (resolution && !t.includes('2160p') && !t.includes('4k') && !t.includes('1080p') && !t.includes('720p') && !t.includes('480p') && !t.includes('sd')) {
        sceneName = `${torrent.name} ${resolution}`;
      }

      db.prepare('UPDATE episodes SET scene_name = ?, file_size = ?, resolution = ?, codec = ?, audio = ? WHERE id = ?')
        .run(sceneName, fs.statSync(destFile).size, resolution, codec, audio, episode.id);
    } catch (resErr) {
      console.error(`[MediaManagement] Failed to detect metadata for episode:`, resErr.message);
    }

    // Refresh TMDB metadata in DB
    try {
      const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(episode.show_id);
      const tmdbShowData = await tmdbService.getShowById(show.tmdb_id);
      if (tmdbShowData) {
        db.prepare('UPDATE shows SET rating = ?, poster_path = ?, overview = ? WHERE id = ?')
          .run(tmdbShowData.vote_average || 0, tmdbShowData.poster_path, tmdbShowData.overview, show.id);
      }
    } catch (tmdbErr) {
      console.error(`[MediaManagement] Failed to refresh TMDB metadata for show:`, tmdbErr.message);
    }

    // Calculate folder size
    try {
      const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(episode.show_id);
      const fullShowFolder = isDedicatedPath
        ? path.join(libraryRoot, showFolder)
        : path.join(libraryRoot, 'TV Shows', showFolder);
      

      // Update the show's total folder size
      const calculateFolderSize = async (dirPath) => {
        let total = 0;
        try {
          const files = await fs.promises.readdir(dirPath);
          for (const f of files) {
            const fp = path.join(dirPath, f);
            const st = await fs.promises.stat(fp);
            if (st.isDirectory()) {
              total += await calculateFolderSize(fp);
            } else {
              total += st.size;
            }
          }
        } catch { /* ignore */ }
        return total;
      };
      const folderSize = await calculateFolderSize(fullShowFolder);
      db.prepare('UPDATE shows SET folder_size = ? WHERE id = ?').run(folderSize, show.id);
      console.log(`[MediaManagement] Updated folder size for ${show.title} to ${folderSize} bytes`);



    } catch (metaErr) {
      console.error(`[MediaManagement] Failed to calculate folder size for episode:`, metaErr.message);
    }
    
    return true;

  } catch (err) {
    console.error(`[MediaManagement] Failed to import episode:`, err);
    return false;
  }
};

// Import a full season pack — scans all video files in the download directory,
// parses SxxExx from filenames, and imports each matching episode
const importSeasonPack = async (torrent, { showId, showTitle, seasonNumber }) => {
  console.log(`[MediaManagement] Importing season pack: ${showTitle} S${seasonNumber.toString().padStart(2, '0')}`);

  try {
    let contentPath = torrent.content_path || path.join(torrent.save_path, torrent.name);

    // Apply download path mapping
    const pathMapping = db.prepare("SELECT value FROM settings WHERE key = 'downloadPathMapping'").get();
    if (pathMapping?.value) {
      try {
        const [from, to] = JSON.parse(pathMapping.value);
        if (contentPath.startsWith(from)) {
          contentPath = contentPath.replace(from, to);
        }
      } catch { /* ignore */ }
    }

    const videoFiles = await findAllVideoFiles(contentPath);
    if (videoFiles.length === 0) {
      console.warn(`[MediaManagement] No video files found in season pack: ${contentPath}`);
      return;
    }
    console.log(`[MediaManagement] Found ${videoFiles.length} video files in season pack`);

    // Get pending episodes for this show/season
    const pendingEpisodes = db.prepare(`
      SELECT e.*, s.title as show_title 
      FROM episodes e 
      JOIN shows s ON e.show_id = s.id 
      WHERE e.show_id = ? AND e.season_number = ? AND e.status IN ('downloading', 'monitored')
    `).all(showId, seasonNumber);

    let importedCount = 0;

    for (const videoFile of videoFiles) {
      const parsed = parseEpisodeFromFilename(videoFile);
      if (!parsed || parsed.season !== seasonNumber) continue;

      const targetEpisodes = parsed.episodes || [parsed.episode];
      for (const epNum of targetEpisodes) {
        const episode = pendingEpisodes.find(ep => ep.episode_number === epNum);
        if (!episode) {
          console.log(`[MediaManagement] No pending episode match for S${seasonNumber.toString().padStart(2, '0')}E${epNum.toString().padStart(2, '0')} — skipping`);
          continue;
        }

        // Build a synthetic torrent-like object for importEpisode (no hash — prevents per-episode torrent removal)
        const fakeTorrent = {
          name: path.basename(videoFile),
          content_path: videoFile,
          save_path: path.dirname(videoFile),
        };

        try {
          await importEpisode(fakeTorrent, episode);
          importedCount++;
        } catch (epErr) {
          console.error(`[MediaManagement] Failed to import episode S${seasonNumber}E${epNum}:`, epErr.message);
        }
      }
    }

    console.log(`[MediaManagement] Season pack import complete: ${importedCount}/${videoFiles.length} episodes imported`);

    // Remove torrent after all episodes are imported (if enabled)
    if (importedCount > 0) {
      const removeSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('removeCompletedDownloads');
      const deleteFilesSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('deleteTorrentFiles');
      if (removeSetting && removeSetting.value === 'true') {
        const deleteFiles = deleteFilesSetting && deleteFilesSetting.value === 'true';
        try {
          await downloadClientService.deleteTorrent(torrent.hash, deleteFiles);
          console.log(`[MediaManagement] Season pack torrent removed.`);
        } catch (delErr) {
          console.error(`[MediaManagement] Failed to remove season pack torrent:`, delErr.message);
        }
      }
    }
    
    return importedCount > 0;
  } catch (err) {
    console.error(`[MediaManagement] Failed to import season pack for ${showTitle}:`, err);
    return false;
  }
};

const init = () => {
  // Check every 5 minutes
  const cronExp = '*/5 * * * *';
  
  taskRegistry.registerTask(
    'media_mover', 
    'Media Mover', 
    'Hardlinks completed downloads from qBittorrent to the correct library path.',
    cronExp,
    runMediaManagement
  );

  const job = cron.schedule(cronExp, () => taskRegistry.executeTask('media_mover'));
  registerJob(job);
  console.log('[MediaManagement] Post-processing scheduler initialized.');
};

module.exports = {
  init,
  getNamingConfig,
  sanitizeTitle,
  resetDownloadsNotInClient
};
