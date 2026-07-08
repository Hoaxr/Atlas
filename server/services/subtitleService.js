const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');
const db = require('../config/database');
const taskRegistry = require('./taskRegistry');
const eventBus = require('./eventBus');
const { runWithConcurrency } = require('../utils/concurrency');
const { registerJob } = require('../utils/cronRegistry');
const { translateWithProvider } = require('./aiTranslationWorker');

// ─── Shared subtitle helpers ─────────────────────────────────────────────

const computeMatchScore = (subRelease, sceneName) => {
  if (!subRelease || !sceneName) return 0;
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const subNorm = normalize(subRelease);
  const fileNorm = normalize(sceneName);
  if (!subNorm || !fileNorm) return 0;
  if (subNorm === fileNorm) return 100;
  if (subNorm.includes(fileNorm) || fileNorm.includes(subNorm)) return 90;
  const subWords = new Set(subNorm.split(/\s+/));
  const fileWords = new Set(fileNorm.split(/\s+/));
  if (subWords.size === 0 || fileWords.size === 0) return 0;
  let matches = 0;
  for (const word of subWords) { if (fileWords.has(word)) matches++; }
  return Math.round((matches / Math.max(subWords.size, fileWords.size)) * 100);
};

const postProcessResults = (results, sceneName) => {
  for (const provider of results) {
    for (const item of provider.items) {
      if (!item.release && sceneName) item.release = sceneName;
      const computed = computeMatchScore(item.release, sceneName);
      if (computed > 0) item.rating = computed;
      if (item.language) item.language = item.language.toUpperCase();
    }
  }
};

const mapOpenSubtitlesItem = (item) => ({
  id: item.attributes.files[0]?.file_id,
  name: item.attributes.feature_details.movie_name,
  language: item.attributes.language,
  release: item.attributes.release,
  downloads: item.attributes.download_count,
  rating: item.attributes.ratings || 0,
  fps: item.attributes.fps,
  format: item.attributes.sub_format,
  uploadDate: item.attributes.upload_date ? new Date(item.attributes.upload_date).toLocaleDateString() : null,
  aiTranslated: item.attributes.ai_translated,
  machineTranslated: item.attributes.machine_translated,
  fromTrusted: item.attributes.from_trusted,
  hearingImpaired: item.attributes.hearing_impaired,
  uploader: item.attributes.uploader?.name || item.attributes.user?.name || null,
  url: item.attributes.url ? `https://www.opensubtitles.com${item.attributes.url}` : null,
  fileId: item.attributes.files[0]?.file_id
});

// ─── End shared helpers ─────────────────────────────────────────────────

const tryOpenSubtitles = async (osApiKey, movie, langCode) => {
  const searchRes = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
    headers: { 'Api-Key': osApiKey, 'Content-Type': 'application/json', 'User-Agent': 'Atlas/1.0' },
    params: { tmdb_id: movie.tmdb_id, languages: langCode }
  });
  const data = searchRes.data.data;
  if (!data || data.length === 0) return null;
  const fileId = data[0].attributes.files[0].file_id;
  const downloadRes = await axios.post('https://api.opensubtitles.com/api/v1/download',
    { file_id: fileId },
    { headers: { 'Api-Key': osApiKey, 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Atlas/1.0' } }
  );
  const srtRes = await axios.get(downloadRes.data.link, { responseType: 'text' });
  return srtRes.data;
};

const trySubdl = async (apiKey, movie, year, langCode, type = 'movie', season = null, episode = null) => {
  const langMap = { 'en': 'EN', 'nl': 'NL', 'fr': 'FR', 'de': 'DE', 'es': 'ES', 'it': 'IT', 'pt': 'PT' };
  const params = {
    api_key: apiKey,
    tmdb_id: movie.tmdb_id,
    type,
    languages: langMap[langCode] || 'EN',
    unpack: '1'
  };
  if (type === 'tv' && season !== null) {
    params.season_number = season;
    params.episode_number = episode || 1;
  }
  const searchRes = await axios.get('https://api.subdl.com/api/v1/subtitles', { params });
  if (!searchRes.data.status || !searchRes.data.subtitles || searchRes.data.subtitles.length === 0) return null;
  const match = searchRes.data.subtitles.find(s => (s.language || '').toLowerCase() === langCode);
  if (!match) return null;

  // Fallback: use the first unpack file URL or the main ZIP URL
  const url = match.unpack_files?.[0]?.url || match.url;
  if (!url) return null;
  const downloadUrl = `https://dl.subdl.com${url.startsWith('/') ? url : '/' + url}`;
  const srtRes = await axios.get(downloadUrl, { responseType: 'text' });
  return srtRes.data;
};

const trySubsource = async (apiKey, movie, langCode) => {
  const langMap = { 'en': 'english', 'nl': 'dutch', 'fr': 'french', 'de': 'german', 'es': 'spanish', 'it': 'italian', 'pt': 'portuguese' };
  const searchRes = await axios.get('https://api.subsource.net/api/v1/movies/search', {
    params: { api_key: apiKey, searchType: 'text', q: movie.title },
    validateStatus: () => true
  });
  if (!searchRes.data?.data || searchRes.data.data.length === 0) return null;
  const movieEntry = searchRes.data.data[0];
  const subsRes = await axios.get('https://api.subsource.net/api/v1/subtitles', {
    params: { api_key: apiKey, movieId: movieEntry.movieId, language: langMap[langCode] || 'english', limit: 30 },
    validateStatus: () => true
  });
  if (!subsRes.data?.data || subsRes.data.data.length === 0) return null;
  const subId = subsRes.data.data[0].subtitleId;
  const dlRes = await axios.get(`https://api.subsource.net/api/v1/subtitles/${subId}/download`, {
    params: { api_key: apiKey },
    responseType: 'text',
    validateStatus: () => true
  });
  if (dlRes.status !== 200) return null;
  return dlRes.data;
};

const downloadSubtitlesForMovies = async () => {
  const osApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'osApiKey'").get();
  const subdlApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'subdlApiKey'").get();
  const subsourceApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'subsourceApiKey'").get();
  
  // Load configured search languages for providers
  let providerLangs = ['en'];
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'providerLangs'").get();
    if (row) {
      const parsed = JSON.parse(row.value);
      providerLangs = Array.isArray(parsed) ? parsed : ['en'];
    }
  } catch { /* ignore */ }

  const autoTranslate = db.prepare("SELECT value FROM settings WHERE key = 'autoTranslate'").get();
  const isAutoTranslate = autoTranslate && autoTranslate.value === 'true';
  const preferNative = db.prepare("SELECT value FROM settings WHERE key = 'preferNativeBeforeTranslate'").get();
  const isPreferNative = preferNative && preferNative.value === 'true';
  let targetLangs = [];
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'targetLangs'").get();
    if (row) targetLangs = JSON.parse(row.value);
  } catch { /* ignore */ }

  const LANG_TO_CODE = { 'Dutch': 'nl', 'French': 'fr', 'German': 'de', 'Spanish': 'es', 'Italian': 'it', 'Portuguese': 'pt' };

  const tryDownloadNative = async (movie, langCode) => {
    let srtContent = null;
    if (!srtContent && osApiKeyRow?.value) {
      try { srtContent = await tryOpenSubtitles(osApiKeyRow.value, movie, langCode); } catch (e) { console.log(`[SubtitleService] OpenSubtitles ${langCode} failed: ${e.message}`); }
    }
    if (!srtContent && subdlApiKeyRow?.value) {
      try { srtContent = await trySubdl(subdlApiKeyRow.value, movie, movie.year, langCode); } catch (e) { console.log(`[SubtitleService] SubDL ${langCode} failed: ${e.message}`); }
    }
    if (!srtContent && subsourceApiKeyRow?.value) {
      try { srtContent = await trySubsource(subsourceApiKeyRow.value, movie, langCode); } catch (e) { console.log(`[SubtitleService] SubSource ${langCode} failed: ${e.message}`); }
    }
    return srtContent;
  };

  const movies = db.prepare("SELECT * FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();

  const processMovie = async (movie) => {
    try {
      if (!fs.existsSync(movie.file_path)) return;

      const parsedPath = path.parse(movie.file_path);

      // Skip if all configured languages already have subtitles
      const missingLangs = providerLangs.filter(langCode =>
        !fs.existsSync(path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`))
      );
      if (missingLangs.length === 0) return;

      console.log(`[SubtitleService] Checking subtitles for: ${movie.title}`);

      // Try each configured language
      for (const langCode of providerLangs) {
        const subPath = path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`);
        if (fs.existsSync(subPath)) continue; // Already have this language

        console.log(`[SubtitleService] Searching ${langCode} subtitle for: ${movie.title}`);
        let srtContent = null;

        // Try providers in order
        if (!srtContent && osApiKeyRow?.value) {
          try {
            srtContent = await tryOpenSubtitles(osApiKeyRow.value, movie, langCode);
            if (srtContent) console.log(`[SubtitleService] Got ${langCode} from OpenSubtitles for ${movie.title}`);
          } catch (e) { console.log(`[SubtitleService] OpenSubtitles ${langCode} failed: ${e.message}`); }
        }

        if (!srtContent && subdlApiKeyRow?.value) {
          try {
            srtContent = await trySubdl(subdlApiKeyRow.value, movie, movie.year, langCode);
            if (srtContent) console.log(`[SubtitleService] Got ${langCode} from SubDL for ${movie.title}`);
          } catch (e) { console.log(`[SubtitleService] SubDL ${langCode} failed: ${e.message}`); }
        }

        if (!srtContent && subsourceApiKeyRow?.value) {
          try {
            srtContent = await trySubsource(subsourceApiKeyRow.value, movie, langCode);
            if (srtContent) console.log(`[SubtitleService] Got ${langCode} from SubSource for ${movie.title}`);
          } catch (e) { console.log(`[SubtitleService] SubSource ${langCode} failed: ${e.message}`); }
        }

        if (srtContent) {
          fs.writeFileSync(subPath, srtContent);
          console.log(`[SubtitleService] Saved ${langCode} subtitle to ${subPath}`);
          eventBus.success('Subtitle downloaded', { title: movie.title, language: langCode });

          // Auto-translate: if we downloaded English and auto-translate is on, translate to target langs
          if (langCode === 'en' && isAutoTranslate && targetLangs.length > 0) {
            for (const lang of targetLangs) {
              const tCode = LANG_TO_CODE[lang];
              if (!tCode || providerLangs.includes(tCode)) continue;
              const targetSubPath = path.join(parsedPath.dir, `${parsedPath.name}.${tCode}.srt`);
              if (fs.existsSync(targetSubPath)) continue;

              // When prefer native is on, try native download first
              if (isPreferNative) {
                console.log(`[SubtitleService] Prefer native: trying native ${tCode} for ${movie.title}`);
                const nativeContent = await tryDownloadNative(movie, tCode);
                if (nativeContent) {
                  fs.writeFileSync(targetSubPath, nativeContent);
                  console.log(`[SubtitleService] Got native ${tCode} for ${movie.title} (preferred over translate)`);
                  eventBus.success('Subtitle downloaded', { title: movie.title, language: tCode });
                  continue;
                }
                console.log(`[SubtitleService] Native ${tCode} not found for ${movie.title}, falling back to translate`);
              }

              try {
                const translated = await translateWithProvider(srtContent, lang);
                fs.writeFileSync(targetSubPath, translated);
                console.log(`[SubtitleService] Auto-translated to ${lang} for ${movie.title}`);
                eventBus.success('Subtitle translated', { title: movie.title, language: lang });
              } catch (translateErr) {
                console.error(`[SubtitleService] Auto-translate to ${lang} failed for ${movie.title}:`, translateErr.message);
              }
            }
          }
        }
      }
      if (!providerLangs.some(l => fs.existsSync(path.join(path.parse(movie.file_path).dir, `${path.parse(movie.file_path).name}.${l}.srt`)))) {
        console.log(`[SubtitleService] No subtitles found for ${movie.title} from any provider`);
      }
    } catch (err) {
      console.error(`[SubtitleService] Failed for ${movie.title}:`, err.message);
    }
  };

  await runWithConcurrency(movies, 3, processMovie);
};

const autoTranslateExisting = async () => {
  const autoTranslate = db.prepare("SELECT value FROM settings WHERE key = 'autoTranslate'").get();
  if (!autoTranslate || autoTranslate.value !== 'true') return;

  const preferNative = db.prepare("SELECT value FROM settings WHERE key = 'preferNativeBeforeTranslate'").get();
  const isPreferNative = preferNative && preferNative.value === 'true';

  const osApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'osApiKey'").get();
  const subdlApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'subdlApiKey'").get();
  const subsourceApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'subsourceApiKey'").get();

  const tryDownloadNative = async (movie, langCode) => {
    let srtContent = null;
    if (!srtContent && osApiKeyRow?.value) {
      try { srtContent = await tryOpenSubtitles(osApiKeyRow.value, movie, langCode); } catch { /* ignore */ }
    }
    if (!srtContent && subdlApiKeyRow?.value) {
      try { srtContent = await trySubdl(subdlApiKeyRow.value, movie, movie.year || (new Date()).getFullYear(), langCode); } catch { /* ignore */ }
    }
    if (!srtContent && subsourceApiKeyRow?.value) {
      try { srtContent = await trySubsource(subsourceApiKeyRow.value, movie, langCode); } catch { /* ignore */ }
    }
    return srtContent;
  };

  let targetLangs = [];
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'targetLangs'").get();
    if (row) targetLangs = JSON.parse(row.value);
  } catch { /* ignore */ }
  if (targetLangs.length === 0) return;

  let providerLangs = ['en'];
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'providerLangs'").get();
    if (row) {
      const parsed = JSON.parse(row.value);
      providerLangs = Array.isArray(parsed) ? parsed : ['en'];
    }
  } catch { /* ignore */ }

  const LANG_TO_CODE = { 'Dutch': 'nl', 'French': 'fr', 'German': 'de', 'Spanish': 'es', 'Italian': 'it', 'Portuguese': 'pt' };

  const translateOrNative = async (fileBase, movieOrEp, lang, enSrtContent) => {
    const tCode = LANG_TO_CODE[lang];
    if (!tCode || providerLangs.includes(tCode)) return;
    const targetSubPath = path.join(fileBase.dir, `${fileBase.name}.${tCode}.srt`);
    if (fs.existsSync(targetSubPath)) return;

    // When prefer native is on, try native download first
    if (isPreferNative) {
      const nativeContent = await tryDownloadNative(movieOrEp, tCode);
      if (nativeContent) {
        fs.writeFileSync(targetSubPath, nativeContent);
        console.log(`[SubtitleService] Got native ${tCode} for ${movieOrEp.title || movieOrEp.show_title} (upgraded from translate)`);
        eventBus.success('Subtitle downloaded', { title: movieOrEp.title || movieOrEp.show_title, language: tCode });
        return;
      }
    }

    // Fall back to translation
    try {
      const translated = await translateWithProvider(enSrtContent, lang);
      fs.writeFileSync(targetSubPath, translated);
      console.log(`[SubtitleService] Auto-translated ${movieOrEp.title || movieOrEp.show_title} to ${lang}`);
      eventBus.success('Subtitle translated', { title: movieOrEp.title || movieOrEp.show_title, language: lang });
    } catch (translateErr) {
      console.error(`[SubtitleService] Auto-translate ${movieOrEp.title || movieOrEp.show_title} to ${lang} failed:`, translateErr.message);
    }
  };

  // Movies
  const movies = db.prepare("SELECT * FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
  
  const processMovieAutoTranslate = async (movie) => {
    try {
      if (!fs.existsSync(movie.file_path)) return;
      const parsedPath = path.parse(movie.file_path);
      const enSubPath = path.join(parsedPath.dir, `${parsedPath.name}.en.srt`);
      if (!fs.existsSync(enSubPath)) return;

      const enSrtContent = fs.readFileSync(enSubPath, 'utf-8');
      for (const lang of targetLangs) {
        await translateOrNative(parsedPath, movie, lang, enSrtContent);
      }
    } catch (err) {
      console.error(`[SubtitleService] Auto-translate check failed for ${movie.title}:`, err.message);
    }
  };

  await runWithConcurrency(movies, 3, processMovieAutoTranslate);

  // Episodes
  const episodes = db.prepare(`
    SELECT e.*, s.title as show_title
    FROM episodes e
    JOIN shows s ON e.show_id = s.id
    WHERE e.status = 'downloaded' AND e.file_path IS NOT NULL
  `).all();

  const processEpisodeAutoTranslate = async (ep) => {
    try {
      if (!fs.existsSync(ep.file_path)) return;
      const parsedPath = path.parse(ep.file_path);
      const enSubPath = path.join(parsedPath.dir, `${parsedPath.name}.en.srt`);
      if (!fs.existsSync(enSubPath)) return;

      const enSrtContent = fs.readFileSync(enSubPath, 'utf-8');
      // Build a movie-like object for the helper
      const epLike = { ...ep, title: `${ep.show_title} S${String(ep.season_number).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')}`, year: ep.year || (new Date()).getFullYear() };
      for (const lang of targetLangs) {
        await translateOrNative(parsedPath, epLike, lang, enSrtContent);
      }
    } catch (err) {
      console.error(`[SubtitleService] Auto-translate check failed for episode:`, err.message);
    }
  };

  await runWithConcurrency(episodes, 3, processEpisodeAutoTranslate);
};

const upgradeTranslatedToNative = async () => {
  const preferNative = db.prepare("SELECT value FROM settings WHERE key = 'preferNativeBeforeTranslate'").get();
  if (!preferNative || preferNative.value !== 'true') return;

  const osApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'osApiKey'").get();
  const subdlApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'subdlApiKey'").get();
  const subsourceApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'subsourceApiKey'").get();
  if (!osApiKeyRow?.value && !subdlApiKeyRow?.value && !subsourceApiKeyRow?.value) return;

  let targetLangs = [];
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'targetLangs'").get();
    if (row) targetLangs = JSON.parse(row.value);
  } catch { /* ignore */ }
  const LANG_TO_CODE = { 'Dutch': 'nl', 'French': 'fr', 'German': 'de', 'Spanish': 'es', 'Italian': 'it', 'Portuguese': 'pt' };
  const targetCodes = targetLangs.map(l => LANG_TO_CODE[l]).filter(Boolean);

  const tryDownloadNative = async (item, langCode) => {
    let srtContent = null;
    if (!srtContent && osApiKeyRow?.value) {
      try { srtContent = await tryOpenSubtitles(osApiKeyRow.value, item, langCode); } catch { /* ignore */ }
    }
    if (!srtContent && subdlApiKeyRow?.value) {
      try { srtContent = await trySubdl(subdlApiKeyRow.value, item, item.year || (new Date()).getFullYear(), langCode); } catch { /* ignore */ }
    }
    if (!srtContent && subsourceApiKeyRow?.value) {
      try { srtContent = await trySubsource(subsourceApiKeyRow.value, item, langCode); } catch { /* ignore */ }
    }
    return srtContent;
  };

  // Movies
  const movies = db.prepare("SELECT * FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
  
  const processMovieUpgrade = async (movie) => {
    try {
      if (!fs.existsSync(movie.file_path)) return;
      const parsedPath = path.parse(movie.file_path);
      for (const tCode of targetCodes) {
        const subPath = path.join(parsedPath.dir, `${parsedPath.name}.${tCode}.srt`);
        if (!fs.existsSync(subPath)) continue; // Only upgrade existing (translated) files
        console.log(`[SubtitleService] Upgrade check: trying native ${tCode} for ${movie.title}`);
        const nativeContent = await tryDownloadNative(movie, tCode);
        if (nativeContent) {
          fs.writeFileSync(subPath, nativeContent);
          console.log(`[SubtitleService] Upgraded ${movie.title} ${tCode} from translated to native`);
          eventBus.success('Subtitle upgraded', { title: movie.title, language: tCode });
        }
      }
    } catch (err) {
      console.error(`[SubtitleService] Upgrade check failed for ${movie.title}:`, err.message);
    }
  };

  await runWithConcurrency(movies, 3, processMovieUpgrade);

  // Episodes
  const episodes = db.prepare(`
    SELECT e.*, s.title as show_title, s.tmdb_id, s.year
    FROM episodes e
    JOIN shows s ON e.show_id = s.id
    WHERE e.status = 'downloaded' AND e.file_path IS NOT NULL
  `).all();

  const processEpisodeUpgrade = async (ep) => {
    let label = 'Unknown';
    try {
      if (!fs.existsSync(ep.file_path)) return;
      const parsedPath = path.parse(ep.file_path);
      label = `${ep.show_title} S${String(ep.season_number).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')}`;
      for (const tCode of targetCodes) {
        const subPath = path.join(parsedPath.dir, `${parsedPath.name}.${tCode}.srt`);
        if (!fs.existsSync(subPath)) continue;
        console.log(`[SubtitleService] Upgrade check: trying native ${tCode} for ${label}`);
        const epLike = { ...ep, tmdb_id: ep.tmdb_id, title: label, year: ep.year || (new Date()).getFullYear() };
        const nativeContent = await tryDownloadNative(epLike, tCode);
        if (nativeContent) {
          fs.writeFileSync(subPath, nativeContent);
          console.log(`[SubtitleService] Upgraded ${label} ${tCode} from translated to native`);
          eventBus.success('Subtitle upgraded', { title: label, language: tCode });
        }
      }
    } catch (err) {
      console.error(`[SubtitleService] Upgrade check failed for ${label}:`, err.message);
    }
  };

  await runWithConcurrency(episodes, 3, processEpisodeUpgrade);
};

const init = () => {
  const cronExp = '0 */6 * * *'; // Every 6 hours

  const runAll = async () => {
    await downloadSubtitlesForMovies();
    await downloadSubtitlesForEpisodes();
    await autoTranslateExisting();
    await upgradeTranslatedToNative();
  };
  
  taskRegistry.registerTask(
    'subtitle_downloader', 
    'Subtitle Downloader', 
    'Searches and downloads subtitles for all downloaded movies and TV episodes.',
    cronExp,
    runAll
  );

  const job = cron.schedule(cronExp, () => taskRegistry.executeTask('subtitle_downloader'));
  registerJob(job);
  console.log('[SubtitleService] Scheduler initialized.');
};

const downloadSubtitlesForEpisodes = async () => {
  const osApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'osApiKey'").get();
  const subdlApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'subdlApiKey'").get();
  const subsourceApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'subsourceApiKey'").get();
  
  let providerLangs = ['en'];
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'providerLangs'").get();
    if (row) {
      const parsed = JSON.parse(row.value);
      providerLangs = Array.isArray(parsed) ? parsed : ['en'];
    }
  } catch { /* ignore */ }

  const episodes = db.prepare(`
    SELECT e.*, s.title as show_title, s.tmdb_id, s.year
    FROM episodes e
    JOIN shows s ON e.show_id = s.id
    WHERE e.status = 'downloaded' AND e.file_path IS NOT NULL
  `).all();

  const processEpisode = async (ep) => {
    try {
      if (!fs.existsSync(ep.file_path)) return;

      const parsedPath = path.parse(ep.file_path);
      const label = `${ep.show_title} S${String(ep.season_number).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')}`;

      // Skip if all configured languages already have subtitles
      const missingLangs = providerLangs.filter(langCode =>
        !fs.existsSync(path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`))
      );
      if (missingLangs.length === 0) return;

      console.log(`[SubtitleService] Checking subtitles for: ${label}`);

      for (const langCode of providerLangs) {
        const subPath = path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`);
        if (fs.existsSync(subPath)) continue;

        console.log(`[SubtitleService] Searching ${langCode} subtitle for: ${label}`);
        let srtContent = null;

        if (!srtContent && osApiKeyRow?.value) {
          try {
            const searchRes = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
              headers: { 'Api-Key': osApiKeyRow.value, 'Content-Type': 'application/json', 'User-Agent': 'Atlas/1.0' },
              params: { tmdb_id: ep.tmdb_id, season_number: ep.season_number, episode_number: ep.episode_number, languages: langCode }
            });
            const data = searchRes.data.data;
            if (data && data.length > 0) {
              const fileId = data[0].attributes.files[0].file_id;
              const downloadRes = await axios.post('https://api.opensubtitles.com/api/v1/download',
                { file_id: fileId },
                { headers: { 'Api-Key': osApiKeyRow.value, 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Atlas/1.0' } }
              );
              const srtRes = await axios.get(downloadRes.data.link, { responseType: 'text' });
              srtContent = srtRes.data;
              if (srtContent) console.log(`[SubtitleService] Got ${langCode} from OpenSubtitles for ${label}`);
            }
          } catch (e) { console.log(`[SubtitleService] OpenSubtitles episode ${langCode} failed: ${e.message}`); }
        }

        if (!srtContent && subdlApiKeyRow?.value) {
          try {
            const episodeMovie = { ...ep, tmdb_id: ep.tmdb_id, title: label, year: ep.year };
            srtContent = await trySubdl(subdlApiKeyRow.value, episodeMovie, ep.year, langCode);
            if (srtContent) console.log(`[SubtitleService] Got ${langCode} from SubDL for ${label}`);
          } catch (e) { console.log(`[SubtitleService] SubDL episode ${langCode} failed: ${e.message}`); }
        }

        if (!srtContent && subsourceApiKeyRow?.value) {
          try {
            const episodeMovie = { ...ep, title: ep.show_title };
            srtContent = await trySubsource(subsourceApiKeyRow.value, episodeMovie, langCode);
            if (srtContent) console.log(`[SubtitleService] Got ${langCode} from SubSource for ${label}`);
          } catch (e) { console.log(`[SubtitleService] SubSource episode ${langCode} failed: ${e.message}`); }
        }

        if (srtContent) {
          fs.writeFileSync(subPath, srtContent);
          console.log(`[SubtitleService] Saved ${langCode} subtitle to ${subPath}`);
          eventBus.success('Subtitle downloaded', { title: label, language: langCode });
        }
      }
    } catch (err) {
      console.error(`[SubtitleService] Failed for episode ${ep.show_title} S${ep.season_number}E${ep.episode_number}:`, err.message);
    }
  };

  await runWithConcurrency(episodes, 3, processEpisode);
};

const downloadSubtitlesForMovie = async (movie, langCode) => {
  const osApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'osApiKey'").get();
  const subdlApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'subdlApiKey'").get();
  const subsourceApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'subsourceApiKey'").get();

  if (!movie.file_path || !fs.existsSync(movie.file_path)) {
    throw new Error('Movie file not found on disk');
  }

  const parsedPath = path.parse(movie.file_path);
  const subPath = path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`);

  if (fs.existsSync(subPath)) {
    return { alreadyExists: true, langCode };
  }

  let srtContent = null;

  if (!srtContent && osApiKeyRow?.value) {
    try {
      srtContent = await tryOpenSubtitles(osApiKeyRow.value, movie, langCode);
    } catch (e) { console.log(`[SubtitleService] OpenSubtitles ${langCode} failed: ${e.message}`); }
  }

  if (!srtContent && subdlApiKeyRow?.value) {
    try {
      srtContent = await trySubdl(subdlApiKeyRow.value, movie, movie.year, langCode);
    } catch (e) { console.log(`[SubtitleService] SubDL ${langCode} failed: ${e.message}`); }
  }

  if (!srtContent && subsourceApiKeyRow?.value) {
    try {
      srtContent = await trySubsource(subsourceApiKeyRow.value, movie, langCode);
    } catch (e) { console.log(`[SubtitleService] SubSource ${langCode} failed: ${e.message}`); }
  }

  if (srtContent) {
    fs.writeFileSync(subPath, srtContent);
    return { success: true, langCode };
  }

  throw new Error(`No subtitle found for language "${langCode}" from any provider`);
};

const downloadSubtitlesForEpisode = async (episode, show, langCode) => {
  const osApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'osApiKey'").get();
  const subdlApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'subdlApiKey'").get();
  const subsourceApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'subsourceApiKey'").get();

  if (!episode.file_path || !fs.existsSync(episode.file_path)) {
    throw new Error('Episode file not found on disk');
  }

  const parsedPath = path.parse(episode.file_path);
  const subPath = path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`);

  if (fs.existsSync(subPath)) {
    return { alreadyExists: true, langCode };
  }

  let srtContent = null;

  // Try OpenSubtitles with show's tmdb_id and episode info
  if (!srtContent && osApiKeyRow?.value) {
    try {
      const searchRes = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
        headers: { 'Api-Key': osApiKeyRow.value, 'Content-Type': 'application/json', 'User-Agent': 'Atlas/1.0' },
        params: { tmdb_id: show.tmdb_id, season_number: episode.season_number, episode_number: episode.episode_number, languages: langCode }
      });
      const data = searchRes.data.data;
      if (data && data.length > 0) {
        const fileId = data[0].attributes.files[0].file_id;
        const downloadRes = await axios.post('https://api.opensubtitles.com/api/v1/download',
          { file_id: fileId },
          { headers: { 'Api-Key': osApiKeyRow.value, 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Atlas/1.0' } }
        );
        const srtRes = await axios.get(downloadRes.data.link, { responseType: 'text' });
        srtContent = srtRes.data;
      }
    } catch (e) { console.log(`[SubtitleService] OpenSubtitles episode ${langCode} failed: ${e.message}`); }
  }

  // Try SubDL by constructing a movie-like object with episode info
  if (!srtContent && subdlApiKeyRow?.value) {
    try {
      const episodeMovie = { ...episode, tmdb_id: show.tmdb_id, title: `${show.title} S${String(episode.season_number).padStart(2, '0')}E${String(episode.episode_number).padStart(2, '0')}`, year: show.year };
      srtContent = await trySubdl(subdlApiKeyRow.value, episodeMovie, show.year, langCode, 'tv', episode.season_number, episode.episode_number);
    } catch (e) { console.log(`[SubtitleService] SubDL episode ${langCode} failed: ${e.message}`); }
  }

  // Try SubSource with show title
  if (!srtContent && subsourceApiKeyRow?.value) {
    try {
      const episodeMovie = { ...episode, title: show.title };
      srtContent = await trySubsource(subsourceApiKeyRow.value, episodeMovie, langCode);
    } catch (e) { console.log(`[SubtitleService] SubSource episode ${langCode} failed: ${e.message}`); }
  }

  if (srtContent) {
    fs.writeFileSync(subPath, srtContent);
    return { success: true, langCode };
  }

  throw new Error(`No subtitle found for language "${langCode}" from any provider`);
};

const searchSubtitlesForMovie = async (movie, langCode) => {
  const osApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'osApiKey'").get();
  const subdlApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'subdlApiKey'").get();
  const subsourceApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'subsourceApiKey'").get();

  // Extract scene/release name from database if available, otherwise fallback to file path
  const sceneName = movie.scene_name || (movie.file_path ? path.basename(movie.file_path, path.extname(movie.file_path)) : '');


  const results = [];

  if (osApiKeyRow?.value) {
    try {
      const res = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
        headers: { 'Api-Key': osApiKeyRow.value, 'Content-Type': 'application/json', 'User-Agent': 'Atlas/1.0' },
        params: { tmdb_id: movie.tmdb_id, languages: langCode }
      });
      const data = res.data.data;
      if (data && data.length > 0) {
        results.push({ provider: 'OpenSubtitles', items: data.map(mapOpenSubtitlesItem) });
      }
    } catch (e) { console.log(`[SubtitleService] OpenSubtitles search failed: ${e.message}`); }
  }

  if (subdlApiKeyRow?.value) {
    try {
      const langMap = { en: 'EN', nl: 'NL', fr: 'FR', de: 'DE', es: 'ES', it: 'IT', pt: 'PT' };
      const res = await axios.get('https://api.subdl.com/api/v1/subtitles', {
        params: { api_key: subdlApiKeyRow.value, tmdb_id: movie.tmdb_id, type: 'movie', languages: langMap[langCode] || 'EN', unpack: '1' }
      });
      if (res.data.status && res.data.subtitles?.length > 0) {
        const matching = res.data.subtitles.filter(s => (s.language || '').toLowerCase() === langCode);
        if (matching.length > 0) {
          results.push({ provider: 'SubDL', items: matching.map(item => ({
            id: item.sd_id || item.id,
            name: item.release_name || item.name || 'Subtitle',
            language: item.language,
            release: item.release_name || item.name || '',
            downloads: item.downloads || 0,
            rating: item.rating || 0,
            fps: item.fps || null,
            format: item.format || 'srt',
            uploadDate: item.created_at ? new Date(item.created_at).toLocaleDateString() : null,
            uploader: item.uploader || null,
            hearingImpaired: item.hearing_impaired || false,
            url: item.url ? `https://dl.subdl.com${item.url.startsWith('/') ? item.url : '/' + item.url}` : null,
            subdlId: item.sd_id || item.id
          })) });
        }
      }
    } catch (e) { console.log(`[SubtitleService] SubDL search failed: ${e.message}`); }
  }

  if (subsourceApiKeyRow?.value) {
    try {
      const langMap = { en: 'english', nl: 'dutch', fr: 'french', de: 'german', es: 'spanish', it: 'italian', pt: 'portuguese' };
      const searchRes = await axios.get('https://api.subsource.net/api/v1/movies/search', {
        params: { api_key: subsourceApiKeyRow.value, searchType: 'text', q: movie.title },
        validateStatus: () => true
      });
      if (searchRes.data?.data?.length > 0) {
        const movieEntry = searchRes.data.data[0];
        const subsRes = await axios.get('https://api.subsource.net/api/v1/subtitles', {
          params: { api_key: subsourceApiKeyRow.value, movieId: movieEntry.movieId, language: langMap[langCode] || 'english', limit: 30 },
          validateStatus: () => true
        });
        if (subsRes.data?.data?.length > 0) {
          results.push({ provider: 'SubSource', items: subsRes.data.data.map(item => ({
            id: item.subtitleId || item.id,
            name: langCode,
            language: langCode,
            release: item.releaseInfo?.[0] || '',
            downloads: item.downloads || 0,
            rating: item.rating?.total || item.rating || 0,
            fps: item.framerate || null,
            format: 'srt',
            uploadDate: item.createdAt ? new Date(item.createdAt).toLocaleDateString() : null,
            uploader: item.contributors?.[0]?.displayname || null,
            hearingImpaired: item.hearingImpaired || false,
            url: item.link ? `https://subsource.net${item.link}` : null,
            subId: item.subtitleId
          })) });
        }
      }
    } catch (e) { console.log(`[SubtitleService] SubSource search failed: ${e.message}`); }
  }

  postProcessResults(results, sceneName);

  return results;
};

const searchSubtitlesForEpisode = async (episode, show, langCode) => {
  const osApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'osApiKey'").get();
  const subdlApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'subdlApiKey'").get();
  const subsourceApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'subsourceApiKey'").get();

  // Extract scene/release name from database if available, otherwise fallback to file path
  const sceneName = (episode.scene_name && !episode.scene_name.startsWith('Unknown ')) ? episode.scene_name : (episode.file_path ? path.basename(episode.file_path, path.extname(episode.file_path)) : '');


  const results = [];

  if (osApiKeyRow?.value) {
    try {
      const res = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
        headers: { 'Api-Key': osApiKeyRow.value, 'Content-Type': 'application/json', 'User-Agent': 'Atlas/1.0' },
        params: { tmdb_id: show.tmdb_id, season_number: episode.season_number, episode_number: episode.episode_number, languages: langCode }
      });
      const data = res.data.data;
      if (data && data.length > 0) {
        results.push({ provider: 'OpenSubtitles', items: data.map(item => {
          const mapped = mapOpenSubtitlesItem(item);
          mapped.name = item.attributes.feature_details.movie_name || show.title;
          return mapped;
        }) });
      }
    } catch (e) { console.log(`[SubtitleService] OpenSubtitles episode search failed: ${e.message}`); }
  }

  if (subdlApiKeyRow?.value) {
    try {
      const langMap = { en: 'EN', nl: 'NL', fr: 'FR', de: 'DE', es: 'ES', it: 'IT', pt: 'PT' };
      const res = await axios.get('https://api.subdl.com/api/v1/subtitles', {
        params: { api_key: subdlApiKeyRow.value, tmdb_id: show.tmdb_id, type: 'tv', season_number: episode.season_number, episode_number: episode.episode_number, languages: langMap[langCode] || 'EN', unpack: '1' }
      });
      if (res.data.status && res.data.subtitles?.length > 0) {
        const matching = res.data.subtitles.filter(s => (s.language || '').toLowerCase() === langCode);
        if (matching.length > 0) {
          const items = [];
          for (const sub of matching) {
            // Handle full-season packs — extract the specific episode's data from unpack_files
            if (sub.full_season && sub.unpack_files?.length > 0) {
              const epFile = sub.unpack_files.find(f => f.episode === episode.episode_number);
              if (epFile) {
                items.push({
                  id: epFile.file_n_id || sub.sd_id,
                  name: epFile.name || sub.filename || 'Subtitle',
                  language: sub.language,
                  release: epFile.release_name || sub.release_name || sub.filename || '',
                  downloads: sub.downloads || 0,
                  rating: sub.rating || 0,
                  fps: epFile.fps || sub.fps || null,
                  format: epFile.format || sub.format || 'srt',
                  uploadDate: sub.created_at ? new Date(sub.created_at).toLocaleDateString() : null,
                  uploader: sub.author || sub.uploader || null,
                  hearingImpaired: epFile.hi || sub.hi || false,
                  url: epFile?.url ? `https://dl.subdl.com${epFile.url.startsWith('/') ? epFile.url : '/' + epFile.url}` : sub.url ? `https://dl.subdl.com${sub.url.startsWith('/') ? sub.url : '/' + sub.url}` : null,
                  subdlId: sub.sd_id || sub.id
                });
              }
            } else {
              items.push({
                id: sub.sd_id || sub.id,
                name: sub.filename || 'Subtitle',
                language: sub.language,
                release: sub.release_name || sub.filename || '',
                downloads: sub.downloads || 0,
                rating: sub.rating || 0,
                fps: sub.fps || null,
                format: sub.format || 'srt',
                uploadDate: sub.created_at ? new Date(sub.created_at).toLocaleDateString() : null,
                uploader: sub.author || sub.uploader || null,
                hearingImpaired: sub.hi || false,
                url: sub.url ? `https://dl.subdl.com${sub.url.startsWith('/') ? sub.url : '/' + sub.url}` : null,
                subdlId: sub.sd_id || sub.id
              });
            }
          }
          if (items.length > 0) results.push({ provider: 'SubDL', items });
        }
      }
    } catch (e) { console.log(`[SubtitleService] SubDL episode search failed: ${e.message}`); }
  }

  if (subsourceApiKeyRow?.value) {
    try {
      const langMap = { en: 'english', nl: 'dutch', fr: 'french', de: 'german', es: 'spanish', it: 'italian', pt: 'portuguese' };
      const searchRes = await axios.get('https://api.subsource.net/api/v1/movies/search', {
        params: { api_key: subsourceApiKeyRow.value, searchType: 'text', q: show.title },
        validateStatus: () => true
      });
      if (searchRes.data?.data?.length > 0) {
        // Find the TV show matching the title
        const showEntry = searchRes.data.data.find(s => s.type === 'tv') || searchRes.data.data[0];
        const subsRes = await axios.get('https://api.subsource.net/api/v1/subtitles', {
          params: { api_key: subsourceApiKeyRow.value, movieId: showEntry.movieId, season: episode.season_number, episode: episode.episode_number, language: langMap[langCode] || 'english', limit: 30 },
          validateStatus: () => true
        });
        if (subsRes.data?.data?.length > 0) {
          results.push({ provider: 'SubSource', items: subsRes.data.data.map(item => ({
            id: item.subtitleId || item.id,
            name: langCode,
            language: langCode,
            release: item.releaseInfo?.[0] || '',
            downloads: item.downloads || 0,
            rating: item.rating?.total || item.rating || 0,
            fps: item.framerate || null,
            format: 'srt',
            uploadDate: item.createdAt ? new Date(item.createdAt).toLocaleDateString() : null,
            uploader: item.contributors?.[0]?.displayname || null,
            hearingImpaired: item.hearingImpaired || false,
            url: item.link ? `https://subsource.net${item.link}` : null,
            subId: item.subtitleId
          })) });
        }
      }
    } catch (e) { console.log(`[SubtitleService] SubSource episode search failed: ${e.message}`); }
  }

  // Post-process: compute match scores and fill in missing data
  for (const provider of results) {
    for (const item of provider.items) {
      if (!item.release && sceneName) item.release = sceneName;
      const computed = computeMatchScore(item.release, sceneName);
      if (computed > 0) item.rating = computed;
      if (item.language) item.language = langCode.toUpperCase();
    }
  }

  return results;
};

module.exports = {
  init,
  downloadSubtitlesForMovies,
  downloadSubtitlesForMovie,
  downloadSubtitlesForEpisode,
  searchSubtitlesForMovie,
  searchSubtitlesForEpisode
};
