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
const { isVideoFile } = require('../utils/fileUtils');
const { getMediaMetadata, parseAudioFromFileName } = require('../utils/videoUtils');

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


const findLargestVideoFile = async (dirPath) => {
  let largestFile = null;
  let maxSize = 0;

  try {
    const stats = await fs.promises.stat(dirPath);
    if (stats.isFile()) {
      if (isVideoFile(dirPath)) return dirPath;
      return null;
    }

    const files = await fs.promises.readdir(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const fileStats = await fs.promises.stat(fullPath);
      
      if (fileStats.isDirectory()) {
        const nestedFile = await findLargestVideoFile(fullPath);
        if (nestedFile) {
          const nestedStats = await fs.promises.stat(nestedFile);
          if (nestedStats.size > maxSize) {
            maxSize = nestedStats.size;
            largestFile = nestedFile;
          }
        }
      } else if (fileStats.isFile() && isVideoFile(fullPath)) {
        if (fileStats.size > maxSize) {
          maxSize = fileStats.size;
          largestFile = fullPath;
        }
      }
    }
  } catch (err) {
    console.error('[MediaManagement] Error scanning for video files:', err);
  }
  
  return largestFile;
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

// Parse season/episode numbers from a filename like "Show.Name.S01E02.mkv"
const parseEpisodeFromFilename = (filePath) => {
  const name = path.basename(filePath).toLowerCase();
  // Try S01E02 pattern
  let match = name.match(/s(\d{1,2})e(\d{1,2})/i);
  if (match) return { season: parseInt(match[1], 10), episode: parseInt(match[2], 10) };
  // Try 01x02 pattern
  match = name.match(/(\d{1,2})x(\d{1,2})/i);
  if (match) return { season: parseInt(match[1], 10), episode: parseInt(match[2], 10) };
  return null;
};

const runMediaManagement = async () => {
  const pendingMoviesCount = db.prepare("SELECT COUNT(*) as count FROM movies WHERE status IN ('downloading', 'monitored')").get().count;
  const pendingEpisodesCount = db.prepare(`
    SELECT COUNT(*) as count FROM episodes 
    WHERE (status = 'downloading') 
       OR (status = 'monitored' AND (file_path IS NULL OR file_path = ''))
  `).get().count;

  console.log(`[MediaManagement] Checking: ${pendingMoviesCount} pending movies, ${pendingEpisodesCount} pending episodes`);

  if (pendingMoviesCount === 0 && pendingEpisodesCount === 0) {
    return 'skipped';
  }

  console.log('[MediaManagement] Starting post-processing check...');
  
  try {
    const torrentList = await downloadClientService.getTorrents() || [];
    
    // Filter finished torrents
    const finishedTorrents = torrentList.filter(t => t.progress === 1);

    const pendingMovies = db.prepare("SELECT * FROM movies WHERE status IN ('downloading', 'monitored')").all();
    const pendingEpisodes = db.prepare(`
      SELECT e.*, s.title as show_title 
      FROM episodes e 
      JOIN shows s ON e.show_id = s.id 
      WHERE e.status IN ('downloading', 'monitored')
    `).all();

    for (const torrent of finishedTorrents) {
      const torrentName = torrent.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Match movies
      for (const movie of pendingMovies) {
        const movieTitle = movie.title.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
        if (torrentName.includes(movieTitle)) {
          await importMovie(torrent, movie);
        }
      }

      // Match episodes (individual)
      for (const ep of pendingEpisodes) {
        const showTitle = ep.show_title.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
        const s = ep.season_number.toString().padStart(2, '0');
        const e = ep.episode_number.toString().padStart(2, '0');
        const epString1 = `s${s}e${e}`;
        const epString2 = `${s}x${e}`; 

        if (torrentName.includes(showTitle) && (torrentName.includes(epString1) || torrentName.includes(epString2))) {
          await importEpisode(torrent, ep);
        }
      }

      // Match season packs — torrent contains show title + Sxx pattern but NO episode IDs (SxxExx or xxXxx)
      const hasEpisodeIds = /\bs\d{2}e\d{2}\b/i.test(torrentName) || /\b\d{1,2}x\d{1,2}\b/i.test(torrentName);
      if (!hasEpisodeIds) {
        const seasonPackMatch = torrentName.match(/\bs(\d{2})\b/i);
        if (seasonPackMatch) {
          const seasonNum = parseInt(seasonPackMatch[1], 10);
          // Find shows whose title is in the torrent name
          for (const ep of pendingEpisodes) {
            const showTitle = ep.show_title.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
            if (torrentName.includes(showTitle) && ep.season_number === seasonNum) {
              await importSeasonPack(torrent, { showId: ep.show_id, showTitle: ep.show_title, seasonNumber: seasonNum });
              break; // One import per torrent
            }
          }
        }
      }
    }

    // Re-fetch to see what's STILL downloading after imports
    const downloadingMovies = db.prepare("SELECT * FROM movies WHERE status = 'downloading'").all();
    const downloadingEpisodes = db.prepare(`
      SELECT e.*, s.title as show_title 
      FROM episodes e 
      JOIN shows s ON e.show_id = s.id 
      WHERE e.status = 'downloading'
    `).all();

    // Reset items that are missing from the torrent client
    for (const movie of downloadingMovies) {
      const movieTitle = movie.title.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      const isStillInQueue = torrentList.some(t => {
        const tName = t.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
        return tName.includes(movieTitle);
      });
      if (!isStillInQueue) {
        console.log(`[MediaManagement] Movie ${movie.title} no longer in download client. Resetting to monitored.`);
        db.prepare("UPDATE movies SET status = 'monitored' WHERE id = ?").run(movie.id);
      }
    }

    for (const ep of downloadingEpisodes) {
      const showTitle = ep.show_title.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      const s = ep.season_number.toString().padStart(2, '0');
      const e = ep.episode_number.toString().padStart(2, '0');
      const epString1 = `s${s}e${e}`;
      const epString2 = `${s}x${e}`;
      const seasonStr = `s${s}`; 

      const isStillInQueue = torrentList.some(t => {
        const tName = t.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
        // Match individual episode (S01E01) or season pack (S01 without episode IDs)
        const hasShow = tName.includes(showTitle);
        const hasEpisode = tName.includes(epString1) || tName.includes(epString2);
        const hasSeasonPack = tName.includes(seasonStr) && !/\bs\d{2}e\d{2}\b/i.test(tName) && !/\b\d{1,2}x\d{1,2}\b/i.test(tName);
        return hasShow && (hasEpisode || hasSeasonPack);
      });

      if (!isStillInQueue) {
        console.log(`[MediaManagement] Episode ${ep.show_title} S${s}E${e} no longer in download client. Resetting to monitored.`);
        db.prepare("UPDATE episodes SET status = 'monitored' WHERE id = ?").run(ep.id);
      }
    }

    // Recalculate status for downloading shows
    const downloadingShows = db.prepare("SELECT id FROM shows WHERE status = 'downloading'").all();
    for (const show of downloadingShows) {
      const activeEps = db.prepare("SELECT COUNT(*) as count FROM episodes WHERE show_id = ? AND status = 'downloading'").get().count;
      if (activeEps === 0) {
        // No active downloads left for this show
        const missingMonitored = db.prepare("SELECT COUNT(*) as count FROM episodes WHERE show_id = ? AND monitored = 1 AND (file_path IS NULL OR file_path = '')").get().count;
        const newStatus = missingMonitored > 0 ? 'monitored' : 'downloaded';
        db.prepare("UPDATE shows SET status = ? WHERE id = ?").run(newStatus, show.id);
        console.log(`[MediaManagement] Show ID ${show.id} all downloads finished. Status updated to ${newStatus}.`);
      }
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

    const ext = path.extname(videoFile);
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
      fileName = path.basename(videoFile, ext);
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
      await fs.promises.unlink(movie.file_path).catch(e => {});
    }

    if (fs.existsSync(destFile)) {
      console.log(`[MediaManagement] File ${destFile} already exists. Overwriting with new import.`);
      await fs.promises.unlink(destFile);
    }

    try {
      console.log(`[MediaManagement] Hardlinking ${videoFile} to ${destFile}`);
      await fs.promises.link(videoFile, destFile);
      console.log(`[MediaManagement] Hardlink complete for ${movie.title}`);
    } catch (linkErr) {
      if (linkErr.code === 'EXDEV') {
        console.log(`[MediaManagement] Cross-device link failed. Falling back to copy for ${movie.title}`);
        await fs.promises.copyFile(videoFile, destFile);
        console.log(`[MediaManagement] Copy complete for ${movie.title}. Deleting original file.`);
        await fs.promises.unlink(videoFile).catch(e => {
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

  } catch (err) {
    console.error(`[MediaManagement] Failed to import movie ${movie.title}:`, err);
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

    const ext = path.extname(videoFile);
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
      fileName = path.basename(videoFile, ext);
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
      await fs.promises.unlink(episode.file_path).catch(e => {});
    }

    if (fs.existsSync(destFile)) {
      console.log(`[MediaManagement] File ${destFile} already exists. Overwriting with new import.`);
      await fs.promises.unlink(destFile);
    }

    try {
      console.log(`[MediaManagement] Hardlinking ${videoFile} to ${destFile}`);
      await fs.promises.link(videoFile, destFile);
      console.log(`[MediaManagement] Hardlink complete for episode.`);
    } catch (linkErr) {
      if (linkErr.code === 'EXDEV') {
        console.log(`[MediaManagement] Cross-device link failed. Falling back to copy for episode.`);
        await fs.promises.copyFile(videoFile, destFile);
        console.log(`[MediaManagement] Copy complete for episode. Deleting original file.`);
        await fs.promises.unlink(videoFile).catch(e => {
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

  } catch (err) {
    console.error(`[MediaManagement] Failed to import episode:`, err);
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

      const episode = pendingEpisodes.find(ep => ep.episode_number === parsed.episode);
      if (!episode) {
        console.log(`[MediaManagement] No pending episode match for S${seasonNumber.toString().padStart(2, '0')}E${parsed.episode.toString().padStart(2, '0')} — skipping`);
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
        console.error(`[MediaManagement] Failed to import episode S${seasonNumber}E${parsed.episode}:`, epErr.message);
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
  } catch (err) {
    console.error(`[MediaManagement] Failed to import season pack for ${showTitle}:`, err);
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
  sanitizeTitle
};
