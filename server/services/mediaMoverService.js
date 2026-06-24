const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const downloadClientService = require('./downloadClientService');

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
    console.error('Error scanning for video files:', err);
  }
  
  return largestFile;
};

const runMediaMover = async () => {
  console.log('[MediaMover] Starting post-processing check...');
  
  try {
    const torrents = await downloadClientService.getTorrents();
    if (!torrents || torrents.length === 0) return;

    // Filter finished torrents
    const finishedTorrents = torrents.filter(t => t.progress === 1);

    // Get all items in downloading status
    const downloadingMovies = db.prepare("SELECT * FROM movies WHERE status = 'downloading'").all();
    const downloadingEpisodes = db.prepare(`
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
        // Simplistic matching: if torrent name contains the movie title and year
        if (torrentName.includes(movieTitle) || torrentName.includes(movie.year.toString())) {
          // It's a match!
          await importMovie(torrent, movie);
        }
      }

      // Match episodes
      for (const ep of downloadingEpisodes) {
        const showTitle = ep.show_title.toLowerCase().replace(/[^a-z0-9]/g, ' ');
        const s = ep.season_number.toString().padStart(2, '0');
        const e = ep.episode_number.toString().padStart(2, '0');
        const epString1 = `s${s}e${e}`;
        const epString2 = `${s}x${e}`; // alternative format

        if (torrentName.includes(showTitle) && (torrentName.includes(epString1) || torrentName.includes(epString2))) {
          // It's a match!
          await importEpisode(torrent, ep);
        }
      }
    }
  } catch (err) {
    console.error('[MediaMover] Error during post-processing:', err.message);
  }
};

const importMovie = async (torrent, movie) => {
  console.log(`[MediaMover] Importing movie: ${movie.title}`);
  
  try {
    const paths = db.prepare('SELECT path FROM library_paths').all();
    if (paths.length === 0) {
      console.warn('[MediaMover] No library paths configured to import to!');
      return;
    }

    const contentPath = torrent.content_path || path.join(torrent.save_path, torrent.name);
    const videoFile = await findLargestVideoFile(contentPath);
    
    if (!videoFile) {
      console.warn(`[MediaMover] No video file found in ${contentPath}`);
      return;
    }

    const ext = path.extname(videoFile);
    // Use the first library path for movies
    const libraryRoot = paths[0].path;
    const destFolder = path.join(libraryRoot, 'Movies', `${movie.title} (${movie.year})`);
    
    // Create folder if it doesn't exist
    await fs.promises.mkdir(destFolder, { recursive: true });
    
    const destFile = path.join(destFolder, `${movie.title} (${movie.year})${ext}`);
    
    if (fs.existsSync(destFile)) {
      console.log(`[MediaMover] File already exists at ${destFile}`);
    } else {
      console.log(`[MediaMover] Copying ${videoFile} to ${destFile}`);
      await fs.promises.copyFile(videoFile, destFile);
      console.log(`[MediaMover] Copy complete for ${movie.title}`);
    }

    // Update database status
    db.prepare("UPDATE movies SET status = 'downloaded' WHERE id = ?").run(movie.id);
    console.log(`[MediaMover] Movie ${movie.title} marked as downloaded.`);

  } catch (err) {
    console.error(`[MediaMover] Failed to import movie ${movie.title}:`, err);
  }
};

const importEpisode = async (torrent, episode) => {
  console.log(`[MediaMover] Importing episode: ${episode.show_title} S${episode.season_number}E${episode.episode_number}`);
  
  try {
    const paths = db.prepare('SELECT path FROM library_paths').all();
    if (paths.length === 0) {
      console.warn('[MediaMover] No library paths configured to import to!');
      return;
    }

    const contentPath = torrent.content_path || path.join(torrent.save_path, torrent.name);
    const videoFile = await findLargestVideoFile(contentPath);
    
    if (!videoFile) {
      console.warn(`[MediaMover] No video file found in ${contentPath}`);
      return;
    }

    const ext = path.extname(videoFile);
    const libraryRoot = paths[0].path;
    const seasonFolder = `Season ${episode.season_number.toString().padStart(2, '0')}`;
    const destFolder = path.join(libraryRoot, 'TV Shows', episode.show_title, seasonFolder);
    
    // Create folder if it doesn't exist
    await fs.promises.mkdir(destFolder, { recursive: true });
    
    const s = episode.season_number.toString().padStart(2, '0');
    const e = episode.episode_number.toString().padStart(2, '0');
    const destFile = path.join(destFolder, `${episode.show_title} - S${s}E${e}${ext}`);
    
    if (fs.existsSync(destFile)) {
      console.log(`[MediaMover] File already exists at ${destFile}`);
    } else {
      console.log(`[MediaMover] Copying ${videoFile} to ${destFile}`);
      await fs.promises.copyFile(videoFile, destFile);
      console.log(`[MediaMover] Copy complete for episode.`);
    }

    // Update database status
    db.prepare("UPDATE episodes SET status = 'downloaded' WHERE id = ?").run(episode.id);
    console.log(`[MediaMover] Episode marked as downloaded.`);

  } catch (err) {
    console.error(`[MediaMover] Failed to import episode:`, err);
  }
};

module.exports = {
  runMediaMover
};
