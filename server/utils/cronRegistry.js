/**
 * Central registry for all node-cron scheduled jobs.
 * Allows graceful shutdown by stopping all jobs.
 */
const jobs = [];

const registerJob = (job) => {
  jobs.push(job);
  return job;
};

const stopAll = () => {
  console.log(`[CronRegistry] Stopping ${jobs.length} scheduled job(s)...`);
  for (const job of jobs) {
    try { job.stop(); } catch { /* ignore */ }
  }
  jobs.length = 0;
};

module.exports = { registerJob, stopAll };
