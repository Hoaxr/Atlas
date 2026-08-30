/**
 * Subtitle Parser, Serializer & Tag Protection Engine
 * 
 * Supports:
 * - SubRip (.srt), WebVTT (.vtt), and Advanced SubStation Alpha (.ass/.ssa)
 * - Auto encoding detection: UTF-8 (with/without BOM), UTF-16 LE, UTF-16 BE, Latin1/Windows-1252
 * - Timing preservation (exact milliseconds start/end)
 * - Tag & formatting protection (HTML, ASS, Sound/Music, Speakers)
 */

const fs = require('fs');
const fsp = require('fs').promises;

/**
 * Decodes a raw Buffer into a normalized UTF-8 string,
 * automatically handling UTF-16 LE/BE, UTF-8 BOM, and Latin1 fallbacks.
 * 
 * @param {Buffer|string} input 
 * @returns {string}
 */
function decodeSubtitleBuffer(input) {
  if (!input) return '';
  if (typeof input === 'string') {
    // If it's a string, strip BOM and clean null bytes if it was misread
    let s = input.replace(/^\uFEFF/, '').replace(/^\uFFFE/, '');
    if (s.includes('\u0000')) {
      s = s.replace(/\u0000/g, '');
    }
    return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  const buf = input;
  if (!Buffer.isBuffer(buf) || buf.length === 0) return '';

  let text = '';

  // 1. UTF-16 LE BOM: 0xFF 0xFE
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    text = buf.slice(2).toString('utf16le');
  }
  // 2. UTF-16 BE BOM: 0xFE 0xFF
  else if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    const copy = Buffer.from(buf.slice(2));
    copy.swap16();
    text = copy.toString('utf16le');
  }
  // 3. UTF-8 BOM: 0xEF 0xBB 0xBF
  else if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    text = buf.slice(3).toString('utf8');
  }
  // 4. Check for high density of null bytes (UTF-16 without BOM)
  else {
    let nullCount = 0;
    const sampleLen = Math.min(200, buf.length);
    for (let i = 0; i < sampleLen; i++) {
      if (buf[i] === 0) nullCount++;
    }

    if (nullCount > sampleLen * 0.15) {
      text = buf.toString('utf16le');
    } else {
      const utf8Str = buf.toString('utf8');
      // If invalid UTF-8 replacement characters present, fallback to latin1
      if (utf8Str.includes('\uFFFD')) {
        text = buf.toString('latin1');
      } else {
        text = utf8Str;
      }
    }
  }

  // Strip any remaining BOM or null bytes
  text = text.replace(/^\uFEFF/, '').replace(/^\uFFFE/, '').replace(/\u0000/g, '');
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Safely reads and decodes a subtitle file from disk.
 * 
 * @param {string} filePath 
 * @returns {Promise<string>}
 */
async function readSubtitleFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Subtitle file not found: ${filePath}`);
  }
  const buf = await fsp.readFile(filePath);
  if (buf.length === 0) {
    throw new Error('Subtitle file is empty (0 bytes)');
  }
  const text = decodeSubtitleBuffer(buf).trim();
  if (!text) {
    throw new Error('Subtitle file contains no readable text content');
  }
  if (text.toLowerCase().startsWith('<!doctype html') || text.toLowerCase().startsWith('<html')) {
    throw new Error('File appears to be an HTML error page, not a valid subtitle');
  }
  return text;
}

/**
 * Parses timestamp string (00:01:23,456 or 00:01:23.456 or 1:23:45.67) to milliseconds.
 */
function timestampToMs(timeStr) {
  if (!timeStr) return 0;
  const match = timeStr.trim().match(/(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{1,4})/);
  if (!match) {
    // Fallback: MM:SS,mmm format without hours
    const matchNoHour = timeStr.trim().match(/(\d{1,2}):(\d{2})[,.](\d{1,4})/);
    if (matchNoHour) {
      const mins = parseInt(matchNoHour[1], 10);
      const secs = parseInt(matchNoHour[2], 10);
      const ms = parseInt(matchNoHour[3].padEnd(3, '0').slice(0, 3), 10);
      return mins * 60000 + secs * 1000 + ms;
    }
    return 0;
  }
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const millis = parseInt(match[4].padEnd(3, '0').slice(0, 3), 10);
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

  for (const [token, originalTag] of tagMap.entries()) {
    const tokenNum = token.replace(/[^\d]/g, '');
    const flexibleRegex = new RegExp(`[❲\\[\\(]\\s*T\\s*${tokenNum}\\s*[❳\\]\\)]`, 'g');
    restored = restored.replace(flexibleRegex, originalTag);
  }

  for (const [token, originalTag] of tagMap.entries()) {
    if (restored.includes(token)) {
      restored = restored.split(token).join(originalTag);
    }
  }

  return restored;
}

/**
 * Parses raw SRT, VTT, or ASS/SSA content into an array of structured SubtitleCue objects.
 * 
 * @param {Buffer|string} rawInput 
 * @returns {{ cues: Array<object>, format: 'srt'|'vtt'|'ass', header: string }}
 */
function parseSubtitles(rawInput) {
  const cleaned = decodeSubtitleBuffer(rawInput);
  if (!cleaned) {
    return { cues: [], format: 'srt', header: '' };
  }

  const isVtt = cleaned.startsWith('WEBVTT');
  const isAss = cleaned.includes('[Events]') && cleaned.includes('Dialogue:');
  const format = isVtt ? 'vtt' : (isAss ? 'ass' : 'srt');

  // Handle ASS / SSA subtitles
  if (isAss) {
    const cues = [];
    const lines = cleaned.split('\n');
    let cueId = 1;
    for (const line of lines) {
      const match = line.match(/^Dialogue:\s*\d+,\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{2,3}),\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{2,3}),[^,]*?,[^,]*?,[^,]*?,[^,]*?,[^,]*?,[^,]*?,(.*)$/i);
      if (match) {
        const startTime = match[1];
        const endTime = match[2];
        const text = match[3].replace(/\\N/g, '\n').replace(/\\n/g, '\n').trim();
        const startMs = timestampToMs(startTime);
        const endMs = timestampToMs(endTime);
        cues.push({
          id: cueId++,
          startTime: msToTimestamp(startMs, 'srt'),
          endTime: msToTimestamp(endMs, 'srt'),
          startMs,
          endMs,
          settings: '',
          text,
          lines: text.split('\n')
        });
      }
    }
    return { cues, format: 'ass', header: '' };
  }

  // Handle SRT and VTT with line-by-line scanning
  const lines = cleaned.split('\n');
  const cues = [];
  let header = '';
  let i = 0;

  if (isVtt) {
    while (i < lines.length && !lines[i].includes('-->')) {
      header += lines[i] + '\n';
      i++;
    }
  }

  // Matches timestamps with --> or -> or —>
  const timeRegex = /((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,4})\s*(?:-->|->|—>)\s*((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,4})(?:[ \t]+([^\n\r]*))?/;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }

    let timeMatch = line.match(timeRegex);
    let explicitId = null;

    if (!timeMatch && /^\d+$/.test(line) && i + 1 < lines.length) {
      explicitId = parseInt(line, 10);
      timeMatch = lines[i + 1].trim().match(timeRegex);
      if (timeMatch) {
        i++; // skip sequence ID line
      }
    }

    if (timeMatch) {
      const startTime = timeMatch[1];
      const endTime = timeMatch[2];
      const settings = timeMatch[3] || '';
      i++;

      const textLines = [];
      while (i < lines.length) {
        const nextLine = lines[i];
        if (nextLine.trim() === '') {
          // Look ahead to check if next block is a new cue
          let peek = i + 1;
          while (peek < lines.length && lines[peek].trim() === '') peek++;
          if (peek < lines.length && (timeRegex.test(lines[peek]) || (/^\d+$/.test(lines[peek].trim()) && peek + 1 < lines.length && timeRegex.test(lines[peek + 1])))) {
            break;
          }
        }
        if (timeRegex.test(nextLine) || (/^\d+$/.test(nextLine.trim()) && i + 1 < lines.length && timeRegex.test(lines[i + 1]))) {
          break;
        }
        textLines.push(nextLine);
        i++;
      }

      const cueText = textLines.join('\n').trim();
      const startMs = timestampToMs(startTime);
      const endMs = timestampToMs(endTime);

      cues.push({
        id: explicitId || cues.length + 1,
        startTime: msToTimestamp(startMs, format === 'vtt' ? 'vtt' : 'srt'),
        endTime: msToTimestamp(endMs, format === 'vtt' ? 'vtt' : 'srt'),
        startMs,
        endMs,
        settings: settings.trim(),
        text: cueText,
        lines: textLines
      });
    } else {
      i++;
    }
  }

  return { cues, format, header: header.trim() };
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

    blocks.push(`${id}\n${start} --> ${end}${settings}\n${text}`);
  }

  return blocks.join('\n\n') + '\n';
}

module.exports = {
  decodeSubtitleBuffer,
  readSubtitleFile,
  timestampToMs,
  msToTimestamp,
  protectTags,
  restoreTags,
  parseSubtitles,
  serializeSubtitles
};
