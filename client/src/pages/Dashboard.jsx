import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { Activity, Film, Tv, Search, CheckCircle2, AlertCircle, Bookmark, BookmarkMinus, LayoutGrid, List, Star, Info, X, RotateCcw, Filter as FilterIcon, CheckSquare, Square, Trash2, FolderOpen, ChevronUp, ChevronDown, Heart, Columns } from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';
import { cachedMovies, cachedShows, setCachedMovies, setCachedShows } from '../lib/libraryCache';
import { formatSize, formatSpeed } from '../lib/format';
import { useSettings } from '../lib/useSettings';

const SortIcon = ({ field, sort }) => {
  if (!sort.startsWith(field)) return null;
  return sort.endsWith('_asc') ? <ChevronUp className="w-3.5 h-3.5 inline ml-1" /> : <ChevronDown className="w-3.5 h-3.5 inline ml-1" />;
};

const parseResolution = (title) => {
  if (!title) return 'Unknown';
  const t = title.toLowerCase();
  if (t.includes('2160p') || t.includes('4k')) return '2160p';
  if (t.includes('1080p')) return '1080p';
  if (t.includes('720p')) return '720p';
  if (t.includes('480p') || t.includes('dvdrip') || t.includes('xvid') || t.includes('hdtv') || t.match(/\bsd\b/)) return 'SD';
  return 'Unknown';
};

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [movies, setMovies] = useState(cachedMovies || []);
  const [shows, setShows] = useState(cachedShows || []);
  const [downloads, setDownloads] = useState([]);
  const [stats, setStats] = useState({ dl_info_speed: 0, up_info_speed: 0 });
  const [loading, setLoading] = useState(!cachedMovies && !cachedShows);
  
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchMovieId, setSearchMovieId] = useState(null);
  
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  const viewMode = location.pathname.includes('shows') ? 'shows' : 'movies';
  const scopeKey = (key) => `atlas_${viewMode}_${key}`;

  const [tableColumns, setTableColumns] = useState(() => {
    try {
      const stored = localStorage.getItem(scopeKey('TableColumns'));
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return { year: true, rating: true, resolution: true, size: true, status: true };
  });
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const columnsMenuRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(scopeKey('TableColumns'), JSON.stringify(tableColumns));
  }, [tableColumns, viewMode]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(event.target)) {
        setColumnsMenuOpen(false);
      }
    }
    if (columnsMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [columnsMenuOpen]);

  const [searchParams] = useSearchParams();

  const [statusFilter, setStatusFilter] = useState(() => localStorage.getItem(scopeKey('StatusFilter')) || 'all');
  const [watchedFilter, setWatchedFilter] = useState(() => localStorage.getItem(scopeKey('WatchedFilter')) || 'all');
  const [genreFilter, setGenreFilter] = useState(() => localStorage.getItem(scopeKey('GenreFilter')) || 'all');
  const [qualityFilter, setQualityFilter] = useState(() => localStorage.getItem(scopeKey('QualityFilter')) || 'all');
  const [resolutionFilter, setResolutionFilter] = useState(() => localStorage.getItem(scopeKey('ResolutionFilter')) || 'all');
  const [yearFilter, setYearFilter] = useState(() => localStorage.getItem(scopeKey('YearFilter')) || 'all');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [sort, setSort] = useState(() => localStorage.getItem(scopeKey('Sort')) || 'added_desc');
  const [viewStyle, setViewStyle] = useState(() => localStorage.getItem('dashboardViewStyle') || 'grid');
  const [searchQuery, setSearchQuery] = useState('');
  
  const searchInputRef = useRef(null);

  // Focus search input when switching between movies and shows
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [viewMode]);

  const handleSortClick = (field) => {
    const defaultDesc = ['rating', 'size', 'year'].includes(field);
    if (sort.startsWith(field)) {
      setSort(sort === `${field}_asc` ? `${field}_desc` : `${field}_asc`);
    } else {
      setSort(defaultDesc ? `${field}_desc` : `${field}_asc`);
    }
  };

  const { profiles: qualityProfiles } = useSettings();

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
  }, [viewStyle]);

  useEffect(() => {
    localStorage.setItem(scopeKey('StatusFilter'), statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    localStorage.setItem(scopeKey('WatchedFilter'), watchedFilter);
  }, [watchedFilter]);

  useEffect(() => {
    localStorage.setItem(scopeKey('GenreFilter'), genreFilter);
  }, [genreFilter]);

  useEffect(() => {
    localStorage.setItem(scopeKey('QualityFilter'), qualityFilter);
  }, [qualityFilter]);

  useEffect(() => {
    localStorage.setItem(scopeKey('ResolutionFilter'), resolutionFilter);
  }, [resolutionFilter]);

  useEffect(() => {
    localStorage.setItem(scopeKey('YearFilter'), yearFilter);
  }, [yearFilter]);

  useEffect(() => {
    localStorage.setItem(scopeKey('Sort'), sort);
  }, [sort]);

  // Reset filters when switching between movies and shows
  const [page, setPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    setStatusFilter(() => localStorage.getItem(scopeKey('StatusFilter')) || 'all');
    setWatchedFilter(() => localStorage.getItem(scopeKey('WatchedFilter')) || 'all');
    setGenreFilter(localStorage.getItem(scopeKey('GenreFilter')) || 'all');
    setQualityFilter(localStorage.getItem(scopeKey('QualityFilter')) || 'all');
    setResolutionFilter(localStorage.getItem(scopeKey('ResolutionFilter')) || 'all');
    setYearFilter(localStorage.getItem(scopeKey('YearFilter')) || 'all');
    setSort(localStorage.getItem(scopeKey('Sort')) || 'added_desc');
    setPage(1);
    
    // Check if we need to show loading state when switching tabs
    if (viewMode === 'movies' && movies.length === 0) setLoading(true);
    if (viewMode === 'shows' && shows.length === 0) setLoading(true);
    
    // Fetch fresh data for the current view
    fetchViewData(viewMode, false);
  }, [viewMode]);

  // Reset pagination when filters/sort change
  useEffect(() => {
    setPage(1);
  }, [sort, statusFilter, watchedFilter, genreFilter, qualityFilter, resolutionFilter, yearFilter]);

  useEffect(() => {
    // Always show cached data immediately (if available), then refresh
    fetchClientData();

    const startPolling = () => setInterval(fetchClientData, 3000);
    let interval = startPolling();

    // Then fetch the other view in background
    const otherMode = viewMode === 'movies' ? 'shows' : 'movies';
    fetchViewData(otherMode, true);

    const onVisibility = () => {
      if (document.hidden) {
        clearInterval(interval);
      } else {
        fetchClientData();
        interval = startPolling();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const fetchViewData = async (mode, isBackground) => {
    try {
      const endpoint = mode === 'movies' ? '/library/movies' : '/library/shows';
      const res = await api.get(endpoint);
      if (res.data.status === 'success') {
        if (mode === 'movies') {
          setCachedMovies(res.data.data);
          setMovies(res.data.data);
        } else {
          setCachedShows(res.data.data);
          setShows(res.data.data);
        }
      }
    } catch (err) {
      console.error(`Failed to fetch ${mode}`, err);
    } finally {
      if (!isBackground) setLoading(false);
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
      } else {
        setDownloads([]);
      }
    } catch (err) {
      console.error('Failed to fetch client data', err);
    }
  };

  const refreshLibrary = () => {
    fetchViewData(viewMode, true);
  };

  // --- Compute derived data for filters ---
  const allItems = viewMode === 'movies' ? [...movies] : [...shows];

  // Unique years from ALL items (stable regardless of filters)
  const allYears = [...new Set(allItems.map(item => item.year).filter(Boolean))].sort((a, b) => b - a);

  // Unique genres from ALL items (stored as comma-separated)
  const allGenres = [...new Set(
    allItems.flatMap(item => 
      item.genres ? item.genres.split(',').map(g => g.trim()).filter(Boolean) : []
    )
  )].sort();

  // Unique quality profiles from ALL items
  const allQualities = [...new Set(
    allItems.map(item => item.quality_profile_name).filter(Boolean)
  )].sort();

  // Unique resolutions from ALL items
  const allResolutions = [...new Set(
    allItems.map(item => parseResolution(item.scene_name || item.sample_episode_path || item.file_path)).filter(r => r !== 'Unknown')
  )].sort((a, b) => {
    const order = { '2160p': 4, '1080p': 3, '720p': 2, 'SD': 1, 'Unknown': 0 };
    return (order[b] || 0) - (order[a] || 0);
  });

  // --- Apply filters (memoized) ---
  const displayItems = useMemo(() => {
    let items = [...allItems];

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

    // Watched filter
    if (watchedFilter === 'watched') {
      items = items.filter(item => item.watched);
    } else if (watchedFilter === 'unwatched') {
      items = items.filter(item => !item.watched);
    }

    // Year filter
    if (yearFilter !== 'all') {
      items = items.filter(item => String(item.year) === yearFilter);
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

    // Rating filter (from statistics page)
    if (ratingFilter !== 'all') {
      const [minR, maxR] = ratingFilter.split('–').map(Number);
      items = items.filter(item => {
        const r = item.rating || 0;
        return r >= minR && r < maxR;
      });
    }

    // Sort
    items.sort((a, b) => {
      if (sort === 'added_desc') return new Date(b.added_at) - new Date(a.added_at);
      if (sort === 'rating_desc') return (b.rating || 0) - (a.rating || 0);
      if (sort === 'rating_asc') return (a.rating || 0) - (b.rating || 0);
      if (sort === 'size_desc') return (b.file_size || b.folder_size || 0) - (a.file_size || a.folder_size || 0);
      if (sort === 'size_asc') return (a.file_size || a.folder_size || 0) - (b.file_size || b.folder_size || 0);
      if (sort === 'title_asc') return (a.title || '').localeCompare(b.title || '');
      if (sort === 'title_desc') return (b.title || '').localeCompare(a.title || '');
      if (sort === 'year_desc') return (b.year || 0) - (a.year || 0);
      if (sort === 'year_asc') return (a.year || 0) - (b.year || 0);
      if (sort === 'status_asc') return (a.status || '').localeCompare(b.status || '');
      if (sort === 'status_desc') return (b.status || '').localeCompare(a.status || '');
      if (sort === 'resolution_asc' || sort === 'resolution_desc') {
        const order = { '2160p': 4, '1080p': 3, '720p': 2, 'SD': 1, 'Unknown': 0 };
        const resA = order[parseResolution(a.scene_name || a.sample_episode_path || a.file_path)] || 0;
        const resB = order[parseResolution(b.scene_name || b.sample_episode_path || b.file_path)] || 0;
        return sort === 'resolution_asc' ? resA - resB : resB - resA;
      }
      return 0;
    });

    return items;
  }, [allItems, searchQuery, statusFilter, watchedFilter, yearFilter, genreFilter, qualityFilter, resolutionFilter, ratingFilter, sort]);

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
  if (ratingFilter !== 'all') activeFilters.push({ key: 'rating', label: `Rating: ${ratingFilter}` });

  const clearFilter = (key) => {
    if (key === 'search') setSearchQuery('');
    if (key === 'year') setYearFilter('all');
    if (key === 'status') setStatusFilter('all');
    if (key === 'watched') setWatchedFilter('all');
    if (key === 'genre') setGenreFilter('all');
    if (key === 'quality') setQualityFilter('all');
    if (key === 'resolution') setResolutionFilter('all');
    if (key === 'rating') setRatingFilter('all');
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setYearFilter('all');
    setStatusFilter('all');
    setWatchedFilter('all');
    setGenreFilter('all');
    setQualityFilter('all');
    setResolutionFilter('all');
    setRatingFilter('all');
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

    if (action === 'delete') {
      const confirmed = await customConfirm(`Delete ${ids.length} selected item(s)? This cannot be undone.`);
      if (!confirmed) return;
    }

    setBulkLoading(true);
    try {
      if (action === 'status') {
        await api.post('/library/bulk/status', { ids, status: value, type });
        customAlert(`Updated ${ids.length} item(s)`);
      } else if (action === 'quality') {
        await api.post('/library/bulk/quality', { ids, profileId: value, type });
        customAlert(`Updated ${ids.length} item(s)`);
      } else if (action === 'delete') {
        await api.post('/library/bulk/delete', { ids, type });
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
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
            {viewMode === 'movies' ? <Film className="w-8 h-8 text-cyan-400" /> : <Tv className="w-8 h-8 text-purple-400" />} {viewMode === 'movies' ? 'Movies' : 'TV Shows'}
          </h1>
          <p className="text-slate-400 mt-1">Your tracked and imported media collection.</p>
        </div>
        
        {/* Search Bar + View Toggle */}
        <div className="flex items-center gap-3">
          <div className="relative w-full max-w-[260px] hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              ref={searchInputRef}
              autoFocus
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
                >
                  <Columns className="w-4 h-4" />
                </button>
                {columnsMenuOpen && (
                  <div className="absolute right-0 top-full mt-3 w-48 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-[60] overflow-hidden text-sm">
                    <div className="p-2 border-b border-white/5 font-semibold text-slate-300">Visible Columns</div>
                    <div className="p-2 flex flex-col gap-1">
                      {['year', 'rating', 'resolution', 'size', 'status'].map(col => (
                        <label key={col} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={tableColumns[col]}
                            onChange={(e) => setTableColumns(prev => ({ ...prev, [col]: e.target.checked }))}
                            className="rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500/50"
                          />
                          <span className="text-slate-300 capitalize">{col}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      
      <div className="glass-panel rounded-2xl min-h-[400px]">
        {/* Filter Bar Header */}
        <div className={`border-b ${viewMode === 'movies' ? 'border-cyan-500/30' : 'border-purple-500/30'} bg-slate-900/50 rounded-t-2xl`}>
          
          {/* Mobile search */}
          <div className="relative w-full p-4 pb-0 sm:hidden">
            <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={`Search ${viewMode === 'movies' ? 'movies' : 'shows'}...`}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-200 text-sm rounded-lg pl-9 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 dark:focus:border-cyan-500/50 placeholder-slate-400 dark:placeholder-slate-500 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-slate-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Main Controls Row */}
          <div className="flex flex-wrap items-center gap-2 p-4 pb-3 justify-between">
            <div className="flex items-center gap-2">
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
        
        <div className="p-6">
        
        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="glass-panel rounded-2xl p-4 mb-4 border border-cyan-500/30 bg-cyan-500/5 flex items-center gap-4 flex-wrap">
            <span className="text-sm font-bold text-cyan-400">
              {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={clearSelection}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Clear
            </button>
            <div className="h-6 w-px bg-slate-700" />
            <button
              onClick={() => handleBulkAction('delete')}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-bold transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Status:</span>
              {['monitored', 'unmonitored', 'downloaded'].map(s => (
                <button
                  key={s}
                  onClick={() => handleBulkAction('status', s)}
                  disabled={bulkLoading}
                  className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors capitalize disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
            {qualityProfiles.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Quality:</span>
                <select
                  onChange={(e) => {
                    handleBulkAction('quality', e.target.value ? parseInt(e.target.value) : null);
                  }}
                  disabled={bulkLoading}
                  defaultValue=""
                  className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-white/5 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <option value="" disabled>Set profile...</option>
                  <option value="">Any (clear)</option>
                  {qualityProfiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
            {bulkLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-500" />}
          </div>
        )}


        {displayItems.length > 0 ? (
          viewStyle === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {paginatedItems.map(item => (
                <div 
                  key={item.id} 
                  onClick={() => {
                    if (viewMode === 'shows') navigate(`/shows/${item.id}`);
                    else navigate(`/movies/${item.id}`);
                  }}
                  className={`cursor-pointer glass-panel rounded-xl overflow-hidden group hover:scale-[1.02] transition-transform duration-300 relative flex flex-col`}
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
                    {item.status === 'monitored' && (
                      <div className="bg-slate-900/80 rounded-full shadow-lg p-1.5" title="Missing">
                        <AlertCircle className="w-5 h-5 text-amber-500" />
                      </div>
                    )}
                    {item.status === 'downloading' && (
                      <div className="bg-slate-900/80 rounded-full shadow-lg p-1.5" title="Downloading">
                        <Activity className="w-5 h-5 text-blue-400 animate-pulse" />
                      </div>
                    )}

                  </div>

                  <div className="aspect-[2/3] relative bg-slate-800">
                    {item.watched ? (
                      <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1 bg-slate-950/80 backdrop-blur px-2 py-1 rounded-md border border-emerald-500/30 shadow-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        <span className="text-[10px] font-bold text-emerald-400">Watched</span>
                      </div>
                    ) : null}
                    <img 
                      src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} 
                      alt={item.title}
                      className="w-full h-full object-cover"
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
                              onClick={async (e) => { 
                                e.stopPropagation(); e.preventDefault(); 
                                setSearchMovieId(item.id); 
                                setSearchModalOpen(true);
                                setIsSearching(true);
                                setHasSearched(false);
                                setSearchResults([]);
                                try {
                                  const endpoint = viewMode === 'movies' ? `/library/movies/${item.id}/search` : `/library/shows/${item.id}/search`;
                                  const res = await api.get(endpoint);
                                  setSearchResults(res.data.data);
                                  setHasSearched(true);
                                } catch (e) {
                                  customAlert('Search failed', 'error');
                                  setHasSearched(true);
                                }
                                setIsSearching(false);
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

                  <div className="p-4 relative z-20 bg-slate-900/90 border-t border-white/5">
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 truncate" title={item.title}>{item.title}</h3>
                    <div className="flex justify-between items-center mt-1">
                      <p className="text-sm text-slate-400 font-medium">{item.year}</p>
                      <div className="flex items-center gap-2">
                        {item.rating > 0 && (
                          <div className="flex items-center gap-1.5 bg-slate-950/50 px-2.5 py-0.5 rounded-lg border border-white/5 shadow-inner">
                            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{Number(item.rating).toFixed(1)}</span>
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
                  {tableColumns.year && <th className="py-3 px-4 font-medium w-24 cursor-pointer hover:text-white transition-colors select-none group" onClick={() => handleSortClick('year')}>Year<SortIcon field="year" sort={sort} /></th>}
                  {tableColumns.rating && <th className="py-3 px-4 font-medium w-32 cursor-pointer hover:text-white transition-colors select-none group" onClick={() => handleSortClick('rating')}>Rating<SortIcon field="rating" sort={sort} /></th>}
                  {tableColumns.resolution && (
                    <th onClick={() => handleSortClick('resolution')} className="py-3 px-4 font-medium w-28 cursor-pointer hover:text-white transition-colors select-none group whitespace-nowrap">
                      Resolution<SortIcon field="resolution" sort={sort} />
                    </th>
                  )}
                  {tableColumns.size && <th className="py-3 px-4 font-medium w-28 cursor-pointer hover:text-white transition-colors select-none group" onClick={() => handleSortClick('size')}>Size<SortIcon field="size" sort={sort} /></th>}
                  {tableColumns.status && <th className="py-3 px-4 font-medium w-32 cursor-pointer hover:text-white transition-colors select-none group" onClick={() => handleSortClick('status')}>Status<SortIcon field="status" sort={sort} /></th>}
                  <th className="py-3 px-4 font-medium w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedItems.map(item => (
                  <tr 
                    key={item.id}
                    onClick={() => {
                      if (viewMode === 'shows') {
                        navigate(`/shows/${item.id}`);
                      } else {
                        navigate(`/movies/${item.id}`);
                      }
                    }}
                    className={`hover:bg-slate-800/50 cursor-pointer transition-colors group ${selectedIds.has(item.id) ? 'bg-cyan-500/5 ring-1 ring-cyan-500/20' : ''}`}
                  >
                    <td className="py-2.5 px-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => toggleSelect(item.id)}
                        className="p-0.5 rounded hover:bg-slate-700 transition-colors"
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
                    {tableColumns.year && (
                      <td className="py-2.5 px-4 text-slate-300 text-sm">
                        {item.year || <span className="text-slate-600">—</span>}
                      </td>
                    )}
                    {tableColumns.rating && (
                      <td className="py-2.5 px-4 text-slate-300 text-sm font-medium">
                        {item.rating > 0 ? (
                          <div className="flex items-center gap-1.5 w-fit bg-slate-950/50 px-2.5 py-0.5 rounded-lg border border-white/5 shadow-inner">
                            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                            <span className="text-sm font-bold text-slate-600 dark:text-slate-200">{Number(item.rating).toFixed(1)}</span>
                          </div>
                        ) : <span className="text-slate-600">—</span>}
                      </td>
                    )}
                    {tableColumns.resolution && (
                      <td className="py-2.5 px-4 text-slate-300">
                        {parseResolution(item.scene_name || item.sample_episode_path || item.file_path) !== 'Unknown' ? (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                            {parseResolution(item.scene_name || item.sample_episode_path || item.file_path)}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    )}
                    {tableColumns.size && (
                      <td className="py-2.5 px-4 text-slate-400 text-sm">
                        {formatSize(item.file_size || item.folder_size || 0)}
                      </td>
                    )}
                    {tableColumns.status && (
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            item.status === 'downloaded' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 
                            item.status === 'downloading' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 
                            item.status === 'monitored' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 
                            'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}>
                            {item.status}
                          </span>
                        </div>
                      </td>
                    )}
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
                              onClick={async (e) => { 
                                e.stopPropagation(); e.preventDefault(); 
                                setSearchMovieId(item.id); 
                                setSearchModalOpen(true); 
                                setIsSearching(true);
                                setHasSearched(false);
                                setSearchResults([]);
                                try {
                                  const endpoint = viewMode === 'movies' ? `/library/movies/${item.id}/search` : `/library/shows/${item.id}/search`;
                                  const res = await api.get(endpoint);
                                  setSearchResults(res.data.data);
                                  setHasSearched(true);
                                } catch (e) {
                                  customAlert('Search failed', 'error');
                                  setHasSearched(true);
                                }
                                setIsSearching(false);
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
        ) : null
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-4">
            <div className="w-8 h-8 border-2 border-cyan-500/50 border-t-cyan-400 rounded-full animate-spin" />
            <p className="text-sm font-medium">Loading data...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[300px] text-slate-500 rounded-xl">
            {viewMode === 'movies' ? <Film className="w-12 h-12 mb-4 opacity-50" /> : <Tv className="w-12 h-12 mb-4 opacity-50" />}
            <p>No {viewMode === 'movies' ? 'movies' : 'TV shows'} in your library yet.</p>
            <p className="text-sm mt-1">Add them from the Discover page or scan your NAS in Settings.</p>
          </div>
        )}
        
        {/* Infinite Scroll Observer Target */}
        <div ref={loadMoreRef} className="h-10 w-full mt-4" />
        
        </div>
      </div>

      {searchModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 p-6 rounded-2xl w-full max-w-3xl border border-white/10 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h2 className="text-2xl font-bold text-white">Interactive Search</h2>
              <button onClick={() => { setSearchModalOpen(false); setSearchResults([]); }} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-[200px]">
            {isSearching ? (
              <div className="flex flex-col items-center justify-center py-10 text-purple-400">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mb-4"></div>
                <p className="font-bold">Searching Indexers...</p>
              </div>
            ) : !searchResults.length && hasSearched ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <p>No results found. Please check if your indexer URLs and API keys are correct in Settings.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {searchResults.map((res, i) => (
                  <div key={i} className="bg-slate-800 p-3 rounded-lg flex justify-between items-center border border-white/5">
                    <div className="overflow-hidden mr-4">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate" title={res.title}>{res.title}</p>
                      <div className="flex space-x-3 text-xs text-slate-400 mt-1">
                        <span className="text-cyan-400">{res.indexer}</span>
                        <span>{res.seeders} Seeders</span>
                        <span>{(res.size / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                      </div>
                    </div>
                    <button 
                      onClick={async () => {
                        try {
                          const endpoint = viewMode === 'movies' ? `/library/movies/${searchMovieId}/download` : `/library/shows/${searchMovieId}/download`;
                          await api.post(endpoint, { torrentUrl: res.link });
                          customAlert('Sent to download client!');
                          setSearchModalOpen(false);
                          refreshLibrary();
                        } catch (e) {
                          customAlert('Failed to send to client', 'error');
                        }
                      }}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1 rounded-lg shrink-0"
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const FilterSelect = ({ value, onChange, label, children, accentColor, hideAll }) => (
  <select
    value={value}
    onChange={onChange}
    className={`bg-white dark:bg-slate-900/80 border ${accentColor || 'border-slate-300 dark:border-white/10'} text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 dark:focus:border-cyan-500/50 p-2 pr-8 appearance-none cursor-pointer hover:border-slate-400 dark:hover:border-slate-500/50 transition-colors bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_6px_center] bg-[length:14px] min-w-[130px]`}
  >
    {!hideAll && <option value="all">{label}</option>}
    {children}
  </select>
);
