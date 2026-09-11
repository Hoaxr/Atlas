import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Music2, Search, Plus, LayoutGrid, List, Disc, Mic2, FileAudio,
  CheckCircle2, AlertCircle, RefreshCw, Loader2, ChevronRight, X,
  FolderTree, HardDrive, Play, Pause, ZoomIn, ZoomOut, Sparkles,
  CheckSquare, Square, Trash2, Eye, EyeOff
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { formatSize } from '../lib/format';
import { albumCoverUrl, artistImageUrl } from '../lib/posterUrl';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import AddArtistModal from '../components/music/AddArtistModal';
import ManualSearchModal from '../components/ManualSearchModal';
import MusicPathsModal from '../components/music/MusicPathsModal';
import StickyBar from '../components/shared/StickyBar';
import EmptyState from '../components/shared/EmptyState';
import { useStickyBar } from '../lib/useStickyBar';

export default function Music() {
  const navigate = useNavigate();
  const { headerRef, stickyVisible } = useStickyBar();
  const [searchParams, setSearchParams] = useSearchParams();

  // Audio player hook
  const { playTrack, playAlbum, currentTrack, isPlaying, togglePlay } = useAudioPlayer();

  // Tab: 'artists' | 'albums' | 'tracks'
  const activeTab = searchParams.get('tab') || 'artists';
  const setTab = (t) => setSearchParams({ tab: t });

  // Data states
  const [artists, setArtists] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [musicPaths, setMusicPaths] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [searchingMissing, setSearchingMissing] = useState(false);
  const [pathsModalOpen, setPathsModalOpen] = useState(false);

  // Filters & search
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, downloaded, missing, monitored
  const [typeFilter, setTypeFilter] = useState('all'); // all, album, single_ep, compilation
  const [formatFilter, setFormatFilter] = useState('all'); // all, flac, mp3
  const [sortKey, setSortKey] = useState('added_desc');
  const [layoutMode, setLayoutMode] = useState(() => localStorage.getItem('atlas_music_layout') || 'grid');

  // Poster card sizing
  const [posterSize, setPosterSize] = useState(() => {
    const saved = localStorage.getItem('atlas_music_poster_size');
    return saved ? Number(saved) : 180;
  });

  // Batch selection states
  const [selectMode, setSelectMode] = useState(false);
  const [selectedAlbumIds, setSelectedAlbumIds] = useState(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);

  // Modals
  const [addArtistOpen, setAddArtistOpen] = useState(false);
  const [manualSearchAlbum, setManualSearchAlbum] = useState(null);

  const setLayout = (mode) => {
    setLayoutMode(mode);
    localStorage.setItem('atlas_music_layout', mode);
  };

  const updatePosterSize = (val) => {
    const clamped = Math.max(130, Math.min(260, val));
    setPosterSize(clamped);
    localStorage.setItem('atlas_music_poster_size', String(clamped));
  };

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [artistsRes, albumsRes, tracksRes, statsRes, pathsRes] = await Promise.allSettled([
        api.get('/library/music/artists'),
        api.get('/library/music/albums'),
        api.get('/library/music/tracks?limit=250'),
        api.get('/library/music/stats'),
        api.get('/library/paths')
      ]);

      if (artistsRes.status === 'fulfilled' && artistsRes.value.data.status === 'success') {
        setArtists(artistsRes.value.data.data || []);
      }
      if (albumsRes.status === 'fulfilled' && albumsRes.value.data.status === 'success') {
        setAlbums(albumsRes.value.data.data || []);
      }
      if (tracksRes.status === 'fulfilled' && tracksRes.value.data.status === 'success') {
        setTracks(tracksRes.value.data.data || []);
      }
      if (statsRes.status === 'fulfilled' && statsRes.value.data.status === 'success') {
        setStats(statsRes.value.data.data || null);
      }
      if (pathsRes.status === 'fulfilled' && pathsRes.value.data.status === 'success') {
        const all = pathsRes.value.data.data || [];
        setMusicPaths(all.filter((p) => p.type === 'music'));
      }
    } catch (err) {
      console.error('Failed to load music library:', err);
      toast.error('Failed to load music library', { id: 'music-load-error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Trigger library scan
  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await api.post('/library/music/scan');
      if (res.data.status === 'success') {
        toast.success(res.data.message || 'Music library scan complete');
        fetchData();
      }
    } catch (err) {
      console.error('Music scan failed:', err);
      toast.error(err.response?.data?.message || 'Music library scan failed');
    } finally {
      setScanning(false);
    }
  };

  // Trigger Search for All Missing Albums
  const handleSearchMissingAll = async () => {
    setSearchingMissing(true);
    try {
      const res = await api.post('/library/music/search-missing');
      if (res.data.status === 'success') {
        toast.success(res.data.message || 'Searching releases for missing albums');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to trigger search');
    } finally {
      setSearchingMissing(false);
    }
  };

  // Batch actions
  const toggleSelectAlbum = (id) => {
    setSelectedAlbumIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchAction = async (action) => {
    if (selectedAlbumIds.size === 0) return;
    setBatchProcessing(true);
    try {
      const albumIds = Array.from(selectedAlbumIds);
      const res = await api.post('/library/music/albums/bulk', { action, albumIds });
      if (res.data.status === 'success') {
        toast.success(res.data.message);
        setSelectedAlbumIds(new Set());
        setSelectMode(false);
        fetchData();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to perform ${action}`);
    } finally {
      setBatchProcessing(false);
    }
  };

  // ── Filtering and Sorting ──────────────────────────────────────────────────

  const filteredAlbums = useMemo(() => {
    return albums
      .filter((album) => {
        if (statusFilter === 'downloaded' && album.status !== 'downloaded') return false;
        if (statusFilter === 'missing' && album.status === 'downloaded') return false;
        if (statusFilter === 'monitored' && !album.monitored) return false;

        if (typeFilter !== 'all') {
          const t = (album.album_type || '').toLowerCase();
          if (typeFilter === 'album' && t !== 'album') return false;
          if (typeFilter === 'single_ep' && t !== 'single' && t !== 'ep') return false;
          if (typeFilter === 'compilation' && t !== 'compilation') return false;
        }

        if (formatFilter !== 'all') {
          const f = (album.file_format || '').toLowerCase();
          if (formatFilter === 'flac' && !f.includes('flac')) return false;
          if (formatFilter === 'mp3' && !f.includes('mp3')) return false;
        }

        if (query.trim()) {
          const q = query.toLowerCase();
          const matchTitle = (album.title || '').toLowerCase().includes(q);
          const matchArtist = (album.artist_name || '').toLowerCase().includes(q);
          const matchGenre = (album.genres || '').toLowerCase().includes(q);
          if (!matchTitle && !matchArtist && !matchGenre) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortKey === 'title_asc') return (a.title || '').localeCompare(b.title || '');
        if (sortKey === 'artist_asc') return (a.artist_name || '').localeCompare(b.artist_name || '');
        if (sortKey === 'year_desc') return (b.year || 0) - (a.year || 0);
        if (sortKey === 'year_asc') return (a.year || 0) - (b.year || 0);
        if (sortKey === 'tracks_desc') return (b.track_count || 0) - (a.track_count || 0);
        return new Date(b.added_at || 0) - new Date(a.added_at || 0);
      });
  }, [albums, query, statusFilter, typeFilter, formatFilter, sortKey]);

  const filteredArtists = useMemo(() => {
    return artists
      .filter((artist) => {
        if (statusFilter === 'monitored' && !artist.monitored) return false;
        if (query.trim()) {
          const q = query.toLowerCase();
          const matchName = (artist.name || '').toLowerCase().includes(q);
          const matchDisambig = (artist.disambiguation || '').toLowerCase().includes(q);
          if (!matchName && !matchDisambig) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortKey === 'name_desc') return (b.name || '').localeCompare(a.name || '');
        if (sortKey === 'albums_desc') return (b.album_count || 0) - (a.album_count || 0);
        if (sortKey === 'name_asc') return (a.name || '').localeCompare(b.name || '');
        return new Date(b.added_at || 0) - new Date(a.added_at || 0);
      });
  }, [artists, query, statusFilter, sortKey]);

  const filteredTracks = useMemo(() => {
    return tracks.filter((track) => {
      if (statusFilter === 'downloaded' && track.status !== 'downloaded') return false;
      if (statusFilter === 'missing' && track.status === 'downloaded') return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const matchTitle = (track.title || '').toLowerCase().includes(q);
        const matchArtist = (track.artist_name || '').toLowerCase().includes(q);
        const matchAlbum = (track.album_title || '').toLowerCase().includes(q);
        if (!matchTitle && !matchArtist && !matchAlbum) return false;
      }
      return true;
    });
  }, [tracks, query, statusFilter]);

  const formatDuration = (secs) => {
    if (!secs) return '--:--';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const missingCount = useMemo(() => {
    return albums.filter((a) => a.monitored && a.status !== 'downloaded').length;
  }, [albums]);

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div ref={headerRef} className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 sm:gap-3 !mb-0">
            <Music2 className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 shrink-0" /> <span className="truncate">Music</span>
          </h1>
          <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block">
            Manage your artists, discographies, and audio downloads.
          </p>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setPathsModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-200/80 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300/40 dark:border-white/5 flex items-center gap-1.5 transition-colors"
            title="Configure Music Mounts & Root Folders"
          >
            <FolderTree className="w-3.5 h-3.5 text-cyan-400" />
            <span>Mounts ({musicPaths.length})</span>
          </button>

          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-200/80 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300/40 dark:border-white/5 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Scan music library folders on disk"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin text-cyan-400' : ''}`} />
            {scanning ? 'Scanning...' : 'Scan Library'}
          </button>

          {missingCount > 0 && (
            <button
              onClick={handleSearchMissingAll}
              disabled={searchingMissing}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
              title="Trigger automated indexer search for all missing monitored albums"
            >
              <Sparkles className={`w-3.5 h-3.5 ${searchingMissing ? 'animate-spin text-cyan-400' : 'text-cyan-400'}`} />
              <span>Search Missing</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-cyan-500 text-slate-950">
                {missingCount}
              </span>
            </button>
          )}

          <button
            onClick={() => setAddArtistOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center gap-1.5 shadow-[0_0_20px_rgba(6,182,212,0.35)] transition-all hover:scale-105 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Add Artist / Album
          </button>
        </div>
      </div>

      <StickyBar visible={stickyVisible}>
        <div className="flex items-center gap-3 ml-auto sm:hidden text-[11px] text-slate-400">
          <span className="text-slate-300">{artists.length} artists</span>
          <span>{albums.length} albums</span>
          <span>{tracks.length} tracks</span>
        </div>
      </StickyBar>

      {/* Banner if no music mounts configured */}
      {!loading && musicPaths.length === 0 && (
        <div className="rounded-2xl p-3.5 bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-300">No Music Mount Configured</p>
              <p className="text-[11px] text-slate-400">
                Configure your music mount (e.g. <span className="font-mono text-cyan-300 font-semibold">/mnt/oblivion/music</span>) so Atlas knows where your audio files live.
              </p>
            </div>
          </div>
          <button
            onClick={() => setPathsModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shrink-0 shadow-lg shadow-amber-500/20"
          >
            Configure Mount
          </button>
        </div>
      )}

      {/* Interactive Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={Mic2}
          label="Artists"
          value={stats?.artists || artists.length}
          accent="text-cyan-400"
          bg="bg-cyan-500/15"
          onClick={() => setTab('artists')}
          active={activeTab === 'artists'}
        />
        <StatCard
          icon={Disc}
          label="Albums"
          value={stats?.albums || albums.length}
          sub={`${stats?.downloadedAlbums || albums.filter((a) => a.status === 'downloaded').length} ready`}
          accent="text-sky-400"
          bg="bg-sky-500/15"
          onClick={() => {
            setTab('albums');
            setStatusFilter('all');
          }}
          onSubClick={() => {
            setTab('albums');
            setStatusFilter('downloaded');
          }}
          active={activeTab === 'albums'}
        />
        <StatCard
          icon={FileAudio}
          label="Tracks"
          value={stats?.tracks || tracks.length}
          accent="text-indigo-400"
          bg="bg-indigo-500/15"
          onClick={() => setTab('tracks')}
          active={activeTab === 'tracks'}
        />
        <StatCard
          icon={HardDrive}
          label="Storage"
          value={formatSize(stats?.totalSize || 0)}
          sub={missingCount > 0 ? `${missingCount} missing` : 'All ready'}
          accent="text-emerald-400"
          bg="bg-emerald-500/15"
          onClick={() => {
            if (missingCount > 0) {
              setTab('albums');
              setStatusFilter('missing');
            }
          }}
        />
      </div>

      {/* ── Toolbar: Tabs + Filters + Slider ─────────────────────────────────── */}
      <div className="glass-panel rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        {/* Navigation Tabs */}
        <div className="flex items-center p-1 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/40 dark:border-white/5">
          <button
            onClick={() => setTab('artists')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'artists'
                ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Mic2 className="w-3.5 h-3.5" />
            Artists ({artists.length})
          </button>
          <button
            onClick={() => setTab('albums')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'albums'
                ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Disc className="w-3.5 h-3.5" />
            Albums ({albums.length})
          </button>
          <button
            onClick={() => setTab('tracks')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'tracks'
                ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FileAudio className="w-3.5 h-3.5" />
            Tracks ({tracks.length})
          </button>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2.5 flex-1 max-w-2xl justify-end flex-wrap">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[140px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className="w-full pl-8 pr-7 py-1.5 bg-slate-200/50 dark:bg-slate-800/50 border border-slate-300/40 dark:border-white/5 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500/70"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-200/50 dark:bg-slate-800/50 border border-slate-300/40 dark:border-white/5 rounded-xl text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500/70"
          >
            <option value="all">All Statuses</option>
            <option value="downloaded">Downloaded</option>
            <option value="missing">Missing</option>
            <option value="monitored">Monitored</option>
          </select>

          {/* Album Type Filter (Albums Tab) */}
          {activeTab === 'albums' && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-200/50 dark:bg-slate-800/50 border border-slate-300/40 dark:border-white/5 rounded-xl text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500/70"
            >
              <option value="all">All Types</option>
              <option value="album">Studio Albums</option>
              <option value="single_ep">Singles & EPs</option>
              <option value="compilation">Compilations</option>
            </select>
          )}

          {/* Format Filter (Albums Tab) */}
          {activeTab === 'albums' && (
            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-200/50 dark:bg-slate-800/50 border border-slate-300/40 dark:border-white/5 rounded-xl text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500/70"
            >
              <option value="all">All Formats</option>
              <option value="flac">FLAC / Lossless</option>
              <option value="mp3">MP3 / Compressed</option>
            </select>
          )}

          {/* Sort Filter */}
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-200/50 dark:bg-slate-800/50 border border-slate-300/40 dark:border-white/5 rounded-xl text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500/70"
          >
            {activeTab === 'albums' ? (
              <>
                <option value="added_desc">Recently Added</option>
                <option value="title_asc">Title (A-Z)</option>
                <option value="artist_asc">Artist (A-Z)</option>
                <option value="year_desc">Year (Newest)</option>
                <option value="year_asc">Year (Oldest)</option>
                <option value="tracks_desc">Most Tracks</option>
              </>
            ) : (
              <>
                <option value="name_asc">Name (A-Z)</option>
                <option value="added_desc">Recently Added</option>
                <option value="albums_desc">Most Albums</option>
              </>
            )}
          </select>

          {/* Poster Size Slider (Grid View) */}
          {activeTab !== 'tracks' && layoutMode === 'grid' && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-200/50 dark:bg-slate-800/50 border border-slate-300/40 dark:border-white/5 rounded-xl">
              <button
                onClick={() => updatePosterSize(posterSize - 20)}
                className="text-slate-400 hover:text-slate-200"
                title="Smaller posters"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <input
                type="range"
                min="130"
                max="260"
                value={posterSize}
                onChange={(e) => updatePosterSize(Number(e.target.value))}
                onDoubleClick={() => updatePosterSize(180)}
                className="w-16 h-1 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                title={`Poster size: ${posterSize}px (double-click to reset)`}
              />
              <button
                onClick={() => updatePosterSize(posterSize + 20)}
                className="text-slate-400 hover:text-slate-200"
                title="Larger posters"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Batch Select Mode Toggle (Albums Tab) */}
          {activeTab === 'albums' && (
            <button
              onClick={() => {
                if (selectMode) {
                  setSelectedAlbumIds(new Set());
                }
                setSelectMode(!selectMode);
              }}
              className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                selectMode
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-200/50 dark:bg-slate-800/50 border-slate-300/40 dark:border-white/5 text-slate-400 hover:text-slate-200'
              }`}
              title="Toggle Select Mode"
            >
              {selectMode ? <CheckSquare className="w-3.5 h-3.5 text-cyan-400" /> : <Square className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">Select</span>
            </button>
          )}

          {/* Grid / List view toggle */}
          {activeTab !== 'tracks' && (
            <div className="flex items-center p-0.5 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/40 dark:border-white/5">
              <button
                onClick={() => setLayout('grid')}
                className={`p-1.5 rounded-lg transition-colors ${
                  layoutMode === 'grid'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Grid view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setLayout('list')}
                className={`p-1.5 rounded-lg transition-colors ${
                  layoutMode === 'list'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="List view"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Floating Batch Action Bar ────────────────────────────────────────── */}
      {selectMode && selectedAlbumIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 border border-cyan-500/40 px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-xl flex items-center gap-3 animate-fade-in">
          <span className="text-xs font-bold text-cyan-300">
            {selectedAlbumIds.size} selected
          </span>

          <div className="h-4 w-px bg-white/10" />

          <button
            onClick={() => handleBatchAction('search')}
            disabled={batchProcessing}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center gap-1 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Search
          </button>

          <button
            onClick={() => handleBatchAction('monitor')}
            disabled={batchProcessing}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            Monitor
          </button>

          <button
            onClick={() => handleBatchAction('unmonitor')}
            disabled={batchProcessing}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 transition-colors"
          >
            <EyeOff className="w-3.5 h-3.5 text-slate-400" />
            Unmonitor
          </button>

          <button
            onClick={() => {
              if (window.confirm(`Are you sure you want to remove ${selectedAlbumIds.size} albums?`)) {
                handleBatchAction('delete');
              }
            }}
            disabled={batchProcessing}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 flex items-center gap-1 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>

          <button
            onClick={() => setSelectedAlbumIds(new Set())}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Main Content ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="glass-panel flex flex-col items-center justify-center h-[320px] rounded-2xl border border-white/5 shadow-xl">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          <p className="text-sm text-slate-400 mt-4">Loading music library...</p>
        </div>
      ) : (
        <>
          {/* ── ALBUMS TAB ──────────────────────────────────────────────── */}
          {activeTab === 'albums' && (
            <>
              {filteredAlbums.length === 0 ? (
                <EmptyState
                  icon="album"
                  title="No albums found"
                  description={
                    albums.length === 0
                      ? 'Click "+ Add Artist / Album" above to import your favorite music.'
                      : 'Try adjusting your search or filters.'
                  }
                />
              ) : layoutMode === 'grid' ? (
                <div
                  className="grid gap-4"
                  style={{
                    gridTemplateColumns: `repeat(auto-fill, minmax(${posterSize}px, 1fr))`
                  }}
                >
                  {filteredAlbums.map((album) => {
                    const isDownloaded = album.status === 'downloaded';
                    const coverUrl = albumCoverUrl(album.mbid);
                    const isSelected = selectedAlbumIds.has(album.id);
                    const isCurrentAlbumPlaying = currentTrack?.album_id === album.id && isPlaying;

                    return (
                      <div
                        key={album.id}
                        className={`group relative glass-panel interactive-glow-card rounded-2xl overflow-hidden flex flex-col transition-all duration-300 ${
                          isSelected ? 'ring-2 ring-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)]' : ''
                        }`}
                      >
                        {/* Album Cover Art */}
                        <div
                          onClick={() => {
                            if (selectMode) {
                              toggleSelectAlbum(album.id);
                            } else {
                              navigate(`/music/albums/${album.id}`);
                            }
                          }}
                          className="aspect-square relative overflow-hidden cursor-pointer bg-slate-800"
                        >
                          <img
                            src={coverUrl}
                            alt={album.title}
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src =
                                'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%23475569" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>';
                            }}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />

                          {/* Hover/Active Play Button for Downloaded Albums */}
                          {isDownloaded && !selectMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isCurrentAlbumPlaying) {
                                  togglePlay();
                                } else {
                                  playAlbum(album);
                                }
                              }}
                              className={`absolute inset-0 m-auto w-12 h-12 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center shadow-[0_0_25px_rgba(6,182,212,0.6)] transition-all hover:scale-110 active:scale-95 z-10 ${
                                isCurrentAlbumPlaying
                                  ? 'opacity-100 ring-4 ring-cyan-300/50'
                                  : 'opacity-0 group-hover:opacity-100'
                              }`}
                              title={isCurrentAlbumPlaying ? 'Pause Album' : `Play ${album.title}`}
                            >
                              {isCurrentAlbumPlaying ? (
                                <Pause className="w-5 h-5 fill-slate-950" />
                              ) : (
                                <Play className="w-5 h-5 fill-slate-950 ml-0.5" />
                              )}
                            </button>
                          )}

                          {/* Checkbox overlay in select mode */}
                          {selectMode && (
                            <div className="absolute top-2 left-2 z-20">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectAlbum(album.id)}
                                className="w-4 h-4 rounded text-cyan-500 accent-cyan-500 cursor-pointer"
                              />
                            </div>
                          )}

                          {/* Status Badge overlay */}
                          {!selectMode && (
                            <div className="absolute top-2 left-2 flex flex-col gap-1">
                              {isDownloaded ? (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/90 text-slate-950 backdrop-blur-md flex items-center gap-1 shadow">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Ready
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/90 text-white backdrop-blur-md flex items-center gap-1 shadow">
                                  Missing
                                </span>
                              )}
                            </div>
                          )}

                          {/* Format badge overlay */}
                          {album.file_format && (
                            <div className="absolute bottom-2 right-2">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-950/80 text-cyan-300 border border-cyan-500/30 backdrop-blur-md">
                                {album.file_format}
                                {album.file_bitdepth ? ` ${album.file_bitdepth}b` : ''}
                              </span>
                            </div>
                          )}

                          {/* Hover Quick Search Action */}
                          {!selectMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setManualSearchAlbum(album);
                              }}
                              className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-950/80 text-slate-300 hover:text-cyan-400 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                              title="Manual search for releases"
                            >
                              <Search className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Album Meta */}
                        <div className="p-3 flex-1 flex flex-col justify-between">
                          <div>
                            <h3
                              onClick={() => navigate(`/music/albums/${album.id}`)}
                              title={album.title}
                              className="font-bold text-sm text-slate-800 dark:text-slate-100 group-hover:text-cyan-400 transition-colors truncate cursor-pointer"
                            >
                              {album.title}
                            </h3>
                            <p
                              onClick={() => navigate(`/music/artists/${album.artist_id}`)}
                              title={album.artist_name}
                              className="text-xs text-slate-400 hover:text-slate-200 transition-colors truncate cursor-pointer mt-0.5"
                            >
                              {album.artist_name}
                            </p>
                          </div>

                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200 dark:border-white/5 text-[11px] text-slate-400">
                            <span>{album.year || 'Unknown'}</span>
                            <span>{album.track_count || 0} tracks</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Albums List View */
                <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 text-slate-400 border-b border-white/5 uppercase tracking-wider font-semibold text-[10px]">
                      <tr>
                        {selectMode && <th className="py-3 px-3 w-8"></th>}
                        <th className="py-3 px-4 w-12">Cover</th>
                        <th className="py-3 px-4">Title</th>
                        <th className="py-3 px-4">Artist</th>
                        <th className="py-3 px-4">Year</th>
                        <th className="py-3 px-4">Tracks</th>
                        <th className="py-3 px-4">Format</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-600 dark:text-slate-300">
                      {filteredAlbums.map((album) => {
                        const isDownloaded = album.status === 'downloaded';
                        const isSelected = selectedAlbumIds.has(album.id);
                        const isCurrentAlbumPlaying = currentTrack?.album_id === album.id && isPlaying;

                        return (
                          <tr
                            key={album.id}
                            className={`hover:bg-white/[0.02] transition-colors cursor-pointer ${
                              isSelected ? 'bg-cyan-500/10' : ''
                            }`}
                            onClick={() => {
                              if (selectMode) {
                                toggleSelectAlbum(album.id);
                              } else {
                                navigate(`/music/albums/${album.id}`);
                              }
                            }}
                          >
                            {selectMode && (
                              <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectAlbum(album.id)}
                                  className="w-4 h-4 rounded text-cyan-500 accent-cyan-500 cursor-pointer"
                                />
                              </td>
                            )}
                            <td className="py-2 px-4">
                              <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-slate-800 group/rowcover">
                                <img
                                  src={albumCoverUrl(album.mbid)}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                                {isDownloaded && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isCurrentAlbumPlaying) {
                                        togglePlay();
                                      } else {
                                        playAlbum(album);
                                      }
                                    }}
                                    className="absolute inset-0 m-auto w-6 h-6 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center opacity-0 group-hover/rowcover:opacity-100 transition-opacity"
                                  >
                                    {isCurrentAlbumPlaying ? (
                                      <Pause className="w-3 h-3 fill-slate-950" />
                                    ) : (
                                      <Play className="w-3 h-3 fill-slate-950 ml-0.5" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-100 hover:text-cyan-400 transition-colors">
                              {album.title}
                            </td>
                            <td
                              className="py-3 px-4 text-slate-400 hover:text-slate-200"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/music/artists/${album.artist_id}`);
                              }}
                            >
                              {album.artist_name}
                            </td>
                            <td className="py-3 px-4 text-slate-400">{album.year || '—'}</td>
                            <td className="py-3 px-4 text-slate-400">{album.track_count || 0}</td>
                            <td className="py-3 px-4 font-mono text-[11px] text-cyan-300">
                              {album.file_format || '—'}
                            </td>
                            <td className="py-3 px-4">
                              {album.status === 'downloaded' ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Downloaded
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-[11px]">
                                  <AlertCircle className="w-3.5 h-3.5" /> Missing
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                {isDownloaded && (
                                  <button
                                    onClick={() => playAlbum(album)}
                                    className="p-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 transition-colors"
                                    title="Play Album"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-cyan-300" />
                                  </button>
                                )}
                                <button
                                  onClick={() => setManualSearchAlbum(album)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 transition-colors"
                                  title="Search releases"
                                >
                                  <Search className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── ARTISTS TAB ─────────────────────────────────────────────── */}
          {activeTab === 'artists' && (
            <>
              {filteredArtists.length === 0 ? (
                <EmptyState
                  icon="artist"
                  title="No artists found"
                  description='Click "+ Add Artist / Album" in the top bar to track artists from MusicBrainz.'
                />
              ) : layoutMode === 'grid' ? (
                <div
                  className="grid gap-4"
                  style={{
                    gridTemplateColumns: `repeat(auto-fill, minmax(${posterSize}px, 1fr))`
                  }}
                >
                  {filteredArtists.map((artist) => {
                    const imgUrl = artistImageUrl(artist.mbid);

                    return (
                      <div
                        key={artist.id}
                        onClick={() => navigate(`/music/artists/${artist.id}`)}
                        className="group relative glass-panel interactive-glow-card rounded-2xl p-4 flex flex-col items-center text-center cursor-pointer"
                      >
                        {/* Circular Artist Photo / Icon */}
                        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden mb-3 bg-gradient-to-tr from-cyan-950 via-slate-900 to-indigo-950 border-2 border-white/10 group-hover:border-cyan-400/60 transition-colors flex items-center justify-center shadow-inner">
                          <img
                            src={imgUrl}
                            alt={artist.name}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                            className="w-full h-full object-cover"
                          />
                          <div className="hidden w-full h-full items-center justify-center text-cyan-400/60">
                            <Mic2 className="w-10 h-10" />
                          </div>
                        </div>

                        <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 group-hover:text-cyan-400 transition-colors truncate w-full">
                          {artist.name}
                        </h3>
                        {artist.disambiguation ? (
                          <p className="text-[11px] text-slate-400 truncate w-full mt-0.5">
                            {artist.disambiguation}
                          </p>
                        ) : (
                          <p className="text-[11px] text-slate-500 italic mt-0.5">Artist</p>
                        )}

                        <div className="mt-3 pt-2 border-t border-slate-200 dark:border-white/5 w-full flex items-center justify-between text-[11px] text-slate-400">
                          <span>{artist.album_count || 0} Albums</span>
                          <span>{artist.track_count || 0} Tracks</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Artists List View */
                <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 text-slate-400 border-b border-white/5 uppercase tracking-wider font-semibold text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Artist</th>
                        <th className="py-3 px-4">Disambiguation</th>
                        <th className="py-3 px-4">Albums</th>
                        <th className="py-3 px-4">Tracks</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">View</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-600 dark:text-slate-300">
                      {filteredArtists.map((artist) => (
                        <tr
                          key={artist.id}
                          className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                          onClick={() => navigate(`/music/artists/${artist.id}`)}
                        >
                          <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-100 hover:text-cyan-400 transition-colors flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-cyan-400 overflow-hidden">
                              <Mic2 className="w-4 h-4" />
                            </div>
                            {artist.name}
                          </td>
                          <td className="py-3 px-4 text-slate-400">{artist.disambiguation || '—'}</td>
                          <td className="py-3 px-4 text-slate-300 font-semibold">{artist.album_count || 0}</td>
                          <td className="py-3 px-4 text-slate-400">{artist.track_count || 0}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                              Monitored
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-slate-400">
                            <ChevronRight className="w-4 h-4 ml-auto" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── TRACKS TAB ──────────────────────────────────────────────── */}
          {activeTab === 'tracks' && (
            <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
              {filteredTracks.length === 0 ? (
                <EmptyState
                  icon="tracks"
                  title="No tracks found"
                  description="Tracks appear once albums are imported."
                />
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-white/5 uppercase tracking-wider font-semibold text-[10px]">
                    <tr>
                      <th className="py-3 px-4 w-12 text-center">Play</th>
                      <th className="py-3 px-4 w-12">#</th>
                      <th className="py-3 px-4">Title</th>
                      <th className="py-3 px-4">Artist</th>
                      <th className="py-3 px-4">Album</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Format</th>
                      <th className="py-3 px-4">Bitrate</th>
                      <th className="py-3 px-4">Size</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                    {filteredTracks.map((track) => {
                      const isDownloaded = track.status === 'downloaded' || track.file_path;
                      const isThisTrackPlaying = currentTrack?.id === track.id && isPlaying;

                      return (
                        <tr
                          key={track.id}
                          className={`hover:bg-white/[0.02] transition-colors group/trackrow ${
                            isThisTrackPlaying ? 'bg-cyan-500/10' : ''
                          }`}
                        >
                          <td className="py-2.5 px-4 text-center">
                            {isDownloaded ? (
                              <button
                                onClick={() => {
                                  if (isThisTrackPlaying) {
                                    togglePlay();
                                  } else {
                                    playTrack(track, filteredTracks);
                                  }
                                }}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  isThisTrackPlaying
                                    ? 'text-cyan-400 bg-cyan-500/20'
                                    : 'text-slate-400 hover:text-cyan-400 hover:bg-white/10'
                                }`}
                                title={isThisTrackPlaying ? 'Pause' : 'Play'}
                              >
                                {isThisTrackPlaying ? (
                                  <span className="inline-flex gap-0.5 items-end h-3 w-3 justify-center">
                                    <span className="w-0.5 h-3 bg-cyan-400 animate-pulse" />
                                    <span className="w-0.5 h-2 bg-cyan-400 animate-pulse delay-75" />
                                    <span className="w-0.5 h-2.5 bg-cyan-400 animate-pulse delay-150" />
                                  </span>
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                )}
                              </button>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-500">
                            {track.track_number ? String(track.track_number).padStart(2, '0') : '—'}
                          </td>
                          <td className="py-2.5 px-4 font-sans font-semibold text-slate-800 dark:text-slate-100">
                            {track.title}
                          </td>
                          <td
                            className="py-2.5 px-4 font-sans text-slate-400 hover:text-slate-200 cursor-pointer"
                            onClick={() => {
                              if (track.artist_id) navigate(`/music/artists/${track.artist_id}`);
                            }}
                          >
                            {track.artist_name}
                          </td>
                          <td
                            className="py-2.5 px-4 font-sans text-slate-400 hover:text-slate-200 cursor-pointer"
                            onClick={() => {
                              if (track.album_id) navigate(`/music/albums/${track.album_id}`);
                            }}
                          >
                            {track.album_title}
                          </td>
                          <td className="py-2.5 px-4 text-slate-400">{formatDuration(track.duration)}</td>
                          <td className="py-2.5 px-4 text-cyan-300">{track.format || '—'}</td>
                          <td className="py-2.5 px-4 text-slate-400">{track.bitrate ? `${track.bitrate} kbps` : '—'}</td>
                          <td className="py-2.5 px-4 text-slate-400">{formatSize(track.file_size)}</td>
                          <td className="py-2.5 px-4 font-sans">
                            {isDownloaded ? (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                              </span>
                            ) : (
                              <span className="text-rose-400 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" /> Missing
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <AddArtistModal
        open={addArtistOpen}
        onClose={() => setAddArtistOpen(false)}
        onAdded={() => fetchData()}
      />

      {manualSearchAlbum && (
        <ManualSearchModal
          mediaId={manualSearchAlbum.id}
          mediaType="album"
          title={`${manualSearchAlbum.artist_name || ''} - ${manualSearchAlbum.title}`}
          onClose={() => setManualSearchAlbum(null)}
          onGrabbed={() => {
            setManualSearchAlbum(null);
            fetchData();
          }}
        />
      )}

      <MusicPathsModal
        open={pathsModalOpen}
        onClose={() => setPathsModalOpen(false)}
        onUpdated={() => fetchData()}
      />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent = 'text-cyan-400', bg = 'bg-cyan-500/15', onClick, onSubClick, active = false }) {
  return (
    <div
      onClick={onClick}
      className={`glass-panel rounded-2xl p-4 sm:p-5 flex items-center gap-3 transition-all ${
        onClick ? 'cursor-pointer hover:border-cyan-500/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-cyan-500/10 active:scale-[0.99]' : ''
      } ${active ? 'border-cyan-500/50 bg-cyan-500/5' : ''}`}
    >
      <div className={`p-2.5 rounded-xl ${bg} shrink-0`}>
        <Icon className={`w-5 h-5 ${accent}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg sm:text-2xl font-black text-slate-800 dark:text-slate-100 leading-none truncate">{value}</p>
        <p className="text-[11px] sm:text-xs font-medium text-slate-400 mt-1 truncate">
          {label}
          {sub && (
            <span
              onClick={(e) => {
                if (onSubClick) {
                  e.stopPropagation();
                  onSubClick();
                }
              }}
              className={`text-emerald-400 ml-1 ${onSubClick ? 'hover:underline cursor-pointer' : ''}`}
            >
              · {sub}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
