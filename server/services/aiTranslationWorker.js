const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../config/database');
const taskRegistry = require('./taskRegistry');

const translateSubtitles = async () => {
  const geminiApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'geminiApiKey'").get();
  const targetLangRow = db.prepare("SELECT value FROM settings WHERE key = 'targetLang'").get();
  
  if (!geminiApiKeyRow || !geminiApiKeyRow.value) {
    throw new Error('Gemini API Key missing. Please set it in Settings.');
  }

  const targetLang = targetLangRow && targetLangRow.value ? targetLangRow.value : 'Dutch';
  const genAI = new GoogleGenerativeAI(geminiApiKeyRow.value);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const movies = db.prepare("SELECT * FROM movies WHERE status = 'downloaded' AND file_path IS NOT NULL").all();

  for (const movie of movies) {
    try {
      if (!fs.existsSync(movie.file_path)) continue;

      const parsedPath = path.parse(movie.file_path);
      const enSubPath = path.join(parsedPath.dir, `${parsedPath.name}.en.srt`);
      const targetSubPath = path.join(parsedPath.dir, `${parsedPath.name}.nl.srt`);

      // Translate only if English sub exists and Dutch sub does not exist
      if (fs.existsSync(enSubPath) && !fs.existsSync(targetSubPath)) {
        console.log(`[AITranslator] Translating subtitles for ${movie.title} into ${targetLang}...`);
        
        const enSrtContent = fs.readFileSync(enSubPath, 'utf8');

        // Due to context windows, we might need to send it all at once if the model handles it,
        // or split it. Gemini 1.5 Flash has a 1M token context window, so an SRT file fits easily!
        const prompt = `You are a professional subtitle translator. Translate the following SRT file from English to ${targetLang}. 
Keep the SRT formatting exactly the same (timestamps and sequence numbers). Do not add any extra text or conversational response, output ONLY the translated SRT content.

${enSrtContent}`;

        const result = await model.generateContent(prompt);
        const translatedText = result.response.text();

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
  translateSubtitles
};
