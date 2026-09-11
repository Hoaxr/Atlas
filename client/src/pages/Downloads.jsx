import { useState, useEffect } from 'react';
import api from '../lib/api';
import { DownloadCloud, ArrowDown, ArrowUp, Activity, Film, Tv, Music2, Play, Pause, Trash2, Clock, HardDrive, CheckSquare, Square, X } from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';
import useWebSocket from '../lib/useWebSocket';
import StickyBar from '../components/shared/StickyBar';
import InlineError from '../components/shared/InlineError';
import { useStickyBar } from '../lib/useStickyBar';
import { parseResolution, parseCodec, parseAudio } from '../lib/format';

const parseReleaseInfo = (rawName, torrent = {}) => {
  if (!rawName) return { title: 'Unknown', mediaLabel: 'Movie', resolution: null, source: null, codec: null, audio: null, hdr: null, isTv: false, isMusic: false, raw: '' };
  
  const name = rawName.replace(/\.(mp4|mkv|avi|mov)$/i, '');
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

  const isMusic = isClientMusic || (hasExplicitMusicClues && !hasVideoClues) || (!hasVideoClues && !hasTvClues && isSmallSize && (name.includes(' - ') || hasExplicitMusicClues));

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
      .replace(/\b(flac|mp3|320kbps|lossless|alac|opus|aac|v0|v2|web-flac|vinyl-flac|cd-flac|cdrip|webrip)\b.*/i, '')
      .trim();

    if (cleanMusicTitle.includes(' - ')) {
      const parts = cleanMusicTitle.split(/\s+-\s+/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const artist = parts[0];
        const album = parts[1];
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
    } else {
      cleanMusicTitle = cleanMusicTitle.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    return {
      title: cleanMusicTitle || rawName,
      mediaLabel: 'Audio',
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
    const showTitle = tvMatch[1].replace(/[._()[\]-]/g, ' ').trim();
    const epString = tvMatch[2].replace(/[._]/g, ' ').toUpperCase().trim();
    return {
      title: `${showTitle} — ${epString}`,
      mediaLabel: 'Episode',
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

  const toggleSelectAll = () => {
    if (selectedHashes.size === downloads.length && downloads.length > 0) {
      setSelectedHashes(new Set());
    } else {
      setSelectedHashes(new Set(downloads.map(d => d.hash)));
    }
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
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytes) => {
    return formatBytes(bytes) + '/s';
  };

  const formatEta = (totalSize, progress, speed) => {
    if (!speed || speed <= 0 || !totalSize || progress >= 99.5) return null;
    const remainingBytes = totalSize * (1 - progress / 100);
    const seconds = Math.floor(remainingBytes / speed);
    if (seconds <= 0) return 'Few seconds remaining';
    if (seconds < 60) return `${seconds}s remaining`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s remaining`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m remaining`;
  };

  const getStateBadge = (state) => {
    const s = (state || '').toLowerCase();
    if (s.startsWith('paused') || s.startsWith('stopped')) {
      return { class: 'bg-amber-500/15 text-amber-400 border-amber-500/30', dot: 'bg-amber-400' };
    }
    if (s.includes('error')) {
      return { class: 'bg-rose-500/15 text-rose-400 border-rose-500/30', dot: 'bg-rose-400' };
    }
    if (s.includes('download') || s.endsWith('dl')) {
      return { class: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' };
    }
    if (s.includes('upload') || s.includes('seed')) {
      return { class: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', dot: 'bg-cyan-400' };
    }
    if (s.startsWith('stall')) {
      return { class: 'bg-rose-500/15 text-rose-400 border-rose-500/30', dot: 'bg-rose-400' };
    }
    return { class: 'bg-slate-700/30 text-slate-400 border-slate-700/50', dot: 'bg-slate-400' };
  };

  const transferRatio = stats.up_info_data !== null && stats.up_info_data !== undefined && Number(stats.dl_info_data) > 0
    ? (stats.up_info_data / stats.dl_info_data).toFixed(2)
    : null;

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div ref={headerRef} className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 sm:gap-3 !mb-0">
            <DownloadCloud className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-400" /> <span className="truncate">Downloads</span>
          </h1>
          <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block">Monitor and manage active downloads across connected clients in real-time.</p>
        </div>
      </div>

      <StickyBar visible={stickyVisible}>
        <div className="flex items-center gap-3 ml-auto sm:hidden text-xs">
          <span className="font-bold text-slate-300">{downloads.length} active</span>
          <span className="flex items-center gap-1 text-emerald-400"><ArrowDown className="w-3 h-3" />{formatSpeed(stats.dl_info_speed)}</span>
          <span className="flex items-center gap-1 text-slate-400"><ArrowUp className="w-3 h-3" />{formatSpeed(stats.up_info_speed)}</span>
        </div>
      </StickyBar>

      <div className="hidden sm:grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-2xl flex items-center space-x-4 border-l-4 border-l-emerald-500 shadow-lg shadow-black/10">
          <div className="p-3.5 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
            <DownloadCloud className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Downloads</p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-3xl font-black text-slate-100">{downloads.length}</p>
              <div className="flex flex-col text-xs font-mono text-emerald-400 text-right space-y-0.5">
                <span className="flex items-center justify-end gap-1.5 font-bold"><ArrowDown className="w-3.5 h-3.5" /> {formatSpeed(stats.dl_info_speed)}</span>
                <span className="flex items-center justify-end gap-1.5 text-slate-400"><ArrowUp className="w-3.5 h-3.5" /> {formatSpeed(stats.up_info_speed)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl flex items-center space-x-4 border-l-4 border-l-cyan-500 shadow-lg shadow-black/10">
          <div className="p-3.5 bg-cyan-500/10 rounded-xl text-cyan-400 border border-cyan-500/20">
            <Activity className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Session Transfer</p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-sm font-semibold text-slate-400">Total Traffic</p>
              <div className="flex flex-col text-xs font-mono text-cyan-400 text-right space-y-0.5">
                {transferRatio !== null && (
                  <span className="flex items-center justify-end gap-1.5 text-slate-400">Ratio: <strong>{transferRatio}</strong></span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {clientError && (
        <InlineError message="Download client not reachable" onRetry={fetchClientData} />
      )}

      {initialLoading ? (
        <div className="glass-panel flex flex-col items-center justify-center h-[320px] rounded-2xl border border-white/5 shadow-xl">
          <div className="w-8 h-8 border-2 border-emerald-500/50 border-t-emerald-400 rounded-full animate-spin" />
          <p className="text-sm text-slate-400 mt-4">Loading downloads...</p>
        </div>
      ) : downloads.length > 0 ? (
        <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-white/5 shadow-xl">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="p-1 -m-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-2"
                title={selectedHashes.size === downloads.length && downloads.length > 0 ? "Deselect all" : "Select all"}
                aria-label={selectedHashes.size === downloads.length && downloads.length > 0 ? "Deselect all" : "Select all"}
              >
                {selectedHashes.size === downloads.length && downloads.length > 0 ? (
                  <CheckSquare className="w-5 h-5 text-emerald-400" />
                ) : selectedHashes.size > 0 ? (
                  <div className="w-5 h-5 rounded border-2 border-emerald-400/60 bg-emerald-400/20 flex items-center justify-center">
                    <div className="w-2.5 h-0.5 bg-emerald-400 rounded" />
                  </div>
                ) : (
                  <Square className="w-5 h-5 text-slate-500 hover:text-slate-400" />
                )}
              </button>
              <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <DownloadCloud className="w-5 h-5 text-emerald-400" /> Live Queue
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {selectedHashes.size > 0 && (
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                  {selectedHashes.size} selected
                </span>
              )}
              <span className="text-xs font-semibold text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-white/5">
                {downloads.length} {downloads.length === 1 ? 'task' : 'tasks'} running
              </span>
            </div>
          </div>

          {/* Bulk Action Bar */}
          {selectedHashes.size > 0 && (
            <div className="glass-panel rounded-xl p-3 sm:p-4 mb-4 border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between gap-3 flex-wrap animate-fade-in shadow-lg">
              <div className="flex items-center gap-3">
                <span className="text-xs sm:text-sm font-bold text-slate-200">
                  <span className="text-emerald-400">{selectedHashes.size}</span> of {downloads.length} selected
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs font-bold transition-all border border-amber-500/20 hover:border-amber-500/40 disabled:opacity-50"
                  title="Pause selected downloads"
                >
                  <Pause className="w-3.5 h-3.5" /> Pause
                </button>

                <button
                  type="button"
                  onClick={handleBulkResume}
                  disabled={bulkLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition-all border border-emerald-500/20 hover:border-emerald-500/40 disabled:opacity-50"
                  title="Resume selected downloads"
                >
                  <Play className="w-3.5 h-3.5 fill-emerald-400/20" /> Resume
                </button>

                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-bold transition-all border border-rose-500/20 hover:border-rose-500/40 disabled:opacity-50"
                  title="Cancel and delete selected downloads"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>

                <button
                  type="button"
                  onClick={clearSelection}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
                  title="Clear selection"
                  aria-label="Clear selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {downloads.map(t => {
              const isSelected = selectedHashes.has(t.hash);
              const totalSize = t.total_size || t.size || 0;
              const progressPct = Math.min(100, Math.max(0, Math.round(t.progress || 0)));
              const eta = formatEta(totalSize, t.progress || 0, t.dlspeed || 0);
              const info = parseReleaseInfo(t.name, t);
              const stateBadge = getStateBadge(t.state);

              return (
                <div 
                  key={t.hash} 
                  className={`transition-all p-4 sm:p-4.5 rounded-xl border shadow-md space-y-3 group ${
                    isSelected
                      ? 'bg-slate-900/90 border-emerald-500/40 ring-1 ring-emerald-500/30'
                      : 'bg-slate-900/60 hover:bg-slate-900/85 border-white/5 hover:border-cyan-500/20'
                  }`}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(t.hash);
                        }}
                        className="p-1 -m-1 mt-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors shrink-0"
                        title={isSelected ? 'Deselect download' : 'Select download'}
                        aria-label={isSelected ? `Deselect ${info.title}` : `Select ${info.title}`}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {info.isMusic ? (
                            <Music2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : info.isTv ? (
                            <Tv className="w-4 h-4 text-purple-400 shrink-0" />
                          ) : (
                            <Film className="w-4 h-4 text-cyan-400 shrink-0" />
                          )}
                          <h3 className="text-sm sm:text-base font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">
                            {info.title}
                          </h3>

                        {/* Quality & Media Badges */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Media Type Badge */}
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                            info.isMusic
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                              : info.isTv
                              ? 'bg-purple-500/10 text-purple-300 border-purple-500/25'
                              : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25'
                          }`}>
                            {info.mediaLabel || (info.isMusic ? 'Audio' : info.isTv ? 'Episode' : 'Movie')}
                          </span>

                          {info.resolution && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/25">
                              {info.resolution}
                            </span>
                          )}
                          {info.source && info.source !== info.mediaLabel && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/10">
                              {info.source}
                            </span>
                          )}
                          {info.codec && info.codec !== info.audio && info.codec !== info.resolution && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/25">
                              {info.codec}
                            </span>
                          )}
                          {info.audio && info.audio !== info.resolution && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                              {info.audio}
                            </span>
                          )}
                          {info.hdr && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25">
                              {info.hdr}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Raw Release Title Subtext */}
                      <p className="text-[11px] font-mono text-slate-500 truncate select-all" title={t.name}>
                        {t.name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 pt-0.5">
                      {t.dlspeed > 0 && (
                        <span className="flex items-center gap-1 text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 shadow-sm">
                          <ArrowDown className="w-3.5 h-3.5" />
                          {formatSpeed(t.dlspeed)}
                        </span>
                      )}

                      {/* Pause / Resume Button */}
                      {(t.state || '').toLowerCase().includes('pause') || (t.state || '').toLowerCase().includes('stop') ? (
                        <button
                          onClick={async () => {
                            try {
                              await api.post(`/clients/torrents/${t.hash}/resume`);
                              setDownloads(prev => prev.map(d => d.hash === t.hash ? { ...d, state: 'downloading' } : d));
                              customAlert('Download resumed');
                            } catch (e) {
                              console.error('Failed to resume download', e);
                              customAlert('Failed to resume download', 'error');
                            }
                          }}
                          className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-all border border-emerald-500/20 hover:border-emerald-500/40"
                          title="Resume Download"
                        >
                          <Play className="w-4 h-4 fill-emerald-400/20" />
                        </button>
                      ) : (
                        <button
                          onClick={async () => {
                            try {
                              await api.post(`/clients/torrents/${t.hash}/pause`);
                              setDownloads(prev => prev.map(d => d.hash === t.hash ? { ...d, state: 'paused', dlspeed: 0 } : d));
                              customAlert('Download paused');
                            } catch (e) {
                              console.error('Failed to pause download', e);
                              customAlert('Failed to pause download', 'error');
                            }
                          }}
                          className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-all border border-amber-500/20 hover:border-amber-500/40"
                          title="Pause Download"
                        >
                          <Pause className="w-4 h-4" />
                        </button>
                      )}

                      {/* Delete Button */}
                      <button 
                        onClick={async () => {
                          if (await customConfirm('Cancel and delete this download?')) {
                            try {
                              await api.delete(`/clients/torrents/${t.hash}?deleteFiles=true`);
                              setDownloads(prev => prev.filter(d => d.hash !== t.hash));
                              setSelectedHashes(prev => {
                                if (!prev.has(t.hash)) return prev;
                                const next = new Set(prev);
                                next.delete(t.hash);
                                return next;
                              });
                              customAlert('Download deleted');
                            } catch (e) {
                              console.error('Failed to delete download', e);
                              customAlert('Failed to cancel download', 'error');
                            }
                          }
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all border border-transparent hover:border-rose-500/20"
                        title="Delete Download"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar with Gradient & Shimmer */}
                  <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden ring-1 ring-white/5 relative">
                    <div 
                      className="bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 h-2 rounded-full transition-all duration-500 relative" 
                      style={{ width: `${progressPct}%` }}
                    >
                      {t.dlspeed > 0 && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-pulse" />
                      )}
                    </div>
                  </div>

                  {/* Bottom Stats Meta Row */}
                  <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${stateBadge.class}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${stateBadge.dot} ${t.dlspeed > 0 ? 'animate-ping' : ''}`} />
                        {t.state || 'Active'}
                      </span>
                      <span className="flex items-center gap-1 text-slate-400">
                        <HardDrive className="w-3 h-3 text-slate-500" />
                        Size: <strong className="text-slate-200 font-mono">{formatBytes(totalSize)}</strong>
                      </span>
                      {eta && (
                        <span className="text-cyan-400 font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3 text-cyan-500/70" /> {eta}
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-bold text-slate-100">{progressPct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="glass-panel flex flex-col items-center justify-center h-[320px] text-slate-400 rounded-2xl relative overflow-hidden border border-white/5 shadow-xl">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-800/20 to-transparent"></div>
          <div className="relative z-10 flex flex-col items-center text-center max-w-sm px-4">
            <div className="p-4 bg-slate-800/60 rounded-2xl mb-4 ring-1 ring-white/10 shadow-xl text-emerald-400">
              <DownloadCloud className="w-10 h-10" />
            </div>
            <h3 className="text-base font-bold text-slate-200">No Active Downloads</h3>
            <p className="text-xs text-slate-400 mt-1">When media downloads are triggered, their real-time progress and speeds will appear here.</p>
          </div>
        </div>
      )}
    </div>
  );
}
