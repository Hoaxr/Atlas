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
const { LANG_TO_CODE } = require('../../utils/constants');
const { protectTags, restoreTags } = require('./parser');

/**
 * Base Translation Provider
 */
class BaseTranslationProvider {
  constructor(name) {
    this.name = name;
  }

  async translateBatch(cues, sourceLang, targetLang, _options = {}) {
    throw new Error('translateBatch must be implemented by subclass');
  }

  async detectLanguage(_sampleText) {
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

  async translateBatch(cues, sourceLang, targetLang, _options = {}) {
    if (!cues || cues.length === 0) return [];

    const targetCode = LANG_TO_CODE[targetLang] || (typeof targetLang === 'string' && targetLang.length === 2 ? targetLang.toLowerCase() : 'nl');
    const sourceCode = LANG_TO_CODE[sourceLang] || (typeof sourceLang === 'string' && sourceLang.length === 2 ? sourceLang.toLowerCase() : 'en');

    // Protect formatting tags and internal newlines in each cue
    const NL_TOKEN = '❲NL❳';
    const protectedItems = cues.map(cue => {
      const { protectedText, tagMap } = protectTags(cue.text);
      // Replace internal newlines so each cue is strictly a single line when batched with \n
      const singleLine = protectedText.replace(/\r?\n/g, ` ${NL_TOKEN} `);
      return { id: cue.id, originalText: cue.text, protectedText: singleLine, tagMap };
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

    // Restore newlines and tags for each cue
    return protectedItems.map((item, idx) => {
      let translatedProtected = translatedLines[idx] !== undefined ? translatedLines[idx] : item.protectedText;
      // Restore internal newlines
      translatedProtected = translatedProtected.replace(new RegExp(`\\s*[❲\\[\\(]\\s*NL\\s*[❳\\]\\)]\\s*`, 'gi'), '\n');
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

const callWithTimeout = (promise, ms = 25000) => {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Gemini request timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
};

/**
 * Gemini AI Provider
 */
class GeminiProvider extends BaseTranslationProvider {
  constructor(apiKey, modelName) {
    super('gemini');
    this.apiKey = apiKey || db.prepare("SELECT value FROM settings WHERE key = 'geminiApiKey'").get()?.value;
    const dbModel = db.prepare("SELECT value FROM settings WHERE key = 'geminiModel'").get()?.value;
    this.modelName = modelName || dbModel || 'gemini-2.5-flash';
    this.fallbackGtx = new GoogleTranslateProvider();
  }

  async translateBatch(cues, sourceLang, targetLang, options = {}) {
    if (!this.apiKey) {
      console.warn('[GeminiProvider] No API key configured, falling back to Google Translate');
      return await this.fallbackGtx.translateBatch(cues, sourceLang, targetLang, options);
    }
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

Output ONLY valid JSON array (no markdown code fences):`;

    const candidateModels = [...new Set([
      this.modelName,
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-flash-latest'
    ].filter(Boolean))];
    let rawOutput = '';
    let lastErr = null;

    const isRateLimitError = (err) => {
      const msg = String(err?.message || '').toLowerCase();
      const status = err?.status || err?.response?.status;
      return status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('too many requests');
    };

    const extractRetryDelay = (err) => {
      try {
        const msg = String(err?.message || '');
        const match = msg.match(/retryDelay["']?\s*:\s*["']?(\d+(?:\.\d+)?)(s)?/i) || msg.match(/wait\s*(\d+)\s*s/i);
        if (match && match[1]) {
          return Math.ceil(parseFloat(match[1]) * 1000);
        }
      } catch { /* ignore */ }
      return null;
    };

    // Try models with rate limit backoff
    for (const m of candidateModels) {
      const maxRetries = 2;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const model = genAI.getGenerativeModel({
            model: m,
            generationConfig: {
              responseMimeType: "application/json"
            }
          });
          const result = await callWithTimeout(model.generateContent(prompt), 25000);
          rawOutput = result.response.text().trim();
          if (rawOutput) break;
        } catch (err) {
          lastErr = err;
          if (isRateLimitError(err) && attempt < maxRetries - 1) {
            const waitMs = Math.min(extractRetryDelay(err) || (3000 * Math.pow(1.5, attempt)), 8000);
            console.log(`[GeminiProvider] Rate limit / quota hit for ${m} (attempt ${attempt + 1}/${maxRetries}). Backing off ${waitMs}ms...`);
            if (typeof options.onStep === 'function') {
              options.onStep(`Gemini rate limit: waiting ${Math.round(waitMs / 1000)}s...`);
            }
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
          console.warn(`[GeminiProvider] Model ${m} attempt ${attempt + 1} failed: ${err.message}`);
          break; // Move to next candidate model
        }
      }
      if (rawOutput) break;
    }

    if (!rawOutput) {
      console.warn(`[GeminiProvider] All Gemini models failed (${lastErr?.message}). Gracefully falling back to Google Translate for this batch.`);
      if (typeof options.onStep === 'function') {
        options.onStep('Falling back to Google Translate...');
      }
      return await this.fallbackGtx.translateBatch(cues, sourceLang, targetLang, options);
    }
    
    let parsedArray;
    try {
      const cleaned = rawOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedArray = JSON.parse(cleaned);
    } catch (e) {
      console.warn('[GeminiProvider] JSON parse failed, falling back to Google Translate:', e.message);
      if (typeof options.onStep === 'function') {
        options.onStep('Falling back to Google Translate...');
      }
      return await this.fallbackGtx.translateBatch(cues, sourceLang, targetLang, options);
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

  async translateBatch(cues, sourceLang, targetLang, _options = {}) {
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

  async translateBatch(cues, sourceLang, targetLang, _options = {}) {
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
    'gemini';

  switch (provider) {
    case 'deepseek':
      return new DeepSeekProvider(overrides.deepseekApiKey, overrides.deepseekModel);
    case 'claude':
      return new ClaudeProvider(overrides.claudeApiKey, overrides.claudeModel);
    case 'googleTranslate':
      return new GoogleTranslateProvider();
    case 'gemini':
    default:
      return new GeminiProvider(overrides.geminiApiKey, overrides.geminiModel);
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
