require('dotenv').config();

// ── Kill any orphaned ffprobe processes from previous runs ──
try {
  require('child_process').execSync('killall ffprobe 2>/dev/null || true', { timeout: 2000 });
} catch { /* ignore */ }

// ── Fail fast if JWT_SECRET is missing — must happen before any module load ──
if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}

const express = require('express');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const db = require('./config/database');
const apiRoutes = require('./routes/api');
const settingsRoutes = require('./routes/settings');
const tmdbRoutes = require('./routes/tmdb');
const simklRoutes = require('./routes/simkl');
const libraryRoutes = require('./routes/library/index');
const tasksRoutes = require('./routes/tasks');
const clientsRoutes = require('./routes/clients');
const authRoutes = require('./routes/auth');
const releaseProfilesRoutes = require('./routes/releaseProfiles');
const usersRoutes = require('./routes/users');
const requestsRoutes = require('./routes/requests');
const webhooksRoutes = require('./routes/webhooks');
const watcherRoutes = require('./routes/watcher');
const watcherService = require('./services/watcherService');
const { stopAll: stopAllCronJobs } = require('./utils/cronRegistry');
const { LAYOUT_PUSH_INTERVAL, TORRENTS_PUSH_INTERVAL } = require('./utils/constants');
const downloadClientService = require('./services/downloadClientService');

const errorHandler = require('./middleware/errorHandler');
const eventBus = require('./services/eventBus');
const presenceTracker = require('./services/presenceTracker');
const { getSetting } = require('./utils/settings');
const fs = require('fs');
const authMiddleware = require('./middleware/authMiddleware');
const requireAdmin = require('./middleware/requireAdmin');
const { stopScan } = require('./services/scanner');

// Services
const automationService = require('./services/automationService');
const mediaManagementService = require('./services/mediaManagementService');
const subtitleService = require('./services/subtitles');
const aiTranslationWorker = require('./services/aiTranslationWorker');
const notificationService = require('./services/notificationService');
const telegramBotService = require('./services/telegramBotService');
const imageService = require('./services/imageService');
const healthService = require('./services/healthService');
const cleanupWorker = require('./services/cleanupWorker');



const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  console.log('[WS] Client connected');
  let authenticated = false;
  let onEvent = null;

  const setupAuth = () => {
    authenticated = true;
    // If no _userId was set by presenceTracker (bypass path), resolve the admin user from DB
    if (!ws._userId) {
      const adminRow = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1").get();
      ws._userId = adminRow ? adminRow.id : 1;
    }
    console.log(`[WS] User ${ws._username || ws._userId} authenticated`);
    
    onEvent = (data) => {
      try {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify(data));
        }
      } catch { /* ignore */ }
    };
    eventBus.on('event', onEvent);
  };

  try {
    const authEnabled = getSetting('authEnabled') !== 'false';
    if (!authEnabled) {
      setupAuth();
    }
  } catch (err) {
    console.error('[WS] Error checking auth enabled status:', err.message);
  }

  // Handle incoming messages (for auth)
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'auth' && !authenticated) {
        authenticated = presenceTracker.handleAuthMessage(ws, msg);
        if (authenticated) {
          setupAuth();
        }
      }
    } catch { /* ignore */ }
  });

  ws.on('close', () => {
    if (ws._userId) {
      presenceTracker.removeConnection(ws._userId, ws);
      console.log(`[WS] User ${ws._username || ws._userId} disconnected`);
    }
    if (onEvent) eventBus.off('event', onEvent);
  });

  ws.on('error', () => {
    if (ws._userId) {
      presenceTracker.removeConnection(ws._userId, ws);
    }
    if (onEvent) eventBus.off('event', onEvent);
  });
});

// Init background jobs
automationService.init();
mediaManagementService.init();
healthService.init();
subtitleService.init();
aiTranslationWorker.init();
telegramBotService.init();
// Notification and Media Server services auto-init in constructor

// ── Layout push broadcast — replaces client-side 3s polling ──
// Sends stats, torrents, issues, and pending request count to all
// authenticated clients every 3 seconds via WebSocket.
const broadcastLayoutUpdate = () => {
  if (wss.clients.size === 0) return;
  try {
    // Lightweight stats (just counts, no heavy aggregation)
    const moviesCount = db.prepare('SELECT COUNT(*) as c FROM movies').get().c;
    const showsCount  = db.prepare('SELECT COUNT(*) as c FROM shows').get().c;
    const pendingCount = db.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'pending'").get().c;

    const payload = {
      type: 'LAYOUT_UPDATE',
      data: {
        movies: moviesCount,
        shows: showsCount,
        pendingRequests: pendingCount,
        // torrents + client stats + issues are async — only include if we have fresh data
      }
    };

    const msg = JSON.stringify(payload);
    wss.clients.forEach((ws) => {
      if (ws.readyState === 1 && ws._userId) {
        try { ws.send(msg); } catch { /* ignore */ }
      }
    });
  } catch (err) {
    broadcastLayoutUpdate._errCount = (broadcastLayoutUpdate._errCount || 0) + 1;
    if (broadcastLayoutUpdate._errCount % 10 === 1) {
      console.warn('[Layout] broadcastLayoutUpdate error (suppressed):', err?.message);
    }
  }
};

// Broadcast torrent data + download stats (heavier — separate interval at 5s)
let _cachedTorrents = [];
let _cachedClientStats = { dl_info_speed: 0, up_info_speed: 0 };
let _clientConnected = false;

const broadcastTorrentsUpdate = async () => {
  if (wss.clients.size === 0) return;
  try {
    const [torrents, stats] = await Promise.allSettled([
      downloadClientService.getTorrents().catch(() => []),
      downloadClientService.getTransferInfo().catch(() => null)
    ]);
    
    _cachedTorrents = torrents.status === 'fulfilled' ? torrents.value : [];
    _cachedClientStats = (stats.status === 'fulfilled' && stats.value) ? stats.value : _cachedClientStats;
    _clientConnected = stats.status === 'fulfilled' && stats.value !== null;

    const payload = {
      type: 'TORRENTS_UPDATE',
      data: {
        torrents: _cachedTorrents,
        clientStats: _cachedClientStats,
        clientConnected: _clientConnected,
      }
    };

    const msg = JSON.stringify(payload);
    wss.clients.forEach((ws) => {
      if (ws.readyState === 1 && ws._userId) {
        try { ws.send(msg); } catch { /* ignore */ }
      }
    });
  } catch { /* ignore */ }
};

const startPolling = (fn, interval) => {
  const poll = async () => {
    try {
      if (wss.clients.size > 0) {
        await fn();
      }
    } catch { /* ignore */ }
    setTimeout(poll, wss.clients.size > 0 ? interval : 10000);
  };
  setTimeout(poll, interval);
};

// Event-driven broadcast triggers on library/request updates
eventBus.on('event', (data) => {
  if (['MOVIE_ADDED', 'SHOW_ADDED', 'REQUEST_CREATED', 'REQUEST_UPDATED'].includes(data.type)) {
    broadcastLayoutUpdate();
  }
});

startPolling(broadcastLayoutUpdate, LAYOUT_PUSH_INTERVAL);
startPolling(broadcastTorrentsUpdate, TORRENTS_PUSH_INTERVAL);
setTimeout(broadcastTorrentsUpdate, 1000);

app.use(compression());
app.use(helmet({
  hsts: false,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https://image.tmdb.org"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "ws:", "wss:"],
      manifestSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://youtube.com"],
      objectSrc: ["'none'"],
    },
  },
}));
app.use(morgan('dev', {
  skip: (req, res) => {
    const ignoredPaths = [
      '/api/settings/clients/test',
      '/api/library/stats',
      '/api/clients/torrents',
      '/api/settings/issues',
      '/api/clients/stats',
      '/api/library/scan/progress'
    ];
    return ignoredPaths.includes(req.originalUrl);
  }
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  credentials: true
}));
app.use(express.json({ limit: '500kb' }));


// Routes
// Apply auth middleware to all /api routes except /api/auth
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth') || req.path.startsWith('/watcher/image') || req.path.startsWith('/images')) {
    return next();
  }
  return authMiddleware(req, res, next);
});

app.use('/api', apiRoutes);

// Safe routes wrapper for settings (only GET /api/settings is safe)
const settingsAdminWrapper = (req, res, next) => {
  if (req.method === 'GET' && req.path === '/') return next();
  return requireAdmin(req, res, next);
};

// Safe routes wrapper for library (only GET is safe for users)
const libraryAdminWrapper = (req, res, next) => {
  if (req.method === 'GET') return next();
  return requireAdmin(req, res, next);
};

// Safe routes wrapper for watcher (only /image is safe, but it's handled above; others are admin)
// Wait, /stats and /sessions are admin only.
const watcherAdminWrapper = (req, res, next) => {
  if (req.path.startsWith('/image')) return next();
  return requireAdmin(req, res, next);
};

app.use('/api/settings', settingsAdminWrapper, settingsRoutes);
app.use('/api/tmdb', tmdbRoutes); // TMDB search/details can be used by any user
app.use('/api/simkl', simklRoutes);
app.use('/api/library', libraryAdminWrapper, libraryRoutes);
app.use('/api/tasks', requireAdmin, tasksRoutes);
app.use('/api/clients', requireAdmin, clientsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/release-profiles', requireAdmin, releaseProfilesRoutes);
app.use('/api/users', usersRoutes); // internally protected
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/requests', requestsRoutes); // internally protected
app.use('/api/watcher', watcherAdminWrapper, watcherRoutes);

// ── Image cache — served without auth (public static-like endpoint) ──────────
// GET /api/images/:type/:tmdbId/poster
// type = 'movies' | 'shows'
app.get('/api/images/:type/:tmdbId/poster', async (req, res) => {
  const { type, tmdbId } = req.params;
  if (!['movies', 'shows'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  // Validate tmdbId is numeric to prevent path traversal via path.join (#2)
  if (!/^\d+$/.test(tmdbId)) return res.status(400).json({ error: 'Invalid tmdbId' });

  const dest = imageService.posterPath(type, tmdbId);

  // Serve from cache if it exists
  if (fs.existsSync(dest)) {
    return res.sendFile(dest, { headers: { 'Cache-Control': 'public, max-age=604800, immutable' } });
  }

  // Cache miss — look up poster_path from DB and download
  try {
    const table      = type === 'movies' ? 'movies' : 'shows';
    const row        = db.prepare(`SELECT poster_path FROM ${table} WHERE tmdb_id = ?`).get(tmdbId);
    const tmdbPath   = row?.poster_path;
    const cachedPath = await imageService.ensurePoster(type, tmdbId, tmdbPath);

    if (!cachedPath || !fs.existsSync(cachedPath)) {
      return res.status(404).json({ error: 'No poster available' });
    }

    return res.sendFile(cachedPath, { headers: { 'Cache-Control': 'public, max-age=604800, immutable' } });
  } catch (err) {
    console.error('[ImageRoute] Failed to serve poster:', err.message);
    return res.status(500).json({ error: 'Failed to fetch poster' });
  }
});

// ---- Production: serve the built client ----
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
  });
}

app.use(errorHandler);

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`[Backend] ${signal} received — shutting down...`);
  
  // Cancel any running library scan
  try {
    stopScan();
    console.log('[Backend] Library scan cancelled.');
  } catch { /* ignore */ }
  
  // Stop all cron jobs to prevent new task executions
  stopAllCronJobs();
  
  // Stop the watcher polling
  watcherService.stopPolling();
  cleanupWorker.stop();
  
  // Close HTTP server (stops accepting new connections)
  server.close(() => {
    console.log('[Backend] HTTP server closed.');
    
    // Close database connection
    try {
      const db = require('./config/database');
      db.close();
      console.log('[Backend] Database closed.');
    } catch { /* ignore */ }
    
    process.exit(0);
  });
  
  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => {
    console.error('[Backend] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, () => {
  console.log(`[Backend] Server op poort ${PORT}`);
  cleanupWorker.start();
  notificationService.sendNotification('Atlas', 'Atlas Media Manager has started successfully.', { title: '' });
});
