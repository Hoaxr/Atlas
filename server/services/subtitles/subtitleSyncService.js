/**
 * Subtitle Synchronization & Integrity Verification Service
 * 
 * Provides fast, multi-tiered subtitle synchronization verification:
 * 1. Boundary & Duration Sanity Check (subtitle duration vs media duration)
 * 2. Cross-Track Alignment (compares target subtitle timing with reference/embedded subtitle tracks)
 * 3. Ffmpeg Voice Activity Spot-Check (tests active audio energy during dialogue cues)
 * 4. Background Scheduled Task & On-Demand Re-Verification
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');
const cron = require('node-cron');
const db = require('../../config/database');
const eventBus = require('../eventBus');
const taskRegistry = require('../taskRegistry');
const { registerJob } = require('../../utils/cronRegistry');
const { runWithConcurrency } = require('../../utils/concurrency');
const { readSubtitleFile, parseSubtitles } = require('./parser');
const { extractLang, getSubtitlesInDir } = require('../../routes/library/helpers');
const { CODE_TO_LANG } = require('../../utils/constants');

const execFileAsync = util.promisify(execFile);

/**
 * Probe media file duration and streams using ffprobe
 */
const probeMediaDuration = async (filePath) => {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'json',
      filePath
    ], { timeout: 15000 });
    const info = JSON.parse(stdout || '{}');
    const sec = parseFloat(info?.format?.duration);
    if (!isNaN(sec) && sec > 0) {
      return { durationSec: sec, durationMs: Math.round(sec * 1000) };
    }
  } catch (err) {
    console.warn(`[SubtitleSyncService] Failed to probe duration for ${filePath}:`, err.message);
  }
  return null;
};

/**
 * Fast volume energy check on a short audio segment using ffmpeg volumedetect
 * Returns { maxVolume, meanVolume, hasSound: boolean }
 */
const probeAudioVolumeAt = async (filePath, startSec, durationSec = 2.0) => {
  try {
    const safeStart = Math.max(0, startSec);
    const { stderr } = await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-ss', String(safeStart),
      '-i', filePath,
      '-t', String(durationSec),
      '-vn',
      '-af', 'volumedetect',
      '-f', 'null',
      '-'
    ], { timeout: 10000 });

    const maxMatch = stderr.match(/max_volume:\s*(-?[\d.]+)\s*dB/i);
    const meanMatch = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/i);

    const maxVol = maxMatch ? parseFloat(maxMatch[1]) : -99;
    const meanVol = meanMatch ? parseFloat(meanMatch[1]) : -99;

    // Normal dialogue voice activity typically peaks above -38dB
    const hasSound = maxVol > -40;
    return { maxVol, meanVol, hasSound };
  } catch {
    return { maxVol: -99, meanVol: -99, hasSound: false };
  }
};

/**
 * Verifies synchronization of a single subtitle file against its video file.
 *
 * @param {object} params
 * @param {string} params.filePath - Absolute path to video file
 * @param {string} params.subPath - Absolute path to subtitle file
 * @param {string} [params.mediaType] - 'movie' or 'episode'
 * @param {number} [params.mediaId] - Media database ID
 * @returns {Promise<object>} Sync verification result
 */
const verifySingleSubtitleSync = async ({ filePath, subPath, mediaType, mediaId }) => {
  if (!fs.existsSync(filePath)) {
    return { status: 'error', synced: false, message: 'Video file missing on disk' };
  }
  if (!fs.existsSync(subPath)) {
    return { status: 'error', synced: false, message: 'Subtitle file missing on disk' };
  }

  let rawContent;
  try {
    rawContent = await readSubtitleFile(subPath);
  } catch (err) {
    return { status: 'corrupt', synced: false, message: `Cannot read subtitle: ${err.message}` };
  }

  const { cues } = parseSubtitles(rawContent);
  if (!cues || cues.length === 0) {
    return { status: 'empty', synced: false, confidence: 1.0, offsetSeconds: 0, message: 'Subtitle file contains no dialogue cues' };
  }

  const mediaProbe = await probeMediaDuration(filePath);
  if (!mediaProbe) {
    return { status: 'unknown', synced: true, confidence: 0.5, offsetSeconds: 0, message: 'Could not probe video file duration' };
  }

  const { durationSec, durationMs } = mediaProbe;
  const firstCue = cues[0];
  const lastCue = cues[cues.length - 1];

  // -------------------------------------------------------------
  // TIER 1: Boundary & Duration Sanity Checks
  // -------------------------------------------------------------
  if (firstCue.startMs < 0) {
    return {
      status: 'invalid_timing',
      synced: false,
      confidence: 0.95,
      offsetSeconds: 0,
      message: 'Subtitle contains negative timestamps'
    };
  }

  // If subtitle lasts significantly past the end of the video (> 8 seconds)
  if (lastCue.endMs > durationMs + 8000) {
    const diffSec = Math.round((lastCue.endMs - durationMs) / 1000);
    return {
      status: 'duration_mismatch',
      synced: false,
      confidence: 0.95,
      offsetSeconds: diffSec,
      message: `Subtitle runs ${diffSec}s past the end of video (wrong cut or different edition)`
    };
  }

  // -------------------------------------------------------------
  // TIER 2: Reference Subtitle Alignment (Cross-Track Comparison)
  // -------------------------------------------------------------
  const subDir = path.dirname(subPath);
  const subFilename = path.basename(subPath);

  // Check if another subtitle exists in the directory that can act as a reference
  // (e.g. if checking .nl.srt, check against .en.srt or original .srt)
  let refPath = null;
  try {
    const dirFiles = await fsp.readdir(subDir);
    const otherSubs = dirFiles.filter(f => {
      const lower = f.toLowerCase();
      return (lower.endsWith('.srt') || lower.endsWith('.vtt')) && f !== subFilename;
    });

    // Prefer English reference subtitle
    const enRef = otherSubs.find(f => f.toLowerCase().endsWith('.en.srt') || f.toLowerCase().endsWith('.eng.srt'));
    if (enRef) {
      refPath = path.join(subDir, enRef);
    } else if (otherSubs.length > 0) {
      refPath = path.join(subDir, otherSubs[0]);
    }
  } catch { /* ignore */ }

  if (refPath && fs.existsSync(refPath)) {
    try {
      const refContent = await readSubtitleFile(refPath);
      const { cues: rawRefCues } = parseSubtitles(refContent);

      const isCreditCue = (c) => /(vertaling|translation|translated by|subtitles by|synced by|opensubtitles|subdl|subsource|addic7ed)/i.test(c?.text || '');
      const cleanTargetCues = cues.filter(c => !isCreditCue(c));
      const refCues = (rawRefCues || []).filter(c => !isCreditCue(c));

      if (refCues && refCues.length >= 10 && cleanTargetCues.length >= 10) {
        // Sample up to 30 cues evenly distributed across the target subtitle
        const sampleCount = Math.min(30, cleanTargetCues.length);
        const step = Math.max(1, Math.floor(cleanTargetCues.length / sampleCount));
        const deltas = [];

        for (let i = 0; i < cleanTargetCues.length; i += step) {
          const cue = cleanTargetCues[i];
          // Find closest reference cue within a ±2.5 second window
          let closestDelta = null;
          let minDiff = 2500;

          for (let j = 0; j < refCues.length; j++) {
            const diff = cue.startMs - refCues[j].startMs;
            if (Math.abs(diff) < minDiff) {
              minDiff = Math.abs(diff);
              closestDelta = diff;
            }
          }

          if (closestDelta !== null) {
            deltas.push(closestDelta);
          }
        }

        if (deltas.length >= 8) {
          // Check for linear drift across chronological timeline (e.g. 23.976 vs 25 fps PAL drift)
          const firstThird = deltas.slice(0, Math.floor(deltas.length / 3));
          const lastThird = deltas.slice(Math.floor(deltas.length * 2 / 3));
          const avgFirst = firstThird.reduce((a, b) => a + b, 0) / (firstThird.length || 1);
          const avgLast = lastThird.reduce((a, b) => a + b, 0) / (lastThird.length || 1);
          const driftMs = Math.abs(avgLast - avgFirst);

          const sortedDeltas = [...deltas].sort((a, b) => a - b);
          const medianDeltaMs = sortedDeltas[Math.floor(sortedDeltas.length / 2)];
          const medianDeltaSec = Math.round(medianDeltaMs / 100) / 10;

          // Compute deviation/spread around median
          const mad = sortedDeltas.reduce((acc, d) => acc + Math.abs(d - medianDeltaMs), 0) / sortedDeltas.length;

          if (driftMs > 3500) {
            return {
              status: 'drift_detected',
              synced: false,
              confidence: 0.92,
              offsetSeconds: medianDeltaSec,
              message: `Framerate drift detected (~${(driftMs / 1000).toFixed(1)}s drift between start and end)`
            };
          }

          if (Math.abs(medianDeltaSec) >= 1.2 && mad < 800) {
            return {
              status: 'offset_detected',
              synced: false,
              confidence: 0.94,
              offsetSeconds: medianDeltaSec,
              message: `Constant time offset detected: ${medianDeltaSec > 0 ? '+' : ''}${medianDeltaSec}s`
            };
          }

          if (Math.abs(medianDeltaSec) < 0.6 && mad < 600) {
            return {
              status: 'in_sync',
              synced: true,
              confidence: 0.96,
              offsetSeconds: medianDeltaSec,
              message: 'Timings align accurately with reference subtitle track'
            };
          }
        }
      }
    } catch (refErr) {
      console.warn('[SubtitleSyncService] Reference comparison warning:', refErr.message);
    }
  }

  // -------------------------------------------------------------
  // TIER 3: Ffmpeg Audio Speech Energy (VAD Spot-Check)
  // -------------------------------------------------------------
  // Sample 5 dialogue cues across the media: 15%, 35%, 50%, 70%, 85%
  const sampleIndices = [
    Math.floor(cues.length * 0.15),
    Math.floor(cues.length * 0.35),
    Math.floor(cues.length * 0.50),
    Math.floor(cues.length * 0.70),
    Math.floor(cues.length * 0.85)
  ];

  let soundHits = 0;
  let checksPerformed = 0;

  for (const idx of sampleIndices) {
    if (idx < 0 || idx >= cues.length) continue;
    const cue = cues[idx];
    const startSec = cue.startMs / 1000;
    const duration = Math.min(2.5, Math.max(1.0, (cue.endMs - cue.startMs) / 1000));

    const vol = await probeAudioVolumeAt(filePath, startSec, duration);
    checksPerformed++;
    if (vol.hasSound) soundHits++;
  }

  if (checksPerformed >= 3 && soundHits >= checksPerformed - 1) {
    return {
      status: 'in_sync',
      synced: true,
      confidence: 0.88,
      offsetSeconds: 0,
      message: 'Dialogue cues correlate with active audio speech energy'
    };
  }

  if (checksPerformed >= 3 && soundHits === 0) {
    return {
      status: 'desynced',
      synced: false,
      confidence: 0.75,
      offsetSeconds: 0,
      message: 'Dialogue cues land during prolonged audio silence'
    };
  }

  return {
    status: 'in_sync',
    synced: true,
    confidence: 0.80,
    offsetSeconds: 0,
    message: 'Subtitle timing checks passed without anomalies'
  };
};

/**
 * Saves or updates subtitle sync results in SQLite subtitle_tracks table
 */
const saveSyncResult = async (mediaType, mediaId, subFilename, subPath, syncResult) => {
  try {
    const langCode = extractLang(subFilename, path) || 'und';
    const langName = CODE_TO_LANG[langCode] || langCode;
    let stat = null;
    try { stat = await fsp.stat(subPath); } catch { /* ignore */ }

    db.prepare(`
      INSERT INTO subtitle_tracks (
        media_type, media_id, filename, file_path, lang_code, lang_name,
        sync_status, sync_offset, sync_details, file_size, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(media_type, media_id, filename) DO UPDATE SET
        file_path = excluded.file_path,
        lang_code = excluded.lang_code,
        lang_name = excluded.lang_name,
        sync_status = excluded.sync_status,
        sync_offset = excluded.sync_offset,
        sync_details = excluded.sync_details,
        file_size = excluded.file_size,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      mediaType,
      mediaId,
      subFilename,
      subPath,
      langCode,
      langName,
      syncResult.status,
      syncResult.offsetSeconds || 0,
      syncResult.message || '',
      stat?.size || 0
    );
  } catch (err) {
    console.warn('[SubtitleSyncService] Failed to save sync result:', err.message);
  }
};

/**
 * Verifies all subtitle files for a specific movie or episode
 */
const verifyAllSubtitlesForMedia = async (mediaType, mediaId, { force = false } = {}) => {
  let mediaRow = null;
  if (mediaType === 'movie') {
    mediaRow = db.prepare('SELECT id, title, file_path, folder_path FROM movies WHERE id = ?').get(mediaId);
  } else if (mediaType === 'episode') {
    mediaRow = db.prepare(`
      SELECT e.id, e.title, e.file_path, e.season_number, e.episode_number,
             s.title as show_title, s.folder_path as show_folder_path
      FROM episodes e
      LEFT JOIN shows s ON e.show_id = s.id
      WHERE e.id = ?
    `).get(mediaId);
  }

  if (!mediaRow || !mediaRow.file_path || !fs.existsSync(mediaRow.file_path)) {
    return [];
  }

  const mediaDir = path.dirname(mediaRow.file_path);
  const subFiles = await getSubtitlesInDir(mediaDir, fsp, path);
  const results = [];

  let existingMap = new Map();
  try {
    const existing = db.prepare(`
      SELECT filename, sync_status, sync_offset, sync_details, file_size
      FROM subtitle_tracks
      WHERE media_type = ? AND media_id = ?
    `).all(mediaType, mediaId);
    existingMap = new Map(existing.map(e => [e.filename, e]));
  } catch { /* ignore */ }

  for (const filename of subFiles) {
    // For episodes, only check subtitles matching this episode
    if (mediaType === 'episode') {
      const sPad = String(mediaRow.season_number).padStart(2, '0');
      const ePad = String(mediaRow.episode_number).padStart(2, '0');
      const p1 = `s${sPad}e${ePad}`.toLowerCase();
      const p2 = `${mediaRow.season_number}x${ePad}`.toLowerCase();
      const lower = filename.toLowerCase();
      if (!lower.includes(p1) && !lower.includes(p2)) {
        continue;
      }
    }

    const subPath = path.join(mediaDir, filename);

    // Incremental optimization: if already verified as in_sync, unchanged, and not forced, skip VAD re-check
    const prev = existingMap.get(filename);
    if (!force && prev && prev.sync_status === 'in_sync') {
      try {
        const stat = await fsp.stat(subPath);
        if (stat.size === prev.file_size) {
          results.push({
            filename,
            filePath: subPath,
            status: 'in_sync',
            synced: true,
            offsetSeconds: prev.sync_offset || 0,
            confidence: 1.0,
            cached: true,
            message: prev.sync_details || 'Already verified in sync'
          });
          continue;
        }
      } catch { /* proceed to normal check */ }
    }

    const syncResult = await verifySingleSubtitleSync({
      filePath: mediaRow.file_path,
      subPath,
      mediaType,
      mediaId
    });

    await saveSyncResult(mediaType, mediaId, filename, subPath, syncResult);

    results.push({
      filename,
      filePath: subPath,
      ...syncResult
    });
  }

  return results;
};

/**
 * Full Library Subtitle Sync Check (Background Task)
 * Uses incremental caching so already-synced tracks are skipped unless forced or changed
 */
const runLibrarySubtitleSyncCheck = async ({ force = false } = {}) => {
  console.log(`[SubtitleSyncService] Starting Library Subtitle Sync Check (force: ${force})...`);
  let totalChecked = 0;
  let cachedCount = 0;
  let issuesFound = 0;

  // 1. Check movies with downloaded status and subtitles
  const movies = db.prepare(`
    SELECT id, title, file_path FROM movies 
    WHERE status = 'downloaded' AND file_path IS NOT NULL AND subtitles IS NOT NULL AND subtitles != '[]'
  `).all();

  await runWithConcurrency(movies, 2, async (movie) => {
    try {
      if (!fs.existsSync(movie.file_path)) return;
      const res = await verifyAllSubtitlesForMedia('movie', movie.id, { force });
      for (const r of res) {
        if (r.cached) {
          cachedCount++;
        } else {
          totalChecked++;
        }
        if (!r.synced) {
          issuesFound++;
          console.warn(`[SubtitleSyncService] Sync issue in movie "${movie.title}" (${r.filename}): ${r.message}`);
        }
      }
    } catch { /* ignore */ }
  });

  // 2. Check episodes with downloaded status and subtitles
  const episodes = db.prepare(`
    SELECT e.id, e.title, e.file_path, s.title as show_title, e.season_number, e.episode_number
    FROM episodes e
    JOIN shows s ON e.show_id = s.id
    WHERE e.status = 'downloaded' AND e.file_path IS NOT NULL AND e.subtitles IS NOT NULL AND e.subtitles != '[]'
  `).all();

  await runWithConcurrency(episodes, 2, async (ep) => {
    try {
      if (!fs.existsSync(ep.file_path)) return;
      const res = await verifyAllSubtitlesForMedia('episode', ep.id, { force });
      for (const r of res) {
        if (r.cached) {
          cachedCount++;
        } else {
          totalChecked++;
        }
        if (!r.synced) {
          issuesFound++;
          const label = `${ep.show_title} S${String(ep.season_number).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')}`;
          console.warn(`[SubtitleSyncService] Sync issue in episode "${label}" (${r.filename}): ${r.message}`);
        }
      }
    } catch { /* ignore */ }
  });

  const msg = `Subtitle sync check completed: checked ${totalChecked} track(s), ${cachedCount} skipped (already in sync), ${issuesFound} issue(s) detected.`;
  console.log(`[SubtitleSyncService] ${msg}`);

  if (issuesFound > 0) {
    eventBus.warn(`Subtitle Sync Warning: ${issuesFound} subtitle track(s) may be out of sync. Check Media Health or Subtitle Manager.`);
  } else {
    eventBus.success(`Subtitle Sync Check: All ${totalChecked} checked subtitles are synchronized.`);
  }

  return { totalChecked, issuesFound };
};

/**
 * Initializes task registry and scheduled cron job
 */
const init = () => {
  const cronExp = '0 4 * * 0'; // Sundays at 4:00 AM
  taskRegistry.registerTask(
    'subtitle_sync_checker',
    'Subtitle Sync & Integrity Checker',
    'Scans media library subtitles to verify timing synchronization against video audio and reference tracks.',
    cronExp,
    runLibrarySubtitleSyncCheck
  );

  const job = cron.schedule(cronExp, () => taskRegistry.executeTask('subtitle_sync_checker'));
  registerJob(job);
  console.log('[SubtitleSyncService] Registered and scheduled subtitle_sync_checker task.');
};

module.exports = {
  init,
  verifySingleSubtitleSync,
  verifyAllSubtitlesForMedia,
  runLibrarySubtitleSyncCheck,
  probeMediaDuration,
  probeAudioVolumeAt
};
