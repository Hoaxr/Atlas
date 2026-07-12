import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { Activity, Film, Tv, Search, CheckCircle2, AlertCircle, Bookmark, BookmarkMinus, LayoutGrid, List, Star, Info, X, RotateCcw, Filter as FilterIcon, CheckSquare, Square, Columns, Plus } from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';
import { cachedMovies, cachedShows, setCachedMovies, setCachedShows } from '../lib/libraryCache';
import { parseResolution, parseCodec } from '../lib/format';
import { sortItems } from '../lib/sortItems';
import { renderColumnCell } from '../components/dashboard/TableCellRenderers';
import { useSettings } from '../lib/useSettings';
import useWebSocket from '../lib/useWebSocket';
import { useOutsideClick } from '../lib/useOutsideClick';
import { SortIcon, FilterSelect } from '../components/shared/FilterSelect';
import BulkActions from '../components/dashboard/BulkActions';
import ManualSearchModal from '../components/ManualSearchModal';
import StickyBar from '../components/shared/StickyBar';
import { useStickyBar } from '../lib/useStickyBar';

function AlphabetIndex({ alphaFilter, setAlphaFilter, items }) {
  const letters = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const availableLetters = useMemo(() => {
    const set = new Set();
    items.forEach(item => {
      const firstChar = (item.title || '').charAt(0).toUpperCase();
      if (/^[A-Z]$/.test(firstChar)) set.add(firstChar);
      else set.add('#');
    });
    return set;
  }, [items]);

  return (
    <div className="hidden md:flex items-center gap-0.5 overflow-x-auto bg-slate-900/90 shadow-[inset_0_2px_8px_rgba(0,0,0,0.7)] rounded-full py-1 px-2.5 ml-auto">
      {letters.map(letter => {
        const isAvailable = availableLetters.has(letter);
        const isActive = alphaFilter === letter;
        return (
          <button
            key={letter}
            onClick={() => setAlphaFilter(isActive ? null : letter)}
            disabled={!isAvailable}
            className={`text-sm font-bold min-w-[26px] h-6 flex items-center justify-center rounded transition-colors ${
              isActive
                ? 'text-cyan-400 bg-cyan-500/20'
                : isAvailable
                  ? 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800 cursor-pointer'
                  : 'text-slate-700 cursor-default'
            }`}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [movies, setMovies] = useState(cachedMovies || []);
  const [shows, setShows] = useState(cachedShows || []);
  const [loading, setLoading] = useState(!cachedMovies && !cachedShows);
  const [isReordering, setIsReordering] = useState(false);
  const reorderTimerRef = useRef(null);
  
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchMediaId, setSearchMediaId] = useState(null);
  const [searchMediaType, setSearchMediaType] = useState(null);
  const [searchMediaTitle, setSearchMediaTitle] = useState('');
  
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  const viewMode = location.pathname.includes('shows') ? 'shows' : 'movies';
  const scopeKey = (key) => `atlas_${viewMode}_${key}`;

  const DEFAULT_TABLE_COLUMNS = { year: true, rating: true, resolution: true, codec: true, audio: true, size: true, subtitles: true, status: true, seasons: true, episodes: true };
  const DEFAULT_COLUMN_ORDER = ['year', 'rating', 'resolution', 'codec', 'audio', 'size', 'subtitles', 'seasons', 'episodes', 'status'];

  const [tableColumns, setTableColumns] = useState(() => {
    try {
      const stored = localStorage.getItem(scopeKey('TableColumns'));
      if (stored) return { ...DEFAULT_TABLE_COLUMNS, ...JSON.parse(stored) };
    } catch { /* ignore */ }
    return { ...DEFAULT_TABLE_COLUMNS };
  });
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const stored = localStorage.getItem(scopeKey('ColumnOrder'));
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge in any new columns that aren't in the saved order
        const merged = [...parsed];
        for (const col of DEFAULT_COLUMN_ORDER) {
          if (!merged.includes(col)) merged.push(col);
        }
        return merged;
      }
    } catch { /* ignore */ }
    return [...DEFAULT_COLUMN_ORDER];
  });
  const [dragColumn, setDragColumn] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const columnsMenuRef = useOutsideClick(() => setColumnsMenuOpen(false), columnsMenuOpen);

  useEffect(() => {
    localStorage.setItem(scopeKey('TableColumns'), JSON.stringify(tableColumns));
    localStorage.setItem(scopeKey('ColumnOrder'), JSON.stringify(columnOrder));
  }, [tableColumns, columnOrder, viewMode]);

  const [searchParams] = useSearchParams();

  const [statusFilter, setStatusFilter] = useState(() => localStorage.getItem(scopeKey('StatusFilter')) || 'all');
  const [watchedFilter, setWatchedFilter] = useState(() => localStorage.getItem(scopeKey('WatchedFilter')) || 'all');
  const [genreFilter, setGenreFilter] = useState(() => localStorage.getItem(scopeKey('GenreFilter')) || 'all');
  const [qualityFilter, setQualityFilter] = useState(() => localStorage.getItem(scopeKey('QualityFilter')) || 'all');
  const [resolutionFilter, setResolutionFilter] = useState(() => localStorage.getItem(scopeKey('ResolutionFilter')) || 'all');
  const [codecFilter, setCodecFilter] = useState(() => localStorage.getItem(scopeKey('CodecFilter')) || 'all');
  const [yearFilter, setYearFilter] = useState(() => localStorage.getItem(scopeKey('YearFilter')) || 'all');
  const [tmdbStatusFilter, setTmdbStatusFilter] = useState(() => localStorage.getItem(scopeKey('TmdbStatusFilter')) || 'all');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [sort, setSort] = useState(() => localStorage.getItem(scopeKey('Sort')) || 'added_desc');
  const [viewStyle, setViewStyle] = useState(() => localStorage.getItem('dashboardViewStyle') || 'grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [alphaFilter, setAlphaFilter] = useState(null);
  
  const searchInputRef = useRef(null);
  const { headerRef, stickyVisible: stickySearchVisible } = useStickyBar();

  // Focus search input when switching between movies and shows
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [viewMode]);

  const triggerReorderFlash = () => {
    setIsReordering(true);
    if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current);
    reorderTimerRef.current = setTimeout(() => setIsReordering(false), 150);
  };

  const handleSortClick = (field) => {
    triggerReorderFlash();
    const defaultDesc = ['rating', 'size', 'year', 'season_count', 'missing_episodes'].includes(field);
    if (sort.startsWith(field)) {
      setSort(sort === `${field}_asc` ? `${field}_desc` : `${field}_asc`);
    } else {
      setSort(defaultDesc ? `${field}_desc` : `${field}_asc`);
    }
  };

  // Drag-and-drop column reordering
  const handleDragStart = (e, colKey) => {
    setDragColumn(colKey);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', colKey);
  };
  const handleDragOver = (e, colKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragColumn && dragColumn !== colKey) {
      setDragOverColumn(colKey);
    }
  };
  const handleDragLeave = () => setDragOverColumn(null);
  const handleDrop = (e, targetCol) => {
    e.preventDefault();
    setDragOverColumn(null);
    setDragColumn(null);
    if (!dragColumn || dragColumn === targetCol) return;
    const newOrder = [...columnOrder];
    const fromIdx = newOrder.indexOf(dragColumn);
    const toIdx = newOrder.indexOf(targetCol);
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragColumn);
    setColumnOrder(newOrder);
  };

  // Column definitions for dynamic table rendering
  const COLUMN_DEFS = {
    year:          { label: 'Year',       sortField: 'year',         w: 'w-24' },
    rating:        { label: 'Rating',     sortField: 'rating',       w: 'w-32' },
    resolution:    { label: 'Resolution', sortField: 'resolution',   w: 'w-24 whitespace-nowrap' },
    codec:         { label: 'Codec',      sortField: 'codec',        w: 'w-20 whitespace-nowrap' },
    audio:         { label: 'Audio',      sortField: 'audio',        w: 'w-24 whitespace-nowrap' },
    size:          { label: 'Size',       sortField: 'size',         w: 'w-28' },
    seasons:       { label: 'Seasons',    sortField: 'season_count', w: 'w-24 whitespace-nowrap', showsOnly: true },
    episodes:      { label: 'Episodes',   sortField: 'missing_episodes', w: 'w-24 whitespace-nowrap', showsOnly: true },
    subtitles:     { label: 'Subtitles',  sortField: null,           w: 'w-32', moviesOnly: true },
    status:        { label: 'Status',     sortField: 'status',        w: 'w-32' },
  };

  const visibleOrderedColumns = columnOrder.filter(col => {
    if (!tableColumns[col]) return false;
    const def = COLUMN_DEFS[col];
    if (!def) return false;
    if (def.showsOnly && viewMode !== 'shows') return false;
    if (def.moviesOnly && viewMode !== 'movies') return false;
    return true;
  });

  const { profiles: qualityProfiles, providerLangs } = useSettings();

  const renderCell = (colKey, item) => renderColumnCell(colKey, item, providerLangs);

  // Apply URL params on mount (from Statistics page clicks)
  useEffect(() => {
    const yearParam = searchParams.get('year');
    const ratingParam = searchParams.get('rating');
    if (yearParam) {
      setYearFilter(yearParam);
      localStorage.setItem(scopeKey('YearFilter'), yearParam);
    }
    if (ratingParam) {
      setRatingFilter(ratingParam);
    }
  }, []); // Only on mount
  useEffect(() => {
    localStorage.setItem('dashboardViewStyle', viewStyle);
    localStorage.setItem(scopeKey('StatusFilter'), statusFilter);
    localStorage.setItem(scopeKey('WatchedFilter'), watchedFilter);
    localStorage.setItem(scopeKey('GenreFilter'), genreFilter);
    localStorage.setItem(scopeKey('QualityFilter'), qualityFilter);
    localStorage.setItem(scopeKey('ResolutionFilter'), resolutionFilter);
    localStorage.setItem(scopeKey('CodecFilter'), codecFilter);
    localStorage.setItem(scopeKey('YearFilter'), yearFilter);
    localStorage.setItem(scopeKey('Sort'), sort);
  }, [viewStyle, statusFilter, watchedFilter, genreFilter, qualityFilter, resolutionFilter, codecFilter, yearFilter, sort]);

  // Reset filters when switching between movies and shows
  const [page, setPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    setStatusFilter(() => localStorage.getItem(scopeKey('StatusFilter')) || 'all');
    setWatchedFilter(() => localStorage.getItem(scopeKey('WatchedFilter')) || 'all');
    setGenreFilter(localStorage.getItem(scopeKey('GenreFilter')) || 'all');
    setQualityFilter(localStorage.getItem(scopeKey('QualityFilter')) || 'all');
    setResolutionFilter(localStorage.getItem(scopeKey('ResolutionFilter')) || 'all');
    setCodecFilter(localStorage.getItem(scopeKey('CodecFilter')) || 'all');
    setYearFilter(localStorage.getItem(scopeKey('YearFilter')) || 'all');
    setSort(localStorage.getItem(scopeKey('Sort')) || 'added_desc');
    setPage(1);
    
    // Fetch data for the current view
    setLoading(true);
    fetchViewData(viewMode, false);
  }, [viewMode]);

  // Reset pagination when filters/sort change and flash the reorder indicator
  useEffect(() => {
    setPage(1);
    triggerReorderFlash();
  }, [sort, statusFilter, watchedFilter, genreFilter, qualityFilter, resolutionFilter, codecFilter, yearFilter, tmdbStatusFilter, alphaFilter]);

  // Capture initial viewMode for the mount-once effect (prevents stale closure)
  const initialViewModeRef = useRef(viewMode);
  if (initialViewModeRef.current === null) initialViewModeRef.current = viewMode;

  useEffect(() => {
    const otherMode = initialViewModeRef.current === 'movies' ? 'shows' : 'movies';
    fetchViewData(otherMode, true);
  }, []);

  // Listen for scan completion to refresh library
  const { onEvent } = useWebSocket();
  useEffect(() => {
    return onEvent((data) => {
      if (data.message && data.message.toLowerCase().includes('scan complete')) {
        fetchViewData('movies', true);
        fetchViewData('shows', true);
      }
    });
  }, [onEvent, viewMode]);

  const fetchViewData = async (mode, isBackground) => {
    try {
      const endpoint = mode === 'movies' ? '/library/movies' : '/library/shows';
      const res = await api.get(endpoint);
      if (res.data.status === 'success') {
        const data = res.data.data;
        if (mode === 'movies') { setCachedMovies(data); setMovies(data); }
        else { setCachedShows(data); setShows(data); }
      }
    } catch (err) {
      console.error(`Failed to fetch ${mode}`, err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  const refreshLibrary = () => {
    fetchViewData(viewMode, true);
  };

  // --- Compute derived data for filters ---
  const sourceData = viewMode === 'movies' ? movies : shows;

  // Unique years from ALL items (stable regardless of filters)
  const allYears = useMemo(() =>
    [...new Set(sourceData.map(item => item.year).filter(Boolean))].sort((a, b) => b - a),
  [sourceData]);

  // Unique genres from ALL items (stored as comma-separated)
  const allGenres = useMemo(() => [...new Set(
    sourceData.flatMap(item =>
      item.genres ? item.genres.split(',').map(g => g.trim()).filter(Boolean) : []
    )
  )].sort(), [sourceData]);

  // Unique quality profiles from ALL items
  const allQualities = useMemo(() => [...new Set(
    sourceData.map(item => item.quality_profile_name).filter(Boolean)
  )].sort(), [sourceData]);

  // Unique resolutions from ALL items
  const allResolutions = useMemo(() => [...new Set(
    sourceData.map(item => parseResolution(item.scene_name || item.sample_episode_path || item.file_path)).filter(r => r !== 'Unknown')
  )].sort((a, b) => {
    const order = { '2160p': 4, '1080p': 3, '720p': 2, 'SD': 1, 'Unknown': 0 };
    return (order[b] || 0) - (order[a] || 0);
  }), [sourceData]);

  // Unique codecs from ALL items
  const allCodecs = useMemo(() => [...new Set(
    sourceData.map(item => item.codec || parseCodec(item.scene_name || item.sample_episode_path || item.file_path)).filter(c => c !== 'Unknown')
  )].sort(), [sourceData]);

  // --- Apply filters (memoized) ---
  const displayItems = useMemo(() => {
    const sourceItems = viewMode === 'movies' ? movies : shows;
    let items = [...sourceItems];

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(item =>
        item.title.toLowerCase().includes(q) ||
        (item.year && item.year.toString().includes(q))
      );
    }

    // Status filter
    if (statusFilter === 'monitored') {
      items = items.filter(item => item.monitored);
    } else if (statusFilter === 'unmonitored') {
      items = items.filter(item => !item.monitored);
    } else if (statusFilter === 'downloaded') {
      items = items.filter(item => item.status === 'downloaded');
    } else if (statusFilter === 'downloading') {
      items = items.filter(item => item.status === 'downloading');
    } else if (statusFilter === 'missing') {
      items = items.filter(item => item.status === 'monitored' && !item.file_path && !item.folder_path);
    }

    // TMDB status filter (shows only)
    if (tmdbStatusFilter !== 'all') {
      items = items.filter(item => item.tmdb_status === tmdbStatusFilter);
    }

    // Watched filter
    if (watchedFilter === 'watched') {
      items = items.filter(item => item.watched);
    } else if (watchedFilter === 'unwatched') {
      items = items.filter(item => !item.watched);
    }

    // Year filter
    if (yearFilter !== 'all') {
      items = items.filter(item => String(item.year) === String(yearFilter));
    }

    // Genre filter
    if (genreFilter !== 'all') {
      items = items.filter(item => {
        if (!item.genres) return false;
        const itemGenres = item.genres.split(',').map(g => g.trim());
        return itemGenres.includes(genreFilter);
      });
    }

    // Quality profile filter
    if (qualityFilter !== 'all') {
      items = items.filter(item => item.quality_profile_name === qualityFilter);
    }

    // Resolution filter
    if (resolutionFilter !== 'all') {
      items = items.filter(item => parseResolution(item.scene_name || item.sample_episode_path || item.file_path) === resolutionFilter);
    }

    // Codec filter
    if (codecFilter !== 'all') {
      items = items.filter(item => (item.codec || parseCodec(item.scene_name || item.sample_episode_path || item.file_path)) === codecFilter);
    }

    // Rating filter (from statistics page)
    if (ratingFilter !== 'all') {
      if (ratingFilter.includes('–')) {
        // Range format: "6–8"
        const [minR, maxR] = ratingFilter.split('–').map(Number);
        items = items.filter(item => {
          const r = item.rating || 0;
          return r >= minR && r < maxR;
        });
      } else {
        // Individual score: "7"
        const score = Number(ratingFilter);
        items = items.filter(item => {
          const r = item.rating || 0;
          return Math.floor(r) === score;
        });
      }
    }

    // Alphabet filter
    if (alphaFilter) {
      items = items.filter(item => {
        const firstChar = (item.title || '').charAt(0).toUpperCase();
        if (/^[A-Z]$/.test(firstChar)) return firstChar === alphaFilter;
        return alphaFilter === '#';
      });
    }

    // Sort (delegated to shared utility)
    items = sortItems(items, sort);

    return items;
  }, [movies, shows, searchQuery, statusFilter, watchedFilter, yearFilter, genreFilter, qualityFilter, resolutionFilter, codecFilter, ratingFilter, tmdbStatusFilter, alphaFilter, sort]);

  // --- Active filter chips ---
  const activeFilters = [];
  if (searchQuery.trim()) activeFilters.push({ key: 'search', label: `"${searchQuery}"` });
  if (yearFilter !== 'all') activeFilters.push({ key: 'year', label: `Year: ${yearFilter}` });
  if (statusFilter !== 'all') {
    const statusLabels = { monitored: 'Monitored', unmonitored: 'Unmonitored', downloaded: 'Downloaded', downloading: 'Downloading', missing: 'Missing' };
    activeFilters.push({ key: 'status', label: statusLabels[statusFilter] || statusFilter });
  }
  if (watchedFilter !== 'all') {
    activeFilters.push({ key: 'watched', label: watchedFilter === 'watched' ? 'Watched' : 'Unwatched' });
  }
  if (genreFilter !== 'all') activeFilters.push({ key: 'genre', label: genreFilter });
  if (qualityFilter !== 'all') activeFilters.push({ key: 'quality', label: qualityFilter });
  if (resolutionFilter !== 'all') activeFilters.push({ key: 'resolution', label: resolutionFilter });
  if (codecFilter !== 'all') activeFilters.push({ key: 'codec', label: codecFilter });
  if (ratingFilter !== 'all') activeFilters.push({ key: 'rating', label: `Rating: ${ratingFilter}` });
  if (tmdbStatusFilter !== 'all') activeFilters.push({ key: 'tmdbStatus', label: `Show: ${tmdbStatusFilter}` });
  if (alphaFilter) activeFilters.push({ key: 'alpha', label: alphaFilter });

  const clearFilter = (key) => {
    if (key === 'search') setSearchQuery('');
    if (key === 'year') setYearFilter('all');
    if (key === 'status') setStatusFilter('all');
    if (key === 'watched') setWatchedFilter('all');
    if (key === 'genre') setGenreFilter('all');
    if (key === 'quality') setQualityFilter('all');
    if (key === 'resolution') setResolutionFilter('all');
    if (key === 'codec') setCodecFilter('all');
    if (key === 'rating') setRatingFilter('all');
    if (key === 'tmdbStatus') setTmdbStatusFilter('all');
    if (key === 'alpha') setAlphaFilter(null);
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setYearFilter('all');
    setStatusFilter('all');
    setWatchedFilter('all');
    setGenreFilter('all');
    setQualityFilter('all');
    setResolutionFilter('all');
    setCodecFilter('all');
    setRatingFilter('all');
    setTmdbStatusFilter('all');
    setAlphaFilter(null);
  };

  const activeFilterCount = activeFilters.length;

  // Bulk action handlers
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayItems.map(i => i.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkAction = async (action, value) => {
    const type = viewMode === 'shows' ? 'shows' : 'movies';
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setBulkLoading(true);
    try {
      if (action === 'status') {
        await api.post('/library/bulk/status', { ids, status: value, type });
        customAlert(`Updated ${ids.length} item(s)`);
      } else if (action === 'quality') {
        await api.post('/library/bulk/quality', { ids, profileId: value, type });
        customAlert(`Updated ${ids.length} item(s)`);
      } else if (action === 'delete') {
        const confirmed = await customConfirm(`Delete ${ids.length} selected item(s)? This cannot be undone.`);
        if (!confirmed) return;
        await api.post('/library/bulk/delete', { ids, type, deleteFiles: value?.deleteFiles });
        customAlert(`Deleted ${ids.length} item(s)`);
      }
      setSelectedIds(new Set());
      refreshLibrary();
    } catch (err) {
      console.error('Bulk action failed', err);
      customAlert('Failed to perform bulk action', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  // Reset selection when switching views
  useEffect(() => {
    setSelectedIds(new Set());
  }, [viewMode]);

  const paginatedItems = displayItems.slice(0, page * itemsPerPage);
  
  const loadMoreRef = useRef(null);
  useEffect(() => {
    if (!loadMoreRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && paginatedItems.length < displayItems.length) {
        setPage(p => p + 1);
      }
    }, { rootMargin: '400px' });
    
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [paginatedItems.length, displayItems.length]);

  return (
    <div className="space-y-3">
      <div ref={headerRef} className="flex items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 sm:gap-3 !mb-0">
            {viewMode === 'movies' ? <Film className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 shrink-0" /> : <Tv className="w-6 h-6 sm:w-8 sm:h-8 text-purple-400 shrink-0" />} <span className="truncate">{viewMode === 'movies' ? 'Movies' : 'TV Shows'}</span>
          </h1>
          <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block !mb-0">Your tracked and imported media collection.</p>
        </div>
        
        {/* View Toggle + Add */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="relative w-full max-w-xs hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={`Search ${viewMode === 'movies' ? 'movies' : 'shows'}...`}
              className="w-full bg-slate-900 border border-white/10 text-slate-200 text-sm rounded-lg pl-9 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 placeholder-slate-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex bg-slate-900 rounded-lg p-1 border border-white/10 shrink-0">
            <button 
              onClick={() => setViewStyle('grid')}
              className={`p-1.5 rounded-md transition-colors ${viewStyle === 'grid' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewStyle('list')}
              className={`p-1.5 rounded-md transition-colors ${viewStyle === 'list' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
            
            {viewStyle === 'list' && (
              <div ref={columnsMenuRef} className="relative ml-1 flex items-center">
                <div className="w-px h-5 bg-white/10 mx-1" />
                <button
                  onClick={() => setColumnsMenuOpen(!columnsMenuOpen)}
                  className={`p-1.5 rounded-md transition-colors ${columnsMenuOpen ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                  title="Table Columns"
                  aria-label="Table Columns"
                  aria-expanded={columnsMenuOpen}
                >
                  <Columns className="w-4 h-4" />
                </button>
                {columnsMenuOpen && (
                  <div className="absolute right-0 top-full mt-3 w-48 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-[60] overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-white/10 text-xs font-bold text-slate-400 uppercase tracking-wider">Columns</div>
                    <div className="p-1.5 flex flex-col gap-0.5">
                      {columnOrder.filter(col => {
                        const def = COLUMN_DEFS[col];
                        if (!def) return false;
                        if (col === 'seasons' && viewMode !== 'shows') return false;
                        if (col === 'episodes' && viewMode !== 'shows') return false;
                        if (col === 'subtitles' && viewMode !== 'movies') return false;
                        return true;
                      }).map(col => (
                        <label key={col} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors group" onClick={(e) => { e.preventDefault(); setTableColumns(prev => ({ ...prev, [col]: !prev[col] })); }}>
                          {tableColumns[col] ? (
                            <div className="w-4 h-4 rounded bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center">
                              <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
                            </div>
                          ) : (
                            <div className="w-4 h-4 rounded bg-slate-800 border border-slate-600/50 group-hover:border-slate-500 transition-colors" />
                          )}
                          <span className="text-sm text-slate-300 capitalize select-none group-hover:text-white transition-colors">{col}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {viewMode === 'movies' && (
            <button
              onClick={() => navigate('/discover?mode=movies')}
              className="flex items-center gap-1.5 px-3 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0"
              title="Add Movie"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Add Movie</span>
            </button>
          )}
          {viewMode === 'shows' && (
            <button
              onClick={() => navigate('/discover?mode=shows')}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0"
              title="Add TV Show"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Add TV Show</span>
            </button>
          )}
        </div>
      </div>

      <StickyBar
        visible={stickySearchVisible}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={`Search ${viewMode === 'movies' ? 'movies' : 'shows'}...`}
        showSearch
      />

      {/* Main Content Area */}
      
      <div className="glass-panel rounded-2xl">
        {/* Filter Bar Header */}
        <div className={`border-b ${viewMode === 'movies' ? 'border-cyan-500/30' : 'border-purple-500/30'} bg-slate-900/50 rounded-t-2xl`}>
          
          {/* Main Controls Row */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 p-3 sm:p-4 pb-2 sm:pb-3 justify-between">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <FilterSelect
                value={sort}
                onChange={e => setSort(e.target.value)}
                label="Sort: Recently Added"
                hideAll
              >
                <option value="added_desc">Recently Added</option>
                <option value="rating_desc">Highest Rating</option>
                <option value="rating_asc">Lowest Rating</option>
                <option value="size_desc">Largest Size</option>
                <option value="size_asc">Smallest Size</option>
                <option value="title_asc">Title (A-Z)</option>
                <option value="title_desc">Title (Z-A)</option>
              </FilterSelect>

              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
                  showAdvancedFilters || activeFilterCount > 0
                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                    : 'bg-slate-900/50 text-slate-400 border-white/5 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <FilterIcon className="w-3.5 h-3.5" />
                Filters {activeFilterCount > 0 && <span className="bg-cyan-500 text-slate-900 rounded-full px-1.5 py-0.5 text-[10px] font-bold ml-1">{activeFilterCount}</span>}
              </button>

              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-rose-400 bg-slate-900/50 hover:bg-slate-800/50 border border-white/5 hover:border-rose-500/30 px-2.5 py-2 rounded-lg transition-colors shrink-0"
                  title="Clear all filters"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {showAdvancedFilters && (
            <div className="px-4 pb-4 border-t border-white/5 pt-3 mt-1 bg-slate-900/30">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <FilterSelect
                  value={yearFilter}
                  onChange={e => setYearFilter(e.target.value)}
                  label="All Years"
                >
                  {allYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </FilterSelect>

                <FilterSelect
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  label="All Statuses"
                >
                  <option value="monitored">Monitored</option>
                  <option value="unmonitored">Unmonitored</option>
                  <option value="downloaded">Downloaded</option>
                  <option value="downloading">Downloading</option>
                  <option value="missing">Missing</option>
                </FilterSelect>

                {viewMode === 'shows' && (
                  <FilterSelect
                    value={tmdbStatusFilter}
                    onChange={e => setTmdbStatusFilter(e.target.value)}
                    label="Show: All"
                  >
                    <option value="Returning Series">Returning Series</option>
                    <option value="Ended">Ended</option>
                    <option value="Canceled">Canceled</option>
                    <option value="In Production">In Production</option>
                  </FilterSelect>
                )}

                <FilterSelect
                  value={watchedFilter}
                  onChange={e => setWatchedFilter(e.target.value)}
                  label="Watched: All"
                >
                  <option value="watched">Watched</option>
                  <option value="unwatched">Unwatched</option>
                </FilterSelect>

                {allQualities.length > 0 && (
                  <FilterSelect
                    value={qualityFilter}
                    onChange={e => setQualityFilter(e.target.value)}
                    label="All Qualities"
                  >
                    {allQualities.map(q => (
                      <option key={q} value={q}>{q}</option>
                    ))}
                  </FilterSelect>
                )}

                {allResolutions.length > 0 && (
                  <FilterSelect
                    value={resolutionFilter}
                    onChange={e => setResolutionFilter(e.target.value)}
                    label="All Resolutions"
                  >
                    {allResolutions.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </FilterSelect>
                )}

                {allCodecs.length > 0 && (
                  <FilterSelect
                    value={codecFilter}
                    onChange={e => setCodecFilter(e.target.value)}
                    label="All Codecs"
                  >
                    {allCodecs.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </FilterSelect>
                )}
                {/* Alphabet Index */}
                <AlphabetIndex 
                  alphaFilter={alphaFilter} 
                  setAlphaFilter={setAlphaFilter} 
                  items={displayItems}
                />
              </div>

              {/* Genre Chips Row */}
              {allGenres.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <FilterIcon className="w-3.5 h-3.5 text-slate-500 shrink-0 mr-1" />
                  <button
                    onClick={() => setGenreFilter('all')}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                      genreFilter === 'all'
                        ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                        : 'bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/5 hover:border-slate-400 dark:hover:border-slate-500/30 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    All
                  </button>
                  {allGenres.map(genre => (
                    <button
                      key={genre}
                      onClick={() => setGenreFilter(genreFilter === genre ? 'all' : genre)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                        genreFilter === genre
                          ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                          : 'bg-slate-800/50 text-slate-400 border-white/5 hover:border-slate-500/30 hover:text-slate-200'
                      }`}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Active Filter Chips */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 pb-4">
              {activeFilters.map(f => (
                <span
                  key={f.key}
                  className="inline-flex items-center gap-1 text-xs font-medium bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2 py-0.5 rounded-full"
                >
                  {f.label}
                  <button onClick={() => clearFilter(f.key)} className="hover:text-white transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <span className="text-xs text-slate-500 ml-1">
                {displayItems.length} item{displayItems.length !== 1 ? 's' : ''}
              </span>

            </div>
          )}

        </div>
        
        <div className="p-4">
        
        <BulkActions
          selectedIds={selectedIds}
          bulkLoading={bulkLoading}
          qualityProfiles={qualityProfiles}
          onClear={clearSelection}
          onAction={handleBulkAction}
        />

        {displayItems.length > 0 ? (
          <div
            style={{
              opacity: isReordering ? 0 : 1,
              transition: 'opacity 0.12s ease',
            }}
          >
          {viewStyle === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3 sm:gap-4">
              {paginatedItems.map(item => (
                <div 
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for ${item.title}`}
                  onClick={() => {
                    if (viewMode === 'shows') navigate(`/shows/${item.id}`);
                    else navigate(`/movies/${item.id}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (viewMode === 'shows') navigate(`/shows/${item.id}`);
                      else navigate(`/movies/${item.id}`);
                    }
                  }}
                  className={`cursor-pointer glass-panel interactive-glow-card scroll-reveal-item rounded-xl overflow-hidden group hover:scale-[1.02] transition-transform duration-300 relative flex flex-col focus:outline-none focus:ring-2 focus:ring-cyan-500/50`}
                >
                  <div className="absolute top-2 left-2 z-20">
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation(); e.preventDefault();
                        try {
                          const endpoint = viewMode === 'movies' ? `/library/movies/${item.id}/toggle-monitor` : `/library/shows/${item.id}/toggle-monitor`;
                          const res = await api.post(endpoint);
                          if (res.data.status === 'success') {
                            refreshLibrary();
                            customAlert(res.data.data.monitored ? 'Now monitored' : 'Now unmonitored');
                          }
                        } catch (err) {
                          customAlert('Failed to toggle monitor status', 'error');
                        }
                      }}
                      className="p-1.5 rounded-full bg-slate-900/80 hover:bg-slate-800 transition-colors shadow-lg group/btn"
                      title={item.monitored ? 'Unmonitor' : 'Monitor'}
                    >
                      {item.monitored ? (
                        <Bookmark className="w-5 h-5 text-emerald-500 fill-emerald-500 group-hover/btn:text-rose-400 group-hover/btn:fill-transparent" />
                      ) : (
                        <Bookmark className="w-5 h-5 text-rose-400 group-hover/btn:text-emerald-400" />
                      )}
                    </button>
                  </div>

                  <div className="absolute top-2 right-2 z-20 flex gap-2">
                    {item.status === 'downloaded' && (
                      <div className="bg-slate-900/80 rounded-full shadow-lg p-1.5" title="Available">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-400/20" />
                      </div>
                    )}
                    {item.status === 'downloading' && (
                      <div className="bg-slate-900/80 rounded-full shadow-lg p-1.5" title="Downloading">
                        <Activity className="w-5 h-5 text-blue-400 animate-pulse" />
                      </div>
                    )}
                    {item.status === 'monitored' && (
                      <div className="bg-slate-900/80 rounded-full shadow-lg p-1.5" title={
                        item.release_date && new Date(item.release_date) > new Date()
                          ? 'Missing / Not Released Yet'
                          : 'Missing'
                      }>
                        <AlertCircle className={`w-5 h-5 ${item.release_date && new Date(item.release_date) > new Date() ? 'text-amber-400' : 'text-amber-500'}`} />
                      </div>
                    )}

                  </div>

                  <div className="aspect-[2/3] relative bg-slate-800 min-h-[200px] flex-shrink-0">
                    {item.watched ? (
                      <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1 bg-slate-950/80 backdrop-blur px-2 py-1 rounded-md border border-emerald-500/30 shadow-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        <span className="text-[10px] font-bold text-emerald-400">Watched</span>
                      </div>
                    ) : null}
                    {viewMode === 'shows' && item.season_count > 0 && (
                      <div className="absolute bottom-2 right-2 z-20 flex items-center gap-1 bg-slate-950/80 backdrop-blur px-2 py-1 rounded-md border border-purple-500/30 shadow-lg">
                        <Tv className="w-3 h-3 text-purple-400" />
                        <span className="text-[10px] font-bold text-purple-400">{item.season_count}</span>
                      </div>
                    )}
                    {/* Placeholder shown before image loads */}
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-700/50 to-slate-800/50 animate-pulse" />
                    <img 
                      src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} 
                      alt={item.title}
                      width="500"
                      height="750"
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover relative"
                    />
                    <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-3 p-4 z-10">
                      <div className="flex flex-col gap-2 w-full">
                        {item.status === 'monitored' && (
                          <div className="flex gap-2 justify-center">
                            <button 
                              onClick={async (e) => { 
                                e.stopPropagation(); e.preventDefault(); 
                                customAlert(`Starting auto-search for ${item.title}...`);
                                try {
                                  const endpoint = viewMode === 'movies' ? `/library/movies/${item.id}/auto-search` : `/library/shows/${item.id}/auto-search`;
                                  const res = await api.post(endpoint);
                                  if (res.data.status === 'success') {
                                    customAlert(res.data.message || `Found & downloading: ${res.data.data?.title || 'torrents'}`);
                                    refreshLibrary();
                                  }
                                } catch (err) {
                                  console.error(err);
                                  customAlert('Auto-search failed to find any results', 'error');
                                }
                              }}
                              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 w-12 h-12 rounded-full font-bold flex items-center justify-center transition-transform hover:scale-110 shadow-lg"
                              title="Auto Search"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>
                            </button>
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); e.preventDefault(); 
                                setSearchMediaId(item.id);
                                setSearchMediaType(viewMode === 'movies' ? 'movie' : 'show');
                                setSearchMediaTitle(item.title);
                                setSearchModalOpen(true);
                              }}
                              className="bg-purple-500 hover:bg-purple-400 text-slate-950 w-12 h-12 rounded-full font-bold flex items-center justify-center transition-transform hover:scale-110 shadow-lg"
                              title="Manual Search"
                            >
                              <Search className="w-5 h-5" />
                            </button>
                          </div>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation(); e.preventDefault();
                            if (viewMode === 'shows') navigate(`/shows/${item.id}`);
                            else navigate(`/movies/${item.id}`);
                          }}
                          className="bg-white/10 hover:bg-white/20 text-white w-full py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors mt-2"
                        >
                          <Info className="w-4 h-4" /> Details
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 relative z-20 bg-gradient-to-b from-slate-800/95 to-slate-900/95 border-t border-white/10">
                    <h3 className="font-semibold text-sm text-slate-100 truncate tracking-wide" title={item.title}>{item.title}</h3>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-slate-500 font-medium tracking-wider uppercase">{item.year}</span>
                      <div className="flex items-center gap-2">
                        {item.rating > 0 && (
                          <div className="flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span className="text-xs font-bold text-amber-300">{Number(item.rating).toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : viewStyle === 'list' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-slate-400 text-sm">
                  <th className="py-3 px-2 font-medium w-8">
                    <button
                      onClick={toggleSelectAll}
                      className="p-0.5 rounded hover:bg-slate-700 transition-colors"
                      title="Select All"
                      aria-label={selectedIds.size === displayItems.length && displayItems.length > 0 ? 'Deselect all' : 'Select all'}
                    >
                      {selectedIds.size === displayItems.length && displayItems.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                      ) : selectedIds.size > 0 ? (
                        <div className="w-4 h-4 rounded border-2 border-cyan-400/50 bg-cyan-400/20" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-600 hover:text-slate-400 transition-colors" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4 font-medium cursor-pointer hover:text-white transition-colors select-none group" onClick={() => handleSortClick('title')}>Title<SortIcon field="title" sort={sort} /></th>
                  {visibleOrderedColumns.map(colKey => {
                    const def = COLUMN_DEFS[colKey];
                    return (
                      <th
                        key={colKey}
                        draggable
                        onDragStart={(e) => handleDragStart(e, colKey)}
                        onDragOver={(e) => handleDragOver(e, colKey)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, colKey)}
                        onDragEnd={() => { setDragColumn(null); setDragOverColumn(null); }}
                        onClick={() => handleSortClick(def.sortField)}
                        className={`py-3 px-4 font-medium cursor-pointer hover:text-white transition-colors select-none group ${def.w} ${dragColumn === colKey ? 'opacity-50' : ''} ${dragOverColumn === colKey ? 'border-l-2 border-cyan-400' : ''}`}
                      >
                        {def.label}<SortIcon field={def.sortField} sort={sort} />
                      </th>
                    );
                  })}
                  <th className="py-3 px-4 font-medium w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedItems.map(item => (
                  <tr 
                    key={item.id}
                    tabIndex={0}
                    aria-label={`View details for ${item.title}`}
                    onClick={() => {
                      if (viewMode === 'shows') {
                        navigate(`/shows/${item.id}`);
                      } else {
                        navigate(`/movies/${item.id}`);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (viewMode === 'shows') navigate(`/shows/${item.id}`);
                        else navigate(`/movies/${item.id}`);
                      }
                    }}
                    className={`hover:bg-slate-800/50 cursor-pointer transition-colors group focus:outline-none focus:bg-slate-800/50 ${selectedIds.has(item.id) ? 'bg-cyan-500/5 ring-1 ring-cyan-500/20' : ''}`}
                  >
                    <td className="py-2.5 px-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => toggleSelect(item.id)}
                        className="p-0.5 rounded hover:bg-slate-700 transition-colors"
                        aria-label={selectedIds.has(item.id) ? `Deselect ${item.title}` : `Select ${item.title}`}
                      >
                        {selectedIds.has(item.id) ? (
                          <CheckSquare className="w-4 h-4 text-cyan-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-600 group-hover:text-slate-400" />
                        )}
                      </button>
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 dark:text-slate-200 font-medium group-hover:text-cyan-500 dark:group-hover:text-cyan-400 transition-colors">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation(); e.preventDefault();
                            try {
                              const endpoint = viewMode === 'movies' ? `/library/movies/${item.id}/toggle-monitor` : `/library/shows/${item.id}/toggle-monitor`;
                              const res = await api.post(endpoint);
                              if (res.data.status === 'success') {
                                refreshLibrary();
                                customAlert(res.data.data.monitored ? 'Now monitored' : 'Now unmonitored');
                              }
                            } catch (err) {
                              customAlert('Failed to toggle monitor status', 'error');
                            }
                          }}
                          className="hover:bg-slate-800 transition-colors p-1 rounded-md group/btn"
                          title={item.monitored ? 'Unmonitor' : 'Monitor'}
                        >
                          {item.monitored ? (
                            <Bookmark className="w-4 h-4 text-emerald-500 fill-emerald-500 group-hover/btn:text-rose-400 group-hover/btn:fill-transparent" />
                          ) : (
                            <Bookmark className="w-4 h-4 text-rose-400 group-hover/btn:text-emerald-400" />
                          )}
                        </button>
                        <span>{item.title}</span>
                      </div>
                    </td>
                    {visibleOrderedColumns.map(colKey => renderCell(colKey, item))}
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex justify-end gap-2 items-center">
                          <>
                            <button 
                              onClick={async (e) => { 
                                e.stopPropagation(); e.preventDefault(); 
                                customAlert(`Starting auto-search for ${item.title}...`);
                                try {
                                  const endpoint = viewMode === 'movies' ? `/library/movies/${item.id}/auto-search` : `/library/shows/${item.id}/auto-search`;
                                  const res = await api.post(endpoint);
                                  if (res.data.status === 'success') {
                                    customAlert(res.data.message || `Found & downloading: ${res.data.data?.title || 'torrents'}`);
                                    refreshLibrary();
                                  }
                                } catch (err) {
                                  console.error(err);
                                  customAlert('Auto-search failed to find any results', 'error');
                                }
                              }}
                              className="text-slate-400 hover:text-emerald-400 transition-colors p-1"
                              title="Auto Search & Download"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>
                            </button>
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); e.preventDefault(); 
                                setSearchMediaId(item.id);
                                setSearchMediaType(viewMode === 'movies' ? 'movie' : 'show');
                                setSearchMediaTitle(item.title);
                                setSearchModalOpen(true);
                              }}
                              className="text-slate-400 hover:text-purple-400 transition-colors p-1"
                              title="Manual Search"
                            >
                              <Search className="w-4 h-4" />
                            </button>
                          </>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-4">
            <div className="w-8 h-8 border-2 border-cyan-500/50 border-t-cyan-400 rounded-full animate-spin" />
            <p className="text-sm font-medium">Loading data...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[300px] text-slate-500 rounded-xl">
            {viewMode === 'movies' ? <Film className="w-12 h-12 mb-4 opacity-50" /> : <Tv className="w-12 h-12 mb-4 opacity-50" />}
            <p>No {viewMode === 'movies' ? 'movies' : 'TV shows'} in your library yet.</p>
            <p className="text-sm mt-1 mb-5">Add them from the Discover page or scan your NAS in Settings.</p>
            <button
              onClick={() => navigate('/discover')}
              className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl text-sm font-bold transition-all hover:scale-105"
            >
              <Search className="w-4 h-4" />
              Browse Discover
            </button>
          </div>
        )}
        
        {/* Infinite Scroll Observer Target */}
        <div ref={loadMoreRef} className="w-full h-4" />
        
        </div>
      </div>

      {searchModalOpen && searchMediaId && (
        <ManualSearchModal
          mediaId={searchMediaId}
          mediaType={searchMediaType}
          title={searchMediaTitle}
          onClose={() => { setSearchModalOpen(false); setSearchMediaId(null); }}
          onGrabbed={refreshLibrary}
        />
      )}
    </div>
  );
}
