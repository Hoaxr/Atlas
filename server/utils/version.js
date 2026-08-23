const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let cachedVersion = null;
let lastCheck = 0;

function getVersionInfo() {
  const now = Date.now();
  // Cache for 10 seconds in dev / prod so we don't spam execSync
  if (cachedVersion && (now - lastCheck < 10000)) {
    return cachedVersion;
  }

  const rootDir = path.resolve(__dirname, '../..');
  let commit = 'dev';
  let fullCommit = '';
  let branch = 'main';
  let date = new Date().toISOString().split('T')[0];
  let message = '';
  let commitCount = 0;
  let version = '1.0.0';

  // 1. Try reading from version.json first if exists
  const versionJsonPath = path.join(__dirname, '../version.json');
  if (fs.existsSync(versionJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
      if (data.commit) commit = data.commit;
      if (data.fullCommit) fullCommit = data.fullCommit;
      if (data.branch) branch = data.branch;
      if (data.date) date = data.date;
      if (data.message) message = data.message;
      if (data.commitCount) commitCount = data.commitCount;
      if (data.version) version = data.version;
    } catch {
      // ignore
    }
  }

  // 2. Try git command if available to get absolute latest
  try {
    const gitCommit = execSync('git rev-parse --short HEAD', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    if (gitCommit) {
      commit = gitCommit;
      fullCommit = execSync('git rev-parse HEAD', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
      branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
      date = execSync('git log -1 --format=%cd --date=short', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
      message = execSync('git log -1 --format=%s', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
      commitCount = parseInt(execSync('git rev-list --count HEAD', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim(), 10) || 0;
    }
  } catch {
    // If git not available, env vars fallback
    if (process.env.GIT_COMMIT) {
      commit = process.env.GIT_COMMIT.slice(0, 7);
      fullCommit = process.env.GIT_COMMIT;
    }
    if (process.env.GIT_BRANCH) {
      branch = process.env.GIT_BRANCH;
    }
  }

  cachedVersion = {
    version,
    commit,
    fullCommit,
    branch,
    date,
    message,
    commitCount,
    repoUrl: 'https://github.com/Hoaxr/Atlas'
  };
  lastCheck = now;

  return cachedVersion;
}

module.exports = {
  getVersionInfo
};
