const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../config/database');
const taskRegistry = require('./taskRegistry');
const eventBus = require('./eventBus');
const { runWithConcurrency } = require('../utils/concurrency');
const { registerJob } = require('../utils/cronRegistry');

const translateWithGemini = async (text, targetLang, apiKey) => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const prompt = `You are a professional subtitle translator. Translate the following SRT file from English to ${targetLang}. 
Keep the SRT formatting exactly the same (timestamps and sequence numbers). Do not add any extra text or conversational response, output ONLY the translated SRT content.

${text}`;
  const result = await model.generateContent(prompt);
  return result.response.text();
};

const translateWithGoogleTranslate = async (text, targetLang) => {
  const axios = require('axios');
  const { LANG_CODE } = require('../routes/library/helpers');
  const target = LANG_CODE[targetLang] || 'nl';

  // Split SRT into lines
  const lines = text.split('\n');
  const translatedLines = [];
  
  // Collect text lines with their indices for batch translation
  const textIndices = [];
  const textContents = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\d+$/.test(line.trim()) || /^\d{2}:\d{2}:\d{2}/.test(line.trim()) || line.trim() === '') {
      translatedLines[i] = line;
    } else {
      textIndices.push(i);
      textContents.push(line);
    }
  }
  
  // Batch translate with a unique separator that Google won't merge across.
  // This preserves the 1:1 line mapping and keeps subtitle sync intact.
  const SEP = ' [===] ';
  const BATCH_SIZE = 20;
  for (let b = 0; b < textContents.length; b += BATCH_SIZE) {
    const batch = textContents.slice(b, b + BATCH_SIZE);
    try {
      const res = await axios.get('https://translate.googleapis.com/translate_a/single', {
        params: { client: 'gtx', sl: 'en', tl: target, dt: 't', q: batch.join(SEP) },
        timeout: 10000
      });
      // Collect all translated text across response segments
      const segments = res.data?.[0] || [];
      let fullText = '';
      for (const seg of segments) {
        fullText += (seg?.[0] || '');
      }
      if (fullText.includes(SEP)) {
        const parts = fullText.split(SEP);
        for (let j = 0; j < batch.length && j < parts.length; j++) {
          translatedLines[textIndices[b + j]] = parts[j].trim();
        }
      } else {
        // Separator lost — use array response directly
        for (let j = 0; j < batch.length; j++) {
          translatedLines[textIndices[b + j]] = segments[j]?.[0] || batch[j];
        }
      }
    } catch {
      for (let j = 0; j < batch.length; j++) {
        translatedLines[textIndices[b + j]] = batch[j];
      }
    }
  }
  
  return translatedLines.join('\n');
};

const translateWithDeepSeek = async (text, targetLang, apiKey) => {
  const axios = require('axios');
  const prompt = `You are a professional subtitle translator. Translate the following SRT file from English to ${targetLang}. 
Keep the SRT formatting exactly the same (timestamps and sequence numbers). Do not add any extra text or conversational response, output ONLY the translated SRT content.

${text}`;
  const res = await axios.post('https://api.deepseek.com/v1/chat/completions', {
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }]
  }, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 60000
  });
  return res.data.choices[0].message.content;
};

const translateWithClaude = async (text, targetLang, apiKey) => {
  const axios = require('axios');
  const prompt = `You are a professional subtitle translator. Translate the following SRT file from English to ${targetLang}. 
Keep the SRT formatting exactly the same (timestamps and sequence numbers). Do not add any extra text or conversational response, output ONLY the translated SRT content.

${text}`;
  const res = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-3-haiku-20240307',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }]
  }, {
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    timeout: 60000
  });
  return res.data.content[0].text;
};

/**
 * Centralized translation dispatch — reads provider & API keys from DB settings
 * and routes to the correct translation function. Use this everywhere instead of
 * duplicating the 4-way if/else chain.
 *
 * @param {string} srtContent - Raw SRT text to translate
 * @param {string} targetLang - Target language name (e.g. 'Dutch', 'French')
 * @param {object} [overrides] - Optional overrides: { provider, geminiApiKey, deepseekApiKey, claudeApiKey }
 * @returns {Promise<string>} Translated SRT text
 */
const translateWithProvider = async (srtContent, targetLang, overrides = {}) => {
  const provider = overrides.provider ||
    db.prepare("SELECT value FROM settings WHERE key = 'translationProvider'").get()?.value ||
    'googleTranslate';

  const getApiKey = (keyName) => overrides[keyName] ||
    db.prepare(`SELECT value FROM settings WHERE key = ?`).get(keyName)?.value;

  if (provider === 'gemini') {
    const apiKey = getApiKey('geminiApiKey');
    if (!apiKey) throw new Error('Gemini API Key missing');
    return translateWithGemini(srtContent, targetLang, apiKey);
  }
  if (provider === 'deepseek') {
    const apiKey = getApiKey('deepseekApiKey');
    if (!apiKey) throw new Error('DeepSeek API Key missing');
    return translateWithDeepSeek(srtContent, targetLang, apiKey);
  }
  if (provider === 'claude') {
    const apiKey = getApiKey('claudeApiKey');
    if (!apiKey) throw new Error('Claude API Key missing');
    return translateWithClaude(srtContent, targetLang, apiKey);
  }
  // Default: Google Translate (no API key needed)
  return translateWithGoogleTranslate(srtContent, targetLang);
};

const translateSubtitles = async () => {
  const provider = db.prepare("SELECT value FROM settings WHERE key = 'translationProvider'").get();
  const geminiApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'geminiApiKey'").get();
  const deepseekApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'deepseekApiKey'").get();
  const claudeApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'claudeApiKey'").get();
  const targetLangRow = db.prepare("SELECT value FROM settings WHERE key = 'targetLang'").get();

  const activeProvider = (provider && provider.value) || 'googleTranslate';
  const targetLang = targetLangRow && targetLangRow.value ? targetLangRow.value : 'Dutch';

  const providerChecks = {
    gemini: { key: geminiApiKeyRow, name: 'Gemini API Key' },
    deepseek: { key: deepseekApiKeyRow, name: 'DeepSeek API Key' },
    claude: { key: claudeApiKeyRow, name: 'Claude API Key' },
  };

  if (providerChecks[activeProvider] && (!providerChecks[activeProvider].key || !providerChecks[activeProvider].key.value)) {
    throw new Error(`${providerChecks[activeProvider].name} missing. Please set it in Settings.`);
  }

  const { LANG_CODE } = require('../routes/library/helpers');
  const langCode = LANG_CODE[targetLang] || 'nl';

  const translateFile = async (filePath, displayName, seasonNum, episodeNum) => {
    if (!fs.existsSync(filePath)) return null;

    const parsedPath = path.parse(filePath);
    const dir = parsedPath.dir;
    const enSubPath = path.join(dir, `${parsedPath.name}.en.srt`);

    // Find English subtitle — try exact name match first, then SxxExx pattern for episodes
    let enSub = null;
    if (fs.existsSync(enSubPath)) {
      enSub = enSubPath;
    } else if (seasonNum !== undefined && episodeNum !== undefined) {
      try {
        const files = fs.readdirSync(dir);
        const matchStr1 = `s${String(seasonNum).padStart(2, '0')}e${String(episodeNum).padStart(2, '0')}`;
        const matchStr2 = `${seasonNum}x${String(episodeNum).padStart(2, '0')}`;
        const found = files.find(f => {
          const fLower = f.toLowerCase();
          return fLower.endsWith('.en.srt') && (fLower.includes(matchStr1) || fLower.includes(matchStr2));
        });
        if (found) enSub = path.join(dir, found);
      } catch { /* ignore */ }
    }

    if (!enSub) return null;

    // Determine target path from the found English subtitle name
    const enParsed = path.parse(enSub);
    const targetSub = path.join(dir, `${enParsed.name.replace(/\.en$/, '')}.${langCode}.srt`);
    if (fs.existsSync(targetSub)) return null;

    console.log(`[AITranslator] Translating subtitles for ${displayName} into ${targetLang} (via ${activeProvider})...`);
    
    const enSrtContent = fs.readFileSync(enSub, 'utf8');
    
    const translatedText = await translateWithProvider(enSrtContent, targetLang, {
      provider: activeProvider,
      geminiApiKey: geminiApiKeyRow?.value,
      deepseekApiKey: deepseekApiKeyRow?.value,
      claudeApiKey: claudeApiKeyRow?.value
    });

    fs.writeFileSync(targetSub, translatedText);
    console.log(`[AITranslator] Successfully translated and saved ${targetSub}`);
    return displayName;
  };

  // Process movies
  const movies = db.prepare("SELECT * FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();
  let translatedCount = 0;
  
  const processMovie = async (movie) => {
    try {
      const result = await translateFile(movie.file_path, movie.title);
      if (result) {
        eventBus.success('Subtitle translated', { title: movie.title, type: 'movie', language: targetLang });
        translatedCount++;
      }
    } catch (err) {
      console.error(`[AITranslator] Failed to translate ${movie.title}:`, err.message);
      eventBus.error(`Subtitle translation failed: ${movie.title}`, { title: movie.title, type: 'movie', error: err.message });
    }
  };

  await runWithConcurrency(movies, 2, processMovie);

  // Process TV show episodes
  const episodes = db.prepare("SELECT e.*, s.title as show_title FROM episodes e JOIN shows s ON e.show_id = s.id WHERE e.status = 'downloaded' AND e.file_path IS NOT NULL").all();
  
  const processEpisode = async (ep) => {
    try {
      const label = `${ep.show_title} S${String(ep.season_number).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')}`;
      const result = await translateFile(ep.file_path, label, ep.season_number, ep.episode_number);
      if (result) {
        eventBus.success('Subtitle translated', { title: label, type: 'episode', language: targetLang });
        translatedCount++;
      }
    } catch (err) {
      console.error(`[AITranslator] Failed to translate ${ep.show_title} S${ep.season_number}E${ep.episode_number}:`, err.message);
      eventBus.error(`Subtitle translation failed: ${ep.show_title} S${ep.season_number}E${ep.episode_number}`, { title: `${ep.show_title} S${ep.season_number}E${ep.episode_number}`, type: 'episode', error: err.message });
    }
  };

  await runWithConcurrency(episodes, 2, processEpisode);

  if (translatedCount > 0) {
    console.log(`[AITranslator] Translated ${translatedCount} subtitle(s) into ${targetLang}`);
  }
};

const init = () => {
  const cronExp = '0 */12 * * *'; // Every 12 hours
  
  taskRegistry.registerTask(
    'ai_translator', 
    'AI Subtitle Translator', 
    'Translates downloaded English subtitles into the target language.',
    cronExp,
    translateSubtitles
  );

  const job = cron.schedule(cronExp, () => taskRegistry.executeTask('ai_translator'));
  registerJob(job);
  console.log('[AITranslator] Scheduler initialized.');
};

module.exports = {
  init,
  translateSubtitles,
  translateWithProvider,
  translateWithGemini,
  translateWithGoogleTranslate,
  translateWithDeepSeek,
  translateWithClaude
};
