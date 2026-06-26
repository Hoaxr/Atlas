import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { Activity, Film, Tv, Search, CheckCircle2, AlertCircle, Bookmark, BookmarkMinus, LayoutGrid, List, Star, Info, X, RotateCcw, Filter as FilterIcon, CheckSquare, Square, Trash2, FolderOpen } from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';
import { cachedMovies, cachedShows, setCachedMovies, setCachedShows } from '../lib/libraryCache';
import { formatSize, formatSpeed } from '../lib/format';
import { useSettings } from '../lib/useSettings';

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
  
  const viewMode = location.pathname.includes('shows') ? 'shows' : 'movies';
  const [searchParams] = useSearchParams();

  const scopeKey = (key) => `dashboard${viewMode === 'movies' ? 'Movies' : 'Shows'}${key}`;

  const [statusFilter, setStatusFilter] = useState(() => localStorage.getItem(scopeKey('StatusFilter')) || 'all');
  const [watchedFilter, setWatchedFilter] = useState(() => localStorage.getItem(scopeKey('WatchedFilter')) || 'all');
  const [genreFilter, setGenreFilter] = useState(() => localStorage.getItem(scopeKey('GenreFilter')) || 'all');
  const [qualityFilter, setQualityFilter] = useState(() => localStorage.getItem(scopeKey('QualityFilter')) || 'all');
  const [yearFilter, setYearFilter] = useState(() => localStorage.getItem(scopeKey('YearFilter')) || 'all');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [sort, setSort] = useState(() => localStorage.getItem(scopeKey('Sort')) || 'added_desc');
  const [viewStyle, setViewStyle] = useState(() => localStorage.getItem('dashboardViewStyle') || 'grid');
  const [searchQuery, setSearchQuery] = useState('');
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
    localStorage.setItem(scopeKey('YearFilter'), yearFilter);
  }, [yearFilter]);

  useEffect(() => {
    localStorage.setItem(scopeKey('Sort'), sort);
  }, [sort]);

  // Reset filters when switching between movies and shows
  useEffect(() => {
    setStatusFilter(() => localStorage.getItem(scopeKey('StatusFilter')) || 'all');
    setWatchedFilter(() => localStorage.getItem(scopeKey('WatchedFilter')) || 'all');
    setGenreFilter(() => localStorage.getItem(scopeKey('GenreFilter')) || 'all');
    setQualityFilter(() => localStorage.getItem(scopeKey('QualityFilter')) || 'all');
    setYearFilter(() => localStorage.getItem(scopeKey('YearFilter')) || 'all');
    setSort(() => localStorage.getItem(scopeKey('Sort')) || 'added_desc');
  }, [viewMode]);

  useEffect(() => {
    // Always show cached data immediately (if available), then refresh
    fetchClientData();

    const startPolling = () => setInterval(fetchClientData, 3000);
    let interval = startPolling();

    // Fetch current view first — faster initial render for what user sees
    fetchViewData(viewMode, false);
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
      items = items.filter(item => item.year == yearFilter);
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
      return 0;
    });

    return items;
  }, [allItems, searchQuery, statusFilter, watchedFilter, yearFilter, genreFilter, qualityFilter, ratingFilter, sort]);

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
  if (ratingFilter !== 'all') activeFilters.push({ key: 'rating', label: `Rating: ${ratingFilter}` });

  const clearFilter = (key) => {
    if (key === 'search') setSearchQuery('');
    if (key === 'year') setYearFilter('all');
    if (key === 'status') setStatusFilter('all');
    if (key === 'watched') setWatchedFilter('all');
    if (key === 'genre') setGenreFilter('all');
    if (key === 'quality') setQualityFilter('all');
    if (key === 'rating') setRatingFilter('all');
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setYearFilter('all');
    setStatusFilter('all');
    setWatchedFilter('all');
    setGenreFilter('all');
    setQualityFilter('all');
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

          {/* Filter Dropdowns Row */}
          <div className="flex flex-wrap items-center gap-2 p-4 pb-3">
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

          {/* Genre Chips Row */}
          {allGenres.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
              <FilterIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
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

        {/* Select All checkbox — list view only */}
        {viewStyle === 'list' && (
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={toggleSelectAll}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            title="Select All"
          >
            {selectedIds.size === displayItems.length && displayItems.length > 0 ? (
              <CheckSquare className="w-5 h-5 text-cyan-400" />
            ) : selectedIds.size > 0 ? (
              <div className="w-5 h-5 rounded border-2 border-cyan-400/50 bg-cyan-400/20" />
            ) : (
              <Square className="w-5 h-5 text-slate-400 dark:text-slate-600" />
            )}
          </button>
          <span className="text-xs text-slate-500">
            {selectedIds.size > 0 ? `${selectedIds.size} of ${displayItems.length} selected` : `${displayItems.length} item${displayItems.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        )}
        {displayItems.length > 0 ? (
          viewStyle === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {displayItems.map(item => (
                <div 
                  key={item.id} 
                  className={`glass-panel rounded-xl overflow-hidden group hover:scale-[1.02] transition-transform duration-300 relative flex flex-col`}
                >
                  <div className="absolute top-2 left-2 z-20">
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation();
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
                                e.stopPropagation(); 
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
                                e.stopPropagation(); 
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
                            e.stopPropagation();
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
                  <th className="py-3 px-2 font-medium w-8"></th>
                  <th className="py-3 px-4 font-medium">Title</th>
                  <th className="py-3 px-4 font-medium w-24">Year</th>
                  <th className="py-3 px-4 font-medium w-32">Rating</th>
                  <th className="py-3 px-4 font-medium w-28">Size</th>
                  <th className="py-3 px-4 font-medium w-32">Status</th>
                  <th className="py-3 px-4 font-medium w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {displayItems.map(item => (
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
                            e.stopPropagation();
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
                    <td className="py-2.5 px-4 text-slate-400 text-sm">
                      {item.year}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 text-sm font-medium">
                      {item.rating > 0 ? (
                        <div className="flex items-center gap-1.5 w-fit bg-slate-950/50 px-2.5 py-0.5 rounded-lg border border-white/5 shadow-inner">
                          <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                          <span className="text-sm font-bold text-slate-600 dark:text-slate-200">{Number(item.rating).toFixed(1)}</span>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-sm text-slate-400 font-mono">
                      {formatSize(item.file_size || item.folder_size)}
                    </td>
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
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        {item.status === 'monitored' && (
                          <>
                            <button 
                              onClick={async (e) => { 
                                e.stopPropagation(); 
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
                                e.stopPropagation(); 
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
                        )}
                        {item.status === 'downloaded' && (
                          <span className="text-[10px] text-slate-600 italic px-1">Downloaded</span>
                        )}
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
          <div className="flex flex-col items-center justify-center h-[300px] text-slate-500 border-2 border-dashed border-slate-700/50 rounded-xl">
            {viewMode === 'movies' ? <Film className="w-12 h-12 mb-4 opacity-50" /> : <Tv className="w-12 h-12 mb-4 opacity-50" />}
            <p>No {viewMode === 'movies' ? 'movies' : 'TV shows'} in your library yet.</p>
            <p className="text-sm mt-1">Add them from the Discover page or scan your NAS in Settings.</p>
          </div>
        )}
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
