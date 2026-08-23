const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function getGitVersion() {
  let commit = 'dev';
  let fullCommit = '';
  let branch = 'main';
  let date = new Date().toISOString().split('T')[0];
  let message = '';
  let commitCount = 0;

  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    fullCommit = execSync('git rev-parse HEAD', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    date = execSync('git log -1 --format=%cd --date=short', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    message = execSync('git log -1 --format=%s', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    commitCount = parseInt(execSync('git rev-list --count HEAD', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim(), 10) || 0;
  } catch (e) {
    if (process.env.GIT_COMMIT) {
      commit = process.env.GIT_COMMIT.slice(0, 7);
      fullCommit = process.env.GIT_COMMIT;
    }
    if (process.env.GIT_BRANCH) {
      branch = process.env.GIT_BRANCH;
    }
  }

  let version = '1.0.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    if (pkg.version) version = pkg.version;
  } catch {
    // ignore
  }

  return {
    version,
    commit,
    fullCommit,
    branch,
    date,
    message,
    commitCount,
    repoUrl: 'https://github.com/Hoaxr/Atlas',
    buildTime: new Date().toISOString()
  };
}

function writeVersionFiles() {
  const info = getGitVersion();
  const content = JSON.stringify(info, null, 2);

  const clientDir = path.join(rootDir, 'client', 'src');
  const serverDir = path.join(rootDir, 'server');

  try {
    if (fs.existsSync(clientDir)) {
      fs.writeFileSync(path.join(clientDir, 'version.json'), content);
    }
    if (fs.existsSync(serverDir)) {
      fs.writeFileSync(path.join(serverDir, 'version.json'), content);
    }
    console.log(`[version] Generated version info: ${info.branch}@${info.commit} (${info.date})`);
  } catch (err) {
    console.error('[version] Failed to write version files:', err.message);
  }

  return info;
}

if (require.main === module) {
  writeVersionFiles();
}

module.exports = {
  getGitVersion,
  writeVersionFiles
};
