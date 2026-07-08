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
 * Format speed in bytes/sec to human-readable string.
 */
export function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec === 0) return '0 B/s';
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
  return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/** ISO 639-1 → display label for subtitle badges */
export const LANG_LABEL = { en: 'EN', nl: 'NL', fr: 'FR', de: 'DE', es: 'ES', it: 'IT', pt: 'PT' };
export const LANG_NAME = { en: 'English', nl: 'Dutch', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese' };

/** Accent color theme per media type */
export const mediaTheme = {
  movie: { accent: 'cyan', accentClass: 'text-cyan-400', accentBg: 'bg-cyan-500/10', accentBorder: 'border-cyan-500/30', accentHover: 'hover:bg-cyan-500/20', accentFill: 'fill-cyan-400', focusRing: 'focus:border-cyan-500/50', spinnerBorder: 'border-cyan-500', gradientFrom: 'from-cyan-500', gradientTo: 'to-blue-500', badgeClass: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' },
  tv:    { accent: 'purple', accentClass: 'text-purple-400', accentBg: 'bg-purple-500/10', accentBorder: 'border-purple-500/30', accentHover: 'hover:bg-purple-500/20', accentFill: 'fill-purple-400', focusRing: 'focus:border-purple-500/50', spinnerBorder: 'border-purple-500', gradientFrom: 'from-purple-500', gradientTo: 'to-pink-500', badgeClass: 'bg-purple-500/20 text-purple-400 border border-purple-500/30' },
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

