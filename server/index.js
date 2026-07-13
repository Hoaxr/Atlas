require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const apiRoutes = require('./routes/api');
const settingsRoutes = require('./routes/settings');
const tmdbRoutes = require('./routes/tmdb');
const traktRoutes = require('./routes/trakt');
const libraryRoutes = require('./routes/library/index');
const tasksRoutes = require('./routes/tasks');
const clientsRoutes = require('./routes/clients');
const authRoutes = require('./routes/auth');
const releaseProfilesRoutes = require('./routes/releaseProfiles');
const usersRoutes = require('./routes/users');
const requestsRoutes = require('./routes/requests');
const watcherRoutes = require('./routes/watcher');
const watcherService = require('./services/watcherService');
const { stopAll: stopAllCronJobs } = require('./utils/cronRegistry');
const { LAYOUT_PUSH_INTERVAL, TORRENTS_PUSH_INTERVAL } = require('./utils/constants');

const errorHandler = require('./middleware/errorHandler');
const eventBus = require('./services/eventBus');
const presenceTracker = require('./services/presenceTracker');

// Services
const automationService = require('./services/automationService');
const mediaManagementService = require('./services/mediaManagementService');
const subtitleService = require('./services/subtitles');
const aiTranslationWorker = require('./services/aiTranslationWorker');
const notificationService = require('./services/notificationService');
const imageService = require('./services/imageService');



const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  let authenticated = false;

  let onEvent = null;

  // Handle incoming messages (for auth)
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'auth' && !authenticated) {
        authenticated = presenceTracker.handleAuthMessage(ws, msg);
        if (authenticated) {
          console.log(`[WS] User ${ws._username} authenticated`);
          
          onEvent = (data) => {
            try {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify(data));
              }
            } catch { /* ignore */ }
          };
          eventBus.on('event', onEvent);
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
subtitleService.init();
aiTranslationWorker.init();
// Notification and Media Server services auto-init in constructor

// ── Layout push broadcast — replaces client-side 3s polling ──
// Sends stats, torrents, issues, and pending request count to all
// authenticated clients every 3 seconds via WebSocket.
const broadcastLayoutUpdate = () => {
  if (wss.clients.size === 0) return;
  try {
    const db = require('./config/database');
    const downloadClientService = require('./services/downloadClientService');

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
  } catch { /* ignore */ }
};

// Broadcast torrent data + download stats (heavier — separate interval at 5s)
let _cachedTorrents = [];
let _cachedClientStats = { dl_info_speed: 0, up_info_speed: 0 };
let _clientConnected = false;

const broadcastTorrentsUpdate = async () => {
  if (wss.clients.size === 0) return;
  try {
    const downloadClientService = require('./services/downloadClientService');
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

setInterval(broadcastLayoutUpdate, LAYOUT_PUSH_INTERVAL);
setInterval(broadcastTorrentsUpdate, TORRENTS_PUSH_INTERVAL);
setTimeout(broadcastTorrentsUpdate, 1000);

app.use(compression());
app.use(helmet({
  hsts: false,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://image.tmdb.org"],
      fontSrc: ["'self'", "data:"],
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
app.use(express.json({ limit: '5mb' }));

const authMiddleware = require('./middleware/authMiddleware');

// Routes
// Apply auth middleware to all /api routes except /api/auth
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth') || req.path.startsWith('/watcher/image') || req.path.startsWith('/images')) {
    return next();
  }
  return authMiddleware(req, res, next);
});

app.use('/api', apiRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/tmdb', tmdbRoutes);
app.use('/api/trakt', traktRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/release-profiles', releaseProfilesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/watcher', watcherRoutes);

// ── Image cache — served without auth (public static-like endpoint) ──────────
// GET /api/images/:type/:tmdbId/poster
// type = 'movies' | 'shows'
app.get('/api/images/:type/:tmdbId/poster', async (req, res) => {
  const { type, tmdbId } = req.params;
  if (!['movies', 'shows'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

  const fs   = require('fs');
  const db   = require('./config/database');
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
  
  // Stop all cron jobs to prevent new task executions
  stopAllCronJobs();
  
  // Stop the watcher polling
  watcherService.stopPolling();
  
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
  notificationService.sendNotification('Atlas', 'Atlas Media Manager has started successfully.', { title: '' });
});
