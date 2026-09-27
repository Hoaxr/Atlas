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
 * Unified set of recognised audio file extensions.
 */
const AUDIO_EXTENSIONS = new Set([
  '.flac', '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.ape', '.wv', '.alac',
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
 * Returns true when `filename` has a recognised audio extension.
 * @param {string} filename  Basename or full path.
 */
const isAudioFile = (filename) =>
  AUDIO_EXTENSIONS.has(path.extname(filename).toLowerCase());

/**
 * Returns true when `filename` has a recognised subtitle extension.
 * @param {string} filename  Basename or full path.
 */
const isSubtitleFile = (filename) =>
  SUBTITLE_EXTENSIONS.has(path.extname(filename).toLowerCase());

/**
 * Checks if a target path is strictly contained within any configured library root path.
 */
const isPathContainedInLibrary = (targetPath) => {
  try {
    const db = require('../config/database');
    const paths = db.prepare('SELECT path FROM library_paths').all();
    const resolvedTarget = path.resolve(targetPath);

    return paths.some(p => {
      const resolvedRoot = path.resolve(p.path);
      const rel = path.relative(resolvedRoot, resolvedTarget);
      // Contained if relative path exists, does not start with '..' and is not absolute
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    });
  } catch {
    return false;
  }
};

/**
 * Recursively deletes a folder and all its contents.
 * Used by movie/show delete and bulk delete endpoints.
 * Includes strict path containment validation against library paths.
 * @param {string} folderPath — absolute path to delete
 */
const deleteFolderRecursive = async (folderPath) => {
  if (!folderPath) return;
  if (isRootLibraryPath(folderPath)) {
    throw new Error(`Cannot delete root library path: ${folderPath}`);
  }
  if (!isPathContainedInLibrary(folderPath)) {
    throw new Error(`Deletion target is outside configured media library paths: ${folderPath}`);
  }

  await fsp.rm(folderPath, { recursive: true, force: true }).catch(() => {});
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

/**
 * Safely deletes a movie's files from disk without destroying parent/shared directories.
 * - Deletes the movie file itself.
 * - Deletes directly matching sidecars (subtitles, .nfo).
 * - Only removes the directory if it's NOT a root library path, contains NO other video files,
 *   and is not referenced by any other movie in the database.
 */
const safelyDeleteMovieFiles = async (movie) => {
  if (!movie) return;
  const db = require('../config/database');
  const filePath = movie.file_path;
  const folderPath = movie.folder_path;
  const dir = filePath ? path.dirname(filePath) : folderPath;

  // 1. Delete the video file if present
  if (filePath) {
    try {
      await fsp.unlink(filePath);
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn(`[fileUtils] Failed to unlink movie file: ${filePath}`, e.message);
    }

    // 2. Delete sidecar files that share the exact basename (e.g. Movie.en.srt, Movie.nfo)
    if (dir) {
      try {
        const parsed = path.parse(filePath);
        const entries = await fsp.readdir(dir);
        for (const entry of entries) {
          if (entry.startsWith(parsed.name)) {
            const entryPath = path.join(dir, entry);
            const ext = path.extname(entry).toLowerCase();
            if (SUBTITLE_EXTENSIONS.has(ext) || ext === '.nfo') {
              await fsp.unlink(entryPath).catch(() => {});
            }
          }
        }
      } catch { /* ignore */ }
    }
  }

  // 3. Inspect the directory before any directory removal
  if (!dir || isRootLibraryPath(dir) || !isPathContainedInLibrary(dir)) {
    return;
  }

  try {
    // Check if any other movie in the DB references this directory or files in it
    const otherMovie = db.prepare(
      'SELECT id FROM movies WHERE (file_path LIKE ? OR folder_path = ?) AND id != ? LIMIT 1'
    ).get(`${dir}%`, dir, movie.id);

    if (otherMovie) {
      // Another movie shares this directory or is inside it — never delete dir!
      return;
    }

    // Check if any other video files remain in the directory
    const remainingEntries = await fsp.readdir(dir);
    const hasRemainingVideos = remainingEntries.some(e => isVideoFile(e));
    if (hasRemainingVideos) {
      // Other video files exist (e.g., another movie or unmonitored media) — preserve folder!
      return;
    }

    // If only non-video files or empty, safe to remove directory
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  } catch (err) {
    console.warn(`[fileUtils] Could not safely clean movie directory ${dir}:`, err.message);
  }
};

module.exports = { VIDEO_EXTENSIONS, AUDIO_EXTENSIONS, SUBTITLE_EXTENSIONS, isVideoFile, isAudioFile, isSubtitleFile, deleteFolderRecursive, isRootLibraryPath, isPathContainedInLibrary, findLargestVideoFile, safelyDeleteMovieFiles };
