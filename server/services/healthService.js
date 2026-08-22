const cron = require('node-cron');
const { execFile } = require('child_process');
const util = require('util');
const fsp = require('fs/promises');
const fs = require('fs');
const db = require('../config/database');
const taskRegistry = require('./taskRegistry');
const { registerJob } = require('../utils/cronRegistry');
const eventBus = require('./eventBus');
const { runWithConcurrency } = require('../utils/concurrency');

const execFilePromise = util.promisify(execFile);

// Cap on automatic corrupt-redownload cycles per item — prevents endless delete/redownload loops.
const MAX_HEALTH_RETRIES = 5;

// Set when ffprobe itself is unusable; aborts the remainder of the current run.
let integrityRunAborted = false;

// Thrown when the ffprobe binary is missing/unusable — distinct from a corrupt media file.
class ProbeUnavailableError extends Error {}

const checkFileIntegrity = async (filePath) => {
  try {
    // ffprobe checks for stream info and format. If it's a corrupt/empty file, it fails.
    const { stdout } = await execFilePromise('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);
    return stdout.trim().length > 0;
  } catch (err) {
    // String error codes (ENOENT/EACCES) mean the binary couldn't spawn; numeric codes are
    // ffprobe exit codes for files it actually probed and judged invalid.
    if (typeof err.code === 'string') {
      throw new ProbeUnavailableError(`ffprobe is missing or not executable (${err.code})`);
    }
    console.error(`[HealthCheck] ffprobe failed for ${filePath}: ${err.message}`);
    return false; // Probed successfully but reported invalid data
  }
};

const processMediaItem = async (type, item) => {
  if (integrityRunAborted) return;

  if (!item.file_path || !fs.existsSync(item.file_path)) {
    // If it says downloaded but file doesn't exist, mark it as missing
    if (item.status === 'downloaded') {
      const query = type === 'movie'
        ? "UPDATE movies SET status = 'monitored', file_path = NULL, search_state = 'PENDING', next_search_at = datetime('now') WHERE id = ?"
        : "UPDATE episodes SET status = 'monitored', file_path = NULL, search_state = 'PENDING', next_search_at = datetime('now') WHERE id = ?";
      db.prepare(query).run(item.id);
      eventBus.warn(`File missing for ${type} ${item.id}, reverting to monitored.`);
    }
    return;
  }

  let isHealthy;
  try {
    isHealthy = await checkFileIntegrity(item.file_path);
  } catch (err) {
    console.error(`[HealthCheck] ${err.message}. Aborting integrity run — no further files will be checked or deleted.`);
    eventBus.error('ffprobe unavailable — media health check aborted. No files were modified.');
    integrityRunAborted = true;
    return;
  }

  if (!isHealthy) {
    // Skip auto-delete once an item has burned through its redownload attempts
    if ((item.retry_count || 0) >= MAX_HEALTH_RETRIES) {
      console.warn(`[HealthCheck] ${type} ${item.id} still corrupt after ${item.retry_count} redownload attempts — skipping.`);
      return;
    }
    const newRetryCount = (item.retry_count || 0) + 1;
    eventBus.error(`[HealthCheck] Corrupt file detected for ${type} ${item.id}. Deleting and re-queuing (attempt ${newRetryCount}/${MAX_HEALTH_RETRIES}).`);
    try {
      await fsp.unlink(item.file_path);
    } catch (err) {
      console.error(`Failed to delete corrupt file ${item.file_path}:`, err);
    }

    const query = type === 'movie'
      ? "UPDATE movies SET status = 'monitored', file_path = NULL, search_state = 'PENDING', retry_count = ?, next_search_at = datetime('now') WHERE id = ?"
      : "UPDATE episodes SET status = 'monitored', file_path = NULL, search_state = 'PENDING', retry_count = ?, next_search_at = datetime('now') WHERE id = ?";
    db.prepare(query).run(newRetryCount, item.id);
  }
};

const runHealthCheck = async () => {
  console.log('[HealthCheck] Starting media health check...');
  integrityRunAborted = false;

  const movies = db.prepare("SELECT id, status, file_path, retry_count FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
  await runWithConcurrency(movies, 2, (movie) => processMediaItem('movie', movie));

  const episodes = db.prepare("SELECT id, status, file_path, retry_count FROM episodes WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
  await runWithConcurrency(episodes, 2, (ep) => processMediaItem('episode', ep));

  console.log('[HealthCheck] Media health check completed.');
};

const init = () => {
  const cronExp = '0 6 * * *'; // Default 6 AM daily
  taskRegistry.registerTask(
    'media_health_check',
    'Self-Healing Library Check',
    'Uses ffprobe to scan library files for corruption and automatically queues replacements.',
    cronExp,
    runHealthCheck
  );

  const job = cron.schedule(cronExp, () => taskRegistry.executeTask('media_health_check'));
  registerJob(job);
};

module.exports = {
  init,
  runHealthCheck
};
