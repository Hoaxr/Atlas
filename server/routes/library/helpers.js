const db = require('../../config/database');

const isWatchedSyncEnabled = () => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'traktWatchedSync'").get();
  return row && row.value === 'true';
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

module.exports = { isWatchedSyncEnabled, translateSrt };
