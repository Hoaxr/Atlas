/**
 * Canonical media parsing utilities — single source of truth for
 * resolution, codec, and audio detection from filenames/release titles.
 */

/**
 * Parse resolution from a filename or release title.
 * Returns: '2160p', '1080p', '720p', '480p', 'SD', or 'Unknown'
 */
const parseResolution = (title) => {
  if (!title) return 'Unknown';
  const t = title.toLowerCase();
  if (t.includes('2160p') || t.includes('4k')) return '2160p';
  if (t.includes('1080p')) return '1080p';
  if (t.includes('720p')) return '720p';
  if (t.includes('480p') || t.includes('dvdrip') || t.includes('xvid') || t.includes('hdtv') || t.match(/\bsd\b/)) return 'SD';
  const camTerms = /\b(cam|telesync|hdts|hdcam|hc|telecine|workprint|screener|scr|camrip|tsrip)\b|[._ -](?:ts|tc|wp)[._ -]/i;
  if (camTerms.test(t)) return 'CAM';
  return 'Unknown';
};

/**
 * Parse codec from a filename or release title.
 * Returns: 'x265', 'x264', or 'Unknown'
 */
const parseCodec = (title) => {
  if (!title) return 'Unknown';
  const t = title.toLowerCase();
  if (t.includes('x265') || t.includes('h265') || t.includes('hevc')) return 'x265';
  if (t.includes('x264') || t.includes('h264') || t.includes('avc')) return 'x264';
  return 'Unknown';
};

/**
 * Parse audio codec information from a filename or release title.
 * Returns: 'Atmos', 'TrueHD', 'DTS-HD', 'DTS', 'DDP 7.1', 'DDP 5.1',
 *          'DD 5.1', 'DD Stereo', 'AC3', 'AAC 5.1', 'AAC Stereo', 'AAC',
 *          '7.1', '5.1', 'Stereo', 'FLAC', 'Opus', 'MP3', or null.
 */
const parseAudio = (title) => {
  if (!title) return null;
  const lower = title.toLowerCase();

  if (lower.includes('atmos')) return 'Atmos';
  if (lower.includes('truehd')) return 'TrueHD';
  if (lower.includes('dts-hd') || lower.includes('dtshd')) return 'DTS-HD';
  if (lower.includes('dts')) return 'DTS';

  if (lower.includes('ddp7.1') || lower.includes('dd+7.1') || lower.includes('e-ac3 7.1') || lower.includes('eac3 7.1')) return 'DDP 7.1';
  if (lower.includes('ddp5.1') || lower.includes('dd+5.1') || lower.includes('e-ac3 5.1') || lower.includes('eac3 5.1') || lower.includes('ddp') || lower.includes('dd+')) return 'DDP 5.1';
  if (lower.includes('dd5.1') || lower.includes('ac3 5.1') || lower.includes('ac-3 5.1')) return 'DD 5.1';
  if (lower.includes('dd2.0') || lower.includes('ac3 2.0') || lower.includes('ac-3 2.0')) return 'DD Stereo';
  if (lower.includes('ac3') || lower.includes('ac-3')) return 'AC3';

  if (lower.includes('aac 5.1') || lower.includes('aac5.1')) return 'AAC 5.1';
  if (lower.includes('aac 2.0') || lower.includes('aac2.0')) return 'AAC Stereo';
  if (lower.includes('aac')) return 'AAC';

  if (lower.includes('7.1')) return '7.1';
  if (lower.includes('5.1')) return '5.1';
  if (lower.includes('2.0') || lower.includes('stereo')) return 'Stereo';

  if (lower.includes('flac')) return 'FLAC';
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('mp3')) return 'MP3';

  return null;
};

/**
 * Resolution quality rank hierarchy (higher number = higher quality).
 */
const RESOLUTION_RANK = {
  '2160p': 4,
  '4k': 4,
  '1080p': 3,
  '720p': 2,
  '480p': 1,
  'sd': 1,
  'cam': 0,
};

const getResolutionRank = (res) => {
  if (!res) return -1;
  const key = String(res).toLowerCase().trim();
  return RESOLUTION_RANK[key] !== undefined ? RESOLUTION_RANK[key] : -1;
};

/**
 * Checks whether currentQuality meets or exceeds cutoff.
 * If cutoff is not specified, returns true.
 * If currentQuality is unknown, returns false.
 */
const isCutoffMet = (currentQuality, cutoff, qualities = null) => {
  if (!cutoff) return true;
  if (!currentQuality || currentQuality === 'Unknown') return false;

  const currentRank = getResolutionRank(currentQuality);
  const cutoffRank = getResolutionRank(cutoff);

  if (currentRank !== -1 && cutoffRank !== -1) {
    return currentRank >= cutoffRank;
  }

  if (currentQuality.toLowerCase() === cutoff.toLowerCase()) return true;

  if (Array.isArray(qualities) && qualities.length > 0) {
    const curIdx = qualities.indexOf(currentQuality);
    const cutIdx = qualities.indexOf(cutoff);
    if (curIdx !== -1 && cutIdx !== -1) {
      const isLowToHigh = getResolutionRank(qualities[0]) < getResolutionRank(qualities[qualities.length - 1]);
      return isLowToHigh ? curIdx >= cutIdx : curIdx <= cutIdx;
    }
  }

  return false;
};

// ─── Music Quality Parsing ────────────────────────────────────────────────────

/**
 * Detect audio format from a release title or filename.
 * Returns: 'FLAC', 'MP3', 'AAC', 'Ogg', 'Opus', 'WAV', 'APE', 'WV', or 'Unknown'
 */
const parseMusicFormat = (title) => {
  if (!title) return 'Unknown';
  const t = title.toLowerCase();
  if (t.includes('.flac') || /\bflac\b/.test(t)) return 'FLAC';
  if (t.includes('.mp3') || /\bmp3\b/.test(t)) return 'MP3';
  if (t.includes('.m4a') || /\baac\b/.test(t) || /\bm4a\b/.test(t)) return 'AAC';
  if (t.includes('.opus') || /\bopus\b/.test(t)) return 'Opus';
  if (t.includes('.ogg') || /\bogg\b/.test(t) || /\bvorbis\b/.test(t)) return 'Ogg';
  if (t.includes('.wav') || /\bwave?\b/.test(t)) return 'WAV';
  if (t.includes('.ape') || /\bmonkey'?s audio\b/.test(t)) return 'APE';
  if (t.includes('.wv') || /\bwavpack\b/.test(t)) return 'WV';
  if (t.includes('.alac') || /\balac\b/.test(t)) return 'ALAC';
  return 'Unknown';
};

/**
 * Detect bitrate from a release title (e.g. "320kbps", "V0", "V2").
 * Returns bitrate as integer kbps or null.
 */
const parseMusicBitrate = (title) => {
  if (!title) return null;
  const t = title.toLowerCase();
  const kbpsMatch = t.match(/(\d{2,4})\s*kbps/);
  if (kbpsMatch) return parseInt(kbpsMatch[1], 10);
  if (/\bv0\b/.test(t)) return 245; // VBR V0 ~245kbps avg
  if (/\bv2\b/.test(t)) return 190; // VBR V2 ~190kbps avg
  if (/\b320\b/.test(t)) return 320;
  if (/\b256\b/.test(t)) return 256;
  if (/\b192\b/.test(t)) return 192;
  if (/\b128\b/.test(t)) return 128;
  return null;
};

/**
 * Detect bit depth from a release title.
 * Returns 16, 24, or null.
 */
const parseMusicBitdepth = (title) => {
  if (!title) return null;
  const t = title.toLowerCase();
  if (t.includes('24bit') || t.includes('24-bit') || t.includes('24 bit')) return 24;
  if (t.includes('16bit') || t.includes('16-bit') || t.includes('16 bit')) return 16;
  return null;
};

/**
 * Rank a music format for upgrade comparisons.
 * Higher number = higher quality.
 */
const MUSIC_FORMAT_RANK = {
  'FLAC': 100,
  'ALAC': 95,
  'WAV': 90,
  'APE': 85,
  'WV': 80,
  'AAC': 60,
  'Ogg': 55,
  'Opus': 55,
  'MP3': 50,
  'Unknown': 0,
};

const parseMusicQualityRank = (format, bitrateKbps = 0, bitdepth = 16) => {
  const formatRank = MUSIC_FORMAT_RANK[format] ?? 0;
  const bitdepthBonus = bitdepth >= 24 ? 5 : 0;
  const bitrateBonus = format === 'MP3' || format === 'AAC' ? Math.min(bitrateKbps / 100, 3) : 0;
  return formatRank + bitdepthBonus + bitrateBonus;
};

module.exports = { parseResolution, parseCodec, parseAudio, getResolutionRank, isCutoffMet, parseMusicFormat, parseMusicBitrate, parseMusicBitdepth, parseMusicQualityRank };
