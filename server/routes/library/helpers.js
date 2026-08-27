const db = require('../../config/database');
const { isWatchedSyncEnabled } = require('../../utils/settings');
const { LANG_TO_CODE } = require('../../utils/constants');
// aiTranslationWorker is lazy-required inside translateSrt to break the
// circular dependency: helpers → aiTranslationWorker → helpers (for LANG_CODE).


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
  // Lazy require to break the circular dependency with aiTranslationWorker
  const { translateWithProvider } = require('../../services/aiTranslationWorker');
  return await translateWithProvider(enSrtContent, targetLang);
};


// Re-exported from constants.js — single source of truth for language name → ISO 639-1 code.
const LANG_CODE = LANG_TO_CODE;

module.exports = { isWatchedSyncEnabled, translateSrt, getSubtitlesInDir, extractLang, LANG_CODE };
