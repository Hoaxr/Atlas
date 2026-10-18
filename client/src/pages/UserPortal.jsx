import { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { 
  Search, Loader2, Plus, Clock, CheckCircle2, XCircle, Key, Star, X, Film, 
  Tv, CalendarClock, Dices, Check, TrendingUp, DownloadCloud, Heart,
  CircleUser, ChevronDown, ArrowRightLeft
} from 'lucide-react';

function RunningManIcon({ className }) {
  return (
    <img
      src="/running-man.png"
      alt=""
      aria-hidden="true"
      className={className}
      style={{ filter: 'brightness(0) invert(1)' }}
    />
  );
}
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../lib/api';
import AtlasLogo from '../components/common/AtlasLogo';
import ChangePasswordModal from '../components/ChangePasswordModal';
import MediaDetailsModal from '../components/MediaDetailsModal';
import MediaRow from '../components/MediaRow';
import { customAlert, customConfirm } from '../utils/alerts';
import { posterUrl, tmdbImgUrl } from '../lib/posterUrl';

export default function UserPortal() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [requests, setRequests] = useState([]);
  const [libraryMovies, setLibraryMovies] = useState([]);
  const [libraryShows, setLibraryShows] = useState([]);
  const [, setLoading] = useState(true);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState(null);
  const [selectedMediaType, setSelectedMediaType] = useState('movie');
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [trendingShows, setTrendingShows] = useState([]);
  const [requestFilter, setRequestFilter] = useState('all');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountRef = useRef(null);
  const navigate = useNavigate();
  const searchTimerRef = useRef(null);

  let user = null;
  try {
    const userStr = localStorage.getItem('atlas_user');
    user = userStr ? JSON.parse(userStr) : null;
  } catch {
    user = null;
  }

  const displayName = user?.displayName || user?.name || user?.username || 'User';
  const role = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase()
    : 'User';
  const isAdmin = user?.role === 'admin';

  // Close the account menu on any click outside or Escape key
  useEffect(() => {
    if (!accountMenuOpen) return;
    const handleClickOutside = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) {
        setAccountMenuOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setAccountMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountMenuOpen]);

  const fetchData = async () => {
    try {
      const [reqsRes, moviesRes, showsRes, trendMoviesRes, trendShowsRes] = await Promise.all([
        api.get('/requests'),
        api.get('/library/movies'),
        api.get('/library/shows'),
        api.get('/tmdb/trending/movies'),
        api.get('/tmdb/trending/shows')
      ]);
      let reqs = reqsRes.data?.data || [];

      const missing = reqs.filter(r => !r.poster_path);
      if (missing.length > 0) {
        const results = await Promise.allSettled(
          missing.map(r => {
            const endpoint = r.type === 'movie' ? `/tmdb/movie/${r.tmdb_id}` : `/tmdb/show/${r.tmdb_id}`;
            return api.get(endpoint).then(res => ({ id: r.id, poster_path: res.data?.data?.poster_path || null }));
          })
        );
        const posterMap = {};
        results.forEach(r => { if (r.status === 'fulfilled' && r.value.poster_path) posterMap[r.value.id] = r.value.poster_path; });
        reqs = reqs.map(r => posterMap[r.id] ? { ...r, poster_path: posterMap[r.id] } : r);
      }

      setRequests(reqs);
      setLibraryMovies(moviesRes.data?.data || []);
      setLibraryShows(showsRes.data?.data || []);
      setTrendingMovies(trendMoviesRes.data?.data || []);
      setTrendingShows(trendShowsRes.data?.data || []);
    } catch (e) {
      console.error(e);
      customAlert('Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get(`/tmdb/search/multi?query=${encodeURIComponent(query)}`);
        setResults(res.data?.data?.filter(item => item.media_type === 'movie' || item.media_type === 'tv') || []);
      } catch {
        customAlert('Search failed');
      } finally {
        setSearching(false);
      }
    }, 500);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query]);

  const handleSearch = (e) => {
    e.preventDefault();
  };

  const handleSurpriseMe = () => {
    const pool = [...trendingMovies, ...trendingShows];
    if (pool.length === 0) return customAlert('Nothing found right now!');
    
    const requestedIds = new Set(requests.map(r => r.tmdb_id));
    const libraryMovieIds = new Set(libraryMovies.map(m => m.tmdb_id));
    const libraryShowIds = new Set(libraryShows.map(s => s.tmdb_id));

    const available = pool.filter(item => {
      const tmdbId = item.tmdb_id || item.id || (item.ids && item.ids.tmdb);
      return !requestedIds.has(tmdbId) && !libraryMovieIds.has(tmdbId) && !libraryShowIds.has(tmdbId);
    });

    if (available.length === 0) return customAlert('You have seen it all!');
    
    const randomItem = available[Math.floor(Math.random() * available.length)];
    const tmdbId = randomItem.tmdb_id || randomItem.id || (randomItem.ids && randomItem.ids.tmdb);
    const isMovie = randomItem.media_type ? randomItem.media_type === 'movie' : randomItem.type === 'movie' || (randomItem.title !== undefined && !randomItem.name);
    
    setSelectedMediaId(tmdbId);
    setSelectedMediaType(isMovie ? 'movie' : 'tv');
  };

  const handleRequest = async (item) => {
    try {
      const tmdbId = item.tmdb_id || item.id || (item.ids && item.ids.tmdb);
      const isMovie = item.media_type 
        ? item.media_type === 'movie' 
        : item.type === 'movie' || (item.title !== undefined && !item.name);
      const mediaType = isMovie ? 'movie' : 'tv';

      const releaseDate = item.release_date || item.first_air_date || null;
      const posterPath = item.poster_path || null;

      const existingRequest = requests.find(r => r.tmdb_id === tmdbId && r.user_id === user?.id);

      if (existingRequest) {
        await api.delete(`/requests/${existingRequest.id}`);
        customAlert('Request cancelled');
      } else {
        if (item.vote_average > 0 && item.vote_average < 5.0) {
          const confirmed = await customConfirm(
            `This ${mediaType === 'movie' ? 'movie' : 'show'} has a very low rating (${item.vote_average.toFixed(1)}/10) and has a low chance of getting approved.\nAre you sure you want to request it?`,
            {
              title: 'Low Rating Warning',
              type: 'warning',
              confirmText: 'Yes, request it',
              cancelText: 'Cancel'
            }
          );
          if (!confirmed) return;
        }

        await api.post('/requests', {
          tmdb_id: tmdbId,
          type: mediaType,
          title: item.title || item.name,
          release_date: releaseDate,
          poster_path: posterPath
        });
        customAlert('Requested successfully!');
      }
      fetchData();
    } catch (err) {
      customAlert(err.response?.data?.message || 'Failed to update request');
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore network errors on logout
    }
    localStorage.removeItem('atlas_token');
    localStorage.removeItem('atlas_user');
    navigate('/login');
  };

  const isNotYetReleased = (releaseDate) => {
    if (!releaseDate) return false;
    return new Date(releaseDate) > new Date();
  };

  const getStatusIcon = (status) => {
    switch (status.toLowerCase()) {
      case 'available': return <CheckCircle2 className="w-5 h-5 text-cyan-400" />;
      case 'approved': return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case 'denied': return <XCircle className="w-5 h-5 text-rose-400" />;
      default: return <Clock className="w-5 h-5 text-amber-400" />;
    }
  };

  const renderMediaCard = (item, _isTrending = false, isGrid = true) => {
    const tmdbId = item.tmdb_id || item.id || (item.ids && item.ids.tmdb);
    const tmdbStr = String(tmdbId);
    const isRequested = requests.some(r => String(r.tmdb_id) === tmdbStr);
    const isMovie = item.media_type 
      ? item.media_type === 'movie' 
      : item.type === 'movie' || (item.title !== undefined && !item.name);
    
    const libraryItem = isMovie
      ? libraryMovies.find(m => String(m.tmdb_id) === tmdbStr)
      : libraryShows.find(s => String(s.tmdb_id) === tmdbStr);
    
    const inLibrary = !!libraryItem;
    // Movies: downloaded if file_path exists and status is 'downloaded'
    // Shows: available if folder_path exists (any episodes on disk)
    const isDownloaded = isMovie 
      ? !!(libraryItem?.file_path && libraryItem?.status === 'downloaded')
      : !!(libraryItem?.folder_path);
      
    const title = item.title || item.name;
    const releaseYear = (item.release_date || item.first_air_date || item.year || '')?.toString().split('-')[0] || 'Unknown';
    const rating = Number(item.vote_average) > 0 ? Number(item.vote_average).toFixed(1) : 'N/A';
    const keyId = tmdbId || title || Math.random().toString();

    const cardClass = isGrid 
      ? "glass-panel rounded-xl overflow-hidden group hover:scale-[1.05] transition-transform duration-300 relative cursor-pointer shadow-lg hover:shadow-cyan-500/20"
      : "flex-none w-40 sm:w-48 md:w-56 glass-panel rounded-xl overflow-hidden group hover:scale-[1.05] transition-transform duration-300 relative snap-start cursor-pointer shadow-lg hover:shadow-cyan-500/20";

    return (
      <motion.div 
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2 }}
        key={keyId} 
        className={cardClass}
        onClick={() => {
          setSelectedMediaId(tmdbId);
          setSelectedMediaType(isMovie ? 'movie' : 'tv');
        }}
      >
        <div className="absolute top-2 left-2 z-20 flex items-center gap-1">
          {isDownloaded && (
            <div className="bg-slate-900/80 rounded-full shadow-lg flex items-center justify-center" title="Downloaded">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 fill-emerald-400/20" />
            </div>
          )}
          {inLibrary && !isDownloaded && (
            <div className="bg-slate-900/80 rounded-full shadow-lg flex items-center justify-center" title="In Library (Not Available Yet)">
              <Clock className="w-6 h-6 text-sky-400 fill-sky-400/20" />
            </div>
          )}
          {isNotYetReleased(item.release_date || item.first_air_date) && (
            <div className="bg-slate-900/80 rounded-full shadow-lg flex items-center justify-center" title="Coming Soon">
              <CalendarClock className="w-6 h-6 text-violet-400 fill-violet-400/20" />
            </div>
          )}
          {!inLibrary && !isNotYetReleased(item.release_date || item.first_air_date) && isRequested && (
            <div className="bg-slate-900/80 rounded-full shadow-lg flex items-center justify-center" title="Requested">
              <Clock className="w-6 h-6 text-amber-400 fill-amber-400/20" />
            </div>
          )}
        </div>

        <div className="aspect-[2/3] relative bg-slate-800">
          {item.poster_path ? (
            <img 
              src={tmdbImgUrl(item.poster_path)} 
              alt={title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500 text-center p-4">No Image</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-end gap-3 p-4 z-30">
            <div className="w-full pointer-events-auto flex flex-col gap-2 translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const isMyRequest = requests.some(r => String(r.tmdb_id) === tmdbStr && r.user_id === user?.id);
                  if (inLibrary || (isRequested && !isMyRequest)) {
                    setSelectedMediaId(tmdbId);
                    setSelectedMediaType(isMovie ? 'movie' : 'tv');
                  } else {
                    handleRequest(item);
                  }
                }}
                className={`w-full py-2 px-2 text-sm rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-lg transition-colors cursor-pointer
                  ${isDownloaded 
                    ? 'bg-emerald-500/90 text-white hover:bg-emerald-400' 
                    : inLibrary
                      ? 'bg-sky-500/90 text-white hover:bg-sky-400'
                      : isRequested 
                        ? 'bg-amber-500/90 text-white hover:bg-amber-400' 
                        : 'bg-cyan-500/90 text-white hover:bg-cyan-400'
                  }`}
              >
                {isDownloaded ? <><CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Downloaded</> :
                 inLibrary ? <><DownloadCloud className="w-4 h-4 flex-shrink-0" /> Not Available Yet</> :
                 isRequested ? <><Clock className="w-4 h-4 flex-shrink-0" /> Requested</> : 
                 isNotYetReleased(item.release_date || item.first_air_date) ? <><CalendarClock className="w-4 h-4 flex-shrink-0" /> Coming Soon</> :
                 <><Plus className="w-4 h-4 flex-shrink-0" /> Request</>}
              </button>
            </div>
          </div>
        </div>
        
        <div className="p-3 relative z-20 bg-slate-900/95 border-t border-white/5">
          <h3 className="font-bold text-slate-200 truncate" title={title}>{title}</h3>
          <div className="flex justify-between items-center mt-1">
            <p className="text-xs text-slate-400 font-medium">{releaseYear}</p>
            <div className={`flex items-center gap-1 ${rating !== 'N/A' ? 'bg-slate-950/50 shadow-inner' : 'bg-slate-950/30'} px-2 py-0.5 rounded border border-white/5`}>
              <Star className={`w-3 h-3 ${rating !== 'N/A' ? 'text-yellow-400 fill-yellow-400 drop-shadow-sm' : 'text-slate-500'}`} />
              <span className={`text-xs ${rating !== 'N/A' ? 'font-bold text-slate-200' : 'font-medium text-slate-400'}`}>{rating}</span>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  const userRequests = requests.filter(r => r.user_id === user?.id);

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute top-1/4 -left-40 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <header className="sticky top-0 z-40 bg-slate-100/90 dark:bg-[#101b2b] border-b border-slate-200 dark:border-slate-800/80 backdrop-blur-md shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <div className="cursor-pointer select-none py-1" onClick={() => { setQuery(''); setResults([]); }}>
            <AtlasLogo variant="lockup" className="h-8 w-auto" />
          </div>

          <div className="flex items-center gap-1 sm:gap-3 shrink-0">
            {/* Donate */}
            <a
              href="https://www.paypal.com/donate/?business=C5EDZZUFSMX4J&no_recurring=0&item_name=Thanks+for+the+coffee&currency_code=EUR"
              target="_blank"
              rel="noopener noreferrer"
              title="Donate"
              aria-label="Donate"
              className="hidden sm:flex p-2 rounded-xl text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors items-center justify-center group"
            >
              <Heart className="w-5 h-5 text-rose-500 fill-rose-500 group-hover:scale-110 transition-transform duration-200" />
            </a>

            {/* Divider */}
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700/60 mx-1 hidden sm:block" />

            {/* Account Menu */}
            {user && (
              <div ref={accountRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((prev) => !prev)}
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="menu"
                  aria-label="User account menu"
                  className={clsx(
                    "flex items-center gap-2 py-1 px-2.5 -my-1 rounded-xl transition-all select-none cursor-pointer group text-left",
                    accountMenuOpen
                      ? "bg-slate-200/80 dark:bg-slate-800/80 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-300 dark:ring-slate-700"
                      : "hover:bg-slate-200/60 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-200"
                  )}
                >
                  <CircleUser className="w-5 h-5 text-slate-500 dark:text-slate-400 group-hover:text-cyan-500 dark:group-hover:text-cyan-400 transition-colors shrink-0" />
                  <div className="flex flex-col items-start justify-center leading-tight min-w-0">
                    <span className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                      {displayName}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 truncate max-w-[120px]">
                      {role}
                    </span>
                  </div>
                  <ChevronDown className={clsx(
                    "w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-transform duration-200 shrink-0",
                    accountMenuOpen && "rotate-180 text-cyan-500 dark:text-cyan-400"
                  )} />
                </button>

                {accountMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-60 bg-white dark:bg-[#111d30] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl shadow-black/15 dark:shadow-black/50 overflow-hidden z-50 animate-fade-in p-1.5 space-y-1"
                  >
                    {isAdmin && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          navigate('/');
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left font-medium text-slate-700 dark:text-slate-200 hover:text-cyan-500 dark:hover:text-cyan-400 hover:bg-cyan-500/10 dark:hover:bg-cyan-500/10 transition-colors group cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform border border-cyan-500/20">
                          <ArrowRightLeft className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-cyan-500 dark:group-hover:text-cyan-300">
                            Switch to Admin Panel
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal truncate">
                            Return to dashboard
                          </div>
                        </div>
                      </button>
                    )}

                    {(!user || user.origin === 'atlas') && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          setIsPasswordModalOpen(true);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors group cursor-pointer"
                      >
                        <Key className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200" />
                        <span>Change Password</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Divider */}
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700/60 mx-1 hidden sm:block" />

            {/* Logout */}
            <button
              type="button"
              onClick={handleLogout}
              title="Logout"
              aria-label="Logout"
              className="flex p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 dark:hover:bg-rose-500/10 transition-colors shrink-0"
            >
              <RunningManIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-8 py-8 relative z-10">
        
        {/* Search Hero Section */}
        <motion.div 
          layout
          className="max-w-3xl mx-auto w-full mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="text-center mb-8">
            <motion.h1 layout className="text-4xl md:text-5xl font-black text-white tracking-tight mb-3">
              What do you want to <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-sky-400">watch?</span>
            </motion.h1>
            <motion.p layout className="text-slate-400 text-lg">
              Search for movies and TV shows to request them to the server.
            </motion.p>
          </div>

          <form onSubmit={handleSearch} className="relative group">
            <div className="absolute inset-0 bg-cyan-500/20 rounded-3xl blur-xl group-hover:bg-cyan-500/30 transition-colors duration-500"></div>
            <div className="relative flex items-center bg-slate-900/80 backdrop-blur-lg border border-white/10 hover:border-cyan-500/50 rounded-3xl shadow-2xl transition-all overflow-hidden pl-5 sm:pl-6 pr-2 sm:pr-3 py-1.5 sm:py-2">
              <Search className="w-6 h-6 text-slate-400 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title..."
                className="flex-1 min-w-0 pl-3 sm:pl-4 pr-3 py-3 sm:py-3.5 bg-transparent text-lg sm:text-xl text-white placeholder-slate-500 focus:outline-none font-normal"
              />
              <div className="flex items-center gap-2 shrink-0">
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
                {searching && <Loader2 className="w-5 h-5 text-cyan-400 animate-spin mr-1" />}
                <button
                  type="button"
                  onClick={handleSurpriseMe}
                  title="Surprise me with a random title"
                  className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 hover:border-cyan-500/40 text-slate-300 hover:text-white transition-all text-xs sm:text-sm font-semibold shadow-sm cursor-pointer group shrink-0"
                >
                  <Dices className="w-4 h-4 text-cyan-400 group-hover:rotate-12 transition-transform duration-200" />
                  <span className="hidden sm:inline">Surprise Me</span>
                </button>
              </div>
            </div>
          </form>
        </motion.div>

        <AnimatePresence mode="wait">
          {query.trim() ? (
            <motion.div 
              key="search-results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Search className="w-6 h-6 text-cyan-400" /> Search Results
                </h2>
                <span className="text-slate-400">{results.length} found</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                {results.map(item => renderMediaCard(item, false, true))}
              </div>
              {results.length === 0 && !searching && (
                <div className="text-center py-20 text-slate-400 text-lg">
                  No results found for "{query}". Try a different search term.
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="home-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-12"
            >
              {/* Dashboard Stats */}
              {userRequests.length > 0 && (
                <section>
                  <div className="grid grid-cols-3 gap-2 sm:gap-4">
                    <div className="bg-slate-800/40 backdrop-blur-sm border border-white/5 rounded-2xl p-3 sm:p-6 flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-2 sm:gap-4 hover:bg-slate-800/60 transition-colors text-center sm:text-left">
                      <div className="p-2 sm:p-3 bg-cyan-500/20 rounded-xl text-cyan-400">
                        <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
                      </div>
                      <div>
                        <div className="text-[10px] sm:text-sm font-semibold text-slate-400 uppercase tracking-wider line-clamp-1">Total</div>
                        <div className="text-xl sm:text-3xl font-black text-white">{userRequests.length}</div>
                      </div>
                    </div>
                    <div className="bg-slate-800/40 backdrop-blur-sm border border-white/5 rounded-2xl p-3 sm:p-6 flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-2 sm:gap-4 hover:bg-slate-800/60 transition-colors text-center sm:text-left">
                      <div className="p-2 sm:p-3 bg-emerald-500/20 rounded-xl text-emerald-400">
                        <Check className="w-5 h-5 sm:w-6 sm:h-6" />
                      </div>
                      <div>
                        <div className="text-[10px] sm:text-sm font-semibold text-slate-400 uppercase tracking-wider line-clamp-1">Approved</div>
                        <div className="text-xl sm:text-3xl font-black text-white">
                          {userRequests.filter(req => {
                            const inLibrary = req.type === 'movie' 
                              ? libraryMovies.some(m => Number(m.tmdb_id) === Number(req.tmdb_id))
                              : libraryShows.some(s => Number(s.tmdb_id) === Number(req.tmdb_id));
                            return inLibrary || req.status === 'approved' || req.status === 'available';
                          }).length}
                        </div>
                      </div>
                    </div>
                    <div className="bg-slate-800/40 backdrop-blur-sm border border-white/5 rounded-2xl p-3 sm:p-6 flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-2 sm:gap-4 hover:bg-slate-800/60 transition-colors text-center sm:text-left">
                      <div className="p-2 sm:p-3 bg-amber-500/20 rounded-xl text-amber-400">
                        <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
                      </div>
                      <div>
                        <div className="text-[10px] sm:text-sm font-semibold text-slate-400 uppercase tracking-wider line-clamp-1">Pending</div>
                        <div className="text-xl sm:text-3xl font-black text-white">
                          {userRequests.filter(req => {
                            const inLibrary = req.type === 'movie' 
                              ? libraryMovies.some(m => Number(m.tmdb_id) === Number(req.tmdb_id))
                              : libraryShows.some(s => Number(s.tmdb_id) === Number(req.tmdb_id));
                            return !inLibrary && req.status === 'pending';
                          }).length}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* My Requests Section */}
              {userRequests.length > 0 && (
                <section>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                      <Clock className="w-6 h-6 text-indigo-400" /> My Requests
                    </h2>
                    
                    {/* Filters */}
                    <div className="flex items-center gap-2 bg-slate-800/50 p-1 rounded-xl border border-white/5 overflow-x-auto hide-scrollbar">
                      <button onClick={() => setRequestFilter('all')} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${requestFilter === 'all' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>All</button>
                      <button onClick={() => setRequestFilter('pending')} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${requestFilter === 'pending' ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>Pending</button>
                      <button onClick={() => setRequestFilter('approved')} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${requestFilter === 'approved' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>Approved</button>
                      <button onClick={() => setRequestFilter('denied')} className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${requestFilter === 'denied' ? 'bg-rose-500 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>Denied</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {userRequests.filter(req => {
                      if (requestFilter === 'all') return true;
                      const inLibrary = req.type === 'movie' 
                        ? libraryMovies.some(m => String(m.tmdb_id) === String(req.tmdb_id))
                        : libraryShows.some(s => String(s.tmdb_id) === String(req.tmdb_id));
                      const displayStatus = inLibrary ? 'approved' : req.status.toLowerCase();
                      
                      if (requestFilter === 'approved') return displayStatus === 'approved' || displayStatus === 'available';
                      if (requestFilter === 'pending') return displayStatus === 'pending';
                      if (requestFilter === 'denied') return displayStatus === 'denied';
                      return true;
                    }).map(req => {
                      const libraryItem = req.type === 'movie'
                        ? libraryMovies.find(m => String(m.tmdb_id) === String(req.tmdb_id))
                        : libraryShows.find(s => String(s.tmdb_id) === String(req.tmdb_id));
                      const inLibrary = !!libraryItem;
                      const isDownloaded = req.type === 'movie'
                        ? !!(libraryItem?.file_path && libraryItem?.status === 'downloaded')
                        : !!(libraryItem?.folder_path);
                      const effectiveReleaseDate = req.release_date || libraryItem?.release_date || null;
                      const unreleased = isNotYetReleased(effectiveReleaseDate);
                      const releaseYear = effectiveReleaseDate ? new Date(effectiveReleaseDate).getFullYear() : null;

                      // Build display labels
                      let displayStatus, statusLabel, statusColor;
                      if (isDownloaded) {
                        displayStatus = 'available';
                        statusLabel = unreleased ? 'Downloaded · Coming Soon' : 'Downloaded';
                        statusColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                      } else if (inLibrary) {
                        displayStatus = 'unreleased';
                        statusLabel = unreleased ? 'Not Available Yet · Coming Soon' : 'Not Available Yet';
                        statusColor = 'bg-sky-500/10 text-sky-400 border-sky-500/20';
                      } else if (unreleased) {
                        displayStatus = 'unreleased';
                        statusLabel = 'Coming Soon';
                        statusColor = 'bg-violet-500/10 text-violet-400 border-violet-500/20';
                      } else if (req.status.toLowerCase() === 'approved') {
                        displayStatus = 'approved';
                        statusLabel = 'Approved';
                        statusColor = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
                      } else if (req.status.toLowerCase() === 'denied') {
                        displayStatus = 'denied';
                        statusLabel = 'Denied';
                        statusColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                      } else {
                        displayStatus = 'pending';
                        statusLabel = 'Pending';
                        statusColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                      }

                      return (
                        <motion.div 
                          layout
                          whileHover={{ scale: 1.02 }}
                          key={req.id} 
                          onClick={() => {
                            setSelectedMediaId(req.tmdb_id);
                            setSelectedMediaType(req.type === 'movie' ? 'movie' : 'tv');
                          }}
                          className="flex items-center gap-4 p-4 rounded-2xl bg-slate-800/40 backdrop-blur-sm border border-white/5 hover:bg-slate-800 hover:border-white/10 hover:shadow-lg transition-all cursor-pointer group"
                        >
                          <div className="w-16 h-24 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0 shadow-md">
                            {(req.poster_path || libraryItem?.poster_path) ? (
                              <img
                                src={libraryItem
                                  ? posterUrl(req.type === 'movie' ? 'movies' : 'shows', req.tmdb_id, req.poster_path || libraryItem?.poster_path)
                                  : tmdbImgUrl(req.poster_path || libraryItem?.poster_path, 'w92')}
                                alt={req.title}
                                onError={(e) => {
                                  const fallbackPath = req.poster_path || libraryItem?.poster_path;
                                  if (fallbackPath && !e.currentTarget.dataset.fallback) {
                                    e.currentTarget.dataset.fallback = 'true';
                                    e.currentTarget.src = `https://image.tmdb.org/t/p/w92${fallbackPath}`;
                                  }
                                }}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                {req.type === 'movie' ? <Film className="w-6 h-6 text-slate-500" /> : <Tv className="w-6 h-6 text-slate-500" />}
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0 py-1 flex flex-col justify-between h-full">
                            <div>
                              <h3 className="font-bold text-white truncate group-hover:text-cyan-400 transition-colors">{req.title}</h3>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300 border border-white/5">
                                  {req.type === 'movie' ? 'Movie' : 'TV'}
                                </span>
                                {releaseYear && <span className="text-xs text-slate-500">{releaseYear}</span>}
                              </div>
                            </div>
                            
                            <div className="mt-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg border ${statusColor}`}>
                                  {getStatusIcon(displayStatus)}
                                  <span>{statusLabel}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Trending Sections */}
              <div className="space-y-8">
                <MediaRow title="Trending Movies" items={trendingMovies} renderMediaCard={renderMediaCard} />
                <MediaRow title="Trending TV Shows" items={trendingShows} renderMediaCard={renderMediaCard} />
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <ChangePasswordModal 
        isOpen={isPasswordModalOpen} 
        onClose={() => setIsPasswordModalOpen(false)} 
      />

      <MediaDetailsModal
        isOpen={!!selectedMediaId}
        onClose={() => setSelectedMediaId(null)}
        mediaId={selectedMediaId}
        mediaType={selectedMediaType}
        isInLibrary={selectedMediaId ? (selectedMediaType === 'movie' ? libraryMovies.some(m => Number(m.tmdb_id) === Number(selectedMediaId)) : libraryShows.some(s => Number(s.tmdb_id) === Number(selectedMediaId))) : false}
        libraryId={selectedMediaId ? (selectedMediaType === 'movie' ? libraryMovies.find(m => Number(m.tmdb_id) === Number(selectedMediaId))?.id : libraryShows.find(s => Number(s.tmdb_id) === Number(selectedMediaId))?.id) : null}
        mode="details"
        requestStatus={selectedMediaId ? requests.find(r => Number(r.tmdb_id) === Number(selectedMediaId))?.status : null}
        onRequest={handleRequest}
      />
    </div>
  );
}
