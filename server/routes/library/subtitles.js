/**
 * Subtitles REST API Routes
 * 
 * Endpoints for:
 * - Multi-language background translation
 * - Translation jobs management (progress, cancel, retry)
 * - Subtitle tracks inspection and metadata
 * - Live cue preview and subtitle editing
 * - Subtitle file download and safe deletion
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const db = require('../../config/database');
const { parseSubtitles, serializeSubtitles } = require('../../services/subtitles/parser');
const translationQueue = require('../../services/subtitles/translationQueue');
const { LANG_TO_CODE, CODE_TO_LANG } = require('../../utils/constants');
const { extractLang, getSubtitlesInDir } = require('./helpers');

/**
 * Helper to resolve media file path and directory securely
 */
const resolveMedia = (mediaType, mediaId) => {
  if (mediaType === 'movie') {
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(mediaId);
    if (!movie) return null;
    const dir = movie.folder_path || (movie.file_path ? path.dirname(movie.file_path) : null);
    return { media: movie, dir, title: movie.title, filePath: movie.file_path };
  } else if (mediaType === 'episode') {
    const episode = db.prepare(`
      SELECT e.*, s.title as show_title, s.folder_path as show_folder_path
      FROM episodes e
      LEFT JOIN shows s ON e.show_id = s.id
      WHERE e.id = ?
    `).get(mediaId);
    if (!episode) return null;
    const dir = episode.file_path ? path.dirname(episode.file_path) : episode.show_folder_path;
    const title = `${episode.show_title || 'Show'} S${String(episode.season_number).padStart(2, '0')}E${String(episode.episode_number).padStart(2, '0')}`;
    return {
      media: episode,
      dir,
      title,
      filePath: episode.file_path,
      seasonNumber: episode.season_number,
      episodeNumber: episode.episode_number
    };
  }
  return null;
};

/**
 * Finds the correct English source subtitle for a specific movie or episode
 */
const findSourceSubtitle = async (resolved, preferredSourceFile) => {
  if (preferredSourceFile && fs.existsSync(preferredSourceFile)) {
    return preferredSourceFile;
  }

  if (!resolved.dir || !fs.existsSync(resolved.dir)) return null;
  const files = await fsp.readdir(resolved.dir);

  // 1. If media has a filePath on disk, check exact matching basename first
  if (resolved.filePath) {
    const parsed = path.parse(resolved.filePath);
    const exactEn = path.join(parsed.dir, `${parsed.name}.en.srt`);
    if (fs.existsSync(exactEn)) return exactEn;
    const exactEng = path.join(parsed.dir, `${parsed.name}.eng.srt`);
    if (fs.existsSync(exactEng)) return exactEng;
    const exactSrt = path.join(parsed.dir, `${parsed.name}.srt`);
    if (fs.existsSync(exactSrt)) return exactSrt;
  }

  // 2. For TV episodes, match specifically by season/episode pattern (e.g. S01E09 or 1x09)
  if (resolved.seasonNumber !== undefined && resolved.episodeNumber !== undefined) {
    const sPad = String(resolved.seasonNumber).padStart(2, '0');
    const ePad = String(resolved.episodeNumber).padStart(2, '0');
    const pattern1 = `s${sPad}e${ePad}`.toLowerCase();
    const pattern2 = `${resolved.seasonNumber}x${ePad}`.toLowerCase();

    // Prefer English
    const enEpFile = files.find(f => {
      const fLower = f.toLowerCase();
      return (fLower.includes(pattern1) || fLower.includes(pattern2)) && (fLower.endsWith('.en.srt') || fLower.endsWith('.eng.srt'));
    });
    if (enEpFile) return path.join(resolved.dir, enEpFile);

    // Fallback to any srt for this episode
    const anyEpSrt = files.find(f => {
      const fLower = f.toLowerCase();
      return (fLower.includes(pattern1) || fLower.includes(pattern2)) && fLower.endsWith('.srt');
    });
    if (anyEpSrt) return path.join(resolved.dir, anyEpSrt);

    return null;
  }

  // 3. For movies, look for English subtitle in the movie folder
  const enFile = files.find(f => f.toLowerCase().endsWith('.en.srt') || f.toLowerCase().endsWith('.eng.srt'));
  if (enFile) return path.join(resolved.dir, enFile);

  const anySrt = files.find(f => f.toLowerCase().endsWith('.srt'));
  if (anySrt) return path.join(resolved.dir, anySrt);

  return null;
};

/**
 * Helper to validate safe file path inside media directory (prevent traversal)
 */
const getSafeFilePath = (dir, filename) => {
  if (!dir || !filename) return null;
  const safeName = path.basename(filename);
  const resolved = path.join(dir, safeName);
  // Ensure path is directly within dir
  if (!resolved.startsWith(path.resolve(dir))) return null;
  return resolved;
};

// ==========================================
// TRANSLATION ENDPOINTS
// ==========================================

/**
 * POST /api/library/subtitles/translate
 * Start translation jobs for 1 or more target languages
 */
router.post('/translate', async (req, res, next) => {
  try {
    const { mediaType, mediaId, targetLangs, sourceLang, sourceFile, provider, retranslate, overrides } = req.body;

    if (!mediaType || !mediaId || !targetLangs) {
      return res.status(400).json({ status: 'error', message: 'Missing mediaType, mediaId, or targetLangs' });
    }

    const resolved = resolveMedia(mediaType, mediaId);
    if (!resolved) {
      return res.status(404).json({ status: 'error', message: `${mediaType} not found` });
    }
    if (!resolved.dir || !fs.existsSync(resolved.dir)) {
      return res.status(400).json({ status: 'error', message: 'Media folder does not exist on disk' });
    }

    // Determine source subtitle file
    const chosenSourceFile = await findSourceSubtitle(resolved, sourceFile);

    if (!chosenSourceFile || !fs.existsSync(chosenSourceFile)) {
      return res.status(400).json({
        status: 'error',
        message: `No English subtitle found for ${resolved.title}. Please download English subtitles first.`
      });
    }

    const jobs = translationQueue.createTranslationJobs({
      mediaType,
      mediaId,
      title: resolved.title,
      sourceFile: chosenSourceFile,
      sourceLang: sourceLang || 'English',
      targetLangs,
      provider,
      retranslate: Boolean(retranslate),
      overrides: overrides || {}
    });

    res.json({
      status: 'success',
      message: `Started ${jobs.length} translation job(s) in background`,
      jobs
    });
  } catch (err) {
    console.error('[SubtitlesAPI] /translate error:', err.message);
    res.status(400).json({ status: 'error', message: err.message });
  }
});

/**
 * GET /api/library/subtitles/jobs
 * Get translation jobs (optional filter by mediaType and mediaId)
 */
router.get('/jobs', (req, res) => {
  try {
    const { mediaType, mediaId, limit } = req.query;
    if (mediaType && mediaId) {
      const jobs = translationQueue.getJobsForMedia(mediaType, parseInt(mediaId, 10));
      return res.json({ status: 'success', data: jobs });
    }
    const jobs = translationQueue.getJobs(limit ? parseInt(limit, 10) : 30);
    res.json({ status: 'success', data: jobs });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/library/subtitles/jobs/:id/cancel
 */
router.post('/jobs/:id/cancel', (req, res) => {
  try {
    const success = translationQueue.cancelJob(req.params.id);
    res.json({ status: 'success', cancelled: success });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * POST /api/library/subtitles/jobs/:id/retry
 */
router.post('/jobs/:id/retry', (req, res) => {
  try {
    const job = translationQueue.retryJob(req.params.id);
    res.json({ status: 'success', job });
  } catch (err) {
    res.status(400).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// SUBTITLE TRACKS & MANAGEMENT
// ==========================================

/**
 * GET /api/library/subtitles/tracks/:mediaType/:mediaId
 * List all subtitle files on disk with rich metadata
 */
router.get('/tracks/:mediaType/:mediaId', async (req, res, next) => {
  try {
    const { mediaType, mediaId } = req.params;
    const resolved = resolveMedia(mediaType, mediaId);
    if (!resolved || !resolved.dir || !fs.existsSync(resolved.dir)) {
      return res.json({ status: 'success', data: [] });
    }

    const subFiles = await getSubtitlesInDir(resolved.dir, fsp, path);
    const dbTracks = db.prepare('SELECT * FROM subtitle_tracks WHERE media_type = ? AND media_id = ?').all(mediaType, mediaId);
    const dbTrackMap = new Map(dbTracks.map(t => [t.filename, t]));

    const tracks = [];

    for (const file of subFiles) {
      const filePath = path.join(resolved.dir, file);
      const ext = path.extname(file).replace('.', '').toLowerCase();
      const langCode = extractLang(file, path);
      const langName = CODE_TO_LANG[langCode] || langCode;

      let stat = null;
      try { stat = await fsp.stat(filePath); } catch { /* ignore */ }

      const dbTrack = dbTrackMap.get(file);

      tracks.push({
        filename: file,
        filePath,
        langCode,
        langName: dbTrack?.lang_name || langName,
        format: ext,
        trackType: dbTrack?.track_type || (file.includes('.ai.') || file.includes('.trans.') ? 'translated' : 'downloaded'),
        sourceLang: dbTrack?.source_lang || null,
        provider: dbTrack?.provider || null,
        manuallyEdited: Boolean(dbTrack?.manually_edited),
        fileSize: stat?.size || dbTrack?.file_size || 0,
        cueCount: dbTrack?.cue_count || 0,
        modifiedAt: stat?.mtime || dbTrack?.updated_at || null
      });
    }

    res.json({ status: 'success', data: tracks });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/library/subtitles/content/:mediaType/:mediaId/:filename
 * Read raw subtitle content and parsed cues for editing/preview
 */
router.get('/content/:mediaType/:mediaId/:filename', async (req, res, next) => {
  try {
    const { mediaType, mediaId, filename } = req.params;
    const resolved = resolveMedia(mediaType, mediaId);
    if (!resolved || !resolved.dir) {
      return res.status(404).json({ status: 'error', message: `${mediaType} not found` });
    }

    const safePath = getSafeFilePath(resolved.dir, filename);
    if (!safePath || !fs.existsSync(safePath)) {
      return res.status(404).json({ status: 'error', message: 'Subtitle file not found' });
    }

    const rawContent = await fsp.readFile(safePath, 'utf8');
    const { cues, format, header } = parseSubtitles(rawContent);

    res.json({
      status: 'success',
      data: {
        filename,
        format,
        header,
        cueCount: cues.length,
        cues,
        rawContent
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/library/subtitles/content/:mediaType/:mediaId/:filename
 * Save edited subtitle cues/content to disk and mark as manually edited
 */
router.put('/content/:mediaType/:mediaId/:filename', async (req, res, next) => {
  try {
    const { mediaType, mediaId, filename } = req.params;
    const { cues, rawContent, format } = req.body;

    const resolved = resolveMedia(mediaType, mediaId);
    if (!resolved || !resolved.dir) {
      return res.status(404).json({ status: 'error', message: `${mediaType} not found` });
    }

    const safePath = getSafeFilePath(resolved.dir, filename);
    if (!safePath) {
      return res.status(400).json({ status: 'error', message: 'Invalid subtitle filename' });
    }

    let finalContent = rawContent;
    if (Array.isArray(cues) && cues.length > 0) {
      finalContent = serializeSubtitles(cues, format || 'srt');
    }

    if (!finalContent || typeof finalContent !== 'string') {
      return res.status(400).json({ status: 'error', message: 'Content or cues are required' });
    }

    // Atomic write
    const tmpPath = `${safePath}.tmp`;
    await fsp.writeFile(tmpPath, finalContent, 'utf8');
    await fsp.rename(tmpPath, safePath);

    const stat = await fsp.stat(safePath);
    const langCode = extractLang(filename, path);
    const cueCount = Array.isArray(cues) ? cues.length : parseSubtitles(finalContent).cues.length;

    // Update DB track
    db.prepare(`
      INSERT INTO subtitle_tracks (
        media_type, media_id, filename, file_path, lang_code, format, 
        track_type, manually_edited, file_size, cue_count, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'edited', 1, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(media_type, media_id, filename) DO UPDATE SET
        manually_edited = 1,
        file_size = excluded.file_size,
        cue_count = excluded.cue_count,
        updated_at = CURRENT_TIMESTAMP
    `).run(mediaType, mediaId, filename, safePath, langCode, format || 'srt', stat.size, cueCount);

    res.json({
      status: 'success',
      message: 'Subtitle saved successfully',
      data: { filename, cueCount, fileSize: stat.size }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/library/subtitles/tracks/:mediaType/:mediaId/:filename
 * Safely delete a subtitle file from disk and database
 */
router.delete('/tracks/:mediaType/:mediaId/:filename', async (req, res, next) => {
  try {
    const { mediaType, mediaId, filename } = req.params;
    const resolved = resolveMedia(mediaType, mediaId);
    if (!resolved || !resolved.dir) {
      return res.status(404).json({ status: 'error', message: `${mediaType} not found` });
    }

    const safePath = getSafeFilePath(resolved.dir, filename);
    if (safePath && fs.existsSync(safePath)) {
      await fsp.unlink(safePath);
    }

    // Clean from subtitle_tracks table
    db.prepare('DELETE FROM subtitle_tracks WHERE media_type = ? AND media_id = ? AND filename = ?')
      .run(mediaType, mediaId, filename);

    // Rescan remaining subtitle languages for media item
    try {
      const remainingFiles = await getSubtitlesInDir(resolved.dir, fsp, path);
      const langs = [...new Set(remainingFiles.map(f => extractLang(f, path)).filter(Boolean))];
      const table = mediaType === 'movie' ? 'movies' : 'episodes';
      db.prepare(`UPDATE ${table} SET subtitles = ? WHERE id = ?`).run(JSON.stringify(langs), mediaId);
    } catch { /* ignore */ }

    res.json({ status: 'success', message: 'Subtitle deleted successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/library/subtitles/download/:mediaType/:mediaId/:filename
 * Download subtitle file to client browser
 */
router.get('/download/:mediaType/:mediaId/:filename', (req, res) => {
  try {
    const { mediaType, mediaId, filename } = req.params;
    const resolved = resolveMedia(mediaType, mediaId);
    if (!resolved || !resolved.dir) {
      return res.status(404).json({ status: 'error', message: `${mediaType} not found` });
    }

    const safePath = getSafeFilePath(resolved.dir, filename);
    if (!safePath || !fs.existsSync(safePath)) {
      return res.status(404).json({ status: 'error', message: 'Subtitle file not found' });
    }

    res.download(safePath, filename);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
