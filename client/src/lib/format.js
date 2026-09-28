/**
 * Format bytes to human-readable size string.
 */
export function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Extract resolution from a release title or filename.
 */
export function parseResolution(title) {
  if (!title) return 'Unknown';
  const t = title.toLowerCase();
  if (t.includes('2160p') || t.includes('4k')) return '2160p';
  if (t.includes('1080p')) return '1080p';
  if (t.includes('720p')) return '720p';
  if (t.includes('480p') || t.includes('dvdrip') || t.includes('xvid') || t.includes('hdtv') || t.match(/\bsd\b/)) return 'SD';
  return 'Unknown';
}

/**
 * Format a date string to a relative time (e.g. "5m ago", "2h ago").
 */
export function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  let str = dateStr;
  if (typeof str === 'string' && !str.includes('Z') && !str.includes('+') && !str.includes('T')) {
    str = str.replace(' ', 'T') + 'Z';
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  if (diff < 0) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

/** ISO 639-1 → display label for subtitle badges */
export const LANG_LABEL = { en: 'EN', nl: 'NL', fr: 'FR', de: 'DE', es: 'ES', it: 'IT', pt: 'PT' };
export const LANG_NAME = { en: 'English', nl: 'Dutch', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese' };

/** Accent color theme per media type */
export const mediaTheme = {
  movie: { accent: 'cyan', accentClass: 'text-cyan-400', accentBg: 'bg-cyan-500/10', accentBorder: 'border-cyan-500/30', accentHover: 'hover:bg-cyan-500/20', accentFill: 'fill-cyan-400', focusRing: 'focus:border-cyan-500/50', spinnerBorder: 'border-cyan-500', gradientFrom: 'from-cyan-500', gradientTo: 'to-blue-500', badgeClass: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' },
  tv:    { accent: 'purple', accentClass: 'text-purple-400', accentBg: 'bg-purple-500/10', accentBorder: 'border-purple-500/30', accentHover: 'hover:bg-purple-500/20', accentFill: 'fill-purple-400', focusRing: 'focus:border-purple-500/50', spinnerBorder: 'border-purple-500', gradientFrom: 'from-purple-500', gradientTo: 'to-pink-500', badgeClass: 'bg-purple-500/20 text-purple-400 border border-purple-500/30' },
  music: { accent: 'emerald', accentClass: 'text-emerald-400', accentBg: 'bg-emerald-500/10', accentBorder: 'border-emerald-500/30', accentHover: 'hover:bg-emerald-500/20', accentFill: 'fill-emerald-400', focusRing: 'focus:border-emerald-500/50', spinnerBorder: 'border-emerald-500', gradientFrom: 'from-emerald-500', gradientTo: 'to-teal-500', badgeClass: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' },
};

/**
 * Extract codec (x264, x265, h264, hevc, etc.) from a release title or filename.
 */
export function parseCodec(title) {
  if (!title) return 'Unknown';
  const t = title.toLowerCase();
  if (t.includes('x265') || t.includes('h265') || t.includes('hevc')) return 'x265';
  if (t.includes('x264') || t.includes('h264') || t.includes('avc')) return 'x264';
  return 'Unknown';
}

/**
 * Extract filename from full file path.
 */
export function getReleaseTitleFromPath(filePath) {
  if (!filePath) return '';
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1];
}

/**
 * Extract audio codec/channel info from a release title or filename.
 */
export function parseAudio(title) {
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
  if (lower.includes('aac 2.0') || lower.includes('aac2.0') || lower.includes('aac')) return 'AAC Stereo';
  
  if (lower.includes('7.1')) return '7.1';
  if (lower.includes('5.1')) return '5.1';
  if (lower.includes('2.0') || lower.includes('stereo')) return 'Stereo';
  
  if (lower.includes('flac')) return 'FLAC';
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('mp3')) return 'MP3';
  
  return 'Unknown';
}

/**
 * Extract release group from title or filename (e.g. "-FLUX", "-Framestor", "-playBD").
 */
export function parseReleaseGroup(title) {
  if (!title) return null;
  const clean = title.replace(/\.(mkv|mp4|avi|mp3|flac|m4a|zip|rar)$/i, '').trim();
  const match = clean.match(/-([A-Za-z0-9_]+)(?:\[.*?\])?$/);
  if (!match) return null;
  const candidate = match[1];
  const ignored = ['x264', 'x265', 'h264', 'h265', 'hevc', 'avc', 'aac', 'ac3', 'dts', '1080p', '720p', '2160p', '4k', 'remux', 'webrip', 'webdl', 'dl'];
  if (ignored.includes(candidate.toLowerCase())) return null;
  return candidate;
}

/**
 * Comprehensive release parser extracting resolution, source, HDR, codecs, and group.
 */
export function parseRelease(title, mediaType = 'movie') {
  if (!title) {
    return {
      resolution: '—',
      source: null,
      isRemux: false,
      hdr: null,
      codec: null,
      audio: null,
      group: null,
      isCam: false,
      musicFormat: null,
    };
  }

  const t = title.toLowerCase();

  // Music specific
  if (mediaType === 'album' || mediaType === 'music') {
    let musicFormat = 'MP3';
    if (t.includes('24bit') || t.includes('24-bit') || t.includes('24/96') || t.includes('24/192')) {
      musicFormat = 'FLAC 24bit';
    } else if (t.includes('flac') || t.includes('lossless')) {
      musicFormat = 'FLAC';
    } else if (t.includes('320k') || t.includes('320 kbps') || t.includes('320kbps')) {
      musicFormat = 'MP3 320';
    } else if (t.includes('v0')) {
      musicFormat = 'MP3 V0';
    } else if (t.includes('256k') || t.includes('v2')) {
      musicFormat = 'MP3 256';
    } else if (t.includes('aac') || t.includes('m4a')) {
      musicFormat = 'AAC';
    } else if (t.includes('alac')) {
      musicFormat = 'ALAC';
    }

    return {
      resolution: musicFormat,
      source: null,
      isRemux: false,
      hdr: null,
      codec: null,
      audio: null,
      group: parseReleaseGroup(title),
      isCam: false,
      musicFormat,
    };
  }

  // Video resolution
  let resolution = parseResolution(title);
  if (resolution === 'Unknown') {
    if (t.includes('2160p') || t.includes('4k') || t.includes('uhd')) resolution = '4K';
    else if (t.includes('1080p') || t.includes('1080i')) resolution = '1080p';
    else if (t.includes('720p')) resolution = '720p';
    else if (t.includes('480p') || t.includes('sd') || t.includes('dvdrip')) resolution = 'SD';
    else resolution = '—';
  } else if (resolution === '2160p') {
    resolution = '4K';
  }

  // Source
  const isRemux = /\bremux\b/i.test(t);
  let source = null;
  if (isRemux) source = 'REMUX';
  else if (/\b(uhd[._ -]?bluray|bluray|blu-ray|bdrip|brrip)\b/i.test(t)) source = 'BluRay';
  else if (/\b(web-?rip)\b/i.test(t)) source = 'WEBRip';
  else if (/\b(web-?dl|web)\b/i.test(t)) source = 'WEB-DL';
  else if (/\b(hdtv|pdtv|dsr)\b/i.test(t)) source = 'HDTV';
  else if (/\b(dvdrip|dvd-?9|dvd-?5|dvd)\b/i.test(t)) source = 'DVDRip';

  // HDR / Color
  let hdr = null;
  if (/\b(dv|dovi|dolby[._ -]?vision)\b/i.test(t)) hdr = 'DV';
  else if (/\b(hdr10\+|hdr10plus)\b/i.test(t)) hdr = 'HDR10+';
  else if (/\b(hdr10|hdr)\b/i.test(t)) hdr = 'HDR';
  else if (/\b(10bit|10-bit)\b/i.test(t)) hdr = '10-bit';

  // Codec
  let codec = parseCodec(title);
  if (codec === 'Unknown') {
    if (/\b(av1)\b/i.test(t)) codec = 'AV1';
    else if (/\b(xvid|divx)\b/i.test(t)) codec = 'XviD';
    else codec = null;
  }

  // Audio
  let audio = parseAudio(title);
  if (audio === 'Unknown') audio = null;

  // CAM
  const isCam = /\b(cam|ts|telesync|hdts|hdcam|hc|telecine|tc|workprint|wp|screener|scr|camrip)\b/i.test(t);

  return {
    resolution,
    source,
    isRemux,
    hdr,
    codec,
    audio,
    group: parseReleaseGroup(title),
    isCam,
    musicFormat: null,
  };
}

