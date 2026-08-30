/**
 * Subtitle Translation Queue & Background Engine
 * 
 * Manages background subtitle translations with:
 * - Persistent SQLite job store (subtitle_jobs)
 * - Cue-level progress tracking
 * - Real-time WebSocket broadcasts via eventBus
 * - Atomic file writes (.tmp -> .srt)
 * - Batch checkpointing, cancellation, and retry
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const db = require('../../config/database');
const eventBus = require('../eventBus');
const { LANG_TO_CODE } = require('../../utils/constants');
const { parseSubtitles, serializeSubtitles } = require('./parser');
const { getTranslationProvider, createCueBatches } = require('./translationProviders');

class SubtitleTranslationQueue {
  constructor() {
    this.activeJobs = new Map(); // id -> job object
    this.queue = [];
    this.running = 0;
    this.maxConcurrent = 2;
    this.isProcessing = false;
  }

  /**
   * Broadcasts job state update to all WebSocket clients and DB
   */
  emitJobUpdate(job) {
    try {
      db.prepare(`
        UPDATE subtitle_jobs 
        SET status = ?, progress = ?, current_step = ?, total_cues = ?, processed_cues = ?, error = ?, completed_at = ?
        WHERE id = ?
      `).run(
        job.status,
        job.progress || 0,
        job.currentStep || '',
        job.totalCues || 0,
        job.processedCues || 0,
        job.error || null,
        job.completedAt || null,
        job.id
      );
    } catch (e) {
      console.warn('[SubtitleQueue] Failed to update job in DB:', e.message);
    }

    eventBus.emit('event', {
      type: 'SUBTITLE_JOB_UPDATE',
      level: job.status === 'failed' ? 'error' : 'info',
      job: {
        id: job.id,
        mediaType: job.mediaType,
        mediaId: job.mediaId,
        title: job.title,
        sourceLang: job.sourceLang,
        targetLang: job.targetLang,
        provider: job.provider,
        status: job.status,
        progress: job.progress,
        currentStep: job.currentStep,
        totalCues: job.totalCues,
        processedCues: job.processedCues,
        error: job.error,
        createdAt: job.createdAt,
        completedAt: job.completedAt
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Creates one or multiple translation jobs for a media item
   * 
   * @param {object} params
   * @param {'movie'|'episode'} params.mediaType
   * @param {number} params.mediaId
   * @param {string} params.title
   * @param {string} params.sourceFile
   * @param {string} [params.sourceLang='English']
   * @param {string|string[]} params.targetLangs
   * @param {string} [params.provider]
   * @param {boolean} [params.retranslate=false]
   * @param {object} [params.overrides]
   * @returns {Array<object>} List of created job records
   */
  createTranslationJobs({
    mediaType,
    mediaId,
    title,
    sourceFile,
    sourceLang = 'English',
    targetLangs,
    provider,
    retranslate = false,
    overrides = {}
  }) {
    if (!mediaType || !mediaId || !sourceFile) {
      throw new Error('mediaType, mediaId, and sourceFile are required');
    }

    if (!fs.existsSync(sourceFile)) {
      throw new Error(`Source subtitle file not found on disk: ${sourceFile}`);
    }

    const langs = Array.isArray(targetLangs) ? targetLangs : [targetLangs];
    if (langs.length === 0) {
      throw new Error('At least one target language must be specified');
    }

    const activeProvider = provider ||
      db.prepare("SELECT value FROM settings WHERE key = 'translationProvider'").get()?.value ||
      'googleTranslate';

    const sourceDir = path.dirname(sourceFile);
    const sourceParsed = path.parse(sourceFile);
    const baseClean = sourceParsed.name.replace(/\.[a-z]{2,3}$/i, '');

    const createdJobs = [];

    for (const lang of langs) {
      const targetCode = LANG_TO_CODE[lang] || (typeof lang === 'string' && lang.length === 2 ? lang.toLowerCase() : 'nl');
      const targetFileName = `${baseClean}.${targetCode}.srt`;
      const targetFilePath = path.join(sourceDir, targetFileName);

      // Duplicate check: if file already exists and not retranslating, throw or skip
      if (fs.existsSync(targetFilePath) && !retranslate) {
        throw new Error(`Subtitle for ${lang} (${targetFileName}) already exists. Enable re-translate to overwrite.`);
      }

      const jobId = `sub_job_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const now = new Date().toISOString();

      const jobRecord = {
        id: jobId,
        mediaType,
        mediaId,
        title: title || `${mediaType} #${mediaId}`,
        sourceLang,
        targetLang: lang,
        sourceFile,
        targetFile: targetFilePath,
        provider: activeProvider,
        status: 'pending',
        progress: 0,
        currentStep: 'Queued',
        totalCues: 0,
        processedCues: 0,
        error: null,
        createdAt: now,
        completedAt: null,
        overrides
      };

      // Save to SQLite
      db.prepare(`
        INSERT INTO subtitle_jobs (id, media_type, media_id, title, source_lang, target_lang, source_file, target_file, provider, status, progress, current_step, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        jobRecord.id,
        jobRecord.mediaType,
        jobRecord.mediaId,
        jobRecord.title,
        jobRecord.sourceLang,
        jobRecord.targetLang,
        jobRecord.sourceFile,
        jobRecord.targetFile,
        jobRecord.provider,
        jobRecord.status,
        jobRecord.progress,
        jobRecord.currentStep,
        jobRecord.createdAt
      );

      this.activeJobs.set(jobId, jobRecord);
      this.queue.push(jobRecord);
      this.emitJobUpdate(jobRecord);
      createdJobs.push(jobRecord);
    }

    // Trigger processing
    this.processQueue();

    return createdJobs;
  }

  /**
   * Main Queue processing loop
   */
  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const job = this.queue.shift();
      if (!job || job.cancelled) continue;

      this.running++;
      this.executeJob(job).finally(() => {
        this.running--;
        this.processQueue();
      });
    }

    this.isProcessing = false;
  }

  /**
   * Executes a single subtitle translation job
   */
  async executeJob(job) {
    try {
      if (job.cancelled) {
        job.status = 'cancelled';
        job.currentStep = 'Cancelled by user';
        this.emitJobUpdate(job);
        return;
      }

      job.status = 'processing';
      job.currentStep = 'Reading source subtitle...';
      job.progress = 5;
      this.emitJobUpdate(job);

      // Read source file
      const rawContent = await fsp.readFile(job.sourceFile, 'utf8');
      const { cues, format, header } = parseSubtitles(rawContent);

      if (cues.length === 0) {
        throw new Error('Source subtitle file contains no valid dialogue cues');
      }

      job.totalCues = cues.length;
      job.processedCues = 0;
      job.currentStep = `Translating 0 of ${cues.length} cues...`;
      job.progress = 10;
      this.emitJobUpdate(job);

      const providerInstance = getTranslationProvider(job.provider, job.overrides);
      const batchSize = job.provider === 'googleTranslate' ? 15 : 25;
      const batches = createCueBatches(cues, batchSize);

      const translatedCues = [];

      for (let i = 0; i < batches.length; i++) {
        if (job.cancelled) {
          job.status = 'cancelled';
          job.currentStep = 'Cancelled by user';
          this.emitJobUpdate(job);
          return;
        }

        const batch = batches[i];
        const translatedBatch = await providerInstance.translateBatch(
          batch,
          job.sourceLang,
          job.targetLang,
          job.overrides
        );

        // Map translated text back to original cues to guarantee 100% timing integrity
        for (let j = 0; j < batch.length; j++) {
          const originalCue = batch[j];
          const transResult = translatedBatch.find(t => String(t.id) === String(originalCue.id)) || translatedBatch[j];
          translatedCues.push({
            ...originalCue,
            text: transResult?.text || originalCue.text
          });
        }

        job.processedCues = translatedCues.length;
        job.progress = Math.min(95, 10 + Math.round((job.processedCues / job.totalCues) * 85));
        job.currentStep = `Translated ${job.processedCues} of ${job.totalCues} cues (${job.progress}%)`;
        this.emitJobUpdate(job);

        // Small delay between batches to be courteous to translation endpoints
        if (i < batches.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

      job.currentStep = 'Writing translated subtitle to disk...';
      job.progress = 96;
      this.emitJobUpdate(job);

      // Serialize back to subtitle format
      const serialized = serializeSubtitles(translatedCues, 'srt');

      // Atomic write: .tmp -> .srt
      const tmpPath = `${job.targetFile}.tmp`;
      await fsp.writeFile(tmpPath, serialized, 'utf8');
      await fsp.rename(tmpPath, job.targetFile);

      // Register or update track in DB
      try {
        const targetFilename = path.basename(job.targetFile);
        const targetCode = LANG_TO_CODE[job.targetLang] || 'nl';
        const fileStat = await fsp.stat(job.targetFile);

        db.prepare(`
          INSERT INTO subtitle_tracks (
            media_type, media_id, filename, file_path, lang_code, lang_name, 
            format, track_type, source_lang, provider, manually_edited, file_size, cue_count, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(media_type, media_id, filename) DO UPDATE SET
            file_path = excluded.file_path,
            lang_code = excluded.lang_code,
            lang_name = excluded.lang_name,
            track_type = excluded.track_type,
            source_lang = excluded.source_lang,
            provider = excluded.provider,
            file_size = excluded.file_size,
            cue_count = excluded.cue_count,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          job.mediaType,
          job.mediaId,
          targetFilename,
          job.targetFile,
          targetCode,
          job.targetLang,
          'srt',
          'translated',
          job.sourceLang,
          job.provider,
          fileStat.size,
          translatedCues.length
        );

        // Also update movie/episode subtitles JSON column
        const table = job.mediaType === 'movie' ? 'movies' : 'episodes';
        const existingRow = db.prepare(`SELECT subtitles FROM ${table} WHERE id = ?`).get(job.mediaId);
        let langs = [];
        try { langs = JSON.parse(existingRow?.subtitles || '[]'); } catch { langs = []; }
        if (!langs.includes(targetCode)) {
          langs.push(targetCode);
          db.prepare(`UPDATE ${table} SET subtitles = ? WHERE id = ?`).run(JSON.stringify(langs), job.mediaId);
        }
      } catch (trackErr) {
        console.warn('[SubtitleQueue] Failed to update subtitle_tracks table:', trackErr.message);
      }

      job.status = 'completed';
      job.progress = 100;
      job.currentStep = `Completed translation into ${job.targetLang}`;
      job.completedAt = new Date().toISOString();
      this.emitJobUpdate(job);

      eventBus.success(`Subtitle translated: ${job.title} (${job.targetLang})`, {
        title: job.title,
        type: job.mediaType,
        language: job.targetLang
      });

    } catch (err) {
      console.error(`[SubtitleQueue] Job ${job.id} failed:`, err.message);
      job.status = 'failed';
      job.error = err.message;
      job.currentStep = `Failed: ${err.message}`;
      job.completedAt = new Date().toISOString();
      this.emitJobUpdate(job);

      eventBus.error(`Subtitle translation failed: ${job.title} (${job.targetLang}) — ${err.message}`, {
        title: job.title,
        type: job.mediaType,
        language: job.targetLang,
        error: err.message
      });
    }
  }

  /**
   * Cancel an in-flight or pending job
   */
  cancelJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.cancelled = true;
      if (job.status === 'pending') {
        job.status = 'cancelled';
        job.currentStep = 'Cancelled by user';
        this.emitJobUpdate(job);
      }
      return true;
    }
    return false;
  }

  /**
   * Retry a failed job
   */
  retryJob(jobId) {
    const row = db.prepare('SELECT * FROM subtitle_jobs WHERE id = ?').get(jobId);
    if (!row) throw new Error('Job not found');

    const job = {
      id: row.id,
      mediaType: row.media_type,
      mediaId: row.media_id,
      title: row.title,
      sourceLang: row.source_lang,
      targetLang: row.target_lang,
      sourceFile: row.source_file,
      targetFile: row.target_file,
      provider: row.provider,
      status: 'pending',
      progress: 0,
      currentStep: 'Retrying...',
      totalCues: 0,
      processedCues: 0,
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      cancelled: false
    };

    this.activeJobs.set(job.id, job);
    this.queue.push(job);
    this.emitJobUpdate(job);
    this.processQueue();
    return job;
  }

  /**
   * Get all active / recent jobs
   */
  getJobs(limit = 30) {
    return db.prepare(`
      SELECT * FROM subtitle_jobs 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(limit).map(r => ({
      id: r.id,
      mediaType: r.media_type,
      mediaId: r.media_id,
      title: r.title,
      sourceLang: r.source_lang,
      targetLang: r.target_lang,
      sourceFile: r.source_file,
      targetFile: r.target_file,
      provider: r.provider,
      status: r.status,
      progress: r.progress,
      currentStep: r.current_step,
      totalCues: r.total_cues,
      processedCues: r.processed_cues,
      error: r.error,
      createdAt: r.created_at,
      completedAt: r.completed_at
    }));
  }

  /**
   * Get jobs for a specific media item
   */
  getJobsForMedia(mediaType, mediaId) {
    return db.prepare(`
      SELECT * FROM subtitle_jobs 
      WHERE media_type = ? AND media_id = ?
      ORDER BY created_at DESC
    `).all(mediaType, mediaId).map(r => ({
      id: r.id,
      mediaType: r.media_type,
      mediaId: r.media_id,
      title: r.title,
      sourceLang: r.source_lang,
      targetLang: r.target_lang,
      sourceFile: r.source_file,
      targetFile: r.target_file,
      provider: r.provider,
      status: r.status,
      progress: r.progress,
      currentStep: r.current_step,
      totalCues: r.total_cues,
      processedCues: r.processed_cues,
      error: r.error,
      createdAt: r.created_at,
      completedAt: r.completed_at
    }));
  }
}

const queue = new SubtitleTranslationQueue();
module.exports = queue;
