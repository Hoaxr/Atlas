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
  const camTerms = /\b(cam|ts|telesync|hdts|hdcam|hc|telecine|tc|workprint|wp|screener|scr)\b/;
  if (camTerms.test(t)) return 'CAM';
  if (t.includes('2160p') || t.includes('4k')) return '2160p';
  if (t.includes('1080p')) return '1080p';
  if (t.includes('720p')) return '720p';
  if (t.includes('480p') || t.includes('dvdrip') || t.includes('xvid') || t.includes('hdtv') || t.match(/\bsd\b/)) return 'SD';
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
 *          'DD 5.1', 'DD Stereo', 'AC3', 'AAC 5.1', 'AAC Stereo', 'AAC', or 'Unknown'
 */
const parseAudio = (title) => {
  if (!title) return 'Unknown';
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

  return 'Unknown';
};

module.exports = { parseResolution, parseCodec, parseAudio };
