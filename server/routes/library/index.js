const express = require('express');
const router = express.Router();

const moviesRouter = require('./movies');
const showsEpisodesRouter = require('./showsEpisodes');
const systemRouter = require('./system');

// Movie routes under /movies
router.use('/movies', moviesRouter);

// Show + episode routes (both prefixed appropriately in the router)
router.use('/', showsEpisodesRouter);

// System routes: paths, scan, bulk, duplicates, calendar, downloads, stats
router.use('/', systemRouter);

module.exports = router;
