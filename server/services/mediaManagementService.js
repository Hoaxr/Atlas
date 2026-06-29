const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const db = require('../config/database');
const downloadClientService = require('./downloadClientService');
const taskRegistry = require('./taskRegistry');
const eventBus = require('./eventBus');
const tmdbService = require('./tmdbService');
const axios = require('axios');

const getNamingConfig = () => {
  const getSetting = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
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

const isVideoFile = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return ['.mkv', '.mp4', '.avi', '.ts', '.m2ts'].includes(ext);
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

const runMediaManagement = async () => {
  const pendingMoviesCount = db.prepare("SELECT COUNT(*) as count FROM movies WHERE status = 'downloading'").get().count;
  const pendingEpisodesCount = db.prepare("SELECT COUNT(*) as count FROM episodes WHERE status = 'downloading'").get().count;

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

      // Match episodes
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

      const isStillInQueue = torrentList.some(t => {
        const tName = t.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
        return tName.includes(showTitle) && (tName.includes(epString1) || tName.includes(epString2));
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

const escapeXml = (unsafe) => {
  if (!unsafe) return '';
  return unsafe.toString().replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
    }
  });
};

const generateMovieNfo = (movie, tmdbData) => {
  const genres = movie.genres ? movie.genres.split(',').map(g => g.trim()) : (tmdbData?.genres ? tmdbData.genres.map(g => g.name) : []);
  const genreTags = genres.map(g => `  <genre>${escapeXml(g)}</genre>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<movie>
  <title>${escapeXml(movie.title)}</title>
  <originaltitle>${escapeXml(tmdbData?.original_title || movie.title)}</originaltitle>
  <year>${movie.year}</year>
  <plot>${escapeXml(movie.overview)}</plot>
  <tmdbid>${movie.tmdb_id}</tmdbid>
  <rating>${movie.rating || 0}</rating>
${genreTags}
</movie>`;
};

// (Removed unused NFO generators)

const downloadArtwork = async (tmdbPath, destPath) => {
  if (!tmdbPath) return;
  try {
    const url = `https://image.tmdb.org/t/p/original${tmdbPath}`;
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
    });
    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (err) {
    console.error(`[MediaManagement] Failed to download artwork ${tmdbPath}:`, err.message);
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
    
    // Apply download path mapping from settings (e.g. ["/downloads", "/mnt/oblivion/downloads"])
    const pathMapping = db.prepare("SELECT value FROM settings WHERE key = 'downloadPathMapping'").get();
    if (pathMapping?.value) {
      try {
        const [from, to] = JSON.parse(pathMapping.value);
        if (contentPath.startsWith(from)) {
          contentPath = contentPath.replace(from, to);
        }
      } catch {}
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
    
    let folderName = `${movie.title} (${movie.year})`;
    let fileName = folderName;
    
    if (config.renameMovies) {
      let format = config.standardMovieFormat;
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
    
    if (!fs.existsSync(destFile)) {
      try {
        console.log(`[MediaManagement] Hardlinking ${videoFile} to ${destFile}`);
        await fs.promises.link(videoFile, destFile);
        console.log(`[MediaManagement] Hardlink complete for ${movie.title}`);
      } catch (linkErr) {
        if (linkErr.code === 'EXDEV') {
          console.log(`[MediaManagement] Cross-device link failed. Falling back to copy for ${movie.title}`);
          await fs.promises.copyFile(videoFile, destFile);
          console.log(`[MediaManagement] Copy complete for ${movie.title}`);
        } else {
          throw linkErr;
        }
      }
    }

    db.prepare("UPDATE movies SET status = 'downloaded', file_path = ?, scene_name = ? WHERE id = ?").run(destFile, torrent.name, movie.id);
    console.log(`[MediaManagement] Movie ${movie.title} marked as downloaded.`);
    eventBus.success('Download complete', { title: movie.title, type: 'movie', destinationPath: finalDestPath });

    // Auto-refresh: detect resolution and update TMDB metadata
    try {
      const { getResolution } = require('../utils/videoUtils');
      let sceneName = torrent.name;
      const t = sceneName.toLowerCase();
      const hasRes = t.includes('2160p') || t.includes('4k') || t.includes('1080p') || t.includes('720p') || t.includes('480p') || t.includes('sd');
      if (!hasRes) {
        const res = await getResolution(destFile);
        if (res) sceneName = `${torrent.name} ${res}`;
      }
      db.prepare('UPDATE movies SET scene_name = ?, file_size = ? WHERE id = ?')
        .run(sceneName, fs.statSync(destFile).size, movie.id);
    } catch (resErr) {
      console.error(`[MediaManagement] Failed to detect resolution for ${movie.title}:`, resErr.message);
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

    // Generate NFO and download artwork
    try {
      const tmdbData = await tmdbService.getMovieById(movie.tmdb_id);
      
      const nfoContent = generateMovieNfo(movie, tmdbData);
      const nfoPath = path.join(destFolder, `${movie.title} (${movie.year}).nfo`);
      await fs.promises.writeFile(nfoPath, nfoContent);
      console.log(`[MediaManagement] Generated NFO for ${movie.title}`);

      const posterPath = movie.poster_path || tmdbData?.poster_path;
      if (posterPath) {
        await downloadArtwork(posterPath, path.join(destFolder, 'poster.jpg'));
        console.log(`[MediaManagement] Downloaded poster for ${movie.title}`);
      }

      const backdropPath = tmdbData?.backdrop_path;
      if (backdropPath) {
        await downloadArtwork(backdropPath, path.join(destFolder, 'fanart.jpg'));
        console.log(`[MediaManagement] Downloaded fanart for ${movie.title}`);
      }
    } catch (metaErr) {
      console.error(`[MediaManagement] Failed to generate metadata for movie ${movie.title}:`, metaErr.message);
    }
    
    // Check if we should remove the torrent
    const removeSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('removeCompletedDownloads');
    if (removeSetting && removeSetting.value === 'true') {
      const deleteFilesSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('deleteTorrentFiles');
      const deleteFiles = deleteFilesSetting && deleteFilesSetting.value === 'true';
      console.log(`[MediaManagement] Removing torrent ${torrent.name} from client (deleteFiles: ${deleteFiles})`);
      const downloadClientService = require('./downloadClientService');
      await downloadClientService.deleteTorrent(torrent.hash, deleteFiles);
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
    if (pathMapping?.value) {
      try {
        const [from, to] = JSON.parse(pathMapping.value);
        if (contentPath.startsWith(from)) {
          contentPath = contentPath.replace(from, to);
        }
      } catch {}
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
    
    if (!fs.existsSync(destFile)) {
      try {
        console.log(`[MediaManagement] Hardlinking ${videoFile} to ${destFile}`);
        await fs.promises.link(videoFile, destFile);
        console.log(`[MediaManagement] Hardlink complete for episode.`);
      } catch (linkErr) {
        if (linkErr.code === 'EXDEV') {
          console.log(`[MediaManagement] Cross-device link failed. Falling back to copy for episode.`);
          await fs.promises.copyFile(videoFile, destFile);
          console.log(`[MediaManagement] Copy complete for episode.`);
        } else {
          throw linkErr;
        }
      }
    }

    db.prepare("UPDATE episodes SET status = 'downloaded', file_path = ?, scene_name = ? WHERE id = ?").run(destFile, torrent.name, episode.id);
    console.log(`[MediaManagement] Episode marked as downloaded.`);
    eventBus.success('Download complete', { title: `${episode.show_title} S${episode.season_number}E${episode.episode_number}`, type: 'episode', destinationPath: finalDestPath });

    // Auto-refresh: detect resolution and update TMDB metadata
    try {
      const { getResolution } = require('../utils/videoUtils');
      let sceneName = torrent.name;
      const t = sceneName.toLowerCase();
      const hasRes = t.includes('2160p') || t.includes('4k') || t.includes('1080p') || t.includes('720p') || t.includes('480p') || t.includes('sd');
      if (!hasRes) {
        const res = await getResolution(destFile);
        if (res) sceneName = `${torrent.name} ${res}`;
      }
      db.prepare('UPDATE episodes SET scene_name = ?, file_size = ? WHERE id = ?')
        .run(sceneName, fs.statSync(destFile).size, episode.id);
    } catch (resErr) {
      console.error(`[MediaManagement] Failed to detect resolution for episode:`, resErr.message);
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

    // Check if we should remove the torrent
    const removeSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('removeCompletedDownloads');
    if (removeSetting && removeSetting.value === 'true') {
      const deleteFilesSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('deleteTorrentFiles');
      const deleteFiles = deleteFilesSetting && deleteFilesSetting.value === 'true';
      console.log(`[MediaManagement] Removing torrent ${torrent.name} from client (deleteFiles: ${deleteFiles})`);
      const downloadClientService = require('./downloadClientService');
      await downloadClientService.deleteTorrent(torrent.hash, deleteFiles);
    }



  } catch (err) {
    console.error(`[MediaManagement] Failed to import episode:`, err);
  }
};

const init = () => {
  // Check every minute
  const cronExp = '* * * * *';
  
  taskRegistry.registerTask(
    'media_mover', 
    'Media Mover', 
    'Hardlinks completed downloads from qBittorrent to the correct library path.',
    cronExp,
    runMediaManagement
  );

  cron.schedule(cronExp, () => taskRegistry.executeTask('media_mover'));
  console.log('[MediaManagement] Post-processing scheduler initialized.');
};

module.exports = {
  init,
  getNamingConfig,
  sanitizeTitle
};
