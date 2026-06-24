const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const db = require('../config/database');
const downloadClientService = require('./downloadClientService');
const taskRegistry = require('./taskRegistry');

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
    const destFolder = path.join(libraryRoot, 'Movies', `${movie.title} (${movie.year})`);
    
    await fs.promises.mkdir(destFolder, { recursive: true });
    const destFile = path.join(destFolder, `${movie.title} (${movie.year})${ext}`);
    
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

    db.prepare("UPDATE movies SET status = 'downloaded', file_path = ? WHERE id = ?").run(destFile, movie.id);
    console.log(`[MediaManagement] Movie ${movie.title} marked as downloaded.`);

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
    const seasonFolder = `Season ${episode.season_number.toString().padStart(2, '0')}`;
    const destFolder = path.join(libraryRoot, 'TV Shows', episode.show_title, seasonFolder);
    
    await fs.promises.mkdir(destFolder, { recursive: true });
    
    const s = episode.season_number.toString().padStart(2, '0');
    const e = episode.episode_number.toString().padStart(2, '0');
    const destFile = path.join(destFolder, `${episode.show_title} - S${s}E${e}${ext}`);
    
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

    db.prepare("UPDATE episodes SET status = 'downloaded', file_path = ? WHERE id = ?").run(destFile, episode.id);
    console.log(`[MediaManagement] Episode marked as downloaded.`);

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
