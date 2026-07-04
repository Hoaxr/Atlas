const path = require('path');

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

module.exports = { VIDEO_EXTENSIONS, SUBTITLE_EXTENSIONS, isVideoFile, isSubtitleFile };
