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
    standardEpisodeFormat: getSetting('standardEpisodeFormat') || '{Show Title} - S{Season}E{Episode} - {Episode Title}'
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
  console.log('[MediaManagement] Starting post-processing check...');
  
  try {
    const torrentList = await downloadClientService.getTorrents() || [];
    
    // Filter finished torrents
    const finishedTorrents = torrentList.filter(t => t.progress === 1);

    let downloadingMovies = db.prepare("SELECT * FROM movies WHERE status = 'downloading'").all();
    let downloadingEpisodes = db.prepare(`
      SELECT e.*, s.title as show_title 
      FROM episodes e 
      JOIN shows s ON e.show_id = s.id 
      WHERE e.status = 'downloading'
    `).all();

    for (const torrent of finishedTorrents) {
      const torrentName = torrent.name.toLowerCase().replace(/[^a-z0-9]/g, ' ');
      
      // Match movies
      for (const movie of downloadingMovies) {
        const movieTitle = movie.title.toLowerCase().replace(/[^a-z0-9]/g, ' ');
        if (torrentName.includes(movieTitle) || torrentName.includes(movie.year.toString())) {
          await importMovie(torrent, movie);
        }
      }

      // Match episodes
      for (const ep of downloadingEpisodes) {
        const showTitle = ep.show_title.toLowerCase().replace(/[^a-z0-9]/g, ' ');
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
    downloadingMovies = db.prepare("SELECT * FROM movies WHERE status = 'downloading'").all();
    downloadingEpisodes = db.prepare(`
      SELECT e.*, s.title as show_title 
      FROM episodes e 
      JOIN shows s ON e.show_id = s.id 
      WHERE e.status = 'downloading'
    `).all();

    // Reset items that are missing from the torrent client
    for (const movie of downloadingMovies) {
      const movieTitle = movie.title.toLowerCase().replace(/[^a-z0-9]/g, ' ');
      const isStillInQueue = torrentList.some(t => {
        const tName = t.name.toLowerCase().replace(/[^a-z0-9]/g, ' ');
        return tName.includes(movieTitle) || tName.includes(movie.year.toString());
      });
      if (!isStillInQueue) {
        console.log(`[MediaManagement] Movie ${movie.title} no longer in download client. Resetting to monitored.`);
        db.prepare("UPDATE movies SET status = 'monitored' WHERE id = ?").run(movie.id);
      }
    }

    for (const ep of downloadingEpisodes) {
      const showTitle = ep.show_title.toLowerCase().replace(/[^a-z0-9]/g, ' ');
      const s = ep.season_number.toString().padStart(2, '0');
      const e = ep.episode_number.toString().padStart(2, '0');
      const epString1 = `s${s}e${e}`;
      const epString2 = `${s}x${e}`; 

      const isStillInQueue = torrentList.some(t => {
        const tName = t.name.toLowerCase().replace(/[^a-z0-9]/g, ' ');
        return tName.includes(showTitle) && (tName.includes(epString1) || tName.includes(epString2));
      });

      if (!isStillInQueue) {
        console.log(`[MediaManagement] Episode ${ep.show_title} S${s}E${e} no longer in download client. Resetting to monitored.`);
        db.prepare("UPDATE episodes SET status = 'monitored' WHERE id = ?").run(ep.id);
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

const generateTvShowNfo = (show, tmdbData) => {
  const genres = show.genres ? show.genres.split(',').map(g => g.trim()) : (tmdbData?.genres ? tmdbData.genres.map(g => g.name) : []);
  const genreTags = genres.map(g => `  <genre>${escapeXml(g)}</genre>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<tvshow>
  <title>${escapeXml(show.title)}</title>
  <originaltitle>${escapeXml(tmdbData?.original_name || show.title)}</originaltitle>
  <year>${show.year}</year>
  <plot>${escapeXml(show.overview)}</plot>
  <tmdbid>${show.tmdb_id}</tmdbid>
  <rating>${show.rating || 0}</rating>
${genreTags}
</tvshow>`;
};

const generateEpisodeNfo = (episode, show) => {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<episodedetails>
  <title>${escapeXml(episode.title)}</title>
  <showtitle>${escapeXml(show.title)}</showtitle>
  <season>${episode.season_number}</season>
  <episode>${episode.episode_number}</episode>
  <plot>${escapeXml(episode.overview)}</plot>
  <aired>${episode.air_date || ''}</aired>
</episodedetails>`;
};

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

    const contentPath = torrent.content_path || path.join(torrent.save_path, torrent.name);
    const videoFile = await findLargestVideoFile(contentPath);
    
    if (!videoFile) {
      console.warn(`[MediaManagement] No video file found in ${contentPath}`);
      return;
    }

    const ext = path.extname(videoFile);
    const libraryRoot = paths[0].path;
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
    
    const destFolder = path.join(libraryRoot, 'Movies', folderName);
    
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
    eventBus.success('Download complete', { title: movie.title, type: 'movie' });

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

    const contentPath = torrent.content_path || path.join(torrent.save_path, torrent.name);
    const videoFile = await findLargestVideoFile(contentPath);
    
    if (!videoFile) {
      console.warn(`[MediaManagement] No video file found in ${contentPath}`);
      return;
    }

    const ext = path.extname(videoFile);
    const libraryRoot = paths[0].path;
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

    const seasonFolder = `Season ${s}`;
    const destFolder = path.join(libraryRoot, 'TV Shows', showFolder, seasonFolder);
    
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
    eventBus.success('Download complete', { title: `${episode.show_title} S${episode.season_number}E${episode.episode_number}`, type: 'episode' });

    // Generate NFO and download artwork
    try {
      const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(episode.show_id);
      const tmdbData = await tmdbService.getShowById(show.tmdb_id);
      const showFolder = path.join(libraryRoot, 'TV Shows', episode.show_title);
      
      const tvshowNfoPath = path.join(showFolder, 'tvshow.nfo');
      if (!fs.existsSync(tvshowNfoPath)) {
        const showNfoContent = generateTvShowNfo(show, tmdbData);
        await fs.promises.writeFile(tvshowNfoPath, showNfoContent);
        console.log(`[MediaManagement] Generated tvshow.nfo for ${show.title}`);
        
        const posterPath = show.poster_path || tmdbData?.poster_path;
        if (posterPath) {
          await downloadArtwork(posterPath, path.join(showFolder, 'poster.jpg'));
        }
        const backdropPath = tmdbData?.backdrop_path;
        if (backdropPath) {
          await downloadArtwork(backdropPath, path.join(showFolder, 'fanart.jpg'));
        }
      }

      const epNfoContent = generateEpisodeNfo(episode, show);
      const epNfoPath = path.join(destFolder, `${episode.show_title} - S${s}E${e}.nfo`);
      await fs.promises.writeFile(epNfoPath, epNfoContent);
      console.log(`[MediaManagement] Generated episode NFO for S${s}E${e}`);

    } catch (metaErr) {
      console.error(`[MediaManagement] Failed to generate metadata for episode:`, metaErr.message);
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
  init
};
