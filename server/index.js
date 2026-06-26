require('dotenv').config();
const express = require('express');
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
const libraryRoutes = require('./routes/library');
const tasksRoutes = require('./routes/tasks');
const clientsRoutes = require('./routes/clients');
const authRoutes = require('./routes/auth');
const errorHandler = require('./middleware/errorHandler');
const eventBus = require('./services/eventBus');

// Services
const automationService = require('./services/automationService');
const mediaManagementService = require('./services/mediaManagementService');
const subtitleService = require('./services/subtitleService');
const aiTranslationWorker = require('./services/aiTranslationWorker');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');

  const onEvent = (data) => {
    try {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(data));
      }
    } catch {}
  };

  eventBus.on('event', onEvent);

  ws.on('close', () => {
    eventBus.off('event', onEvent);
  });

  ws.on('error', () => {
    eventBus.off('event', onEvent);
  });
});

// Init background jobs
automationService.init();
mediaManagementService.init();
subtitleService.init();
aiTranslationWorker.init();

app.use(compression());
app.use(helmet());
app.use(morgan('dev'));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));

// Routes
app.use('/api', apiRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/tmdb', tmdbRoutes);
app.use('/api/trakt', traktRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/auth', authRoutes);
app.use(errorHandler);

server.listen(PORT, () => console.log(`[Backend] Server op poort ${PORT}`));
