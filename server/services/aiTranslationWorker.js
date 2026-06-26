const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../config/database');
const taskRegistry = require('./taskRegistry');

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
  // Free Google Translate endpoint (no API key needed)
  const langMap = { 'Dutch': 'nl', 'French': 'fr', 'German': 'de', 'Spanish': 'es', 'Italian': 'it', 'Portuguese': 'pt' };
  const target = langMap[targetLang] || 'nl';

  // Split SRT into lines, translate only the text lines (not timestamps/numbers)
  const lines = text.split('\n');
  const translatedLines = [];
  
  for (const line of lines) {
    // Skip timestamp lines and sequence numbers — translate only text content
    if (/^\d+$/.test(line.trim()) || /^\d{2}:\d{2}:\d{2}/.test(line.trim()) || line.trim() === '') {
      translatedLines.push(line);
    } else {
      try {
        const res = await axios.get('https://translate.googleapis.com/translate_a/single', {
          params: {
            client: 'gtx',
            sl: 'en',
            tl: target,
            dt: 't',
            q: line
          },
          timeout: 5000
        });
        // Response format: [[["translated","original",...]],...]
        const translated = res.data[0][0][0];
        translatedLines.push(translated || line);
      } catch {
        translatedLines.push(line); // fallback to original on error
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

  const langCode = { 'Dutch': 'nl', 'French': 'fr', 'German': 'de', 'Spanish': 'es', 'Italian': 'it', 'Portuguese': 'pt' }[targetLang] || 'nl';

  const movies = db.prepare("SELECT * FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();

  for (const movie of movies) {
    try {
      if (!fs.existsSync(movie.file_path)) continue;

      const parsedPath = path.parse(movie.file_path);
      const enSubPath = path.join(parsedPath.dir, `${parsedPath.name}.en.srt`);
      const targetSubPath = path.join(parsedPath.dir, `${parsedPath.name}.${langCode}.srt`);

      if (fs.existsSync(enSubPath) && !fs.existsSync(targetSubPath)) {
        console.log(`[AITranslator] Translating subtitles for ${movie.title} into ${targetLang} (via ${activeProvider})...`);
        
        const enSrtContent = fs.readFileSync(enSubPath, 'utf8');
        
        let translatedText;
        if (activeProvider === 'gemini') {
          translatedText = await translateWithGemini(enSrtContent, targetLang, geminiApiKeyRow.value);
        } else if (activeProvider === 'deepseek') {
          translatedText = await translateWithDeepSeek(enSrtContent, targetLang, deepseekApiKeyRow.value);
        } else if (activeProvider === 'claude') {
          translatedText = await translateWithClaude(enSrtContent, targetLang, claudeApiKeyRow.value);
        } else {
          translatedText = await translateWithGoogleTranslate(enSrtContent, targetLang);
        }

        fs.writeFileSync(targetSubPath, translatedText);
        console.log(`[AITranslator] Successfully translated and saved ${targetSubPath}`);
      }
    } catch (err) {
      console.error(`[AITranslator] Failed to translate ${movie.title}:`, err.message);
    }
  }
};

const init = () => {
  const cronExp = '0 */12 * * *'; // Every 12 hours
  
  taskRegistry.registerTask(
    'ai_translator', 
    'AI Subtitle Translator', 
    'Translates downloaded English subtitles into the target language using Gemini.',
    cronExp,
    translateSubtitles
  );

  cron.schedule(cronExp, () => taskRegistry.executeTask('ai_translator'));
  console.log('[AITranslator] Scheduler initialized.');
};

module.exports = {
  init,
  translateSubtitles,
  translateWithGemini,
  translateWithGoogleTranslate,
  translateWithDeepSeek,
  translateWithClaude
};
