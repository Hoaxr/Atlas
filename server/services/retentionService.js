const cron = require('node-cron');
const db = require('../config/database');
const taskRegistry = require('./taskRegistry');
const { registerJob } = require('../utils/cronRegistry');

// Retention windows in days
const WINDOWS = [
  { table: 'logs', column: 'created_at', days: 30 },
  { table: 'play_history', column: 'created_at', days: 90 },
  { table: 'indexer_stats', column: 'created_at', days: 90 }
];

const pruneOldRows = () => {
  for (const { table, column, days } of WINDOWS) {
    try {
      const result = db.prepare(
        `DELETE FROM ${table} WHERE ${column} < datetime('now', ?)`
      ).run(`-${days} days`);
      if (result.changes > 0) {
        console.log(`[Retention] Pruned ${result.changes} row(s) older than ${days}d from ${table}`);
      }
    } catch (err) {
      console.error(`[Retention] Failed to prune ${table}:`, err.message);
    }
  }
};

const init = () => {
  const cronExp = '30 4 * * *'; // Daily at 4:30 AM
  taskRegistry.registerTask(
    'retention_prune',
    'Data Retention Pruning',
    'Deletes old logs, play history, and indexer stats past their retention windows.',
    cronExp,
    pruneOldRows
  );

  const job = cron.schedule(cronExp, () => taskRegistry.executeTask('retention_prune'));
  registerJob(job);
};

module.exports = {
  init,
  pruneOldRows
};
