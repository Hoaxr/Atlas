const db = require('../../config/database');
const { isWatchedSyncEnabled } = require('../../utils/settings');

const SUBTITLE_EXTS = ['.srt', '.sub', '.vtt', '.ass', '.ssa', '.smi', '.idx'];

const getSubtitlesInDir = async (dir, fsp, pathLib) => {
  try {
    const items = await fsp.readdir(dir);
    return items.filter(item => {
      const ext = pathLib.extname(item).toLowerCase();
      return SUBTITLE_EXTS.includes(ext);
    });
  } catch {
    return [];
  }
};

const extractLang = (filename, pathLib) => {
  const name = pathLib.basename(filename, pathLib.extname(filename));
  // Try language code at the very end first (e.g. .en, _nl)
  let match = name.match(/[._]([a-z]{2,3})$/i);
  // Fallback: language code followed by another separator (e.g. .en.forced)
  if (!match) match = name.match(/[._]([a-z]{2,3})(?=[._])/i);
  if (match) {
    const code = match[1].toLowerCase();
    // Map 3-letter and full codes to 2-letter
    const langMap = {
      eng: 'en', english: 'en',
      nld: 'nl', dutch: 'nl',
      fra: 'fr', fre: 'fr', french: 'fr',
      deu: 'de', ger: 'de', german: 'de',
      spa: 'es', spanish: 'es',
      ita: 'it', italian: 'it',
      por: 'pt', portuguese: 'pt',
    };
    return langMap[code] || code;
  }
  return 'unknown';
};

const translateSrt = async (enSrtContent, targetLang) => {
  const provider = db.prepare("SELECT value FROM settings WHERE key = 'translationProvider'").get();
  const activeProvider = (provider && provider.value) || 'googleTranslate';
  const { translateWithGemini, translateWithGoogleTranslate, translateWithDeepSeek, translateWithClaude } = require('../../services/aiTranslationWorker');

  if (activeProvider === 'gemini') {
    const geminiApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'geminiApiKey'").get();
    if (!geminiApiKeyRow || !geminiApiKeyRow.value) throw new Error('Gemini API Key missing. Set it in Settings.');
    return await translateWithGemini(enSrtContent, targetLang, geminiApiKeyRow.value);
  } else if (activeProvider === 'deepseek') {
    const deepseekApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'deepseekApiKey'").get();
    if (!deepseekApiKeyRow || !deepseekApiKeyRow.value) throw new Error('DeepSeek API Key missing. Set it in Settings.');
    return await translateWithDeepSeek(enSrtContent, targetLang, deepseekApiKeyRow.value);
  } else if (activeProvider === 'claude') {
    const claudeApiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'claudeApiKey'").get();
    if (!claudeApiKeyRow || !claudeApiKeyRow.value) throw new Error('Claude API Key missing. Set it in Settings.');
    return await translateWithClaude(enSrtContent, targetLang, claudeApiKeyRow.value);
  } else {
    return await translateWithGoogleTranslate(enSrtContent, targetLang);
  }
};

// Shared language name → ISO 639-1 code mapping
const LANG_CODE = { 'Dutch': 'nl', 'French': 'fr', 'German': 'de', 'Spanish': 'es', 'Italian': 'it', 'Portuguese': 'pt' };

module.exports = { isWatchedSyncEnabled, translateSrt, getSubtitlesInDir, extractLang, LANG_CODE };
