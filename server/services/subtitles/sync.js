const fs = require('fs');
const path = require('path');
const db = require('../../config/database');
const { scanSubtitleLangs } = require('../scanner/fileScanner');
const { runWithConcurrency } = require('../../utils/concurrency');

const { normalizeLanguageCode: normalizeLangCode } = require('../../utils/languages');

const invalidateStats = () => {
  try {
    const systemRouter = require('../../routes/library/system');
    if (typeof systemRouter.invalidateStatsCache === 'function') {
      systemRouter.invalidateStatsCache();
    }
  } catch { /* ignore */ }
};

const invalidateMovieDirCache = (dirPath) => {
  try {
    const moviesRoute = require('../../routes/library/movies');
    if (typeof moviesRoute.clearDirCache === 'function') {
      moviesRoute.clearDirCache(dirPath);
    }
  } catch { /* ignore */ }
};

/**
 * Scans disk and video container for movie subtitles, updates SQLite movies.subtitles,
 * invalidates dirCache and statsCache.
 */
const syncMovieSubtitles = async (movieId, filePath = null) => {
  try {
    if (!filePath) {
      const row = db.prepare('SELECT file_path FROM movies WHERE id = ?').get(movieId);
      filePath = row?.file_path;
    }
    if (!filePath || !fs.existsSync(filePath)) return [];

    invalidateMovieDirCache(path.dirname(filePath));
    const diskLangs = await scanSubtitleLangs(filePath);
    const normalized = [...new Set(diskLangs.map(normalizeLangCode).filter(Boolean))];
    db.prepare('UPDATE movies SET subtitles = ? WHERE id = ?').run(JSON.stringify(normalized), movieId);
    invalidateStats();
    return normalized;
  } catch (err) {
    console.warn(`[SubtitleSync] Failed to sync movie subtitles for ${movieId}:`, err.message);
    return [];
  }
};

/**
 * Scans disk for episode subtitles, updates SQLite episodes.subtitles,
 * and invalidates statsCache.
 */
const syncEpisodeSubtitles = async (episodeId, filePath = null) => {
  try {
    if (!filePath) {
      const row = db.prepare('SELECT file_path FROM episodes WHERE id = ?').get(episodeId);
      filePath = row?.file_path;
    }
    if (!filePath || !fs.existsSync(filePath)) return [];

    const diskLangs = await scanSubtitleLangs(filePath);
    const normalized = [...new Set(diskLangs.map(normalizeLangCode).filter(Boolean))];
    db.prepare('UPDATE episodes SET subtitles = ? WHERE id = ?').run(JSON.stringify(normalized), episodeId);
    invalidateStats();
    return normalized;
  } catch (err) {
    console.warn(`[SubtitleSync] Failed to sync episode subtitles for ${episodeId}:`, err.message);
    return [];
  }
};

/**
 * Background auto-heal check for any movies and episodes that have
 * files on disk with subtitles, but DB has null or empty subtitles.
 */
const autoHealMissingSubtitles = async () => {
  try {
    const rawMovies = db.prepare(`
      SELECT id, file_path FROM movies 
      WHERE file_path IS NOT NULL AND (subtitles IS NULL OR subtitles = '[]')
    `).all();

    const rawEpisodes = db.prepare(`
      SELECT id, file_path FROM episodes
      WHERE file_path IS NOT NULL AND (subtitles IS NULL OR subtitles = '[]')
    `).all();

    if (rawMovies.length === 0 && rawEpisodes.length === 0) return;

    let updated = false;

    if (rawMovies.length > 0) {
      await runWithConcurrency(rawMovies, 5, async (m) => {
        try {
          if (!fs.existsSync(m.file_path)) return;
          const langs = await syncMovieSubtitles(m.id, m.file_path);
          if (langs.length > 0) updated = true;
        } catch { /* ignore */ }
      });
    }

    if (rawEpisodes.length > 0) {
      await runWithConcurrency(rawEpisodes, 5, async (ep) => {
        try {
          if (!fs.existsSync(ep.file_path)) return;
          const langs = await syncEpisodeSubtitles(ep.id, ep.file_path);
          if (langs.length > 0) updated = true;
        } catch { /* ignore */ }
      });
    }

    if (updated) {
      invalidateStats();
      console.log('[SubtitleSync] Auto-healed missing subtitle records from disk');
    }
  } catch (e) {
    console.warn('[SubtitleSync] Auto-heal check failed:', e.message);
  }
};

module.exports = {
  syncMovieSubtitles,
  syncEpisodeSubtitles,
  autoHealMissingSubtitles,
  invalidateStats,
  invalidateMovieDirCache
};
