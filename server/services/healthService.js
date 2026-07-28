const cron = require('node-cron');
const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fsp = require('fs/promises');
const fs = require('fs');
const db = require('../config/database');
const taskRegistry = require('./taskRegistry');
const { registerJob } = require('../utils/cronRegistry');
const eventBus = require('./eventBus');
const { isVideoFile } = require('../utils/fileUtils');
const { runWithConcurrency } = require('../utils/concurrency');

const execPromise = util.promisify(exec);

const checkFileIntegrity = async (filePath) => {
  try {
    // ffprobe checks for stream info and format. If it's a corrupt/empty file, it fails.
    const { stdout, stderr } = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
    return stdout.trim().length > 0;
  } catch (err) {
    console.error(`[HealthCheck] ffprobe failed for ${filePath}: ${err.message}`);
    return false; // Corrupt or unreadable
  }
};

const processMediaItem = async (type, item) => {
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

  const isHealthy = await checkFileIntegrity(item.file_path);
  
  if (!isHealthy) {
    eventBus.error(`[HealthCheck] Corrupt file detected for ${type} ${item.id}. Deleting and re-queuing.`);
    try {
      await fsp.unlink(item.file_path);
    } catch (err) {
      console.error(`Failed to delete corrupt file ${item.file_path}:`, err);
    }
    
    const query = type === 'movie'
      ? "UPDATE movies SET status = 'monitored', file_path = NULL, search_state = 'PENDING', retry_count = 0, next_search_at = datetime('now') WHERE id = ?"
      : "UPDATE episodes SET status = 'monitored', file_path = NULL, search_state = 'PENDING', retry_count = 0, next_search_at = datetime('now') WHERE id = ?";
    db.prepare(query).run(item.id);
  }
};

const runHealthCheck = async () => {
  console.log('[HealthCheck] Starting media health check...');
  
  const movies = db.prepare("SELECT id, status, file_path FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
  await runWithConcurrency(movies, 2, (movie) => processMediaItem('movie', movie));

  const episodes = db.prepare("SELECT id, status, file_path FROM episodes WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
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
