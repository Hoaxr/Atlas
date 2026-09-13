import { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import {
  DownloadCloud, Download, ArrowDown, ArrowUp, Activity,
  Play, Pause, Trash2, Clock, CheckSquare, Square, X,
  Loader2, MoreHorizontal, Check, Menu, LayoutGrid, ChevronDown, Search
} from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';
import useWebSocket from '../lib/useWebSocket';
import StickyBar from '../components/shared/StickyBar';
import InlineError from '../components/shared/InlineError';
import { useStickyBar } from '../lib/useStickyBar';
import { parseResolution, parseCodec, parseAudio } from '../lib/format';

const decodeHtml = (str) => {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&ouml;/gi, 'ö')
    .replace(/&auml;/gi, 'ä')
    .replace(/&uuml;/gi, 'ü')
    .replace(/&eacute;/gi, 'é')
    .replace(/&egrave;/gi, 'è')
    .replace(/&aring;/gi, 'å')
    .replace(/&oslash;/gi, 'ø')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
};

const parseReleaseInfo = (rawName, torrent = {}) => {
  if (!rawName) return { title: 'Unknown', mediaLabel: 'Movie', resolution: null, source: null, codec: null, audio: null, hdr: null, isTv: false, isMusic: false, raw: '' };

  const safeRawName = decodeHtml(rawName.trim());
  const isHashName = /^[a-f0-9]{32,64}$/i.test(safeRawName);
  if (isHashName) {
    const isMusicClient = torrent.mediaType === 'music' || torrent.category === 'music' || torrent.category === 'audio';
    return {
      title: 'Retrieving metadata...',
      mediaLabel: isMusicClient ? 'Music' : 'Download',
      resolution: null,
      source: null,
      codec: null,
      audio: null,
      hdr: null,
      isTv: false,
      isMusic: isMusicClient,
      isPendingMetadata: true,
      raw: safeRawName
    };
  }
  
  const name = safeRawName.replace(/\.(mp4|mkv|avi|mov|flac|mp3|m4a|aac|opus|ogg|wav|webm|ts|m2ts)$/i, '');
  const totalBytes = torrent.total_size || torrent.size || 0;
  const isSmallSize = totalBytes > 0 && totalBytes < 1200 * 1024 * 1024; // Music releases are < 1.2GB

  const resolution = parseResolution(name);
  const codec = parseCodec(name);
  const audio = parseAudio(name);

  let source = null;
  if (/web-?dl/i.test(name)) source = 'WEB-DL';
  else if (/web-?rip/i.test(name)) source = 'WEBRip';
  else if (/bluray|bdrip/i.test(name)) source = 'BluRay';
  else if (/hdtv/i.test(name)) source = 'HDTV';

  let hdr = null;
  if (/10-?bit/i.test(name)) hdr = '10-Bit';
  else if (/hdr10\+/i.test(name)) hdr = 'HDR10+';
  else if (/hdr/i.test(name)) hdr = 'HDR';
  else if (/dv|dovi|dolby\s*vision/i.test(name)) hdr = 'DV';

  // Video and TV clues
  const hasVideoClues = /\b(1080p|720p|2160p|4k|480p|576p|bluray|bdrip|brrip|hdtv|web-?dl|web-?rip|x264|x265|hevc|h264|h265|avc|xvid|divx|dvdrip)\b/i.test(name);
  const hasTvClues = /\b(S\d{1,2}[._\s-]*E\d{1,3}|Season\s*\d+|\d+x\d+)\b/i.test(name);

  // Explicit music indicators
  const hasExplicitMusicClues = /\b(flac|mp3|320kbps|320k|lossless|alac|opus|aac|v0|v2|web-flac|vinyl-flac|cd-flac|cdrip|vinyl|remaster|remastered|anniversary|deluxe\s+edition|deluxe\s+version|boxset|discography|soundtrack|ost)\b/i.test(name) || /\.(flac|mp3|m4a|aac|ogg|opus|wav|ape|wv)$/i.test(rawName);

  // Client category, tags, or save_path classification
  const isClientMusic = 
    torrent.mediaType === 'music' ||
    torrent.category === 'music' ||
    torrent.category === 'audio' ||
    (typeof torrent.tags === 'string' && torrent.tags.toLowerCase().includes('music')) ||
    (Array.isArray(torrent.tags) && torrent.tags.some(t => String(t).toLowerCase().includes('music'))) ||
    (torrent.save_path || torrent.downloadDir || '').toLowerCase().includes('/music');

  const isClientVideo = 
    torrent.mediaType === 'movie' ||
    torrent.mediaType === 'tv' ||
    torrent.category === 'movies' ||
    torrent.category === 'movie' ||
    torrent.category === 'tv' ||
    (torrent.save_path || torrent.downloadDir || '').toLowerCase().includes('/movies') ||
    (torrent.save_path || torrent.downloadDir || '').toLowerCase().includes('/tv');

  const isMusic = !isClientVideo && (
    isClientMusic ||
    (hasExplicitMusicClues && !hasVideoClues) ||
    (!hasVideoClues && !hasTvClues && isSmallSize && (name.includes(' - ') || hasExplicitMusicClues))
  );

  if (isMusic && !hasVideoClues) {
    let musicFormat = 'FLAC';
    if (/\b(mp3|320kbps|320k)\b/i.test(name) || /\.mp3$/i.test(rawName)) musicFormat = 'MP3';
    else if (/\b(aac|m4a)\b/i.test(name) || /\.(aac|m4a)$/i.test(rawName)) musicFormat = 'AAC';
    else if (/\bopus\b/i.test(name) || /\.opus$/i.test(rawName)) musicFormat = 'Opus';
    else if (/\bflac\b/i.test(name) || /\.flac$/i.test(rawName)) musicFormat = 'FLAC';

    let musicSource = null;
    if (/\bvinyl\b/i.test(name)) musicSource = 'Vinyl';
    else if (/\b(cdrip|cd-flac|cd)\b/i.test(name)) musicSource = 'CD';
    else if (/\b(web-flac|web-dl|webrip|web)\b/i.test(name)) musicSource = 'WEB';

    let musicQuality = null;
    if (/\b(24-?bit|24\/[0-9]+)\b/i.test(name)) musicQuality = '24-Bit';
    else if (/\b(320kbps|320k)\b/i.test(name)) musicQuality = '320k';
    else if (/\bv0\b/i.test(name)) musicQuality = 'V0';
    else if (/\bv2\b/i.test(name)) musicQuality = 'V2';
    else if (/\b(remaster|remastered)\b/i.test(name)) musicQuality = 'Remaster';
    else if (/\blossless\b/i.test(name) && musicFormat !== 'FLAC') musicQuality = 'Lossless';

    // Format clean music title: Artist — Album (Year)
    let cleanMusicTitle = name
      .replace(/\[(?:FLAC|MP3|320k?|WEB|CD|Vinyl|24bit|Lossless|Hi-Res)[^\]]*\]/gi, '')
      .replace(/\((?:FLAC|MP3|320k?|WEB|CD|Vinyl|24bit|Lossless|Hi-Res)[^)]*\)/gi, '')
      .replace(/\b(flac|mp3|320kbps|lossless|alac|opus|aac|v0|v2|web-flac|vinyl-flac|cd-flac|cdrip|webrip)\b.*/i, '')
      .replace(/[\s\-_—([{\\/]+$/, '')
      .trim();

    if (cleanMusicTitle.includes(' - ')) {
      const parts = cleanMusicTitle.split(/\s+-\s+/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const artist = parts[0];
        const album = parts[1].replace(/[\s\-_—([{\\/]+$/, '').trim();
        let year = null;
        if (parts.length >= 3 && /^(19\d{2}|20\d{2})(?:\s*\(\d{4}\))?$/.test(parts[2])) {
          year = parts[2].match(/\b(19\d{2}|20\d{2})\b/)?.[1];
        } else {
          const ym = album.match(/\b(19\d{2}|20\d{2})\b/);
          if (ym) year = ym[1];
        }
        if (year && !album.includes(year)) {
          cleanMusicTitle = `${artist} — ${album} (${year})`;
        } else {
          cleanMusicTitle = `${artist} — ${album}`;
        }
      }
    } else if (cleanMusicTitle.includes('-')) {
      const parts = cleanMusicTitle.split('-').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const artist = parts[0];
        const album = parts.slice(1).join(' ').replace(/[\s\-_—([{\\/]+$/, '').trim();
        cleanMusicTitle = `${artist} — ${album}`;
      }
    } else {
      cleanMusicTitle = cleanMusicTitle.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    cleanMusicTitle = cleanMusicTitle.replace(/[\s\-_—([{\\/]+$/, '').trim();

    return {
      title: cleanMusicTitle || rawName,
      mediaLabel: 'Music',
      resolution: null,
      source: musicSource,
      codec: musicQuality,
      audio: musicFormat,
      hdr: null,
      isTv: false,
      isMusic: true,
      raw: rawName
    };
  }

  // TV format check
  const tvMatch = name.match(/(.*?)\b(S\d{1,2}[._\s-]*E\d{1,3}(?:[-_E\s]+(?:S\d{1,2})?E?\d{1,3})*|Season\s*\d+|\d+x\d+)\b/i);
  if (tvMatch) {
    let showTitle = tvMatch[1].replace(/[._()[\]-]/g, ' ').trim();
    const yearMatch = tvMatch[1].match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
      const year = yearMatch[1];
      const baseShow = tvMatch[1].replace(new RegExp(`\\b${year}\\b.*`), '').replace(/[._()[\]-]/g, ' ').trim();
      if (baseShow) showTitle = `${baseShow} (${year})`;
    }
    const epString = tvMatch[2].replace(/[._]/g, '').toUpperCase().trim();
    return {
      title: `${showTitle} ${epString}`,
      mediaLabel: 'TV Show',
      resolution: resolution !== 'Unknown' ? resolution : null,
      source,
      codec: codec !== 'Unknown' ? codec : null,
      audio: audio !== 'Unknown' ? audio : null,
      hdr,
      isTv: true,
      isMusic: false,
      raw: rawName
    };
  }

  // Movie format with year
  const movieMatch = name.match(/(.*?)\b(19\d{2}|20\d{2})\b/);
  if (movieMatch) {
    const movieTitle = movieMatch[1].replace(/[._()[\]-]/g, ' ').trim();
    const year = movieMatch[2];
    return {
      title: `${movieTitle} (${year})`,
      mediaLabel: 'Movie',
      resolution: resolution !== 'Unknown' ? resolution : null,
      source,
      codec: codec !== 'Unknown' ? codec : null,
      audio: audio !== 'Unknown' ? audio : null,
      hdr,
      isTv: false,
      isMusic: false,
      raw: rawName
    };
  }

  // Clean title fallback
  const cleanTitle = name
    .replace(/\b(1080p|720p|4k|2160p|bluray|web-?dl|web-?rip|x264|x265|hevc|ddp5?\.?1?|aac)\b.*/i, '')
    .replace(/[._()[\]-]/g, ' ')
    .trim();

  return {
    title: cleanTitle || rawName,
    mediaLabel: 'Movie',
    resolution: resolution !== 'Unknown' ? resolution : null,
    source,
    codec: codec !== 'Unknown' ? codec : null,
    audio: audio !== 'Unknown' ? audio : null,
    hdr,
    isTv: false,
    isMusic: false,
    raw: rawName
  };
};

export default function Downloads() {
  const { headerRef, stickyVisible } = useStickyBar();
  const { onEvent } = useWebSocket();
  const [downloads, setDownloads] = useState([]);
  const [stats, setStats] = useState({ dl_info_speed: 0, up_info_speed: 0 });
  const [initialLoading, setInitialLoading] = useState(true);
  const [clientError, setClientError] = useState(false);
  const [selectedHashes, setSelectedHashes] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [openMenuHash, setOpenMenuHash] = useState(null);
  const [activeTab, setActiveTab] = useState('active');
  const [sortBy, setSortBy] = useState('progress');
  const [viewMode, setViewMode] = useState('list');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const handleOutsideClick = () => setOpenMenuHash(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchClientData();

    // Listen for WebSocket push updates (replaces 3s polling)
    const cleanup = onEvent((data) => {
      if (data.type === 'TORRENTS_UPDATE' && data.data) {
        const newTorrents = data.data.torrents || [];
        setDownloads(newTorrents);
        setSelectedHashes(prev => {
          if (prev.size === 0) return prev;
          const newHashes = new Set(newTorrents.map(t => t.hash));
          const filtered = new Set([...prev].filter(h => newHashes.has(h)));
          return filtered.size === prev.size ? prev : filtered;
        });
        setStats(data.data.clientStats || { dl_info_speed: 0, up_info_speed: 0 });
        setInitialLoading(false);
        setClientError(data.clientConnected === false);
      }
    });

    return () => { if (cleanup) cleanup(); };
  }, [onEvent]);

  const toggleSelect = (hash) => {
    setSelectedHashes(prev => {
      const next = new Set(prev);
      if (next.has(hash)) {
        next.delete(hash);
      } else {
        next.add(hash);
      }
      return next;
    });
  };

  const toggleSelectAll = (visibleItems = []) => {
    if (visibleItems.length === 0) return;
    const allSelected = visibleItems.every(d => selectedHashes.has(d.hash));
    setSelectedHashes(prev => {
      const next = new Set(prev);
      if (allSelected) {
        visibleItems.forEach(d => next.delete(d.hash));
      } else {
        visibleItems.forEach(d => next.add(d.hash));
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedHashes(new Set());
  };

  const handleBulkPause = async () => {
    const hashes = Array.from(selectedHashes);
    if (hashes.length === 0) return;
    setBulkLoading(true);
    try {
      setDownloads(prev => prev.map(d => hashes.includes(d.hash) ? { ...d, state: 'paused', dlspeed: 0 } : d));
      await api.post('/clients/torrents/bulk-pause', { hashes });
      customAlert(`${hashes.length} download${hashes.length !== 1 ? 's' : ''} paused`);
      clearSelection();
    } catch (e) {
      console.error('Failed to pause downloads', e);
      customAlert('Failed to pause selected downloads', 'error');
      fetchClientData();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkResume = async () => {
    const hashes = Array.from(selectedHashes);
    if (hashes.length === 0) return;
    setBulkLoading(true);
    try {
      setDownloads(prev => prev.map(d => hashes.includes(d.hash) ? { ...d, state: 'downloading' } : d));
      await api.post('/clients/torrents/bulk-resume', { hashes });
      customAlert(`${hashes.length} download${hashes.length !== 1 ? 's' : ''} resumed`);
      clearSelection();
    } catch (e) {
      console.error('Failed to resume downloads', e);
      customAlert('Failed to resume selected downloads', 'error');
      fetchClientData();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    const hashes = Array.from(selectedHashes);
    if (hashes.length === 0) return;
    const count = hashes.length;
    if (await customConfirm(`Cancel and delete ${count} download${count !== 1 ? 's' : ''}?`)) {
      setBulkLoading(true);
      try {
        setDownloads(prev => prev.filter(d => !hashes.includes(d.hash)));
        await api.post('/clients/torrents/bulk-delete', { hashes, deleteFiles: true });
        customAlert(`${count} download${count !== 1 ? 's' : ''} deleted`);
        clearSelection();
      } catch (e) {
        console.error('Failed to delete downloads', e);
        customAlert('Failed to delete selected downloads', 'error');
        fetchClientData();
      } finally {
        setBulkLoading(false);
      }
    }
  };

  const handlePause = async (hash) => {
    try {
      await api.post(`/clients/torrents/${hash}/pause`);
      setDownloads(prev => prev.map(d => d.hash === hash ? { ...d, state: 'paused', dlspeed: 0 } : d));
      customAlert('Download paused');
    } catch (e) {
      console.error('Failed to pause download', e);
      customAlert('Failed to pause download', 'error');
    }
  };

  const handleResume = async (hash) => {
    try {
      await api.post(`/clients/torrents/${hash}/resume`);
      setDownloads(prev => prev.map(d => d.hash === hash ? { ...d, state: 'downloading' } : d));
      customAlert('Download resumed');
    } catch (e) {
      console.error('Failed to resume download', e);
      customAlert('Failed to resume download', 'error');
    }
  };

  const handleDelete = async (hash, deleteFiles = true) => {
    const msg = deleteFiles ? 'Cancel and delete this download and files?' : 'Remove this download from client?';
    if (await customConfirm(msg)) {
      try {
        await api.delete(`/clients/torrents/${hash}?deleteFiles=${deleteFiles}`);
        setDownloads(prev => prev.filter(d => d.hash !== hash));
        setSelectedHashes(prev => {
          if (!prev.has(hash)) return prev;
          const next = new Set(prev);
          next.delete(hash);
          return next;
        });
        customAlert(deleteFiles ? 'Download deleted' : 'Download removed from client');
      } catch (e) {
        console.error('Failed to delete download', e);
        customAlert('Failed to cancel download', 'error');
      }
    }
  };

  const fetchClientData = async () => {
    try {
      const [statsResult, torrentsResult] = await Promise.allSettled([
        api.get('/clients/stats'),
        api.get('/clients/torrents')
      ]);
      
      if (statsResult.status === 'fulfilled' && statsResult.value.data.status === 'success' && statsResult.value.data.data) {
        setStats(statsResult.value.data.data);
      } else {
        setStats({ dl_info_speed: 0, up_info_speed: 0 });
      }

      if (torrentsResult.status === 'fulfilled' && torrentsResult.value.data.status === 'success' && torrentsResult.value.data.data) {
        setDownloads(torrentsResult.value.data.data);
        setClientError(false);
      } else {
        setDownloads([]);
        setClientError(true);
      }
    } catch (err) {
      console.error('Failed to fetch client data', err);
      setClientError(true);
    } finally {
      setInitialLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    const num = Number(bytes);
    if (!bytes || isNaN(num) || num <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    if (isNaN(i) || i < 0 || !sizes[i]) return '0 B';
    return parseFloat((num / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytes) => {
    return formatBytes(bytes) + '/s';
  };

  const formatEta = (totalSize, progress, speed, clientEta = null) => {
    let seconds = null;
    if (clientEta !== null && clientEta !== undefined && clientEta > 0 && clientEta < 8640000) {
      seconds = clientEta;
    } else if (speed > 0 && totalSize > 0 && progress < 99.5) {
      const remainingBytes = totalSize * (1 - progress / 100);
      seconds = Math.floor(remainingBytes / speed);
    }

    if (!seconds || seconds <= 0) return null;
    if (seconds < 60) return `${seconds}s remaining`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m remaining`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours < 24) {
      return remMins > 0 ? `${hours}h ${remMins}m remaining` : `${hours}h remaining`;
    }
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days}d ${remHours}h remaining` : `${days}d remaining`;
  };

  const isFailedTorrent = (t) => {
    const s = (t.state || '').toLowerCase();
    return s.includes('error') || s.includes('fail') || s.includes('missing');
  };

  const isCompletedTorrent = (t) => {
    if (isFailedTorrent(t)) return false;
    const progress = Math.min(100, Math.max(0, Math.round(t.progress || 0)));
    const s = (t.state || '').toLowerCase();
    return progress >= 100 || s.includes('seed') || s.includes('upload') || s.includes('complete');
  };

  const isQueuedTorrent = (t) => {
    if (isFailedTorrent(t) || isCompletedTorrent(t)) return false;
    const s = (t.state || '').toLowerCase();
    return s.includes('pause') || s.includes('stop') || s.includes('queue') || s.includes('waiting');
  };

  const isActiveTorrent = (t) => {
    return !isFailedTorrent(t) && !isCompletedTorrent(t) && !isQueuedTorrent(t);
  };

  const activeDownloads = downloads.filter(isActiveTorrent);
  const queuedDownloads = downloads.filter(isQueuedTorrent);
  const completedDownloads = downloads.filter(isCompletedTorrent);
  const failedDownloads = downloads.filter(isFailedTorrent);

  const activeCount = activeDownloads.length;
  const queuedCount = queuedDownloads.length;
  const completedCount = completedDownloads.length;
  const failedCount = failedDownloads.length;

  const completedTotalBytes = completedDownloads.reduce((acc, d) => acc + (d.total_size || d.size || 0), 0);
  const totalTrafficBytes = (Number(stats.dl_info_data) || 0) + (Number(stats.up_info_data) || 0);
  const totalTrafficFormatted = totalTrafficBytes > 0 
    ? formatBytes(totalTrafficBytes) 
    : (downloads.reduce((acc, d) => acc + (d.total_size || d.size || 0), 0) > 0 
        ? formatBytes(downloads.reduce((acc, d) => acc + (d.total_size || d.size || 0), 0))
        : '0 B');

  const filteredDownloads = downloads.filter(t => {
    if (activeTab === 'active') {
      if (!isActiveTorrent(t)) return false;
    } else if (activeTab === 'queued') {
      if (!isQueuedTorrent(t)) return false;
    } else if (activeTab === 'completed') {
      if (!isCompletedTorrent(t)) return false;
    } else if (activeTab === 'failed') {
      if (!isFailedTorrent(t)) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const name = (t.name || '').toLowerCase();
      const client = (t.clientName || '').toLowerCase();
      const path = (t.save_path || t.downloadDir || '').toLowerCase();
      if (!name.includes(q) && !client.includes(q) && !path.includes(q)) return false;
    }

    return true;
  });

  const sortedDownloads = useMemo(() => {
    return [...filteredDownloads].sort((a, b) => {
      if (sortBy === 'progress') return (b.progress || 0) - (a.progress || 0);
      if (sortBy === 'speed') return ((b.dlspeed || 0) + (b.upspeed || 0)) - ((a.dlspeed || 0) + (a.upspeed || 0));
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'size') return ((b.total_size || b.size || 0) - (a.total_size || a.size || 0));
      if (sortBy === 'eta') {
        const getValidEta = (t) => {
          const eta = t.eta;
          if (eta === null || eta === undefined || eta <= 0 || eta >= 8640000) return Infinity;
          return eta;
        };
        return getValidEta(a) - getValidEta(b);
      }
      return 0;
    });
  }, [filteredDownloads, sortBy]);

  const transferRatio = stats.up_info_data !== null && stats.up_info_data !== undefined && Number(stats.dl_info_data) > 0
    ? (stats.up_info_data / stats.dl_info_data).toFixed(2)
    : null;

  return (
    <div className="space-y-3">
      <div ref={headerRef} className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 sm:gap-3 !mb-0">
            <DownloadCloud className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400" /> <span className="truncate">Downloads</span>
          </h1>
          <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block !mb-0">
            Monitor and manage active downloads across connected clients in real-time.
          </p>
        </div>
      </div>

      <StickyBar visible={stickyVisible}>
        <div className="flex items-center gap-3 ml-auto sm:hidden text-xs">
          <span className="font-bold text-slate-300">{activeCount} active</span>
          <span className="flex items-center gap-1 text-emerald-400"><ArrowDown className="w-3 h-3" />{formatSpeed(stats.dl_info_speed)}</span>
          <span className="flex items-center gap-1 text-slate-400"><ArrowUp className="w-3 h-3" />{formatSpeed(stats.up_info_speed)}</span>
        </div>
      </StickyBar>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Active Downloads */}
        <div className="glass-panel rounded-xl p-3 sm:p-3.5 border border-white/5 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
            <Download className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">Active Downloads</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-lg sm:text-2xl font-black text-slate-100">{activeCount}</span>
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-0.5">
                <ArrowDown className="w-3 h-3" /> {formatSpeed(stats.dl_info_speed || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Completed */}
        <div className="glass-panel rounded-xl p-3 sm:p-3.5 border border-white/5 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
            <Check className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">Completed</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-lg sm:text-2xl font-black text-slate-100">{completedCount}</span>
              <span className="text-xs font-semibold text-cyan-400 flex items-center gap-0.5" title="Total size of completed items">
                {formatBytes(completedTotalBytes)}
              </span>
            </div>
          </div>
        </div>

        {/* Queued */}
        <div className="glass-panel rounded-xl p-3 sm:p-3.5 border border-white/5 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-slate-800 text-slate-300 border border-white/5 shrink-0">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">Queued</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-lg sm:text-2xl font-black text-slate-100">{queuedCount}</span>
              <span className="text-xs font-medium text-slate-400">
                {queuedCount} pending
              </span>
            </div>
          </div>
        </div>

        {/* Total Traffic */}
        <div className="glass-panel rounded-xl p-3 sm:p-3.5 border border-white/5 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-slate-800 text-slate-300 border border-white/5 shrink-0">
            <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">Total Traffic</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-lg sm:text-2xl font-black text-slate-100 truncate">{totalTrafficFormatted}</span>
              <span className="text-xs font-medium text-slate-400 truncate">
                Ratio: {transferRatio || '0.00'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-header Filter & Controls Bar */}
      <div className="glass-panel rounded-xl px-3 sm:px-4 py-2 border border-white/5 flex items-center justify-between gap-3 flex-wrap shadow-sm">
        {/* Tabs */}
        <div className="flex items-center gap-3 sm:gap-5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={`relative py-1 flex items-center gap-2 text-xs sm:text-sm font-semibold transition-colors shrink-0 ${
              activeTab === 'active' ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Active Downloads</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full transition-all ${
                activeTab === 'active'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                  : 'bg-slate-800 text-slate-400 font-medium border border-white/5'
              }`}
            >
              {activeCount}
            </span>
            {activeTab === 'active' && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-cyan-400 rounded-full shadow-[0_0_6px_rgba(6,182,212,0.6)]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('queued')}
            className={`relative py-1 flex items-center gap-2 text-xs sm:text-sm font-semibold transition-colors shrink-0 ${
              activeTab === 'queued' ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Queued</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full transition-all ${
                activeTab === 'queued'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                  : 'bg-slate-800 text-slate-400 font-medium border border-white/5'
              }`}
            >
              {queuedCount}
            </span>
            {activeTab === 'queued' && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-cyan-400 rounded-full shadow-[0_0_6px_rgba(6,182,212,0.6)]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`relative py-1 flex items-center gap-2 text-xs sm:text-sm font-semibold transition-colors shrink-0 ${
              activeTab === 'completed' ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Completed</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full transition-all ${
                activeTab === 'completed'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                  : 'bg-slate-800 text-slate-400 font-medium border border-white/5'
              }`}
            >
              {completedCount}
            </span>
            {activeTab === 'completed' && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-cyan-400 rounded-full shadow-[0_0_6px_rgba(6,182,212,0.6)]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('failed')}
            className={`relative py-1 flex items-center gap-2 text-xs sm:text-sm font-semibold transition-colors shrink-0 ${
              activeTab === 'failed' ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Failed</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full transition-all ${
                activeTab === 'failed'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                  : 'bg-slate-800 text-slate-400 font-medium border border-white/5'
              }`}
            >
              {failedCount}
            </span>
            {activeTab === 'failed' && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-cyan-400 rounded-full shadow-[0_0_6px_rgba(6,182,212,0.6)]" />
            )}
          </button>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
          {/* Quick Search */}
          <div className="relative min-w-[130px] sm:min-w-[170px] max-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter..."
              className="w-full bg-slate-900 border border-white/10 rounded-lg pl-8 pr-7 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                title="Clear filter"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Select All Toggle */}
          {sortedDownloads.length > 0 && (
            <button
              type="button"
              onClick={() => toggleSelectAll(sortedDownloads)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-slate-800/60 transition-colors"
              title={
                sortedDownloads.every(d => selectedHashes.has(d.hash))
                  ? 'Deselect all visible'
                  : 'Select all visible'
              }
            >
              {sortedDownloads.every(d => selectedHashes.has(d.hash)) ? (
                <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
              ) : sortedDownloads.some(d => selectedHashes.has(d.hash)) ? (
                <div className="w-3.5 h-3.5 rounded border border-cyan-400/60 bg-cyan-400/20 flex items-center justify-center">
                  <div className="w-1.5 h-0.5 bg-cyan-400 rounded" />
                </div>
              ) : (
                <Square className="w-3.5 h-3.5 text-slate-500" />
              )}
              <span className="hidden sm:inline">Select All</span>
            </button>
          )}

          {/* Sort selector */}
          <div className="relative">
            <div className="flex items-center bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1 gap-1.5 focus-within:border-cyan-500/50">
              <span className="text-slate-500 text-[11px] font-medium">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none bg-transparent text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer pr-4"
              >
                <option value="progress" className="bg-slate-900 text-white">Progress</option>
                <option value="speed" className="bg-slate-900 text-white">Speed</option>
                <option value="name" className="bg-slate-900 text-white">Name</option>
                <option value="size" className="bg-slate-900 text-white">Size</option>
                <option value="eta" className="bg-slate-900 text-white">ETA</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center bg-slate-900 border border-white/10 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1 rounded-md transition-all ${
                viewMode === 'list'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="List view"
            >
              <Menu className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1 rounded-md transition-all ${
                viewMode === 'grid'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Grid view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {clientError && (
        <InlineError message="Download client not reachable" onRetry={fetchClientData} />
      )}

      {/* Bulk Action Bar */}
      {selectedHashes.size > 0 && (
        <div className="glass-panel rounded-xl p-2.5 sm:p-3 border border-cyan-500/30 bg-cyan-950/20 flex items-center justify-between gap-3 flex-wrap animate-fade-in shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-xs sm:text-sm font-bold text-slate-200">
              <span className="text-cyan-400">{selectedHashes.size}</span> of {sortedDownloads.length} selected
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-slate-400 hover:text-white transition-colors underline"
            >
              Clear
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleBulkPause}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs font-bold transition-all border border-amber-500/20 hover:border-amber-500/40 disabled:opacity-50"
              title="Pause selected downloads"
            >
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>

            <button
              type="button"
              onClick={handleBulkResume}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition-all border border-emerald-500/20 hover:border-emerald-500/40 disabled:opacity-50"
              title="Resume selected downloads"
            >
              <Play className="w-3.5 h-3.5 fill-emerald-400/20" /> Resume
            </button>

            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-bold transition-all border border-rose-500/20 hover:border-rose-500/40 disabled:opacity-50"
              title="Cancel and delete selected downloads"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>

            <button
              type="button"
              onClick={clearSelection}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
              title="Clear selection"
              aria-label="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {initialLoading ? (
        <div className="glass-panel flex flex-col items-center justify-center h-[260px] rounded-xl border border-white/5 shadow-xl">
          <div className="w-8 h-8 border-2 border-cyan-500/50 border-t-cyan-400 rounded-full animate-spin" />
          <p className="text-sm text-slate-400 mt-3">Loading downloads...</p>
        </div>
      ) : sortedDownloads.length > 0 ? (
        <div className={viewMode === 'grid' ? "grid grid-cols-1 xl:grid-cols-2 gap-2.5" : "space-y-2"}>
          {sortedDownloads.map(t => {
            const isSelected = selectedHashes.has(t.hash);
            const totalSize = t.total_size || t.size || 0;
            const progressPct = Math.min(100, Math.max(0, Math.round(t.progress || 0)));
            const completedBytes = t.completed || (totalSize > 0 ? (totalSize * progressPct / 100) : 0);
            const eta = formatEta(totalSize, t.progress || 0, t.dlspeed || 0, t.eta);
            const info = parseReleaseInfo(t.name, t);
            const isPaused = (t.state || '').toLowerCase().includes('pause') || (t.state || '').toLowerCase().includes('stop');
            const isComplete = progressPct >= 100 || (t.state || '').toLowerCase().includes('seed') || (t.state || '').toLowerCase().includes('complete');
            const folderPath = t.save_path || t.downloadDir || (info.isMusic ? '/downloads/music' : info.isTv ? '/downloads/tvshows' : '/downloads/movies');

            const isDownloading = t.dlspeed > 0;
            const isUploading = t.upspeed > 0;

            let etaText = '—';
            if (isPaused) etaText = 'Paused';
            else if (isComplete && !eta) etaText = isUploading ? 'Seeding' : 'Completed';
            else if (eta) etaText = eta;
            else if (t.dlspeed === 0) etaText = 'Stalled';

            return (
              <div 
                key={t.hash} 
                className={`glass-panel transition-all px-3 py-2.5 sm:px-4 sm:py-2.5 rounded-xl border group relative ${
                  isSelected
                    ? 'border-cyan-500/40 bg-cyan-950/20 ring-1 ring-cyan-500/30'
                    : 'border-white/5 hover:border-white/10 bg-slate-900/40 hover:bg-slate-900/60'
                }`}
              >
                {/* Line 1: Checkbox, Status Icon, Title, Badges ... Speed, ETA, Size, Actions */}
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Selection checkbox */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(t.hash);
                      }}
                      className="text-slate-500 hover:text-slate-300 transition-colors shrink-0 p-0.5"
                      title={isSelected ? 'Deselect download' : 'Select download'}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-600 hover:text-slate-400" />
                      )}
                    </button>

                    {/* State icon */}
                    <div className="shrink-0">
                      {info.isPendingMetadata ? (
                        <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                      ) : isPaused ? (
                        <Pause className="w-4 h-4 text-amber-400/90" title="Paused" />
                      ) : isComplete ? (
                        <Check className="w-4 h-4 text-cyan-400" title="Completed" />
                      ) : t.dlspeed > 0 ? (
                        <ArrowDown className="w-4 h-4 text-emerald-400 animate-pulse" title="Downloading" />
                      ) : (
                        <Clock className="w-4 h-4 text-slate-500" title={t.state || 'Queued'} />
                      )}
                    </div>

                    {/* Title */}
                    <span 
                      className="text-xs sm:text-sm font-bold text-slate-200 truncate group-hover:text-white transition-colors"
                      title={info.raw || t.name}
                    >
                      {info.title}
                    </span>

                    {/* Badges */}
                    <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        {info.mediaLabel}
                      </span>
                      {info.resolution && (
                        <span className="text-[10px] font-medium font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/5">
                          {info.resolution}
                        </span>
                      )}
                      {info.codec && info.codec !== info.resolution && (
                        <span className="text-[10px] font-medium font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/5">
                          {info.codec}
                        </span>
                      )}
                      {info.audio && info.audio !== info.codec && (
                        <span className="text-[10px] font-medium font-mono px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400 border border-white/5">
                          {info.audio}
                        </span>
                      )}
                      {info.source && (
                        <span className="text-[10px] font-medium font-mono px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400 border border-white/5">
                          {info.source}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right group: Speed, ETA, Size, Action buttons */}
                  <div className="flex items-center gap-3 sm:gap-4 shrink-0 font-mono text-xs">
                    {/* Speed */}
                    <div className="flex items-center gap-2">
                      {isDownloading && (
                        <span className="font-semibold text-emerald-400 flex items-center gap-0.5" title="Download speed">
                          <ArrowDown className="w-3 h-3 animate-pulse" /> {formatSpeed(t.dlspeed)}
                        </span>
                      )}
                      {isUploading && (
                        <span className="font-semibold text-cyan-400 flex items-center gap-0.5" title="Upload speed">
                          <ArrowUp className="w-3 h-3" /> {formatSpeed(t.upspeed)}
                        </span>
                      )}
                      {!isDownloading && !isUploading && (
                        <span className="text-slate-500 font-semibold">
                          {isPaused ? 'Paused' : isComplete ? 'Idle' : '0 B/s'}
                        </span>
                      )}
                    </div>

                    {/* ETA */}
                    <span className="text-slate-400 hidden md:inline">
                      {etaText}
                    </span>

                    {/* Downloaded / Total Size */}
                    <span className="text-slate-400 hidden lg:inline">
                      <span className="text-slate-200 font-medium">{formatBytes(completedBytes)}</span>
                      <span className="text-slate-600 mx-1">/</span>
                      <span>{formatBytes(totalSize)}</span>
                    </span>

                    {/* Controls */}
                    <div className="flex items-center gap-1">
                      {isPaused ? (
                        <button
                          type="button"
                          onClick={() => handleResume(t.hash)}
                          className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors"
                          title="Resume download"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handlePause(t.hash)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/5 transition-colors"
                          title="Pause download"
                        >
                          <Pause className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuHash(openMenuHash === t.hash ? null : t.hash);
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-white/5 transition-colors"
                          title="More options"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>

                        {openMenuHash === t.hash && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-full mt-1 w-52 bg-slate-900 border border-white/10 rounded-xl shadow-2xl z-30 py-1 overflow-hidden"
                          >
                            <button
                              onClick={async () => {
                                setOpenMenuHash(null);
                                if (isPaused) await handleResume(t.hash);
                                else await handlePause(t.hash);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-200 hover:bg-slate-800/80 flex items-center gap-2.5 transition-colors"
                            >
                              {isPaused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-amber-400" />}
                              <span>{isPaused ? 'Resume Download' : 'Pause Download'}</span>
                            </button>

                            <button
                              onClick={async () => {
                                setOpenMenuHash(null);
                                await handleDelete(t.hash, false);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-200 hover:bg-slate-800/80 flex items-center gap-2.5 transition-colors"
                            >
                              <Trash2 className="w-4 h-4 text-slate-400" />
                              <span>Remove from Client</span>
                            </button>

                            <button
                              onClick={async () => {
                                setOpenMenuHash(null);
                                await handleDelete(t.hash, true);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs font-semibold text-rose-400 hover:bg-rose-500/10 flex items-center gap-2.5 transition-colors border-t border-white/5"
                            >
                              <Trash2 className="w-4 h-4 text-rose-400" />
                              <span>Cancel & Delete Files</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Line 2: Slim Progress Bar + Percent + Client & Save Path */}
                <div className="flex items-center gap-2.5 pt-0.5">
                  <div className="flex-1 h-1.5 bg-slate-800/80 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        isPaused
                          ? 'bg-amber-500/80'
                          : isComplete
                          ? 'bg-cyan-400'
                          : 'bg-gradient-to-r from-emerald-400 to-cyan-400'
                      }`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  <span className="text-[11px] font-bold font-mono text-slate-300 tabular-nums shrink-0 w-8 text-right">
                    {progressPct}%
                  </span>

                  <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 shrink-0">
                    <span className="text-cyan-400/80 font-medium">{t.clientName || 'qBittorrent'}</span>
                    <span>•</span>
                    {t.ratio !== undefined && t.ratio !== null && Number(t.ratio) >= 0 && (
                      <>
                        <span className="font-mono text-slate-400" title="Share ratio">Ratio: {Number(t.ratio).toFixed(2)}</span>
                        <span>•</span>
                      </>
                    )}
                    {t.num_seeds !== undefined && t.num_seeds !== null && Number(t.num_seeds) >= 0 && (
                      <>
                        <span className="font-mono text-slate-400" title="Seeds">Seeds: {t.num_seeds}</span>
                        <span>•</span>
                      </>
                    )}
                    <span className="truncate max-w-[220px]" title={folderPath}>{folderPath}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-panel p-10 rounded-xl border border-white/5 text-center flex flex-col items-center justify-center relative overflow-hidden shadow-xl">
          <div className="relative z-10 flex flex-col items-center text-center max-w-sm px-4">
            <div className="p-3.5 bg-slate-800/60 rounded-xl mb-3 border border-white/5 text-cyan-400">
              <DownloadCloud className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-200 capitalize">
              {downloads.length === 0 ? 'No Downloads in Queue' : `No ${activeTab} Downloads`}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {downloads.length === 0
                ? 'When media downloads are triggered, their real-time progress and speeds will appear here.'
                : `There are currently no downloads matching the "${activeTab}" filter.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
