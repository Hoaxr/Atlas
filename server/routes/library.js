const express = require('express');
const router = express.Router();
const libraryService = require('../services/libraryService');
const scannerService = require('../services/scannerService');

// Stats
router.get('/stats', (req, res, next) => {
  try {
    const db = require('../config/database');
    const moviesCount = db.prepare('SELECT count(*) as count FROM movies').get().count;
    const showsCount = db.prepare('SELECT count(*) as count FROM shows').get().count;
    res.json({ status: 'success', data: { movies: moviesCount, shows: showsCount } });
  } catch (error) {
    next(error);
  }
});

// Movies
router.get('/movies', (req, res, next) => {
  try {
    const movies = libraryService.getMovies();
    res.json({ status: 'success', data: movies });
  } catch (error) {
    next(error);
  }
});

router.get('/movies/:id', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const fs = require('fs/promises');
    const path = require('path');
    const movie = db.prepare('SELECT m.*, qp.name as quality_profile_name FROM movies m LEFT JOIN quality_profiles qp ON m.quality_profile_id = qp.id WHERE m.id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });
    
    let subtitles = [];
    if (movie.file_path) {
      try {
        const dir = path.dirname(movie.file_path);
        const files = await fs.readdir(dir);
        subtitles = files.filter(f => f.endsWith('.srt') || f.endsWith('.vtt') || f.endsWith('.sub'));
        const stats = await fs.stat(movie.file_path);
        movie.size = stats.size;
      } catch (err) {
        // Ignore if directory cannot be read
      }
    }
    movie.subtitles = subtitles;

    res.json({ status: 'success', data: movie });
  } catch (err) {
    next(err);
  }
});

router.get('/movies/:id/search', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const indexerService = require('../services/indexerService');
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

    const results = await indexerService.searchMovie(movie.title, movie.year);
    res.json({ status: 'success', data: results });
  } catch (err) {
    next(err);
  }
});

router.post('/movies/:id/reset', async (req, res, next) => {
  try {
    const db = require('../config/database');
    db.prepare("UPDATE movies SET status = 'monitored' WHERE id = ?").run(req.params.id);
    res.json({ status: 'success', message: 'Movie reset to monitored' });
  } catch (err) {
    next(err);
  }
});

router.post('/movies/:id/toggle-monitor', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const movie = db.prepare('SELECT status FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });
    
    const newStatus = movie.status === 'unmonitored' ? 'monitored' : 'unmonitored';
    db.prepare('UPDATE movies SET status = ? WHERE id = ?').run(newStatus, req.params.id);
    
    res.json({ status: 'success', data: { status: newStatus }});
  } catch (err) {
    next(err);
  }
});

router.post('/movies/:id/download', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const downloadClientService = require('../services/downloadClientService');
    const { torrentUrl } = req.body;
    
    await downloadClientService.addTorrent(torrentUrl);
    db.prepare("UPDATE movies SET status = 'downloading' WHERE id = ?").run(req.params.id);
    
    res.json({ status: 'success', message: 'Sent to download client' });
  } catch (err) {
    next(err);
  }
});

router.post('/movies/:id/auto-search', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const indexerService = require('../services/indexerService');
    const downloadClientService = require('../services/downloadClientService');
    
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    if (!movie) return res.status(404).json({ status: 'error', message: 'Movie not found' });

    const results = await indexerService.searchMovie(movie.title, movie.year);
    if (!results || results.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No torrents found for this movie' });
    }

    const bestResult = results[0];
    await downloadClientService.addTorrent(bestResult.link, 'movie');
    db.prepare("UPDATE movies SET status = 'downloading' WHERE id = ?").run(req.params.id);
    
    res.json({ status: 'success', message: 'Best result sent to download client', data: bestResult });
  } catch (err) {
    next(err);
  }
});

router.post('/movies', async (req, res, next) => {
  try {
    const { tmdbId } = req.body;
    if (!tmdbId) {
      return res.status(400).json({ status: 'error', message: 'tmdbId is required' });
    }
    const result = await libraryService.addMovie(tmdbId);
    res.json({ status: 'success', data: result });
  } catch (error) {
    if (error.message === 'Movie already in library') {
      return res.status(409).json({ status: 'error', message: error.message });
    }
    next(error);
  }
});

// Shows
router.get('/shows', (req, res, next) => {
  try {
    const shows = libraryService.getShows();
    res.json({ status: 'success', data: shows });
  } catch (error) {
    next(error);
  }
});

router.get('/shows/:id', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const fs = require('fs/promises');
    const path = require('path');
    
    const show = db.prepare('SELECT s.*, qp.name as quality_profile_name FROM shows s LEFT JOIN quality_profiles qp ON s.quality_profile_id = qp.id WHERE s.id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });
    
    let folderSize = 0;
    if (show.folder_path) {
      try {
        const getFolderSize = async (dir) => {
          let size = 0;
          try {
            const files = await fs.readdir(dir, { withFileTypes: true });
            for (const file of files) {
              const filePath = path.join(dir, file.name);
              try {
                if (file.isDirectory()) {
                  size += await getFolderSize(filePath);
                } else {
                  const stats = await fs.stat(filePath);
                  size += stats.size;
                }
              } catch (e) {
                // Ignore individual file errors
              }
            }
          } catch (e) {
            // Ignore directory read errors
          }
          return size;
        };
        folderSize = await getFolderSize(show.folder_path);
      } catch (err) {
        // Folder might not exist yet or no permissions, ignore
      }
    }
    show.folder_size = folderSize;
    
    res.json({ status: 'success', data: show });
  } catch (err) {
    next(err);
  }
});

router.get('/shows/:id/episodes', (req, res, next) => {
  try {
    const db = require('../config/database');
    const episodes = db.prepare('SELECT * FROM episodes WHERE show_id = ? ORDER BY season_number ASC, episode_number ASC').all(req.params.id);
    res.json({ status: 'success', data: episodes });
  } catch (err) {
    next(err);
  }
});

router.get('/shows/:id/search', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const indexerService = require('../services/indexerService');
    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });

    const results = await indexerService.searchShowPack(show.title);
    res.json({ status: 'success', data: results });
  } catch (err) {
    next(err);
  }
});

router.post('/shows/:id/auto-search', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const indexerService = require('../services/indexerService');
    const downloadClientService = require('../services/downloadClientService');
    
    const show = db.prepare('SELECT * FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });

    // Find all monitored episodes that are missing
    const episodes = db.prepare("SELECT * FROM episodes WHERE show_id = ? AND status = 'monitored'").all(req.params.id);
    
    let sentCount = 0;
    for (const ep of episodes) {
      const results = await indexerService.searchEpisode(show.title, ep.season_number, ep.episode_number);
      if (results && results.length > 0) {
        const bestResult = results.sort((a, b) => b.seeders - a.seeders)[0];
        await downloadClientService.addTorrent(bestResult.link, 'tv');
        db.prepare("UPDATE episodes SET status = 'downloading' WHERE id = ?").run(ep.id);
        sentCount++;
      }
    }
    
    if (sentCount > 0) {
      db.prepare("UPDATE shows SET status = 'downloading' WHERE id = ?").run(req.params.id);
    }
    
    res.json({ status: 'success', message: `Sent ${sentCount} episodes to download client` });
  } catch (err) {
    next(err);
  }
});

router.post('/shows/:id/download', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const downloadClientService = require('../services/downloadClientService');
    const { torrentUrl } = req.body;
    
    await downloadClientService.addTorrent(torrentUrl, 'tv');
    db.prepare("UPDATE shows SET status = 'downloading' WHERE id = ?").run(req.params.id);
    db.prepare("UPDATE episodes SET status = 'downloading' WHERE show_id = ? AND status = 'monitored'").run(req.params.id);
    
    res.json({ status: 'success', message: 'Season pack sent to download client' });
  } catch (err) {
    next(err);
  }
});

router.post('/shows', async (req, res, next) => {
  try {
    const { tmdbId } = req.body;
    if (!tmdbId) {
      return res.status(400).json({ status: 'error', message: 'tmdbId is required' });
    }
    const result = await libraryService.addShow(tmdbId);
    res.json({ status: 'success', data: result });
  } catch (error) {
    if (error.message === 'Show already in library') {
      return res.status(409).json({ status: 'error', message: error.message });
    }
    next(error);
  }
});

router.post('/shows/:id/toggle-monitor', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const show = db.prepare('SELECT status FROM shows WHERE id = ?').get(req.params.id);
    if (!show) return res.status(404).json({ status: 'error', message: 'Show not found' });
    
    const newStatus = show.status === 'unmonitored' ? 'monitored' : 'unmonitored';
    db.prepare('UPDATE shows SET status = ? WHERE id = ?').run(newStatus, req.params.id);
    db.prepare('UPDATE episodes SET status = ? WHERE show_id = ?').run(newStatus, req.params.id);
    
    res.json({ status: 'success', data: { status: newStatus }});
  } catch (err) {
    next(err);
  }
});

router.post('/shows/:id/seasons/:season/toggle-monitor', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const { id, season } = req.params;
    
    const monitoredCount = db.prepare('SELECT count(*) as count FROM episodes WHERE show_id = ? AND season_number = ? AND status != ?').get(id, season, 'unmonitored').count;
    const newStatus = monitoredCount > 0 ? 'unmonitored' : 'monitored';
    
    db.prepare('UPDATE episodes SET status = ? WHERE show_id = ? AND season_number = ?').run(newStatus, id, season);
    
    res.json({ status: 'success', data: { status: newStatus }});
  } catch (err) {
    next(err);
  }
});

router.post('/episodes/:id/toggle-monitor', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const episode = db.prepare('SELECT status FROM episodes WHERE id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });
    
    const newStatus = episode.status === 'unmonitored' ? 'monitored' : 'unmonitored';
    db.prepare('UPDATE episodes SET status = ? WHERE id = ?').run(newStatus, req.params.id);
    
    res.json({ status: 'success', data: { status: newStatus }});
  } catch (err) {
    next(err);
  }
});

// Paths
router.get('/paths', (req, res, next) => {
  try {
    const paths = libraryService.getPaths();
    res.json({ status: 'success', data: paths });
  } catch (error) {
    next(error);
  }
});

router.get('/downloads', async (req, res, next) => {
  try {
    const downloadClientService = require('../services/downloadClientService');
    const torrents = await downloadClientService.getTorrents();
    res.json({ status: 'success', data: torrents });
  } catch (error) {
    next(error);
  }
});

router.post('/paths', (req, res, next) => {
  try {
    const { path } = req.body;
    if (!path) {
      return res.status(400).json({ status: 'error', message: 'path is required' });
    }
    const result = libraryService.addPath(path);
    res.json({ status: 'success', data: result });
  } catch (error) {
    if (error.message === 'Path already exists in library') {
      return res.status(409).json({ status: 'error', message: error.message });
    }
    next(error);
  }
});

router.delete('/paths/:id', (req, res, next) => {
  try {
    libraryService.removePath(req.params.id);
    res.json({ status: 'success' });
  } catch (error) {
    next(error);
  }
});

// Scan
router.post('/scan', async (req, res, next) => {
  try {
    // Ideally this runs asynchronously in the background, but for simplicity we await it or start it and return
    // If scanning takes long, we should return immediately and let it run
    // Let's run it synchronously for simple local libraries, but a real app would dispatch a job
    const result = await scannerService.scanLibrary();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/episodes/:id/search', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const indexerService = require('../services/indexerService');
    const episode = db.prepare('SELECT e.*, s.title as show_title FROM episodes e JOIN shows s ON e.show_id = s.id WHERE e.id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });

    const results = await indexerService.searchEpisode(episode.show_title, episode.season_number, episode.episode_number);
    res.json({ status: 'success', data: results });
  } catch (err) {
    next(err);
  }
});

router.post('/episodes/:id/auto-search', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const indexerService = require('../services/indexerService');
    const downloadClientService = require('../services/downloadClientService');
    
    const episode = db.prepare('SELECT e.*, s.title as show_title FROM episodes e JOIN shows s ON e.show_id = s.id WHERE e.id = ?').get(req.params.id);
    if (!episode) return res.status(404).json({ status: 'error', message: 'Episode not found' });

    const results = await indexerService.searchEpisode(episode.show_title, episode.season_number, episode.episode_number);
    
    if (!results || results.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No torrents found for this episode' });
    }

    // Sort by seeders descending and pick top
    const bestResult = results.sort((a, b) => b.seeders - a.seeders)[0];
    
    await downloadClientService.addTorrent(bestResult.link, 'tv');
    db.prepare("UPDATE episodes SET status = 'downloading' WHERE id = ?").run(req.params.id);
    
    res.json({ status: 'success', message: 'Best result sent to download client', data: bestResult });
  } catch (err) {
    next(err);
  }
});

router.post('/episodes/:id/reset', async (req, res, next) => {
  try {
    const db = require('../config/database');
    db.prepare("UPDATE episodes SET status = 'monitored' WHERE id = ?").run(req.params.id);
    res.json({ status: 'success', message: 'Episode reset to monitored' });
  } catch (err) {
    next(err);
  }
});

router.post('/episodes/:id/download', async (req, res, next) => {
  try {
    const db = require('../config/database');
    const downloadClientService = require('../services/downloadClientService');
    const { torrentUrl } = req.body;
    
    await downloadClientService.addTorrent(torrentUrl, 'tv');
    db.prepare("UPDATE episodes SET status = 'downloading' WHERE id = ?").run(req.params.id);
    
    res.json({ status: 'success', message: 'Sent to download client' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
