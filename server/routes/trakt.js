const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const traktService = require('../services/traktService');
const authMiddleware = require('../middleware/authMiddleware');

// Configure multer to save to temp dir
const upload = multer({ dest: path.join(__dirname, '../temp') });

router.post('/import', authMiddleware, upload.array('files'), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  try {
    let totalMovies = 0;
    let totalEpisodes = 0;

    for (const file of req.files) {
      const filePath = file.path;
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      let jsonData;
      try {
        jsonData = JSON.parse(fileContent);
      } catch {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: `Invalid JSON file: ${file.originalname}` });
      }

      const result = await traktService.importTraktJson(jsonData);
      totalMovies += result.movies || 0;
      totalEpisodes += result.episodes || 0;

      // Clean up file
      fs.unlinkSync(filePath);
    }

    res.json({ success: true, message: `Successfully imported ${totalMovies} movies and ${totalEpisodes} episodes` });
    
    // Push to Simkl in background so Simkl also gets the Trakt data
    if (totalMovies > 0 || totalEpisodes > 0) {
      const simklService = require('../services/simklService');
      simklService.pushWatchedToSimkl().catch(e => 
        console.error('[TraktImport] Failed to push to Simkl:', e.message)
      );
    }
  } catch (error) {
    console.error('Failed to import Trakt files:', error);
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      });
    }
    res.status(500).json({ error: 'Internal server error during import' });
  }
});

module.exports = router;
