import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { Search as SearchIcon, Plus, Tv, Film, Star, CheckCircle2, CheckSquare, ListFilter, Eye } from 'lucide-react';
import MediaDetailsModal from '../components/MediaDetailsModal';
import MediaRow from '../components/MediaRow';
import InlineError from '../components/shared/InlineError';
import { useOutsideClick } from '../lib/useOutsideClick';



export default function Discover() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'shows' ? 'shows' : 'movies';
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState([]);
  const [trendingResults, setTrendingResults] = useState([]);
  const [recentResults, setRecentResults] = useState([]);
  const [recommendedResults, setRecommendedResults] = useState([]);
  const [upcomingResults, setUpcomingResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [rowsMenuOpen, setRowsMenuOpen] = useState(false);
  const rowsMenuRef = useOutsideClick(() => setRowsMenuOpen(false), rowsMenuOpen);

  const ROW_KEYS = ['recent', 'trending', 'upcoming', 'recommended'];
  const ROW_LABELS = { trending: 'Trending', recent: 'Recently Added', upcoming: 'In Cinemas', recommended: 'Recommended' };
  const [visibleRows, setVisibleRows] = useState(() => {
    try {
      const stored = localStorage.getItem('discoverVisibleRows');
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return { trending: true, recent: true, upcoming: true, recommended: true };
  });

  useEffect(() => {
    localStorage.setItem('discoverVisibleRows', JSON.stringify(visibleRows));
  }, [visibleRows]);
  const [error, setError] = useState('');
  const [mode, setMode] = useState(initialMode); // 'movies' or 'shows'
  const [libraryItems, setLibraryItems] = useState(new Map()); // tmdb_id → library DB id
  const [watchedMap, setWatchedMap] = useState(new Map());
  
  // Modal state
  const [selectedMediaId, setSelectedMediaId] = useState(null);
  const [selectedMediaType, setSelectedMediaType] = useState('movie');
  const [modalAction, setModalAction] = useState('add'); // 'add' or 'details'

  // Cache data per mode so switching is instant
  const cacheRef = useRef({ movies: null, shows: null });

  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null && q !== query) {
      setQuery(q);
    }
  }, [searchParams]);


  // Close rows menu on outside click — handled by useOutsideClick hook above

  useEffect(() => {
    let interval;
    let searchTimer;
    
    if (!query) {
      setIsTyping(false);
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

      // Fire requests concurrently. Don't block the UI for the slowest request.
      const loadInitialData = async () => {
        const hasCache = !!cacheRef.current[mode];
        if (!hasCache) {
          setLoading(true);
        }
        
        const libraryPromise = fetchLibrary();
        const allDataPromise = fetchAllData();
        
        if (!hasCache) {
          // Wait for both library and external TMDB data to load before hiding the overlay
          // This prevents the spinner from flashing and hiding too early.
          await Promise.all([libraryPromise, allDataPromise]);
          setLoading(false);
        }
      };
      
      loadInitialData();

      interval = setInterval(() => {
        fetchLibrary();
        fetchAllData(true);
      }, 60000);
    } else {
      setIsTyping(true);
      searchTimer = setTimeout(() => {
        executeSearch(query);
      }, 500);
    }
    
    return () => {
      if (interval) clearInterval(interval);
      if (searchTimer) clearTimeout(searchTimer);
    };
    // fetchLibrary/fetchAllData/executeSearch read only query & mode, both already deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode]);

  const fetchLibrary = async () => {
    try {
      // Use ?badges=true to skip expensive subtitle scanning on movies
      const endpoint = mode === 'movies' ? '/library/movies?badges=true' : '/library/shows';
      const [libRes, watchedRes] = await Promise.all([
        api.get(endpoint),
        api.get('/library/watched-tmdb'),
      ]);
      if (libRes.data.status === 'success') {
        const items = libRes.data.data;
        const itemMap = new Map(items.map(item => [item.tmdb_id, item.id]));
        const watched = new Map(items.map(item => [item.tmdb_id, !!item.watched]));
        // Merge persistent watched_tmdb entries (survives library deletion)
        if (watchedRes.data.status === 'success') {
          for (const entry of watchedRes.data.data) {
            if (!watched.has(entry.tmdb_id)) {
              watched.set(entry.tmdb_id, true);
            }
          }
        }
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
    
    const trendingEnd = mode === 'movies' ? '/tmdb/trending/movies' : '/tmdb/trending/shows';
    const recEnd = mode === 'movies' ? '/tmdb/recommended/movies' : '/tmdb/recommended/shows';
    const upcomingEnd = mode === 'movies' ? '/tmdb/movies/upcoming' : '/tmdb/shows/upcoming';

    // Fire all requests — each updates state independently as it resolves
    const setters = [
      api.get(trendingEnd).then(res => {
        if (res.data?.status === 'success') setTrendingResults(res.data.data);
        return res;
      }),
      api.get(recEnd).then(res => {
        if (res.data?.status === 'success') setRecommendedResults(res.data.data);
        return res;
      }),
      api.get(upcomingEnd).then(res => {
        if (res.data?.status === 'success') setUpcomingResults(res.data.data);
        return res;
      }),
    ];

    try {
      const results = await Promise.all(setters.map(p => p.catch(() => null)));
      
      cacheRef.current[mode] = {
        trending: results[0]?.data?.status === 'success' ? results[0].data.data : (cacheRef.current[mode]?.trending || []),
        recommended: results[1]?.data?.status === 'success' ? results[1].data.data : (cacheRef.current[mode]?.recommended || []),
        upcoming: results[2]?.data?.status === 'success' ? results[2].data.data : (cacheRef.current[mode]?.upcoming || []),
        recent: cacheRef.current[mode]?.recent || [],
        libraryIds: cacheRef.current[mode]?.libraryIds || new Map(),
      };
    } catch (err) {
      if (!isBackgroundRefresh) {
        setError(err.response?.data?.message || 'Failed to load media.');
      }
    }
  };

  const executeSearch = async (searchQuery) => {
    if (!searchQuery) return;
    
    setIsTyping(false);
    setLoading(true);
    setError('');
    try {
      const endpoint = mode === 'movies' ? '/tmdb/search/movie' : '/tmdb/search/show';
      const [res] = await Promise.all([
        api.get(`${endpoint}?query=${encodeURIComponent(searchQuery)}`),
        fetchLibrary(),
      ]);
      if (res.data.status === 'success') {
        setResults(res.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || `Failed to search ${mode}. Check TMDB API key in Settings.`);
    } finally {
      setLoading(false);
    }
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
    const tmdbId = media.ids?.tmdb || media.id;
    const keyId = tmdbId || media.title || media.name || Math.random().toString();
    const isInLibrary = tmdbId ? libraryItems.has(tmdbId) : false;
    const displayType = media.media_type === 'tv' ? 'show' : media.media_type === 'movie' ? 'movie' : mode === 'movies' ? 'movie' : 'show';

    const cardClass = isGrid 
      ? "rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden group hover:border-slate-700 transition-all duration-200 relative"
      : "flex-none w-40 sm:w-44 rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden group hover:border-slate-700 transition-all duration-200 relative snap-start";

    return (
      <div key={keyId} className={cardClass}>
        
        {isInLibrary && (
          <div className="absolute top-2 left-2 z-20 bg-slate-900/80 rounded-full shadow-lg flex items-center justify-center group-hover:opacity-0 transition-opacity duration-200" title="In Library">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 fill-emerald-400/20" />
          </div>
        )}

        {isTrending && watchers && (
          <div className="absolute top-2 right-2 z-20 bg-slate-950/80 backdrop-blur text-xs font-bold px-2 py-1 rounded-md text-orange-400 border border-orange-500/30 shadow-lg group-hover:opacity-0 transition-opacity duration-200">
            🔥 {watchers} watching
          </div>
        )}

        <div className="aspect-[2/3] relative bg-slate-800">
          {watchedMap.get(tmdbId) ? (
            <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1 bg-slate-950/80 backdrop-blur px-2 py-1 rounded-md border border-emerald-500/30 shadow-lg group-hover:opacity-0 transition-opacity duration-200">
              <Eye className="w-3 h-3 text-emerald-400" />
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
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 w-full py-1.5 px-2 text-sm rounded-lg font-bold flex items-center justify-center gap-1.5 shadow-lg"
              >
                <Plus className="w-4 h-4 flex-shrink-0" /> Add {mode === 'movies' ? 'Movie' : 'Show'}
              </button>
            ) : (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  const libraryId = libraryItems.get(tmdbId);
                  navigate(displayType === 'movie' ? `/movies/${libraryId}` : `/shows/${libraryId}`);
                }}
                className="bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors text-emerald-400 border border-emerald-500/30 w-full py-1.5 px-2 text-sm rounded-lg font-bold flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> In Library
              </button>
            )}
          </div>
        </div>
        <div className="p-3 relative z-20 bg-slate-800/95 border-t border-white/10">
          <h3 className="font-semibold text-sm text-slate-100 truncate tracking-wide" title={title}>{title}</h3>
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-slate-500 font-medium tracking-wider uppercase">{releaseYear}</span>
            {rating !== '?' && (
              <div className="flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                <span className="text-xs font-bold text-amber-300">{rating}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const isDiscovering = !query;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 sm:gap-3 !mb-0">
              <SearchIcon className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 shrink-0" />
              <span className="truncate">Discover</span>
            </h1>
            <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block !mb-0">
              Search and add new media to your library.
            </p>
          </div>
          
          {/* Mode Toggle & Options */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative flex items-center bg-[#101e31] p-1 rounded-xl border border-[#1c2d46] shadow-inner select-none">
              <button 
                type="button"
                onClick={() => setMode('movies')}
                className={`relative flex items-center justify-center gap-2.5 px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors duration-150 ${
                  mode === 'movies' ? 'text-slate-950 font-bold' : 'text-slate-100 hover:text-white'
                }`}
              >
                {mode === 'movies' && (
                  <motion.div
                    layoutId="discover-mode-slider"
                    className="absolute inset-0 rounded-lg bg-gradient-to-b from-[#38a7f4] to-[#2291ea] shadow-sm"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <Film className={`relative z-10 w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0 transition-colors duration-150 ${mode === 'movies' ? 'text-slate-950' : 'text-slate-100'}`} />
                <span className="relative z-10 hidden sm:inline">Movies</span>
              </button>
              <button 
                type="button"
                onClick={() => setMode('shows')}
                className={`relative flex items-center justify-center gap-2.5 px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors duration-150 ${
                  mode === 'shows' ? 'text-slate-950 font-bold' : 'text-slate-100 hover:text-white'
                }`}
              >
                {mode === 'shows' && (
                  <motion.div
                    layoutId="discover-mode-slider"
                    className="absolute inset-0 rounded-lg bg-gradient-to-b from-[#38a7f4] to-[#2291ea] shadow-sm"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <Tv className={`relative z-10 w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0 transition-colors duration-150 ${mode === 'shows' ? 'text-slate-950' : 'text-slate-100'}`} />
                <span className="relative z-10 hidden sm:inline">TV Shows</span>
              </button>
            </div>
            
            {/* Row visibility options */}
            {isDiscovering && !loading && (
              <div ref={rowsMenuRef} className="relative">
                <button
                  onClick={() => setRowsMenuOpen(!rowsMenuOpen)}
                  className={`h-10 w-10 flex items-center justify-center rounded-xl border transition-all duration-150 ${
                    rowsMenuOpen 
                      ? 'bg-gradient-to-b from-[#38a7f4] to-[#2291ea] text-slate-950 shadow-sm border-transparent' 
                      : 'bg-[#101e31] border border-[#1c2d46] text-slate-100 hover:text-white hover:border-slate-600 shadow-sm'
                  }`}
                  title="Toggle visible rows"
                  aria-label="Toggle visible rows"
                >
                  <ListFilter className="w-5 h-5" />
                </button>
                {rowsMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-[#0e1a2b] border border-[#1c2d46] rounded-xl shadow-2xl z-[60] overflow-hidden">
                    <div className="px-3.5 py-2 border-b border-[#1c2d46] text-[10px] font-bold text-slate-400 uppercase tracking-wider">Visible Rows</div>
                    <div className="p-1.5 flex flex-col gap-0.5">
                      {ROW_KEYS.filter(k => k !== 'upcoming' || mode === 'movies').map(key => (
                        <label key={key} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors group" onClick={(e) => { e.preventDefault(); setVisibleRows(prev => ({ ...prev, [key]: !prev[key] })); }}>
                          {visibleRows[key] ? (
                            <div className="w-3.5 h-3.5 rounded bg-[#0d2b51] border border-[#1f4e82] flex items-center justify-center">
                              <CheckSquare className="w-3 h-3 text-cyan-400" />
                            </div>
                          ) : (
                            <div className="w-3.5 h-3.5 rounded bg-slate-900 border border-slate-700 group-hover:border-slate-600 transition-colors" />
                          )}
                          <span className="text-xs text-slate-300 capitalize select-none group-hover:text-slate-100 transition-colors">{ROW_LABELS[key]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>



      {error && (
        <InlineError message={error} />
      )}

      {isDiscovering && !error && (
        <div className="mt-2 relative min-h-[calc(100vh-200px)]">
          {loading && (
            <div className="absolute inset-0 z-30 bg-slate-50 dark:bg-[#0a1320] text-slate-400">
              <div className="sticky top-[40vh] flex flex-col items-center justify-center gap-4 text-slate-400">
                <div className="w-8 h-8 border-2 border-cyan-500/50 border-t-cyan-400 rounded-full animate-spin" />
                <p className="text-sm font-medium">Loading data...</p>
              </div>
            </div>
          )}
          
          <div
            className="transition-opacity duration-200"
            style={{
              opacity: loading ? 0 : 1,
              pointerEvents: loading ? 'none' : 'auto',
            }}
          >
            {visibleRows.recent && <MediaRow title="Recently Added" items={recentResults} badgeText="From your library" renderMediaCard={renderMediaCard} />}
            {visibleRows.trending && <MediaRow title="Trending Right Now" items={trendingResults} badgeText="Powered by TMDB" isTrending={true} renderMediaCard={renderMediaCard} />}
            {visibleRows.upcoming && <MediaRow title={mode === 'movies' ? "In Cinemas & Upcoming" : "Upcoming Shows"} items={upcomingResults} badgeText="Powered by TMDB" renderMediaCard={renderMediaCard} />}
            {visibleRows.recommended && <MediaRow title="Recommended For You" items={recommendedResults} badgeText="Powered by TMDB" renderMediaCard={renderMediaCard} />}
          </div>
        </div>
      )}

      {!isDiscovering && (loading || isTyping) && (
        <div className="mt-16 flex flex-col items-center justify-center text-slate-500 min-h-[50vh]">
          <div className="w-8 h-8 border-2 border-cyan-500/50 border-t-cyan-400 rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium">Searching...</p>
        </div>
      )}

      {!isDiscovering && results.length > 0 && !(loading || isTyping) && (
        <div className="mt-8 min-h-[50vh]">
           <h2 className="text-base sm:text-lg font-bold text-slate-100 mb-4">
             Search Results
           </h2>
           <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3 sm:gap-4">
             {results.map((item) => renderMediaCard(item, false, true))}
           </div>
        </div>
      )}

      {!isDiscovering && results.length === 0 && !loading && !isTyping && !error && (
        <div className="mt-16 flex flex-col items-center justify-center text-slate-500 min-h-[50vh]">
           <SearchIcon className="w-16 h-16 mb-4 text-slate-600/50" />
           <p className="text-xl font-medium text-slate-400">No results found for "{query}"</p>
           <p className="text-sm mt-2 text-slate-500">Try adjusting your search terms</p>
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
