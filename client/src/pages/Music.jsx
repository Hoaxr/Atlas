import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Music2, Search, Plus, LayoutGrid, List, Disc, Mic2, FileAudio,
  CheckCircle2, AlertCircle, Loader2, ChevronRight, X,
  Play, Pause, Sparkles, Filter, RotateCcw,
  CheckSquare, Square, Trash2, Eye, EyeOff,
  Bookmark, ArrowRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { formatSize } from '../lib/format';
import { albumCoverUrl, artistImageUrl } from '../lib/posterUrl';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import AddArtistModal from '../components/music/AddArtistModal';
import ManualSearchModal from '../components/ManualSearchModal';
import AlbumCard from '../components/music/AlbumCard';
import StickyBar from '../components/shared/StickyBar';
import EmptyState from '../components/shared/EmptyState';
import { useStickyBar } from '../lib/useStickyBar';
import { FilterSelect } from '../components/shared/FilterSelect';

export default function Music() {
  const navigate = useNavigate();
  const { headerRef, stickyVisible } = useStickyBar();
  const searchInputRef = useRef(null);
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

  // Filters & search
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, downloaded, missing, monitored
  const [typeFilter, setTypeFilter] = useState('all'); // all, album, single_ep, compilation
  const [formatFilter, setFormatFilter] = useState('all'); // all, flac, mp3
  const [sortKey, setSortKey] = useState('added_desc');
  const [showFilters, setShowFilters] = useState(false);
  const [layoutMode, setLayoutMode] = useState(() => localStorage.getItem('atlas_music_layout') || 'grid');

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== 'all') count++;
    if (activeTab === 'albums' && typeFilter !== 'all') count++;
    if (activeTab === 'albums' && formatFilter !== 'all') count++;
    return count;
  }, [statusFilter, typeFilter, formatFilter, activeTab]);

  const clearAllFilters = () => {
    setStatusFilter('all');
    setTypeFilter('all');
    setFormatFilter('all');
  };

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
  const [artistActionId, setArtistActionId] = useState(null); // artist currently running a search action

  const setLayout = (mode) => {
    setLayoutMode(mode);
    localStorage.setItem('atlas_music_layout', mode);
  };

  const updatePosterSize = (val) => {
    const clamped = Math.max(120, Math.min(260, val));
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

  useEffect(() => {
    if (!stickyVisible && query) {
      searchInputRef.current?.focus();
    }
  }, [stickyVisible, query]);

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

  // ── Artist card actions ────────────────────────────────────────────────────

  const handleArtistSearch = async (artist) => {
    setArtistActionId(artist.id);
    try {
      const res = await api.post(`/library/music/artists/${artist.id}/search`);
      if (res.data.status === 'success') toast.success(res.data.message || 'Searching missing albums');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to trigger search');
    } finally {
      setArtistActionId(null);
    }
  };

  const handleArtistMonitorToggle = async (artist) => {
    try {
      const newMonitored = artist.monitored ? 0 : 1;
      await api.put(`/library/music/artists/${artist.id}`, { monitored: newMonitored });
      setArtists((prev) => prev.map((a) => (a.id === artist.id ? { ...a, monitored: newMonitored } : a)));
      toast.success(newMonitored ? 'Artist monitored' : 'Artist unmonitored');
    } catch {
      toast.error('Failed to update monitoring status');
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

  return (
    <div className="space-y-3">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div ref={headerRef} className="flex items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 sm:gap-3 !mb-0">
            <Music2 className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 shrink-0" /> <span className="truncate">Music</span>
          </h1>
          <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block !mb-0">
            Your tracked and imported media collection.
          </p>
        </div>

        {/* View Toggle + Search + Add Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="relative w-full max-w-xs hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${activeTab}...`}
              className="w-full bg-slate-900 border border-white/10 text-slate-200 text-sm rounded-lg pl-9 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 placeholder-slate-500 transition-all"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex bg-slate-900 rounded-lg p-1 border border-white/10 shrink-0">
            <button
              onClick={() => setLayout('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                layoutMode === 'grid' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLayout('list')}
              className={`p-1.5 rounded-md transition-colors ${
                layoutMode === 'list' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setAddArtistOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0"
            title="Add Music"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Add Music</span>
          </button>
        </div>
      </div>

      <StickyBar
        visible={stickyVisible}
        searchQuery={query}
        onSearchChange={setQuery}
        searchPlaceholder={`Search ${activeTab}...`}
        showSearch
      />

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
                Configure your music root folder under Settings &rarr; Library Management so Atlas knows where your audio files live.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/settings?tab=library')}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shrink-0 shadow-lg shadow-amber-500/20"
          >
            Configure in Settings
          </button>
        </div>
      )}

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

      {/* ── Main Content Container ────────────────────────────────────────── */}
      <div className="glass-panel rounded-2xl min-h-[100vh]">
        {/* Filter Bar Header */}
        <div className="border-b border-cyan-500/30 bg-slate-900/50 rounded-t-2xl">
          {/* Main Controls Row */}
          <div className="flex items-center gap-1.5 sm:gap-2 p-2.5 sm:p-4 pb-2 sm:pb-3 justify-between flex-wrap sm:flex-nowrap">
            {/* Left side: Sub-tabs, Sort & Filters */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 flex-wrap">
              {/* Sub-tabs */}
              <div className="flex items-center p-1 rounded-xl bg-slate-900/80 border border-white/5 shrink-0">
                <button
                  onClick={() => setTab('artists')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    activeTab === 'artists'
                      ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Mic2 className="w-3.5 h-3.5" />
                  <span>Artists</span>
                  <span className="text-[10px] opacity-75">({artists.length})</span>
                </button>
                <button
                  onClick={() => setTab('albums')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    activeTab === 'albums'
                      ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Disc className="w-3.5 h-3.5" />
                  <span>Albums</span>
                  <span className="text-[10px] opacity-75">({albums.length})</span>
                </button>
                <button
                  onClick={() => setTab('tracks')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    activeTab === 'tracks'
                      ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileAudio className="w-3.5 h-3.5" />
                  <span>Tracks</span>
                  <span className="text-[10px] opacity-75">({tracks.length})</span>
                </button>
              </div>

              {/* Sort Select */}
              <FilterSelect
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                label="Sort: Recently Added"
                hideAll
                className="max-w-[140px] sm:max-w-none shrink-0"
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
                    <option value="added_desc">Recently Added</option>
                    <option value="name_asc">Name (A-Z)</option>
                    <option value="name_desc">Name (Z-A)</option>
                    <option value="albums_desc">Most Albums</option>
                  </>
                )}
              </FilterSelect>

              {/* Filters Toggle Button */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1 sm:gap-1.5 text-xs font-medium px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl border transition-colors shrink-0 ${
                  showFilters || activeFilterCount > 0
                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                    : 'bg-slate-900/50 text-slate-400 border-white/5 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <Filter className="w-3.5 h-3.5 shrink-0" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="bg-cyan-500 text-slate-900 rounded-full px-1.5 py-0.5 text-[10px] font-bold ml-0.5">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Right side: Batch Select (Albums) + Slider */}
            <div className="flex items-center gap-2 shrink-0">
              {activeTab === 'albums' && (
                <button
                  onClick={() => {
                    if (selectMode) setSelectedAlbumIds(new Set());
                    setSelectMode(!selectMode);
                  }}
                  className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 ${
                    selectMode
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : 'bg-slate-900/50 text-slate-400 border-white/5 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                  title="Toggle Select Mode"
                >
                  {selectMode ? <CheckSquare className="w-3.5 h-3.5 text-cyan-400" /> : <Square className="w-3.5 h-3.5" />}
                  <span className="hidden md:inline">Select</span>
                </button>
              )}

              {layoutMode === 'grid' && activeTab !== 'tracks' && (
                <div className="flex items-center gap-1 sm:gap-2 bg-slate-900/60 border border-white/5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl shrink-0">
                  <button
                    type="button"
                    onClick={() => updatePosterSize(Math.max(120, posterSize - 20))}
                    className={`p-0.5 transition-colors rounded ${
                      posterSize <= 140 ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Smaller cards"
                    aria-label="Smaller cards"
                  >
                    <LayoutGrid className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </button>
                  <input
                    type="range"
                    min="120"
                    max="260"
                    step="10"
                    value={posterSize}
                    onChange={(e) => updatePosterSize(Number(e.target.value))}
                    onDoubleClick={() => updatePosterSize(180)}
                    title={`Card size: ${posterSize}px (double-click to reset)`}
                    aria-label="Card size"
                    className="w-14 sm:w-24 md:w-28 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={() => updatePosterSize(Math.min(260, posterSize + 20))}
                    className={`p-0.5 transition-colors rounded ${
                      posterSize >= 240 ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Larger cards"
                    aria-label="Larger cards"
                  >
                    <LayoutGrid className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Expandable Advanced Filters Drawer */}
          {showFilters && (
            <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-white/5 pt-3 mt-1 bg-slate-900/30">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap items-center gap-2 mb-1">
                <FilterSelect
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  label="All Statuses"
                >
                  <option value="monitored">Monitored</option>
                  <option value="downloaded">Downloaded</option>
                  <option value="missing">Missing</option>
                </FilterSelect>

                {activeTab === 'albums' && (
                  <FilterSelect
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    label="All Types"
                  >
                    <option value="album">Studio Albums</option>
                    <option value="single_ep">Singles & EPs</option>
                    <option value="compilation">Compilations</option>
                  </FilterSelect>
                )}

                {activeTab === 'albums' && (
                  <FilterSelect
                    value={formatFilter}
                    onChange={(e) => setFormatFilter(e.target.value)}
                    label="All Formats"
                  >
                    <option value="flac">FLAC / Lossless</option>
                    <option value="mp3">MP3 / Compressed</option>
                  </FilterSelect>
                )}

                {activeFilterCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-rose-400 bg-slate-800/60 hover:bg-rose-500/10 px-2 py-1 rounded-full border border-white/5 hover:border-rose-500/20 transition-all ml-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Clear filters
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Active Filter Pills Bar */}
          {activeFilterCount > 0 && (
            <div className="flex items-center flex-wrap gap-1.5 px-3 sm:px-4 py-2 border-t border-white/5 bg-slate-900/40">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">Active:</span>
              {statusFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                  Status: {statusFilter}
                  <button onClick={() => setStatusFilter('all')} className="hover:text-white transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {activeTab === 'albums' && typeFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                  Type: {typeFilter}
                  <button onClick={() => setTypeFilter('all')} className="hover:text-white transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {activeTab === 'albums' && formatFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                  Format: {formatFilter}
                  <button onClick={() => setFormatFilter('all')} className="hover:text-white transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <button
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-rose-400 bg-slate-800/60 hover:bg-rose-500/10 px-2 py-0.5 rounded-full border border-white/5 hover:border-rose-500/20 transition-all ml-1"
              >
                <RotateCcw className="w-3 h-3" /> Clear all
              </button>
              <span className="text-xs text-slate-500 ml-auto">
                {activeTab === 'artists' ? filteredArtists.length : activeTab === 'albums' ? filteredAlbums.length : filteredTracks.length} items
              </span>
            </div>
          )}
        </div>

        {/* Content Area Inside Glass Panel */}
        <div className="p-3 sm:p-5 relative min-h-[calc(100vh-200px)]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-[320px]">
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
                      ? 'Click "+ Add Music" above to import your favorite music.'
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
                  {filteredAlbums.map((album) => (
                    <AlbumCard
                      key={album.id}
                      album={album}
                      subtitleMode="artist"
                      selectMode={selectMode}
                      isSelected={selectedAlbumIds.has(album.id)}
                      onToggleSelect={toggleSelectAlbum}
                      onManualSearch={setManualSearchAlbum}
                    />
                  ))}
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
                                  src={album.cover_url || albumCoverUrl(album)}
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
                            <td className="py-3 px-4 text-slate-400">
                              {Math.max(album.expected_track_count || 0, album.track_count || 0)}
                              {album.disc_count > 1 && (
                                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium whitespace-nowrap">
                                  {album.disc_count} Discs
                                </span>
                              )}
                            </td>
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
                  description='Click "+ Add Music" in the top bar to track artists from MusicBrainz.'
                />
              ) : layoutMode === 'grid' ? (
                <div
                  className="grid gap-4"
                  style={{
                    gridTemplateColumns: `repeat(auto-fill, minmax(${posterSize}px, 1fr))`
                  }}
                >
                  {filteredArtists.map((artist) => {
                    const imgUrl = artist.image_url || artistImageUrl(artist);
                    const downloadedAlbums = artist.downloaded_albums || 0;
                    const totalAlbums = artist.album_count || 0;
                    const isComplete = totalAlbums > 0 && downloadedAlbums >= totalAlbums;
                    const isBusy = artistActionId === artist.id;

                    return (
                      <div
                        key={artist.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`View ${artist.name}`}
                        onClick={() => navigate(`/music/artists/${artist.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(`/music/artists/${artist.id}`);
                          }
                        }}
                        className="group relative glass-panel interactive-glow-card rounded-xl overflow-hidden cursor-pointer flex flex-col hover:scale-[1.02] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 hover:shadow-[0_0_30px_-5px_rgba(6,182,212,0.25)] hover:border-cyan-500/40"
                      >
                        {/* Artist photo (square) */}
                        <div className="w-full aspect-square relative bg-slate-800 flex-shrink-0 overflow-hidden">
                          {/* Placeholder icon shown behind the image / when it fails */}
                          <div className="absolute inset-0 flex items-center justify-center text-slate-700/60 pointer-events-none">
                            <Mic2 className="w-10 h-10 stroke-[1.5]" />
                          </div>

                          {/* Top-left: monitor toggle */}
                          <div className="absolute top-1.5 sm:top-2 left-1.5 sm:left-2 z-20">
                            <button
                              onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleArtistMonitorToggle(artist); }}
                              className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-slate-900/80 hover:bg-slate-800 transition-colors shadow-lg flex items-center justify-center group/mon"
                              title={artist.monitored ? 'Unmonitor' : 'Monitor'}
                              aria-label={artist.monitored ? 'Unmonitor artist' : 'Monitor artist'}
                            >
                              {artist.monitored ? (
                                <Bookmark className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-emerald-500 fill-emerald-500 group-hover/mon:text-rose-400 group-hover/mon:fill-transparent" />
                              ) : (
                                <Bookmark className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-rose-400 group-hover/mon:text-emerald-400" />
                              )}
                            </button>
                          </div>

                          {/* Top-right: manual search */}
                          <div className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 z-20">
                            <button
                              onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleArtistSearch(artist); }}
                              disabled={isBusy}
                              className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-slate-900/80 hover:bg-cyan-500/20 transition-colors shadow-lg flex items-center justify-center text-cyan-400 disabled:opacity-60"
                              title="Search missing albums"
                              aria-label="Search missing albums"
                            >
                              {isBusy ? <Loader2 className="w-3.5 h-3.5 sm:w-5 sm:h-5 animate-spin" /> : <Search className="w-3.5 h-3.5 sm:w-5 sm:h-5" />}
                            </button>
                          </div>

                          {/* Bottom-left status badge */}
                          <div className={`absolute bottom-1.5 sm:bottom-2 left-1.5 sm:left-2 z-20 flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-slate-950/80 backdrop-blur rounded-md border shadow-lg ${
                            isComplete ? 'border-emerald-500/30' : downloadedAlbums > 0 ? 'border-amber-500/30' : 'border-rose-500/30'
                          }`}>
                            {isComplete ? (
                              <>
                                <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-400" />
                                <span className="text-[9px] sm:text-[10px] font-bold text-emerald-400">Complete</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${downloadedAlbums > 0 ? 'text-amber-400' : 'text-rose-400'}`} />
                                <span className={`text-[9px] sm:text-[10px] font-bold ${downloadedAlbums > 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                                  {downloadedAlbums > 0 ? 'Partial' : 'Missing'}
                                </span>
                              </>
                            )}
                          </div>

                          {/* Bottom-right track count badge (hidden when there are no tracks) */}
                          {(artist.track_count || 0) > 0 && (
                            <div className="absolute bottom-1.5 sm:bottom-2 right-1.5 sm:right-2 z-20 flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-slate-950/80 backdrop-blur rounded-md border border-purple-500/30 shadow-lg">
                              <FileAudio className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-purple-400" />
                              <span className="text-[9px] sm:text-[10px] font-bold text-purple-400">{artist.track_count}</span>
                            </div>
                          )}

                          {imgUrl ? (
                            <img
                              src={imgUrl}
                              alt=""
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              className="w-full h-full object-cover relative z-10"
                            />
                          ) : null}
                        </div>

                        {/* Info bar */}
                        <div className="p-2 sm:p-3 w-full flex-1 flex flex-col justify-between bg-gradient-to-b from-slate-800/95 to-slate-900/95 border-t border-white/10 group-hover:border-cyan-500/30 transition-colors">
                          <div className="flex items-center justify-between gap-1">
                            <h3 className="font-semibold text-xs sm:text-sm text-slate-100 group-hover:text-cyan-400 transition-colors truncate tracking-wide flex-1" title={artist.name}>
                              {artist.name}
                            </h3>
                            <ArrowRight className="w-3.5 h-3.5 text-cyan-400 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 flex-shrink-0 hidden sm:block" />
                          </div>
                          {totalAlbums > 0 && (
                            <div className="flex items-center justify-end mt-1 sm:mt-2 gap-2">
                              <span
                                className={`flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md border flex-shrink-0 ${
                                  downloadedAlbums === 0
                                    ? 'bg-slate-500/10 border-slate-500/20 text-slate-400'
                                    : isComplete
                                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                                      : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                                }`}
                                title={downloadedAlbums > 0 ? `${downloadedAlbums} of ${totalAlbums} albums downloaded` : `${totalAlbums} albums`}
                              >
                                <Disc className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                <span className="text-[10px] sm:text-[11px] font-bold">
                                  {downloadedAlbums > 0 ? `${downloadedAlbums}/${totalAlbums}` : totalAlbums}
                                </span>
                              </span>
                            </div>
                          )}
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
                          <td className="py-3 px-4">
                            <span className={
                              (artist.downloaded_albums || 0) === 0
                                ? 'text-slate-500 font-semibold'
                                : (artist.downloaded_albums || 0) >= (artist.album_count || 0)
                                  ? 'text-green-400 font-semibold'
                                  : 'text-amber-400 font-semibold'
                            }>
                              {artist.downloaded_albums || 0}/{artist.album_count || 0}
                            </span>
                          </td>
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
        </div>
      </div>

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
    </div>
  );
}
