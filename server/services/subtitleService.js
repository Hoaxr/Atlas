const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');
const db = require('../config/database');
const taskRegistry = require('./taskRegistry');

const downloadSubtitlesForMovies = async () => {
  const osApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'osApiKey'").get();
  if (!osApiKeyRow || !osApiKeyRow.value) {
    throw new Error('OpenSubtitles API Key missing. Please set it in Settings.');
  }
  
  const osApiKey = osApiKeyRow.value;

  // Find movies that are downloaded but don't have an English subtitle file yet
  const movies = db.prepare("SELECT * FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();

  for (const movie of movies) {
    try {
      if (!fs.existsSync(movie.file_path)) continue;

      const parsedPath = path.parse(movie.file_path);
      const enSubPath = path.join(parsedPath.dir, `${parsedPath.name}.en.srt`);

      // Skip if subtitle already exists
      if (fs.existsSync(enSubPath)) continue;

      console.log(`[SubtitleService] Searching for subtitles for: ${movie.title}`);

      // 1. Search OpenSubtitles by TMDB ID
      const searchRes = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
        headers: {
          'Api-Key': osApiKey,
          'Content-Type': 'application/json'
        },
        params: {
          tmdb_id: movie.tmdb_id,
          languages: 'en'
        }
      });

      const data = searchRes.data.data;
      if (data && data.length > 0) {
        const fileId = data[0].attributes.files[0].file_id;

        // 2. Request download link
        const downloadRes = await axios.post('https://api.opensubtitles.com/api/v1/download', 
          { file_id: fileId },
          {
            headers: {
              'Api-Key': osApiKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          }
        );

        const downloadLink = downloadRes.data.link;

        // 3. Download the actual file
        const srtRes = await axios.get(downloadLink, { responseType: 'text' });
        
        fs.writeFileSync(enSubPath, srtRes.data);
        console.log(`[SubtitleService] Saved English subtitle to ${enSubPath}`);
      } else {
        console.log(`[SubtitleService] No English subtitles found for ${movie.title}`);
      }

    } catch (err) {
      console.error(`[SubtitleService] Failed to get subtitle for ${movie.title}:`, err.message);
    }
  }
};

const init = () => {
  const cronExp = '0 */6 * * *'; // Every 6 hours
  
  taskRegistry.registerTask(
    'subtitle_downloader', 
    'Subtitle Downloader', 
    'Searches and downloads English subtitles for all downloaded movies.',
    cronExp,
    downloadSubtitlesForMovies
  );

  cron.schedule(cronExp, () => taskRegistry.executeTask('subtitle_downloader'));
  console.log('[SubtitleService] Scheduler initialized.');
};

module.exports = {
  init,
  downloadSubtitlesForMovies
};
