require('dotenv').config();
const express = require('express');
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
const errorHandler = require('./middleware/errorHandler');

// Services
const automationService = require('./services/automationService');
const mediaManagementService = require('./services/mediaManagementService');
const subtitleService = require('./services/subtitleService');
const aiTranslationWorker = require('./services/aiTranslationWorker');

const app = express();
const PORT = process.env.PORT || 3000;

// Init background jobs
automationService.init();
mediaManagementService.init();
subtitleService.init();
aiTranslationWorker.init();

app.use(helmet());
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', apiRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/tmdb', tmdbRoutes);
app.use('/api/trakt', traktRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/clients', clientsRoutes);
app.use(errorHandler);

app.listen(PORT, () => console.log(`[Backend] Server op poort ${PORT}`));
