import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { Search as SearchIcon, Plus, Tv, Film, Star, CheckCircle2, Check, ListFilter, Eye, LayoutGrid, Grid3x3, Calendar, DownloadCloud } from 'lucide-react';
import MediaDetailsModal from '../components/MediaDetailsModal';
import MediaRow from '../components/MediaRow';
import InlineError from '../components/shared/InlineError';
import { useOutsideClick } from '../lib/useOutsideClick';
import useWebSocket from '../lib/useWebSocket';
import { setCachedMovies, setCachedShows } from '../lib/libraryCache';
import { invalidateLibraryIndex } from '../lib/libraryIndex';



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

  const [posterSize, setPosterSize] = useState(() => {
    try {
      const saved = localStorage.getItem('discoverPosterSize') || localStorage.getItem('dashboardPosterSize');
      if (saved) {
        const parsed = Number(saved);
        if (!isNaN(parsed) && parsed >= 80 && parsed <= 260) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return 180;
  });

  useEffect(() => {
    try {
      localStorage.setItem('discoverPosterSize', String(posterSize));
    } catch {
      // ignore
    }
  }, [posterSize]);

  const sliderPercent = Math.min(100, Math.max(0, ((posterSize - 90) / (240 - 90)) * 100));

  const cardScale = useMemo(() => {
    const t = Math.min(1, Math.max(0, (posterSize - 90) / (240 - 90)));
    return {
      badgeSize: Math.round((22 + t * 14) / 2) * 2,        // 22px at 90 -> 36px at 240 (always even)
      badgeIconSize: Math.round((12 + t * 8) / 2) * 2,     // 12px at 90 -> 20px at 240 (always even)
      cornerOffset: Math.round(4 + t * 6),       // 4px at 90 -> 10px at 240
      dockBtnSize: Math.round(24 + t * 20),      // 24px at 90 -> 44px at 240
      dockIconSize: Math.round(12 + t * 8),      // 12px at 90 -> 20px at 240
      isCompact: posterSize <= 140,
    };
  }, [posterSize]);

  const [error, setError] = useState('');
  const [mode, setMode] = useState(initialMode); // 'movies' or 'shows'
  const [libraryItems, setLibraryItems] = useState(new Map()); // tmdb_id → library DB id
  const [watchedMap, setWatchedMap] = useState(new Map());
  const [downloadedSet, setDownloadedSet] = useState(new Set());
  
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

  const { onEvent } = useWebSocket();
  useEffect(() => {
    return onEvent((data) => {
      if (
        data.type === 'MOVIE_ADDED' ||
        data.type === 'SHOW_ADDED' ||
        (data.message && data.message.toLowerCase().includes('scan complete'))
      ) {
        fetchLibrary();
      }
    });
  }, [onEvent, mode]);

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
        setLibraryItems(cacheRef.current[mode].libraryIds || new Map());
        setWatchedMap(cacheRef.current[mode].watchedMap || new Map());
        setDownloadedSet(cacheRef.current[mode].downloadedIds || new Set());
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
      // Use ?badges=true to skip expensive subtitle scanning on movies, add cache-buster
      const endpoint = mode === 'movies' ? `/library/movies?badges=true&_t=${Date.now()}` : `/library/shows?_t=${Date.now()}`;
      const [libRes, watchedRes] = await Promise.all([
        api.get(endpoint),
        api.get('/library/watched-tmdb'),
      ]);
      if (libRes.data.status === 'success') {
        const items = libRes.data.data;
        const itemMap = new Map();
        const watched = new Map();
        const downloaded = new Set();

        for (const item of items) {
          if (item.tmdb_id !== null && item.tmdb_id !== undefined) {
            itemMap.set(item.tmdb_id, item.id);
            itemMap.set(Number(item.tmdb_id), item.id);
            itemMap.set(String(item.tmdb_id), item.id);

            if (item.watched) {
              watched.set(item.tmdb_id, true);
              watched.set(Number(item.tmdb_id), true);
              watched.set(String(item.tmdb_id), true);
            }

            if (
              item.status === 'downloaded' || 
              (item.file_path && item.file_path.trim() !== '') ||
              (item.downloaded_episodes && item.downloaded_episodes > 0) ||
              (item.file_size && item.file_size > 0)
            ) {
              downloaded.add(item.tmdb_id);
              downloaded.add(Number(item.tmdb_id));
              downloaded.add(String(item.tmdb_id));
            }
          }
        }

        // Merge persistent watched_tmdb entries (survives library deletion)
        if (watchedRes.data.status === 'success') {
          for (const entry of watchedRes.data.data) {
            if (entry.tmdb_id !== null && entry.tmdb_id !== undefined) {
              watched.set(entry.tmdb_id, true);
              watched.set(Number(entry.tmdb_id), true);
              watched.set(String(entry.tmdb_id), true);
            }
          }
        }
        setLibraryItems(itemMap);
        setWatchedMap(watched);
        setDownloadedSet(downloaded);
        
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
          cacheRef.current[mode].watchedMap = watched;
          cacheRef.current[mode].downloadedIds = downloaded;
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
        watchedMap: cacheRef.current[mode]?.watchedMap || new Map(),
        downloadedIds: cacheRef.current[mode]?.downloadedIds || new Set(),
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

  const getProbableDownloadInfo = (media) => {
    if (!media) return null;

    let targetDateStr = media.digital_release_date || media.estimated_download_date;
    let isConfirmed = !!media.digital_release_date;

    if (!targetDateStr) {
      if (media.release_date) {
        const parts = media.release_date.split('-').map(Number);
        if (parts.length === 3 && !parts.some(isNaN)) {
          const d = new Date(parts[0], parts[1] - 1, parts[2]);
          d.setDate(d.getDate() + 45); // standard theatrical-to-digital estimate (~45 days)
          const y = d.getFullYear();
          const mo = String(d.getMonth() + 1).padStart(2, '0');
          const da = String(d.getDate()).padStart(2, '0');
          targetDateStr = `${y}-${mo}-${da}`;
        }
      } else if (media.first_air_date) {
        targetDateStr = media.first_air_date.split('T')[0];
        isConfirmed = true;
      }
    }

    if (!targetDateStr) return null;
    const parts = targetDateStr.split('T')[0].split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;

    const targetDate = new Date(parts[0], parts[1] - 1, parts[2]);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (targetDate <= now) {
      return {
        isAvailable: true,
        text: 'Available Now',
        shortText: 'Available',
        dateStr: targetDateStr,
      };
    }

    const isThisYear = targetDate.getFullYear() === now.getFullYear();
    const shortMonth = targetDate.toLocaleDateString(undefined, { month: 'short' });
    const day = targetDate.getDate();
    const year = targetDate.getFullYear();

    const formattedDate = isThisYear ? `${shortMonth} ${day}` : `${shortMonth} ${day}, ${year}`;
    const prefix = isConfirmed ? '' : '~';

    return {
      isAvailable: false,
      text: `${prefix}${formattedDate}`,
      shortText: `${prefix}${shortMonth} ${day}`,
      dateStr: targetDateStr,
    };
  };

  const renderMediaCard = (media, isTrending = false, isGrid = false, isUpcoming = false) => {
    if (!media) return null;

    const title = media.title || media.name;
    const releaseYear = (media.release_date || media.first_air_date || '')?.split('-')[0] || 'Unknown';
    const rating = Number(media.vote_average || media.rating) > 0 ? Number(media.vote_average || media.rating).toFixed(1) : 'N/A';
    const watchers = media.watchers;
    const poster = media.poster_path ? (media.poster_path.startsWith('http') ? media.poster_path : `https://image.tmdb.org/t/p/w500${media.poster_path}`) : null;
    const tmdbId = media.ids?.tmdb || media.id;
    const keyId = tmdbId || media.title || media.name || Math.random().toString();
    const isInLibrary = tmdbId ? (libraryItems.has(tmdbId) || libraryItems.has(Number(tmdbId)) || libraryItems.has(String(tmdbId))) : false;
    const isDownloaded = tmdbId ? (
      downloadedSet.has(tmdbId) || 
      downloadedSet.has(Number(tmdbId)) || 
      downloadedSet.has(String(tmdbId)) || 
      media.status === 'downloaded' ||
      Boolean(media.file_path && media.file_path.trim() !== '') ||
      Boolean(media.downloaded_episodes && media.downloaded_episodes > 0)
    ) : false;
    const downloadInfo = (isUpcoming && !isDownloaded) ? getProbableDownloadInfo(media) : null;
    const displayType = media.media_type === 'tv' ? 'show' : media.media_type === 'movie' ? 'movie' : mode === 'movies' ? 'movie' : 'show';

    const isCompact = posterSize <= 140;

    const cardClass = isGrid 
      ? "rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden group hover:border-slate-700 transition-all duration-200 relative w-full"
      : "flex-none rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden group hover:border-slate-700 transition-all duration-200 relative snap-start";

    const handleCardClick = () => {
      if (isInLibrary) {
        const libraryId = libraryItems.get(tmdbId);
        if (libraryId) {
          navigate(displayType === 'movie' ? `/movies/${libraryId}` : `/shows/${libraryId}`);
          return;
        }
      }
      setSelectedMediaId(tmdbId);
      setSelectedMediaType(displayType);
      setModalAction('details');
    };

    return (
      <div
        key={keyId}
        role="button"
        tabIndex={0}
        aria-label={`View details for ${title}`}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCardClick();
          }
        }}
        className={`${cardClass} cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50`}
        style={!isGrid ? { width: `${posterSize}px`, minWidth: `${posterSize}px` } : undefined}
      >
        
        {isInLibrary && (
          <div 
            style={{
              top: `${cardScale.cornerOffset}px`,
              left: `${cardScale.cornerOffset}px`,
              width: `${cardScale.badgeSize}px`,
              height: `${cardScale.badgeSize}px`,
            }}
            className="absolute z-20 bg-slate-900/80 rounded-full shadow-lg flex items-center justify-center group-hover:opacity-0 transition-opacity duration-200" 
            title="In Library"
          >
            <CheckCircle2 
              style={{
                width: `${cardScale.badgeIconSize}px`,
                height: `${cardScale.badgeIconSize}px`,
              }}
              className="text-emerald-400 fill-emerald-400/20" 
            />
          </div>
        )}

        {isTrending && watchers && (
          <div 
            style={{
              top: `${cardScale.cornerOffset}px`,
              right: `${cardScale.cornerOffset}px`,
            }}
            className={`absolute z-20 bg-slate-950/80 backdrop-blur font-bold rounded-md text-orange-400 border border-orange-500/30 shadow-lg group-hover:opacity-0 transition-opacity duration-200 ${
              isCompact ? 'text-[9px] px-1 py-0.5' : 'text-xs px-2 py-1'
            }`}
          >
            🔥 {watchers} {isCompact ? '' : 'watching'}
          </div>
        )}

        <div className="aspect-[2/3] relative bg-slate-800">
          {watchedMap.get(tmdbId) ? (
            <div 
              style={{
                top: !(isTrending && watchers) ? `${cardScale.cornerOffset}px` : undefined,
                bottom: (isTrending && watchers) ? `${cardScale.cornerOffset}px` : undefined,
                right: !(isTrending && watchers) ? `${cardScale.cornerOffset}px` : undefined,
                left: (isTrending && watchers) ? `${cardScale.cornerOffset}px` : undefined,
                width: `${cardScale.badgeSize}px`,
                height: `${cardScale.badgeSize}px`,
              }}
              className="absolute z-20 flex items-center justify-center rounded-full bg-slate-900/80 backdrop-blur border border-emerald-500/30 shadow-lg group-hover:opacity-0 transition-opacity duration-200" 
              title="Watched"
            >
              <Eye 
                style={{
                  width: `${cardScale.badgeIconSize}px`,
                  height: `${cardScale.badgeIconSize}px`,
                }}
                className="text-emerald-400" 
              />
            </div>
          ) : null}

          {downloadInfo && !isDownloaded && (
            <div 
              style={{
                bottom: `${cardScale.cornerOffset}px`,
                left: `${cardScale.cornerOffset}px`,
                right: `${cardScale.cornerOffset}px`,
              }}
              className="absolute z-20 pointer-events-none group-hover:opacity-0 transition-opacity duration-200"
              title={downloadInfo.isAvailable ? "Available to download now" : `Probable download release: ${downloadInfo.dateStr || downloadInfo.text}`}
            >
              <div className={`w-full backdrop-blur-md rounded-md flex items-center justify-center gap-1 shadow-lg shadow-black/80 font-bold tracking-tight truncate border ${
                downloadInfo.isAvailable
                  ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-950/90 border-cyan-500/35 text-cyan-200'
              } ${isCompact ? 'px-1 py-0.5 text-[9px]' : 'px-1.5 py-0.5 sm:py-1 text-[10px] sm:text-[11px]'}`}>
                {downloadInfo.isAvailable ? (
                  <DownloadCloud className={`${isCompact ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-emerald-400 shrink-0`} />
                ) : (
                  <Calendar className={`${isCompact ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-cyan-400 shrink-0`} />
                )}
                <span className="truncate">
                  {isCompact ? downloadInfo.shortText : downloadInfo.text}
                </span>
              </div>
            </div>
          )}
          {poster ? (
            <img 
              src={poster} 
              alt={title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500 text-center p-2 text-xs">No Image</div>
          )}
          
          <div className={`absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center z-10 pointer-events-none ${
            isCompact ? 'p-2 gap-1.5' : 'p-4 gap-3'
          }`}>
            {!isInLibrary ? (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddMedia(tmdbId, displayType);
                }}
                className={`bg-cyan-500 hover:bg-cyan-400 text-slate-950 w-full rounded-lg font-bold flex items-center justify-center shadow-lg pointer-events-auto ${
                  isCompact ? 'py-1 px-1 text-xs gap-1' : 'py-1.5 px-2 text-sm gap-1.5'
                }`}
              >
                <Plus className={`${isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} flex-shrink-0`} /> Add {isCompact ? '' : (mode === 'movies' ? 'Movie' : 'Show')}
              </button>
            ) : (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  const libraryId = libraryItems.get(tmdbId);
                  if (libraryId) {
                    navigate(displayType === 'movie' ? `/movies/${libraryId}` : `/shows/${libraryId}`);
                  }
                }}
                className={`bg-emerald-500/20 hover:bg-emerald-500/30 transition-colors text-emerald-400 border border-emerald-500/30 font-bold flex items-center justify-center shadow-lg cursor-pointer pointer-events-auto ${
                  isCompact ? 'rounded-full hover:scale-110 transition-transform p-0' : 'w-full rounded-lg py-1.5 px-2 text-sm gap-1.5'
                }`}
                style={isCompact ? { width: `${cardScale.dockBtnSize}px`, height: `${cardScale.dockBtnSize}px` } : undefined}
                title="In Library"
              >
                <CheckCircle2 
                  style={isCompact ? { width: `${cardScale.dockIconSize}px`, height: `${cardScale.dockIconSize}px` } : undefined}
                  className={`${isCompact ? '' : 'w-4 h-4'} flex-shrink-0`} 
                />
                {!isCompact && <span>In Library</span>}
              </button>
            )}
          </div>
        </div>
        <div className={`relative z-20 bg-slate-800/95 border-t border-white/10 ${isCompact ? 'p-2' : 'p-3'}`}>
          <h3 className={`font-semibold text-slate-100 truncate tracking-wide ${isCompact ? 'text-xs' : 'text-sm'}`} title={title}>{title}</h3>
          <div className="flex justify-between items-center mt-1.5">
            <span className="text-[11px] text-slate-500 font-medium tracking-wider uppercase">{releaseYear}</span>
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${
              rating !== 'N/A' 
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' 
                : 'bg-slate-700/30 border-white/5 text-slate-400'
            }`}>
              <Star className={`w-2.5 h-2.5 ${rating !== 'N/A' ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`} />
              <span className={`text-[11px] ${rating !== 'N/A' ? 'font-bold' : 'font-medium'}`}>{rating}</span>
            </div>
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
          
          {/* Mode Toggle, Poster Size Slider & Options */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 flex-wrap">
            {/* Poster resize slider (desktop) */}
            <div className="hidden sm:flex items-center gap-2.5 shrink-0 bg-[#101e31] px-3 py-1.5 rounded-xl border border-[#1c2d46] shadow-inner select-none">
              <button
                type="button"
                onClick={() => setPosterSize(prev => Math.max(90, prev - 15))}
                className="text-slate-400 hover:text-white transition-colors"
                title="Smaller posters"
                aria-label="Smaller posters"
              >
                <Grid3x3 className="w-3.5 h-3.5" />
              </button>
              <input
                type="range"
                min="90"
                max="240"
                step="5"
                value={posterSize}
                onChange={e => setPosterSize(Number(e.target.value))}
                onDoubleClick={() => setPosterSize(180)}
                title={`Poster size: ${posterSize}px (double-click to reset)`}
                aria-label="Poster size"
                style={{
                  background: `linear-gradient(to right, #38a7f4 0%, #38a7f4 ${sliderPercent}%, #101e31 ${sliderPercent}%, #101e31 100%)`
                }}
                className="w-20 sm:w-28 md:w-32 h-1.5 rounded-full appearance-none cursor-pointer border border-[#1c2d46] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#42a8f8] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#42a8f8] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
              />
              <button
                type="button"
                onClick={() => setPosterSize(prev => Math.min(240, prev + 15))}
                className="text-slate-400 hover:text-white transition-colors"
                title="Larger posters"
                aria-label="Larger posters"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

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
                  type="button"
                  onClick={() => setRowsMenuOpen(!rowsMenuOpen)}
                  className={`h-10 w-10 flex items-center justify-center rounded-xl border transition-colors shadow-sm ${
                    rowsMenuOpen || ROW_KEYS.some(k => (k !== 'upcoming' || mode === 'movies') && visibleRows[k] === false)
                      ? 'bg-[#0d2b51] text-[#e7ecf6] border-[#1b4273]'
                      : 'bg-[#101e31] text-slate-300 border-[#1c2d46] hover:border-slate-600 hover:text-white'
                  }`}
                  title="Toggle visible rows"
                  aria-label="Toggle visible rows"
                >
                  <ListFilter className={`w-5 h-5 transition-colors ${
                    rowsMenuOpen || ROW_KEYS.some(k => (k !== 'upcoming' || mode === 'movies') && visibleRows[k] === false)
                      ? 'text-cyan-400'
                      : 'text-slate-400'
                  }`} />
                </button>
                {rowsMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-52 max-w-[calc(100vw-1rem)] bg-[#0e1a2b] border border-[#1c2d46] rounded-xl shadow-xl shadow-black/50 z-[60] py-1.5 overflow-hidden">
                    <div className="px-3.5 py-1.5 border-b border-[#1c2d46] text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Visible Rows
                    </div>
                    <div className="flex flex-col">
                      {ROW_KEYS.filter(k => k !== 'upcoming' || mode === 'movies').map(key => {
                        const isSelected = !!visibleRows[key];
                        return (
                          <label
                            key={key}
                            className={`w-full text-left px-3.5 py-2 text-sm flex items-center justify-between transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#0d2b51]/60 text-white font-medium'
                                : 'text-slate-300 hover:bg-[#16273d] hover:text-white'
                            }`}
                            onClick={(e) => {
                              e.preventDefault();
                              setVisibleRows(prev => ({ ...prev, [key]: !prev[key] }));
                            }}
                          >
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                  isSelected
                                    ? 'bg-[#0d2b51] border-[#1b4273]'
                                    : 'bg-slate-900 border-slate-700/80'
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3 text-[#e7ecf6]" />}
                              </div>
                              <span className="truncate">{ROW_LABELS[key]}</span>
                            </div>
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={isSelected}
                              onChange={() => {}}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile secondary bar: poster resize slider */}
        <div className="flex sm:hidden items-center justify-between gap-3 px-0.5 pt-0.5">
          <span className="text-xs text-slate-400 font-medium">
            Poster size
          </span>
          <div className="flex items-center gap-2 shrink-0 bg-[#101e31] px-2.5 py-1 rounded-xl border border-[#1c2d46] shadow-inner select-none">
            <button
              type="button"
              onClick={() => setPosterSize(prev => Math.max(90, prev - 15))}
              className="p-1 text-slate-400 hover:text-white transition-colors"
              title="Smaller posters"
              aria-label="Smaller posters"
            >
              <Grid3x3 className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min="90"
              max="240"
              step="5"
              value={posterSize}
              onChange={e => setPosterSize(Number(e.target.value))}
              onDoubleClick={() => setPosterSize(180)}
              title={`Poster size: ${posterSize}px`}
              aria-label="Poster size"
              style={{
                background: `linear-gradient(to right, #38a7f4 0%, #38a7f4 ${sliderPercent}%, #101e31 ${sliderPercent}%, #101e31 100%)`
              }}
              className="w-24 xs:w-28 h-1.5 rounded-full appearance-none cursor-pointer border border-[#1c2d46] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#42a8f8] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#42a8f8] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
            />
            <button
              type="button"
              onClick={() => setPosterSize(prev => Math.min(240, prev + 15))}
              className="p-1 text-slate-400 hover:text-white transition-colors"
              title="Larger posters"
              aria-label="Larger posters"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
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
            {visibleRows.upcoming && (
              <MediaRow 
                title={mode === 'movies' ? "In Cinemas & Upcoming" : "Upcoming Shows"} 
                items={upcomingResults} 
                badgeText="Powered by TMDB" 
                renderMediaCard={(item, isTrending, isGrid) => renderMediaCard(item, isTrending, isGrid, true)} 
              />
            )}
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
           <div
             className="dashboard-poster-grid gap-3 sm:gap-4 relative"
             style={{ '--poster-size': `${posterSize}px` }}
           >
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
        onAdded={(tmdbId, details, createdItem) => {
          const numericTmdbId = Number(tmdbId || details?.id);
          const dbId = createdItem?.id || numericTmdbId;

          // 1. Immediately mark as in library so cards instantly switch to "In Library"
          setLibraryItems(prev => {
            const next = new Map(prev);
            next.set(numericTmdbId, dbId);
            next.set(String(numericTmdbId), dbId);
            return next;
          });

          if (createdItem?.status === 'downloaded' || (createdItem?.file_path && createdItem.file_path.trim() !== '')) {
            setDownloadedSet(prev => {
              const next = new Set(prev);
              next.add(numericTmdbId);
              next.add(String(numericTmdbId));
              return next;
            });
          }

          // 2. Prepend immediately to Recently Added
          if (details) {
            const itemType = (selectedMediaType === 'tv' || selectedMediaType === 'show' || details.media_type === 'tv') ? 'tv' : 'movie';
            const newItem = {
              id: dbId,
              tmdb_id: numericTmdbId,
              media_type: itemType,
              title: details.title || details.name,
              name: details.title || details.name,
              poster_path: details.poster_path,
              vote_average: details.vote_average || 0,
              rating: details.vote_average || 0,
              year: details.release_date ? parseInt(details.release_date.split('-')[0]) : (details.first_air_date ? parseInt(details.first_air_date.split('-')[0]) : null),
              release_date: details.release_date || '',
              first_air_date: details.first_air_date || '',
              overview: details.overview || '',
            };

            setRecentResults(prev => [
              newItem,
              ...prev.filter(x => (x.tmdb_id || x.id) !== numericTmdbId)
            ].slice(0, 20));

            // Keep the cache for this mode in sync so clearing search doesn't revert to stale data
            if (cacheRef.current[mode]) {
              cacheRef.current[mode].recent = [
                newItem,
                ...(cacheRef.current[mode].recent || []).filter(x => (x.tmdb_id || x.id) !== numericTmdbId)
              ].slice(0, 20);
              if (cacheRef.current[mode].libraryIds) {
                cacheRef.current[mode].libraryIds.set(numericTmdbId, dbId);
                cacheRef.current[mode].libraryIds.set(String(numericTmdbId), dbId);
              }
              if ((createdItem?.status === 'downloaded' || createdItem?.file_path) && cacheRef.current[mode].downloadedIds) {
                cacheRef.current[mode].downloadedIds.add(numericTmdbId);
                cacheRef.current[mode].downloadedIds.add(String(numericTmdbId));
              }
            }
          }

          // 3. Invalidate global module caches
          setCachedMovies(null);
          setCachedShows(null);
          invalidateLibraryIndex();

          // 4. Background refresh
          fetchLibrary();
        }}
      />
    </div>
  );
}
