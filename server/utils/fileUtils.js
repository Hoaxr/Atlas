const path = require('path');
const fsp = require('fs/promises');

/**
 * Unified set of recognised video file extensions.
 * Covers common containers including broadcast/transport formats.
 */
const VIDEO_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.avi', '.mov', '.wmv', '.webm', '.ts', '.m2ts', '.mpg', '.mpeg',
]);


/**
 * Unified set of recognised subtitle file extensions.
 */
const SUBTITLE_EXTENSIONS = new Set([
  '.srt', '.sub', '.vtt', '.ass', '.ssa', '.smi', '.idx',
]);

/**
 * Returns true when `filename` has a recognised video extension.
 * @param {string} filename  Basename or full path.
 */
const isVideoFile = (filename) =>
  VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase());

/**
 * Returns true when `filename` has a recognised subtitle extension.
 * @param {string} filename  Basename or full path.
 */
const isSubtitleFile = (filename) =>
  SUBTITLE_EXTENSIONS.has(path.extname(filename).toLowerCase());

/**
 * Recursively deletes a folder and all its contents.
 * Used by movie/show delete and bulk delete endpoints.
 * @param {string} folderPath — absolute path to delete
 */
const deleteFolderRecursive = async (folderPath) => {
  const entries = await fsp.readdir(folderPath, { withFileTypes: true });
  await Promise.all(entries.map(entry => {
    const full = path.join(folderPath, entry.name);
    return entry.isDirectory() ? deleteFolderRecursive(full) : fsp.unlink(full).catch(() => {});
  }));
  await fsp.rmdir(folderPath).catch(() => {});
};

/**
 * Checks if a given path is an exact match to a configured library root path.
 */
const isRootLibraryPath = (folderPath) => {
  try {
    const db = require('../config/database');
    const paths = db.prepare('SELECT path FROM library_paths').all();
    return paths.some(p => path.resolve(p.path) === path.resolve(folderPath));
  } catch {
    return false;
  }
};

/**
 * Recursively finds the largest video file inside `dirPath`.
 * If `dirPath` is itself a video file, it is returned directly.
 * @param {string} dirPath — absolute path to a file or directory
 * @returns {Promise<{path: string, name: string, size: number, dir: string}|null>}
 */
const findLargestVideoFile = async (dirPath) => {
  let stat;
  try {
    stat = await fsp.stat(dirPath);
  } catch {
    return null;
  }

  // If given a file directly, return it if it's a recognised video
  if (stat.isFile()) {
    if (isVideoFile(dirPath)) {
      return { path: dirPath, name: path.basename(dirPath), size: stat.size, dir: path.dirname(dirPath) };
    }
    return null;
  }

  let best = null;
  let maxSize = -1;
  let items;
  try {
    items = await fsp.readdir(dirPath);
  } catch {
    return null;
  }
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    try {
      const s = await fsp.stat(fullPath);
      if (s.isDirectory()) {
        const sub = await findLargestVideoFile(fullPath);
        if (sub && sub.size > maxSize) {
          maxSize = sub.size;
          best = sub;
        }
      } else if (isVideoFile(item) && s.size > maxSize) {
        maxSize = s.size;
        best = { path: fullPath, name: item, size: s.size, dir: dirPath };
      }
    } catch { /* ignore unstatable entries */ }
  }
  return best;
};

module.exports = { VIDEO_EXTENSIONS, SUBTITLE_EXTENSIONS, isVideoFile, isSubtitleFile, deleteFolderRecursive, isRootLibraryPath, findLargestVideoFile };
