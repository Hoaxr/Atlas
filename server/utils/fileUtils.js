const path = require('path');
const fsp = require('fs/promises');

/**
 * Unified set of recognised video file extensions.
 * Covers common containers including broadcast/transport formats.
 */
const VIDEO_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.avi', '.mov', '.wmv', '.ts', '.m2ts', '.mpg', '.mpeg',
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

module.exports = { VIDEO_EXTENSIONS, SUBTITLE_EXTENSIONS, isVideoFile, isSubtitleFile, deleteFolderRecursive, isRootLibraryPath };
