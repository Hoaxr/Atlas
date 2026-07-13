/**
 * imageService — local poster cache
 *
 * Posters are stored at:
 *   {dataDir}/images/movies/{tmdbId}/poster.jpg
 *   {dataDir}/images/shows/{tmdbId}/poster.jpg
 *
 * The data directory is mounted as a Docker volume so images survive
 * container rebuilds. Library folders are never written to.
 */

const fs   = require('fs');
const path = require('path');
const axios = require('axios');

// Root of the persistent data directory (same volume as database.sqlite)
const DATA_DIR  = path.join(__dirname, '../data');
const IMAGE_DIR = path.join(DATA_DIR, 'images');

// TMDB base URLs
const TMDB_POSTER_BASE   = 'https://image.tmdb.org/t/p/w500';
const TMDB_ORIGINAL_BASE = 'https://image.tmdb.org/t/p/original';

/**
 * Absolute path for a cached poster.
 * @param {'movies'|'shows'} type
 * @param {number|string} tmdbId
 */
const posterPath = (type, tmdbId) =>
  path.join(IMAGE_DIR, type, String(tmdbId), 'poster.jpg');

/**
 * Download an image from TMDB and save it to destPath.
 * Creates parent directories as needed.
 * @param {string} tmdbImagePath  e.g. "/abc123.jpg"
 * @param {string} destPath       Absolute local path to write
 * @param {string} [size]         TMDB size slug, default 'w500'
 */
const downloadImage = async (tmdbImagePath, destPath, size = 'w500') => {
  const base = size === 'original' ? TMDB_ORIGINAL_BASE : TMDB_POSTER_BASE;
  const url  = `${base}${tmdbImagePath}`;

  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const response = await axios({ method: 'GET', url, responseType: 'stream', timeout: 15000 });
  const writer   = fs.createWriteStream(destPath);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
};

/**
 * Ensure a poster is cached locally, downloading from TMDB if needed.
 * Returns the absolute local path (whether the file existed or was just downloaded).
 * Returns null if no tmdbImagePath is provided.
 *
 * @param {'movies'|'shows'} type
 * @param {number|string} tmdbId
 * @param {string|null}   tmdbImagePath  The poster_path from TMDB, e.g. "/abc123.jpg"
 */
const ensurePoster = async (type, tmdbId, tmdbImagePath) => {
  if (!tmdbImagePath) return null;

  const dest = posterPath(type, tmdbId);
  if (!fs.existsSync(dest)) {
    try {
      await downloadImage(tmdbImagePath, dest);
    } catch (err) {
      console.error(`[ImageService] Failed to download poster for ${type}/${tmdbId}:`, err.message);
      return null;
    }
  }
  return dest;
};

/**
 * Delete the cached poster for a given item (e.g. when it's removed from library).
 * @param {'movies'|'shows'} type
 * @param {number|string} tmdbId
 */
const deletePoster = (type, tmdbId) => {
  const dest = posterPath(type, tmdbId);
  if (fs.existsSync(dest)) {
    try { fs.unlinkSync(dest); } catch { /* ignore */ }
  }
  // Remove the now-empty directory
  const dir = path.dirname(dest);
  try {
    const remaining = fs.readdirSync(dir);
    if (remaining.length === 0) fs.rmdirSync(dir);
  } catch { /* ignore */ }
};

module.exports = { ensurePoster, deletePoster, posterPath, IMAGE_DIR };
