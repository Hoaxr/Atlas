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

const { VALID_LANGUAGES, parseSubtitleMetadata } = require('../../utils/languages');

const extractLang = (filename, pathLib) => {
  const meta = parseSubtitleMetadata(filename);
  if (meta.langCode && meta.langCode !== 'und') {
    return meta.langCode;
  }
  return 'en';
};

const translateSrt = async (enSrtContent, targetLang) => {
  // Lazy require to break the circular dependency with aiTranslationWorker
  const { translateWithProvider } = require('../../services/aiTranslationWorker');
  return await translateWithProvider(enSrtContent, targetLang);
};


// Re-exported from constants.js — single source of truth for language name → ISO 639-1 code.
const LANG_CODE = LANG_TO_CODE;

module.exports = { isWatchedSyncEnabled, translateSrt, getSubtitlesInDir, extractLang, LANG_CODE };
