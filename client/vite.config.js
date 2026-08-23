import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

let commit = 'dev';
let fullCommit = '';
let branch = 'main';
let date = new Date().toISOString().split('T')[0];
let message = '';
let commitCount = 0;
let version = '1.0.0';

try {
  const versionJsonPath = path.resolve(__dirname, 'src/version.json');
  if (fs.existsSync(versionJsonPath)) {
    const v = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
    commit = v.commit || commit;
    fullCommit = v.fullCommit || fullCommit;
    branch = v.branch || branch;
    date = v.date || date;
    message = v.message || message;
    commitCount = v.commitCount || commitCount;
    version = v.version || version;
  }
} catch {
  // ignore
}

try {
  const gitCommit = execSync('git rev-parse --short HEAD', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
  if (gitCommit) {
    commit = gitCommit;
    fullCommit = execSync('git rev-parse HEAD', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    date = execSync('git log -1 --format=%cd --date=short', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    message = execSync('git log -1 --format=%s', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    commitCount = parseInt(execSync('git rev-list --count HEAD', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim(), 10) || 0;
  }
} catch {
  if (process.env.GIT_COMMIT) {
    commit = process.env.GIT_COMMIT.slice(0, 7);
    fullCommit = process.env.GIT_COMMIT;
  }
  if (process.env.GIT_BRANCH) {
    branch = process.env.GIT_BRANCH;
  }
}

export default defineConfig({
  define: {
    __APP_VERSION_INFO__: JSON.stringify({
      version,
      commit,
      fullCommit,
      branch,
      date,
      message,
      commitCount,
      repoUrl: 'https://github.com/Hoaxr/Atlas',
      buildTime: new Date().toISOString()
    })
  },
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor';
            }
            if (id.includes('axios')) {
              return 'axios';
            }
            if (id.includes('lucide-react')) {
              return 'icons';
            }
          }
        }
      },
    },
  },
});
