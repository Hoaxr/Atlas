/**
 * Subtitle Parser, Serializer & Tag Protection Engine
 * 
 * Supports:
 * - SubRip (.srt) and WebVTT (.vtt)
 * - Timing preservation (milliseconds start/end)
 * - Tag & formatting protection (HTML, ASS, Sound/Music, Speakers)
 */

/**
 * Parses timestamp string (00:01:23,456 or 00:01:23.456) to milliseconds.
 */
function timestampToMs(timeStr) {
  if (!timeStr) return 0;
  const match = timeStr.trim().match(/(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const millis = parseInt(match[4], 10);
  return hours * 3600000 + minutes * 60000 + seconds * 1000 + millis;
}

/**
 * Converts milliseconds to SRT timestamp string (00:00:00,000) or VTT (00:00:00.000).
 */
function msToTimestamp(ms, format = 'srt') {
  if (isNaN(ms) || ms < 0) ms = 0;
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);

  const pad2 = (n) => String(n).padStart(2, '0');
  const pad3 = (n) => String(n).padStart(3, '0');
  const sep = format === 'vtt' ? '.' : ',';

  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}${sep}${pad3(millis)}`;
}

/**
 * Tag & token patterns to protect from machine translation
 */
const TAG_PATTERNS = [
  // ASS / SSA override tags (e.g. {\an8}, {\pos(100,200)})
  /\{[\\/][^}]+\}/gi,
  // HTML tags (e.g. <i>, </b>, <font color="#ff0000">)
  /<\/?[a-zA-Z][^>]*>/gi,
  // Music notes symbols (e.g. ♪, ♫, &#9834;)
  /[♪♫]/g,
  // Sound / environment indicators: [Music], [Applause], (Gunshot), (Laughter)
  /\[[a-zA-Z0-9\s.,'?!_-]{2,40}\]/g,
  /\([a-zA-Z0-9\s.,'?!_-]{2,40}\)/g,
  // Speaker prefix at start of line (e.g. "JOHN:", "DETECTIVE MILLER:")
  /^[A-Z0-9\s.'_-]{2,25}:(?=\s)/gm
];

/**
 * Protects formatting tags, sound descriptions, and special markers by
 * substituting them with language-neutral placeholder tokens: ❲T1❳, ❲T2❳, etc.
 * 
 * @param {string} text 
 * @returns {{ protectedText: string, tagMap: Map<string, string> }}
 */
function protectTags(text) {
  if (!text) return { protectedText: '', tagMap: new Map() };

  let tokenIndex = 1;
  const tagMap = new Map();
  let protectedText = text;

  for (const pattern of TAG_PATTERNS) {
    protectedText = protectedText.replace(pattern, (match) => {
      // If already a token, don't re-tokenize
      if (/^❲T\d+❳$/.test(match)) return match;
      const token = `❲T${tokenIndex++}❳`;
      tagMap.set(token, match);
      return token;
    });
  }

  return { protectedText, tagMap };
}

/**
 * Restores original formatting tags and special tokens into translated text.
 * 
 * @param {string} translatedText 
 * @param {Map<string, string>} tagMap 
 * @returns {string}
 */
function restoreTags(translatedText, tagMap) {
  if (!translatedText || !tagMap || tagMap.size === 0) return translatedText || '';

  let restored = translatedText;

  // Handle minor spacing alterations translation engines might inject (e.g. "❲ T1 ❳" or "(T1)")
  for (const [token, originalTag] of tagMap.entries()) {
    const tokenNum = token.replace(/[^\d]/g, '');
    const flexibleRegex = new RegExp(`[❲\\[\\(]\\s*T\\s*${tokenNum}\\s*[❳\\]\\)]`, 'g');
    restored = restored.replace(flexibleRegex, originalTag);
  }

  // Exact fallback
  for (const [token, originalTag] of tagMap.entries()) {
    if (restored.includes(token)) {
      restored = restored.split(token).join(originalTag);
    }
  }

  return restored;
}

/**
 * Parses raw SRT or VTT content into an array of structured SubtitleCue objects.
 * 
 * @param {string} rawContent 
 * @returns {{ cues: Array<object>, format: 'srt'|'vtt', header: string }}
 */
function parseSubtitles(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    return { cues: [], format: 'srt', header: '' };
  }

  // Normalize line breaks
  const normalized = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const format = normalized.startsWith('WEBVTT') ? 'vtt' : 'srt';

  let header = '';
  let body = normalized;

  if (format === 'vtt') {
    const firstDoubleBreak = normalized.indexOf('\n\n');
    if (firstDoubleBreak !== -1) {
      header = normalized.substring(0, firstDoubleBreak).trim();
      body = normalized.substring(firstDoubleBreak + 2).trim();
    }
  }

  const blocks = body.split(/\n\n+/);
  const cues = [];

  const timeLineRegex = /(?:(\d+)\n)?((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3})(?:[ \t]+([^\n\r]*))?/;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;

    const match = block.match(timeLineRegex);
    if (match) {
      const explicitId = match[1] ? parseInt(match[1], 10) : null;
      const startTime = match[2];
      const endTime = match[3];
      const settings = match[4] || '';

      const matchIndex = match.index || 0;
      const matchLength = match[0].length;
      const textAfterTime = block.substring(matchIndex + matchLength).trim();

      const startMs = timestampToMs(startTime);
      const endMs = timestampToMs(endTime);

      cues.push({
        id: explicitId || cues.length + 1,
        startTime: msToTimestamp(startMs, format),
        endTime: msToTimestamp(endMs, format),
        startMs,
        endMs,
        settings: settings.trim(),
        text: textAfterTime,
        lines: textAfterTime.split('\n')
      });
    }
  }

  return { cues, format, header };
}

/**
 * Serializes an array of SubtitleCue objects back to SRT or VTT string.
 * 
 * @param {Array<object>} cues 
 * @param {'srt'|'vtt'} [format='srt'] 
 * @param {string} [header=''] 
 * @returns {string}
 */
function serializeSubtitles(cues, format = 'srt', header = '') {
  if (!Array.isArray(cues) || cues.length === 0) {
    return format === 'vtt' ? 'WEBVTT\n\n' : '';
  }

  const blocks = [];

  if (format === 'vtt') {
    blocks.push(header || 'WEBVTT\n');
  }

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const id = i + 1;
    const start = msToTimestamp(cue.startMs !== undefined ? cue.startMs : timestampToMs(cue.startTime), format);
    const end = msToTimestamp(cue.endMs !== undefined ? cue.endMs : timestampToMs(cue.endTime), format);
    const settings = cue.settings ? ` ${cue.settings}` : '';
    const text = (cue.text || '').trim();

    if (format === 'srt') {
      blocks.push(`${id}\n${start} --> ${end}${settings}\n${text}`);
    } else {
      blocks.push(`${id}\n${start} --> ${end}${settings}\n${text}`);
    }
  }

  return blocks.join('\n\n') + '\n';
}

module.exports = {
  timestampToMs,
  msToTimestamp,
  protectTags,
  restoreTags,
  parseSubtitles,
  serializeSubtitles
};
