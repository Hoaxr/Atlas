import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Search as SearchIcon, Plus, Info, Tv, Film, Star, CheckCircle2, ChevronRight, ChevronLeft, CheckSquare, Square, ListFilter } from 'lucide-react';
import MediaDetailsModal from '../components/MediaDetailsModal';
import { customAlert } from '../utils/alerts';

function MediaRow({ title, items, badgeText, isTrending = false, renderMediaCard }) {
  const scrollContainerRef = useRef(null);
  const firstIdRef = useRef(null);

  // Auto-scroll to start when new items are prepended
  useEffect(() => {
    if (items && items.length > 0 && items[0].id !== firstIdRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
    firstIdRef.current = items && items.length > 0 ? items[0].id : null;
  }, [items]);

  const scroll = (direction) => {
    if (scrollContainerRef.current) {
      const scrollAmount = window.innerWidth > 768 ? 800 : 300;
      scrollContainerRef.current.scrollBy({ left: direction === 'right' ? scrollAmount : -scrollAmount, behavior: 'smooth' });
    }
  };

  if (!items || items.length === 0) return null;
  return (
    <div className="mb-10 group/row relative">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-slate-200 flex items-center space-x-2">
          <span className="bg-gradient-to-r from-orange-400 to-pink-500 text-transparent bg-clip-text">
            {title}
          </span>
          {badgeText && (
            <span className="text-xs font-normal text-slate-500 bg-slate-900 px-2 py-1 rounded-md ml-4 border border-white/5">
              {badgeText}
            </span>
          )}
        </h2>
        <div className="flex gap-2">
           <button onClick={() => scroll('left')} className="p-2 bg-slate-900/50 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors border border-white/5 backdrop-blur-sm">
             <ChevronLeft className="w-5 h-5" />
           </button>
           <button onClick={() => scroll('right')} className="p-2 bg-slate-900/50 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors border border-white/5 backdrop-blur-sm">
             <ChevronRight className="w-5 h-5" />
           </button>
        </div>
      </div>
      
      <div ref={scrollContainerRef} className="flex overflow-x-auto gap-6 snap-x snap-mandatory pb-4 hide-scrollbar">
        {items.map(item => renderMediaCard(item, isTrending, false))}
      </div>
    </div>
  );
}

export default function Discover() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [trendingResults, setTrendingResults] = useState([]);
  const [recentResults, setRecentResults] = useState([]);
  const [recommendedResults, setRecommendedResults] = useState([]);
  const [upcomingResults, setUpcomingResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rowsMenuOpen, setRowsMenuOpen] = useState(false);
  const rowsMenuRef = useRef(null);
  
  const ROW_KEYS = ['trending', 'recent', 'upcoming', 'recommended'];
  const ROW_LABELS = { trending: 'Trending', recent: 'Recently Added', upcoming: 'In Cinemas', recommended: 'Recommended' };
  const [visibleRows, setVisibleRows] = useState(() => {
    try {
      const stored = localStorage.getItem('discoverVisibleRows');
      if (stored) return JSON.parse(stored);
    } catch {}
    return { trending: true, recent: true, upcoming: true, recommended: true };
  });

  useEffect(() => {
    localStorage.setItem('discoverVisibleRows', JSON.stringify(visibleRows));
  }, [visibleRows]);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('movies'); // 'movies' or 'shows'
  const [libraryItems, setLibraryItems] = useState(new Map()); // tmdb_id → library DB id
  const [watchedMap, setWatchedMap] = useState(new Map());
  
  // Modal state
  const [selectedMediaId, setSelectedMediaId] = useState(null);
  const [selectedMediaType, setSelectedMediaType] = useState('movie');
  const [modalAction, setModalAction] = useState('add'); // 'add' or 'details'

  // Cache data per mode so switching is instant
  const cacheRef = useRef({ movies: null, shows: null });
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [mode]);

  // Close rows menu on outside click
  useEffect(() => {
    if (!rowsMenuOpen) return;
    const handler = (e) => {
      if (rowsMenuRef.current && !rowsMenuRef.current.contains(e.target)) {
        setRowsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [rowsMenuOpen]);

  useEffect(() => {
    let interval;
    if (!query) {
      setResults([]);

      if (cacheRef.current[mode]) {
        // Cached data available — show immediately, no loading
        setTrendingResults(cacheRef.current[mode].trending);
        setRecommendedResults(cacheRef.current[mode].recommended);
        setUpcomingResults(cacheRef.current[mode].upcoming || []);
        setRecentResults(cacheRef.current[mode].recent);
        setLibraryItems(cacheRef.current[mode].libraryIds);
        setLoading(false);
      }

      // Always refresh in background
      fetchAllData();
      interval = setInterval(() => fetchAllData(true), 60000);
    } else {
      const timer = setTimeout(() => {
        executeSearch(query);
      }, 500);
      return () => clearTimeout(timer);
    }
    fetchLibrary();
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [query, mode]);

  const fetchLibrary = async () => {
    try {
      const endpoint = mode === 'movies' ? '/library/movies' : '/library/shows';
      const res = await api.get(endpoint);
      if (res.data.status === 'success') {
        const items = res.data.data;
        const itemMap = new Map(items.map(item => [item.tmdb_id, item.id]));
        const watched = new Map(items.map(item => [item.tmdb_id, !!item.watched]));
        setLibraryItems(itemMap);
        setWatchedMap(watched);
        
        // Map library format back to tmdb format for the cards
        const mappedRecent = items.slice(0, 20).map(i => ({
          ...i,
          id: i.tmdb_id,
          media_type: mode === 'movies' ? 'movie' : 'tv',
          vote_average: i.rating,
          release_date: i.year ? `${i.year}-01-01` : '',
          first_air_date: i.year ? `${i.year}-01-01` : '',
          title: i.title,
          name: i.title,
        }));
        setRecentResults(mappedRecent);
        
        // Update cache
        if (cacheRef.current[mode]) {
          cacheRef.current[mode].recent = mappedRecent;
          cacheRef.current[mode].libraryIds = itemMap;
        }
      }
    } catch (err) {
      console.error('Failed to fetch library', err);
    }
  };

  const fetchAllData = async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) setError('');
    
    try {
      const trendingEnd = mode === 'movies' ? '/trakt/trending/movies' : '/trakt/trending/shows';
      const recEnd = mode === 'movies' ? '/tmdb/recommended/movies' : '/tmdb/recommended/shows';
      
      const [trendRes, recRes, upRes] = await Promise.all([
        api.get(trendingEnd),
        api.get(recEnd),
        mode === 'movies' ? api.get('/tmdb/movies/upcoming') : Promise.resolve({ data: { status: 'success', data: [] } }),
      ]);
      
      if (trendRes.data?.status === 'success') {
        setTrendingResults(trendRes.data.data);
      }
      if (recRes.data?.status === 'success') {
        setRecommendedResults(recRes.data.data);
      }
      if (upRes.data?.status === 'success') {
        setUpcomingResults(upRes.data.data);
      }
      
      // Update cache for current mode
      cacheRef.current[mode] = {
        trending: trendRes.data?.status === 'success' ? trendRes.data.data : (cacheRef.current[mode]?.trending || []),
        recommended: recRes.data?.status === 'success' ? recRes.data.data : (cacheRef.current[mode]?.recommended || []),
        upcoming: upRes.data?.status === 'success' ? upRes.data.data : (cacheRef.current[mode]?.upcoming || []),
        recent: cacheRef.current[mode]?.recent || [],
        libraryIds: cacheRef.current[mode]?.libraryIds || new Map(),
      };
      
    } catch (err) {
      if (!isBackgroundRefresh) {
        setError(err.response?.data?.message || 'Failed to load media. Make sure APIs are configured.');
      }
    } finally {
      if (!isBackgroundRefresh) setLoading(false);
    }
  };

  const executeSearch = async (searchQuery) => {
    if (!searchQuery) return;
    
    setLoading(true);
    setError('');
    try {
      const endpoint = mode === 'movies' ? '/tmdb/search/movie' : '/tmdb/search/show';
      const res = await api.get(`${endpoint}?query=${encodeURIComponent(searchQuery)}`);
      if (res.data.status === 'success') {
        setResults(res.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || `Failed to search ${mode}. Check TMDB API key in Settings.`);
    } finally {
      setLoading(false);
    }
  };

  const searchMovies = (e) => {
    e.preventDefault();
    executeSearch(query);
  };

  const handleDetailsClick = (id, type) => {
    setSelectedMediaId(id);
    setSelectedMediaType(type);
    setModalAction('details');
  };

  const handleAddMedia = (id, type) => {
    setSelectedMediaId(id);
    setSelectedMediaType(type);
    setModalAction('add');
  };

  const renderMediaCard = (media, isTrending = false, isGrid = false) => {
    if (!media) return null;

    const title = media.title || media.name;
    const releaseYear = (media.release_date || media.first_air_date || '')?.split('-')[0] || 'Unknown';
    const rating = media.vote_average ? media.vote_average.toFixed(1) : '?';
    const watchers = media.watchers;
    const poster = media.poster_path ? (media.poster_path.startsWith('http') ? media.poster_path : `https://image.tmdb.org/t/p/w500${media.poster_path}`) : null;
    const tmdbId = media.id || (media.ids && media.ids.tmdb);
    const keyId = tmdbId || media.title || media.name || index; // Fallback to title, name, or index
    const isInLibrary = tmdbId ? libraryItems.has(tmdbId) : false;
    const displayType = media.media_type === 'tv' ? 'show' : media.media_type === 'movie' ? 'movie' : mode === 'movies' ? 'movie' : 'show';

    const cardClass = isGrid 
      ? "glass-panel rounded-xl overflow-hidden group hover:scale-[1.02] transition-transform duration-300 relative"
      : "flex-none w-48 sm:w-56 glass-panel rounded-xl overflow-hidden group hover:scale-[1.02] transition-transform duration-300 relative snap-start";

    return (
      <div key={keyId} className={cardClass}>
        
        {isInLibrary && (
          <div className="absolute top-2 left-2 z-20 bg-slate-900/80 rounded-full shadow-lg" title="In Library">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 fill-emerald-400/20" />
          </div>
        )}

        {isTrending && watchers && (
          <div className="absolute top-2 right-2 z-20 bg-slate-950/80 backdrop-blur text-xs font-bold px-2 py-1 rounded-md text-orange-400 border border-orange-500/30 shadow-lg">
            🔥 {watchers} watching
          </div>
        )}

        <div className="aspect-[2/3] relative bg-slate-800">
          {watchedMap.get(tmdbId) ? (
            <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1 bg-slate-950/80 backdrop-blur px-2 py-1 rounded-md border border-emerald-500/30 shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span className="text-[10px] font-bold text-emerald-400">Watched</span>
            </div>
          ) : null}
          {poster ? (
            <img 
              src={poster} 
              alt={title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500 text-center p-4">No Image</div>
          )}
          
          <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-3 p-4 z-10">
            {!isInLibrary ? (
              <button 
                onClick={() => handleAddMedia(tmdbId, displayType)}
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 w-full py-2 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg"
              >
                <Plus className="w-4 h-4" /> Add {mode === 'movies' ? 'Movie' : 'Show'}
              </button>
            ) : (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  const libraryId = libraryItems.get(tmdbId);
                  navigate(displayType === 'movie' ? `/movies/${libraryId}` : `/shows/${libraryId}`);
                }}
                className="bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors text-emerald-400 border border-emerald-500/30 w-full py-2 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" /> In Library
              </button>
            )}
          </div>
        </div>
        <div className="p-4 relative z-20 bg-slate-900/90 border-t border-white/5">
          <h3 className="font-bold text-slate-200 truncate" title={title}>{title}</h3>
          <div className="flex justify-between items-center mt-1">
            <p className="text-sm text-slate-400 font-medium">{releaseYear}</p>
            {rating !== '?' && (
              <div className="flex items-center gap-1.5 bg-slate-950/50 px-2.5 py-0.5 rounded-lg border border-white/5 shadow-inner">
                <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                <span className="text-sm font-bold text-slate-200">{rating}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const isDiscovering = !query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
            <SearchIcon className="w-8 h-8 text-emerald-400" /> Discover
          </h1>
          <p className="text-slate-400 mt-1">Search and add new media to your library.</p>
        </div>
        
        {/* Mode Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/5 shadow-inner">
            <button 
              onClick={() => setMode('movies')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${mode === 'movies' ? 'bg-cyan-500/20 text-cyan-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Film className="w-4 h-4" /> <span>Movies</span>
            </button>
            <button 
              onClick={() => setMode('shows')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${mode === 'shows' ? 'bg-purple-500/20 text-purple-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Tv className="w-4 h-4" /> <span>TV Shows</span>
            </button>
          </div>
          
          {/* Row visibility options */}
          {isDiscovering && !loading && (
            <div ref={rowsMenuRef} className="relative">
              <button
                onClick={() => setRowsMenuOpen(!rowsMenuOpen)}
                className={`p-2 rounded-xl transition-colors ${rowsMenuOpen ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                title="Toggle rows"
              >
                <ListFilter className="w-5 h-5" />
              </button>
              {rowsMenuOpen && (
                <div className="absolute right-0 top-full mt-3 w-52 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-[60] overflow-hidden text-sm">
                  <div className="p-2 border-b border-white/5 font-semibold text-slate-300">Visible Rows</div>
                  <div className="p-2 flex flex-col gap-1">
                    {ROW_KEYS.filter(k => k !== 'upcoming' || mode === 'movies').map(key => (
                      <label key={key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded cursor-pointer" onClick={(e) => { e.preventDefault(); setVisibleRows(prev => ({ ...prev, [key]: !prev[key] })); }}>
                        {visibleRows[key] ? (
                          <CheckSquare className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        )}
                        <span className="text-slate-300 select-none">{ROW_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6 shadow-2xl">
        <form onSubmit={searchMovies} className="flex gap-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by title, IMDb ID (e.g. tt1234567), or TMDB ID..."
              className="glass-input w-full !pl-12 h-12 text-lg shadow-inner"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </form>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl">
          {error}
        </div>
      )}

      {isDiscovering && !error && (
        <div className="mt-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-4">
              <div className="w-8 h-8 border-2 border-cyan-500/50 border-t-cyan-400 rounded-full animate-spin" />
              <p className="text-sm font-medium">Loading data...</p>
            </div>
          ) : (
            <>
              <MediaRow title="Trending Right Now" items={trendingResults} badgeText="Powered by Trakt.tv" isTrending={true} renderMediaCard={renderMediaCard} />
              {visibleRows.recent && <MediaRow title="Recently Added" items={recentResults} badgeText="From your library" renderMediaCard={renderMediaCard} />}
              {visibleRows.upcoming && <MediaRow title="In Cinemas & Upcoming" items={upcomingResults} badgeText="Powered by TMDB" renderMediaCard={renderMediaCard} />}
              {visibleRows.recommended && <MediaRow title="Recommended For You" items={recommendedResults} badgeText="Powered by TMDB" renderMediaCard={renderMediaCard} />}
            </>
          )}
        </div>
      )}

      {!isDiscovering && results.length > 0 && (
        <div className="mt-8">
           <h2 className="text-xl font-bold text-slate-200 flex items-center space-x-2 mb-6">
             <span className="bg-gradient-to-r from-cyan-400 to-blue-500 text-transparent bg-clip-text">
               Search Results
             </span>
           </h2>
           <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
             {results.map((item) => renderMediaCard(item, false, true))}
           </div>
        </div>
      )}

      <MediaDetailsModal 
        isOpen={!!selectedMediaId}
        onClose={() => setSelectedMediaId(null)}
        mediaId={selectedMediaId}
        mediaType={selectedMediaType}
        isInLibrary={selectedMediaId ? libraryItems.has(selectedMediaId) : false}
        libraryId={selectedMediaId ? libraryItems.get(selectedMediaId) : null}
        mode={modalAction}
        onAdded={(tmdbId, details) => {
          setLibraryItems(prev => new Map(prev).set(tmdbId, null));
          // Immediately prepend to Recently Added using the TMDB data we already have
          if (details) {
            const newItem = {
              id: details.id,
              tmdb_id: details.id,
              media_type: mode === 'movies' ? 'movie' : 'tv',
              title: details.title || details.name,
              name: details.title || details.name,
              poster_path: details.poster_path,
              vote_average: details.vote_average,
              rating: details.vote_average,
              year: details.release_date ? parseInt(details.release_date.split('-')[0]) : (details.first_air_date ? parseInt(details.first_air_date.split('-')[0]) : null),
              release_date: details.release_date || '',
              first_air_date: details.first_air_date || '',
              overview: details.overview,
            };
            setRecentResults(prev => [newItem, ...prev].slice(0, 20));
          }
          fetchLibrary();
        }}
      />
    </div>
  );
}
