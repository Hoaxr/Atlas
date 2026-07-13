const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const db = require('../../config/database');
const taskRegistry = require('../taskRegistry');
const eventBus = require('../eventBus');
const { runWithConcurrency } = require('../../utils/concurrency');
const { registerJob } = require('../../utils/cronRegistry');
const { translateWithProvider } = require('../aiTranslationWorker');
const { LANG_TO_CODE } = require('../../utils/constants');

const openSubtitles = require('./providers/openSubtitles');
const subdl = require('./providers/subdl');
const subsource = require('./providers/subsource');

// Shared helpers
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

const getProviderKeys = () => {
  return {
    osApiKey: db.prepare("SELECT value FROM settings WHERE key = 'osApiKey'").get()?.value,
    subdlApiKey: db.prepare("SELECT value FROM settings WHERE key = 'subdlApiKey'").get()?.value,
    subsourceApiKey: db.prepare("SELECT value FROM settings WHERE key = 'subsourceApiKey'").get()?.value
  };
};

const getProviderLangs = () => {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'providerLangs'").get();
    if (row) {
      const parsed = JSON.parse(row.value);
      return Array.isArray(parsed) ? parsed : ['en'];
    }
  } catch { /* ignore */ }
  return ['en'];
};

const tryDownloadNativeMovie = async (movie, langCode) => {
  const keys = getProviderKeys();
  let srtContent = null;
  if (!srtContent && keys.osApiKey) {
    try { srtContent = await openSubtitles.downloadForMovie(keys.osApiKey, movie, langCode); } catch (e) { console.log(`[SubtitleService] OpenSubtitles ${langCode} failed: ${e.message}`); }
  }
  if (!srtContent && keys.subdlApiKey) {
    try { srtContent = await subdl.downloadForMovie(keys.subdlApiKey, movie, langCode); } catch (e) { console.log(`[SubtitleService] SubDL ${langCode} failed: ${e.message}`); }
  }
  if (!srtContent && keys.subsourceApiKey) {
    try { srtContent = await subsource.downloadForMovie(keys.subsourceApiKey, movie, langCode); } catch (e) { console.log(`[SubtitleService] SubSource ${langCode} failed: ${e.message}`); }
  }
  return srtContent;
};

const tryDownloadNativeEpisode = async (show, episode, langCode) => {
  const keys = getProviderKeys();
  let srtContent = null;
  if (!srtContent && keys.osApiKey) {
    try { srtContent = await openSubtitles.downloadForEpisode(keys.osApiKey, show, episode, langCode); } catch (e) { console.log(`[SubtitleService] OpenSubtitles ${langCode} failed: ${e.message}`); }
  }
  if (!srtContent && keys.subdlApiKey) {
    try { srtContent = await subdl.downloadForEpisode(keys.subdlApiKey, show, episode, langCode); } catch (e) { console.log(`[SubtitleService] SubDL ${langCode} failed: ${e.message}`); }
  }
  if (!srtContent && keys.subsourceApiKey) {
    try { srtContent = await subsource.downloadForEpisode(keys.subsourceApiKey, show, episode, langCode); } catch (e) { console.log(`[SubtitleService] SubSource ${langCode} failed: ${e.message}`); }
  }
  return srtContent;
};

const downloadSubtitlesForMovie = async (movie, langCode) => {
  if (!movie.file_path || !fs.existsSync(movie.file_path)) throw new Error('Movie file not found on disk');
  const parsedPath = path.parse(movie.file_path);
  const subPath = path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`);

  if (fs.existsSync(subPath)) return { alreadyExists: true, langCode };

  const srtContent = await tryDownloadNativeMovie(movie, langCode);
  if (srtContent) {
    fs.writeFileSync(subPath, srtContent);
    return { success: true, langCode };
  }
  throw new Error(`No subtitle found for language "${langCode}" from any provider`);
};

const downloadSubtitlesForEpisode = async (episode, show, langCode) => {
  if (!episode.file_path || !fs.existsSync(episode.file_path)) throw new Error('Episode file not found on disk');
  const parsedPath = path.parse(episode.file_path);
  const subPath = path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`);

  if (fs.existsSync(subPath)) return { alreadyExists: true, langCode };

  const srtContent = await tryDownloadNativeEpisode(show, episode, langCode);
  if (srtContent) {
    fs.writeFileSync(subPath, srtContent);
    return { success: true, langCode };
  }
  throw new Error(`No subtitle found for language "${langCode}" from any provider`);
};

const downloadSubtitlesForMovies = async () => {
  const providerLangs = getProviderLangs();
  const autoTranslate = db.prepare("SELECT value FROM settings WHERE key = 'autoTranslate'").get();
  const isAutoTranslate = autoTranslate && autoTranslate.value === 'true';
  const preferNative = db.prepare("SELECT value FROM settings WHERE key = 'preferNativeBeforeTranslate'").get();
  const isPreferNative = preferNative && preferNative.value === 'true';
  let targetLangs = [];
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'targetLangs'").get();
    if (row) targetLangs = JSON.parse(row.value);
  } catch { /* ignore */ }

  const movies = db.prepare("SELECT * FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();

  const processMovie = async (movie) => {
    try {
      if (!fs.existsSync(movie.file_path)) return;
      const parsedPath = path.parse(movie.file_path);
      const missingLangs = providerLangs.filter(langCode => !fs.existsSync(path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`)));
      if (missingLangs.length === 0) return;

      console.log(`[SubtitleService] Checking subtitles for: ${movie.title}`);
      for (const langCode of providerLangs) {
        const subPath = path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`);
        if (fs.existsSync(subPath)) continue;

        console.log(`[SubtitleService] Searching ${langCode} subtitle for: ${movie.title}`);
        const srtContent = await tryDownloadNativeMovie(movie, langCode);

        if (srtContent) {
          fs.writeFileSync(subPath, srtContent);
          console.log(`[SubtitleService] Saved ${langCode} subtitle to ${subPath}`);
          eventBus.success('Subtitle downloaded', { title: movie.title, language: langCode });

          if (langCode === 'en' && isAutoTranslate && targetLangs.length > 0) {
            for (const lang of targetLangs) {
              const tCode = LANG_TO_CODE[lang];
              if (!tCode || providerLangs.includes(tCode)) continue;
              const targetSubPath = path.join(parsedPath.dir, `${parsedPath.name}.${tCode}.srt`);
              if (fs.existsSync(targetSubPath)) continue;

              if (isPreferNative) {
                const nativeContent = await tryDownloadNativeMovie(movie, tCode);
                if (nativeContent) {
                  fs.writeFileSync(targetSubPath, nativeContent);
                  eventBus.success('Subtitle downloaded', { title: movie.title, language: tCode });
                  continue;
                }
              }

              try {
                const translated = await translateWithProvider(srtContent, lang);
                fs.writeFileSync(targetSubPath, translated);
                eventBus.success('Subtitle translated', { title: movie.title, language: lang });
              } catch (translateErr) {
                console.error(`[SubtitleService] Auto-translate to ${lang} failed for ${movie.title}:`, translateErr.message);
              }
            }
          }
        }
      }
    } catch (err) { console.error(`[SubtitleService] Failed for ${movie.title}:`, err.message); }
  };

  await runWithConcurrency(movies, 3, processMovie);
};

const downloadSubtitlesForEpisodes = async () => {
  const providerLangs = getProviderLangs();
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
      const missingLangs = providerLangs.filter(langCode => !fs.existsSync(path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`)));
      if (missingLangs.length === 0) return;

      console.log(`[SubtitleService] Checking subtitles for: ${label}`);
      for (const langCode of providerLangs) {
        const subPath = path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`);
        if (fs.existsSync(subPath)) continue;

        console.log(`[SubtitleService] Searching ${langCode} subtitle for: ${label}`);
        const show = { tmdb_id: ep.tmdb_id, title: ep.show_title, year: ep.year };
        const srtContent = await tryDownloadNativeEpisode(show, ep, langCode);

        if (srtContent) {
          fs.writeFileSync(subPath, srtContent);
          console.log(`[SubtitleService] Saved ${langCode} subtitle to ${subPath}`);
          eventBus.success('Subtitle downloaded', { title: label, language: langCode });
        }
      }
    } catch (err) { console.error(`[SubtitleService] Failed for episode ${ep.show_title}:`, err.message); }
  };

  await runWithConcurrency(episodes, 3, processEpisode);
};

const searchSubtitlesForMovie = async (movie, langCode) => {
  const keys = getProviderKeys();
  const sceneName = movie.scene_name || (movie.file_path ? path.basename(movie.file_path, path.extname(movie.file_path)) : '');
  const results = [];

  if (keys.osApiKey) {
    try {
      const items = await openSubtitles.searchForMovie(keys.osApiKey, movie, langCode);
      if (items.length > 0) results.push({ provider: 'OpenSubtitles', items });
    } catch (e) { console.log(`[SubtitleService] OpenSubtitles search failed: ${e.message}`); }
  }
  if (keys.subdlApiKey) {
    try {
      const items = await subdl.searchForMovie(keys.subdlApiKey, movie, langCode);
      if (items.length > 0) results.push({ provider: 'SubDL', items });
    } catch (e) { console.log(`[SubtitleService] SubDL search failed: ${e.message}`); }
  }
  if (keys.subsourceApiKey) {
    try {
      const items = await subsource.searchForMovie(keys.subsourceApiKey, movie, langCode);
      if (items.length > 0) results.push({ provider: 'SubSource', items });
    } catch (e) { console.log(`[SubtitleService] SubSource search failed: ${e.message}`); }
  }

  postProcessResults(results, sceneName);
  return results;
};

const searchSubtitlesForEpisode = async (episode, show, langCode) => {
  const keys = getProviderKeys();
  const sceneName = (episode.scene_name && !episode.scene_name.startsWith('Unknown ')) ? episode.scene_name : (episode.file_path ? path.basename(episode.file_path, path.extname(episode.file_path)) : '');
  const results = [];

  if (keys.osApiKey) {
    try {
      const items = await openSubtitles.searchForEpisode(keys.osApiKey, show, episode, langCode);
      if (items.length > 0) results.push({ provider: 'OpenSubtitles', items });
    } catch (e) { console.log(`[SubtitleService] OpenSubtitles episode search failed: ${e.message}`); }
  }
  if (keys.subdlApiKey) {
    try {
      const items = await subdl.searchForEpisode(keys.subdlApiKey, show, episode, langCode);
      if (items.length > 0) results.push({ provider: 'SubDL', items });
    } catch (e) { console.log(`[SubtitleService] SubDL episode search failed: ${e.message}`); }
  }
  if (keys.subsourceApiKey) {
    try {
      const items = await subsource.searchForEpisode(keys.subsourceApiKey, show, episode, langCode);
      if (items.length > 0) results.push({ provider: 'SubSource', items });
    } catch (e) { console.log(`[SubtitleService] SubSource episode search failed: ${e.message}`); }
  }

  postProcessResults(results, sceneName);
  return results;
};

const autoTranslateExisting = async () => {
  const autoTranslate = db.prepare("SELECT value FROM settings WHERE key = 'autoTranslate'").get();
  if (!autoTranslate || autoTranslate.value !== 'true') return;

  const preferNative = db.prepare("SELECT value FROM settings WHERE key = 'preferNativeBeforeTranslate'").get();
  const isPreferNative = preferNative && preferNative.value === 'true';

  let targetLangs = [];
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'targetLangs'").get();
    if (row) targetLangs = JSON.parse(row.value);
  } catch { /* ignore */ }
  if (targetLangs.length === 0) return;

  const providerLangs = getProviderLangs();

  const translateOrNativeMovie = async (fileBase, movie, lang, enSrtContent) => {
    const tCode = LANG_TO_CODE[lang];
    if (!tCode || providerLangs.includes(tCode)) return;
    const targetSubPath = path.join(fileBase.dir, `${fileBase.name}.${tCode}.srt`);
    if (fs.existsSync(targetSubPath)) return;

    if (isPreferNative) {
      const nativeContent = await tryDownloadNativeMovie(movie, tCode);
      if (nativeContent) {
        fs.writeFileSync(targetSubPath, nativeContent);
        eventBus.success('Subtitle downloaded', { title: movie.title, language: tCode });
        return;
      }
    }
    try {
      const translated = await translateWithProvider(enSrtContent, lang);
      fs.writeFileSync(targetSubPath, translated);
      eventBus.success('Subtitle translated', { title: movie.title, language: lang });
    } catch (e) { console.error(`[SubtitleService] Auto-translate failed:`, e.message); }
  };

  const movies = db.prepare("SELECT * FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
  await runWithConcurrency(movies, 3, async (movie) => {
    try {
      if (!fs.existsSync(movie.file_path)) return;
      const parsedPath = path.parse(movie.file_path);
      const enSubPath = path.join(parsedPath.dir, `${parsedPath.name}.en.srt`);
      if (!fs.existsSync(enSubPath)) return;

      const enSrtContent = fs.readFileSync(enSubPath, 'utf-8');
      for (const lang of targetLangs) await translateOrNativeMovie(parsedPath, movie, lang, enSrtContent);
    } catch (e) { /* ignore */ }
  });
};

const upgradeTranslatedToNative = async () => {
  const preferNative = db.prepare("SELECT value FROM settings WHERE key = 'preferNativeBeforeTranslate'").get();
  if (!preferNative || preferNative.value !== 'true') return;

  const keys = getProviderKeys();
  if (!keys.osApiKey && !keys.subdlApiKey && !keys.subsourceApiKey) return;

  let targetLangs = [];
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'targetLangs'").get();
    if (row) targetLangs = JSON.parse(row.value);
  } catch { /* ignore */ }
  const targetCodes = targetLangs.map(l => LANG_TO_CODE[l]).filter(Boolean);

  const movies = db.prepare("SELECT * FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
  await runWithConcurrency(movies, 3, async (movie) => {
    try {
      if (!fs.existsSync(movie.file_path)) return;
      const parsedPath = path.parse(movie.file_path);
      for (const tCode of targetCodes) {
        const subPath = path.join(parsedPath.dir, `${parsedPath.name}.${tCode}.srt`);
        if (!fs.existsSync(subPath)) continue;
        const nativeContent = await tryDownloadNativeMovie(movie, tCode);
        if (nativeContent) {
          fs.writeFileSync(subPath, nativeContent);
          eventBus.success('Subtitle upgraded', { title: movie.title, language: tCode });
        }
      }
    } catch (e) { /* ignore */ }
  });
};

const init = () => {
  const cronExp = '0 */6 * * *';
  const runAll = async () => {
    await downloadSubtitlesForMovies();
    await downloadSubtitlesForEpisodes();
    await autoTranslateExisting();
    await upgradeTranslatedToNative();
  };
  taskRegistry.registerTask('subtitle_downloader', 'Subtitle Downloader', 'Searches and downloads subtitles.', cronExp, runAll);
  const job = cron.schedule(cronExp, () => taskRegistry.executeTask('subtitle_downloader'));
  registerJob(job);
};

module.exports = {
  init,
  downloadSubtitlesForMovies,
  downloadSubtitlesForMovie,
  downloadSubtitlesForEpisode,
  searchSubtitlesForMovie,
  searchSubtitlesForEpisode
};
