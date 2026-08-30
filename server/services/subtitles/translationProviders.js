/**
 * Subtitle Translation Providers Abstraction Layer
 * 
 * Provides unified interfaces for translating subtitle cue batches across:
 * - Google Translate (free, resilient recursive batch halving + backoff)
 * - Gemini AI (Google Generative AI)
 * - DeepSeek AI (OpenAI-compatible)
 * - Claude (Anthropic)
 * - Custom OpenAI / LocalAI
 */

const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../../config/database');
const { LANG_TO_CODE, CODE_TO_LANG } = require('../../utils/constants');
const { protectTags, restoreTags } = require('./parser');

/**
 * Base Translation Provider
 */
class BaseTranslationProvider {
  constructor(name) {
    this.name = name;
  }

  async translateBatch(cues, sourceLang, targetLang, options = {}) {
    throw new Error('translateBatch must be implemented by subclass');
  }

  async detectLanguage(sampleText) {
    return 'en';
  }
}

/**
 * Google Translate (Web/GTX API) Provider
 * Fast, free, with recursive batch halving and 429 exponential backoff.
 */
class GoogleTranslateProvider extends BaseTranslationProvider {
  constructor() {
    super('googleTranslate');
  }

  async translateBatch(cues, sourceLang, targetLang, options = {}) {
    if (!cues || cues.length === 0) return [];

    const targetCode = LANG_TO_CODE[targetLang] || (typeof targetLang === 'string' && targetLang.length === 2 ? targetLang.toLowerCase() : 'nl');
    const sourceCode = LANG_TO_CODE[sourceLang] || (typeof sourceLang === 'string' && sourceLang.length === 2 ? sourceLang.toLowerCase() : 'en');

    // Protect formatting tags in each cue
    const protectedItems = cues.map(cue => {
      const { protectedText, tagMap } = protectTags(cue.text);
      return { id: cue.id, originalText: cue.text, protectedText, tagMap };
    });

    const linesToTranslate = protectedItems.map(item => item.protectedText);

    const gtxTranslate = async (lines, target, source, retries = 4) => {
      if (lines.length === 0) return [];
      const q = lines.join('\n');
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const res = await axios.get('https://translate.googleapis.com/translate_a/single', {
            params: { client: 'gtx', sl: source, tl: target, dt: 't', q },
            timeout: 15000
          });
          const segments = res.data?.[0] || [];
          let fullText = '';
          for (const seg of segments) fullText += (seg?.[0] || '');
          const parts = fullText.split('\n');
          return lines.map((orig, i) => parts[i]?.trim() || orig);
        } catch (err) {
          const status = err?.response?.status;
          if (status === 429 && attempt < retries - 1) {
            const wait = 2000 * Math.pow(2, attempt);
            console.log(`[GoogleTranslate] 429 rate limited, retrying in ${wait}ms...`);
            await new Promise(r => setTimeout(r, wait));
            continue;
          }
          // On batch error (400, 413, etc.), recursively halve the batch
          if (lines.length > 1) {
            const mid = Math.ceil(lines.length / 2);
            await new Promise(r => setTimeout(r, 250));
            const left = await gtxTranslate(lines.slice(0, mid), target, source, retries);
            await new Promise(r => setTimeout(r, 250));
            const right = await gtxTranslate(lines.slice(mid), target, source, retries);
            return [...left, ...right];
          }
          console.warn(`[GoogleTranslate] Single line translation failed, keeping original: ${err?.message}`);
          return lines;
        }
      }
      return lines;
    };

    const translatedLines = await gtxTranslate(linesToTranslate, targetCode, sourceCode);

    // Restore tags for each cue
    return protectedItems.map((item, idx) => {
      const translatedProtected = translatedLines[idx] !== undefined ? translatedLines[idx] : item.protectedText;
      const restoredText = restoreTags(translatedProtected, item.tagMap);
      return {
        id: item.id,
        text: restoredText
      };
    });
  }

  async detectLanguage(sampleText) {
    if (!sampleText) return 'en';
    try {
      const res = await axios.get('https://translate.googleapis.com/translate_a/single', {
        params: { client: 'gtx', sl: 'auto', tl: 'en', dt: 't', q: sampleText.substring(0, 500) },
        timeout: 8000
      });
      return res.data?.[2] || 'en';
    } catch {
      return 'en';
    }
  }
}

/**
 * Gemini AI Provider
 */
class GeminiProvider extends BaseTranslationProvider {
  constructor(apiKey, modelName) {
    super('gemini');
    this.apiKey = apiKey || db.prepare("SELECT value FROM settings WHERE key = 'geminiApiKey'").get()?.value;
    this.modelName = modelName || db.prepare("SELECT value FROM settings WHERE key = 'geminiModel'").get()?.value || 'gemini-1.5-flash';
  }

  async translateBatch(cues, sourceLang, targetLang, options = {}) {
    if (!this.apiKey) throw new Error('Gemini API key is required. Please configure it in Settings.');
    if (!cues || cues.length === 0) return [];

    const protectedItems = cues.map(cue => {
      const { protectedText, tagMap } = protectTags(cue.text);
      return { id: cue.id, originalText: cue.text, protectedText, tagMap };
    });

    const genAI = new GoogleGenerativeAI(this.apiKey);

    const cuesPayload = protectedItems.map(item => ({
      id: item.id,
      text: item.protectedText
    }));

    const prompt = `You are a professional film and television subtitle translator.
Translate the following subtitle dialogue cues from ${sourceLang || 'English'} to ${targetLang}.

CRITICAL RULES:
1. Preserve all special placeholder tokens exactly as they are (e.g., ❲T1❳, ❲T2❳, ❲S1❳, ❲M1❳). Do not remove or alter tokens.
2. Return a valid JSON array of objects with fields "id" and "text".
3. Maintain natural dialogue flow, character voice, and conversational context.
4. Keep line breaks inside cues if appropriate.
5. Return exactly ${cuesPayload.length} translated items matching the input IDs.

Input cues JSON:
${JSON.stringify(cuesPayload, null, 2)}

Output ONLY valid JSON array (no markdown code fences if possible, or \`\`\`json):`;

    const candidateModels = [this.modelName, 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash'].filter(Boolean);
    let rawOutput = '';
    let lastErr = null;

    for (const m of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({ model: m });
        const result = await model.generateContent(prompt);
        rawOutput = result.response.text().trim();
        if (rawOutput) break;
      } catch (err) {
        lastErr = err;
        console.warn(`[GeminiProvider] Model ${m} failed: ${err.message}, trying next model...`);
      }
    }

    if (!rawOutput) {
      throw lastErr || new Error('Gemini translation request failed');
    }
    
    let parsedArray = [];
    try {
      const cleaned = rawOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedArray = JSON.parse(cleaned);
    } catch (e) {
      console.warn('[GeminiProvider] JSON parse failed, falling back to line mapping:', e.message);
    }

    const resultMap = new Map();
    if (Array.isArray(parsedArray)) {
      for (const item of parsedArray) {
        if (item && item.id !== undefined && item.text !== undefined) {
          resultMap.set(String(item.id), String(item.text));
        }
      }
    }

    return protectedItems.map(item => {
      const translated = resultMap.get(String(item.id)) || item.protectedText;
      return {
        id: item.id,
        text: restoreTags(translated, item.tagMap)
      };
    });
  }
}

/**
 * DeepSeek AI Provider (OpenAI Compatible)
 */
class DeepSeekProvider extends BaseTranslationProvider {
  constructor(apiKey, modelName) {
    super('deepseek');
    this.apiKey = apiKey || db.prepare("SELECT value FROM settings WHERE key = 'deepseekApiKey'").get()?.value;
    this.modelName = modelName || 'deepseek-chat';
  }

  async translateBatch(cues, sourceLang, targetLang, options = {}) {
    if (!this.apiKey) throw new Error('DeepSeek API key is required. Please configure it in Settings.');
    if (!cues || cues.length === 0) return [];

    const protectedItems = cues.map(cue => {
      const { protectedText, tagMap } = protectTags(cue.text);
      return { id: cue.id, originalText: cue.text, protectedText, tagMap };
    });

    const cuesPayload = protectedItems.map(item => ({
      id: item.id,
      text: item.protectedText
    }));

    const prompt = `You are a professional film and television subtitle translator.
Translate the following subtitle dialogue cues from ${sourceLang || 'English'} to ${targetLang}.

CRITICAL RULES:
1. Preserve all special placeholder tokens exactly as they are (e.g., ❲T1❳, ❲T2❳). Do not remove or alter tokens.
2. Return a valid JSON array of objects with fields "id" and "text".
3. Return exactly ${cuesPayload.length} translated items matching the input IDs.

Input cues JSON:
${JSON.stringify(cuesPayload, null, 2)}

Output ONLY valid JSON array:`;

    const res = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: this.modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    }, {
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      timeout: 60000
    });

    const rawOutput = res.data?.choices?.[0]?.message?.content?.trim() || '';
    let parsedArray = [];
    try {
      const cleaned = rawOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedArray = JSON.parse(cleaned);
    } catch (e) {
      console.warn('[DeepSeekProvider] JSON parse failed:', e.message);
    }

    const resultMap = new Map();
    if (Array.isArray(parsedArray)) {
      for (const item of parsedArray) {
        if (item && item.id !== undefined && item.text !== undefined) {
          resultMap.set(String(item.id), String(item.text));
        }
      }
    }

    return protectedItems.map(item => {
      const translated = resultMap.get(String(item.id)) || item.protectedText;
      return {
        id: item.id,
        text: restoreTags(translated, item.tagMap)
      };
    });
  }
}

/**
 * Claude (Anthropic) Provider
 */
class ClaudeProvider extends BaseTranslationProvider {
  constructor(apiKey, modelName) {
    super('claude');
    this.apiKey = apiKey || db.prepare("SELECT value FROM settings WHERE key = 'claudeApiKey'").get()?.value;
    this.modelName = modelName || db.prepare("SELECT value FROM settings WHERE key = 'claudeModel'").get()?.value || 'claude-3-haiku-20240307';
  }

  async translateBatch(cues, sourceLang, targetLang, options = {}) {
    if (!this.apiKey) throw new Error('Claude API key is required. Please configure it in Settings.');
    if (!cues || cues.length === 0) return [];

    const protectedItems = cues.map(cue => {
      const { protectedText, tagMap } = protectTags(cue.text);
      return { id: cue.id, originalText: cue.text, protectedText, tagMap };
    });

    const cuesPayload = protectedItems.map(item => ({
      id: item.id,
      text: item.protectedText
    }));

    const prompt = `You are a professional film and television subtitle translator.
Translate the following subtitle dialogue cues from ${sourceLang || 'English'} to ${targetLang}.

CRITICAL RULES:
1. Preserve all special placeholder tokens exactly as they are (e.g., ❲T1❳, ❲T2❳).
2. Return a valid JSON array of objects with fields "id" and "text".
3. Return exactly ${cuesPayload.length} translated items matching the input IDs.

Input cues JSON:
${JSON.stringify(cuesPayload, null, 2)}

Output ONLY valid JSON array:`;

    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: this.modelName,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    }, {
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    const rawOutput = res.data?.content?.[0]?.text?.trim() || '';
    let parsedArray = [];
    try {
      const cleaned = rawOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedArray = JSON.parse(cleaned);
    } catch (e) {
      console.warn('[ClaudeProvider] JSON parse failed:', e.message);
    }

    const resultMap = new Map();
    if (Array.isArray(parsedArray)) {
      for (const item of parsedArray) {
        if (item && item.id !== undefined && item.text !== undefined) {
          resultMap.set(String(item.id), String(item.text));
        }
      }
    }

    return protectedItems.map(item => {
      const translated = resultMap.get(String(item.id)) || item.protectedText;
      return {
        id: item.id,
        text: restoreTags(translated, item.tagMap)
      };
    });
  }
}

/**
 * Provider Factory
 */
function getTranslationProvider(providerName, overrides = {}) {
  const provider = providerName ||
    overrides.provider ||
    db.prepare("SELECT value FROM settings WHERE key = 'translationProvider'").get()?.value ||
    'googleTranslate';

  switch (provider) {
    case 'gemini':
      return new GeminiProvider(overrides.geminiApiKey, overrides.geminiModel);
    case 'deepseek':
      return new DeepSeekProvider(overrides.deepseekApiKey, overrides.deepseekModel);
    case 'claude':
      return new ClaudeProvider(overrides.claudeApiKey, overrides.claudeModel);
    case 'googleTranslate':
    default:
      return new GoogleTranslateProvider();
  }
}

/**
 * Splits cues into contextual batches
 */
function createCueBatches(cues, batchSize = 20) {
  const batches = [];
  for (let i = 0; i < cues.length; i += batchSize) {
    batches.push(cues.slice(i, i + batchSize));
  }
  return batches;
}

module.exports = {
  BaseTranslationProvider,
  GoogleTranslateProvider,
  GeminiProvider,
  DeepSeekProvider,
  ClaudeProvider,
  getTranslationProvider,
  createCueBatches
};
