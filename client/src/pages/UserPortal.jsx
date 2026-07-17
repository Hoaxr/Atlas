import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Plus, Clock, CheckCircle2, XCircle, LogOut, Key, Star, X, Film, Tv, Info, CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../lib/api';
import Logo from '../components/layout/Logo';
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
  const [loading, setLoading] = useState(true);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState(null);
  const [selectedMediaType, setSelectedMediaType] = useState('movie');
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [trendingShows, setTrendingShows] = useState([]);
  const navigate = useNavigate();
  const searchTimerRef = useRef(null);

  const userStr = localStorage.getItem('atlas_user');
  const user = userStr ? JSON.parse(userStr) : null;

  const fetchData = async () => {
    try {
      const [reqsRes, moviesRes, showsRes, trendMoviesRes, trendShowsRes] = await Promise.all([
        api.get('/requests'),
        api.get('/library/movies'),
        api.get('/library/shows'),
        api.get('/trakt/trending/movies'),
        api.get('/trakt/trending/shows')
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
      } catch (err) {
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

  const handleLogout = () => {
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

  const renderMediaCard = (item, isTrending = false, isGrid = true) => {
    const tmdbId = item.tmdb_id || item.id || (item.ids && item.ids.tmdb);
    const isRequested = requests.some(r => r.tmdb_id === tmdbId);
    const isMovie = item.media_type 
      ? item.media_type === 'movie' 
      : item.type === 'movie' || (item.title !== undefined && !item.name);
    
    const inLibrary = isMovie
      ? libraryMovies.some(m => m.tmdb_id === tmdbId)
      : libraryShows.some(s => s.tmdb_id === tmdbId);
      
    const title = item.title || item.name;
    const releaseYear = (item.release_date || item.first_air_date || item.year || '')?.toString().split('-')[0] || 'Unknown';
    const rating = item.vote_average ? item.vote_average.toFixed(1) : '?';
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
        {inLibrary && (
          <div className="absolute top-2 left-2 z-20 bg-slate-900/80 rounded-full shadow-lg" title="In Library">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 fill-emerald-400/20" />
          </div>
        )}
        
        {!inLibrary && isRequested && (
          <div className="absolute top-2 left-2 z-20 bg-slate-900/80 rounded-full shadow-lg" title="Requested">
            <Clock className="w-6 h-6 text-amber-400 fill-amber-400/20" />
          </div>
        )}

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
                  const isMyRequest = requests.some(r => r.tmdb_id === tmdbId && r.user_id === user?.id);
                  if (inLibrary || (isRequested && !isMyRequest)) {
                    setSelectedMediaId(tmdbId);
                    setSelectedMediaType(isMovie ? 'movie' : 'tv');
                  } else {
                    handleRequest(item);
                  }
                }}
                className={`w-full py-2 px-2 text-sm rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-lg transition-colors cursor-pointer
                  ${inLibrary 
                    ? 'bg-emerald-500/90 text-white hover:bg-emerald-400' 
                    : isRequested 
                      ? 'bg-amber-500/90 text-white hover:bg-amber-400' 
                      : 'bg-cyan-500/90 text-white hover:bg-cyan-400'
                  }`}
              >
                {inLibrary ? <><CheckCircle2 className="w-4 h-4 flex-shrink-0" /> In Library</> :
                 isRequested ? <><Clock className="w-4 h-4 flex-shrink-0" /> Requested</> : 
                 <><Plus className="w-4 h-4 flex-shrink-0" /> Request</>}
              </button>
            </div>
          </div>
        </div>
        
        <div className="p-3 relative z-20 bg-slate-900/95 border-t border-white/5">
          <h3 className="font-bold text-slate-200 truncate" title={title}>{title}</h3>
          <div className="flex justify-between items-center mt-1">
            <p className="text-xs text-slate-400 font-medium">{releaseYear}</p>
            {rating !== '?' && (
              <div className="flex items-center gap-1 bg-slate-950/50 px-2 py-0.5 rounded border border-white/5 shadow-inner">
                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                <span className="text-xs font-bold text-slate-200">{rating}</span>
              </div>
            )}
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

      <header className="sticky top-0 z-50 bg-slate-900/60 backdrop-blur-xl border-b border-white/10 shadow-lg overflow-hidden">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer select-none relative group/logo p-1 px-2" onClick={() => { setQuery(''); setResults([]); }}>
            <div className="absolute -left-6 -top-6 w-28 h-28 scale-125 sm:scale-150 pointer-events-none group-hover/logo:scale-[1.35] sm:group-hover/logo:scale-[1.6] transition-transform duration-500 will-change-transform transform-gpu">
              <Logo className="w-full h-full" isWatermark={true} />
            </div>
            <div className="relative z-10 pl-10 sm:pl-12">
              <span className="text-2xl sm:text-3xl font-display font-black uppercase tracking-widest drop-shadow-lg">
                <span className="bg-gradient-to-r from-cyan-300 via-cyan-400 to-sky-400 bg-clip-text text-transparent">
                  Atlas
                </span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <div className="flex items-center gap-3">
                <span className="hidden sm:block text-slate-400 text-sm font-medium">
                  Hi, <span className="text-white font-bold">{user.username}</span>
                </span>
                <div className="w-px h-5 bg-white/10 hidden sm:block"></div>
                {(!user || user.origin === 'atlas') && (
                  <button 
                    onClick={() => setIsPasswordModalOpen(true)}
                    className="p-2 rounded-xl hover:bg-white/10 transition-colors text-slate-400 hover:text-white group relative"
                    title="Change Password"
                  >
                    <Key className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  </button>
                )}
                <button 
                  onClick={handleLogout}
                  className="p-2 rounded-xl hover:bg-rose-500/10 hover:text-rose-400 transition-colors text-slate-400 group relative"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
                </button>
              </div>
            )}
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
            <div className="relative flex items-center bg-slate-900/80 backdrop-blur-lg border border-white/10 hover:border-cyan-500/50 rounded-3xl shadow-2xl transition-all overflow-hidden">
              <Search className="w-6 h-6 text-slate-400 ml-6" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title..."
                className="w-full pl-4 pr-16 py-5 bg-transparent text-xl text-white placeholder-slate-500 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-14 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                  title="Clear search"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
              <div className="absolute right-4">
                {searching && <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />}
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
              {/* My Requests Section */}
              {userRequests.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                    <Clock className="w-6 h-6 text-indigo-400" /> My Requests
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {userRequests.map(req => {
                      const inLibrary = req.type === 'movie' 
                        ? libraryMovies.some(m => m.tmdb_id === req.tmdb_id)
                        : libraryShows.some(s => s.tmdb_id === req.tmdb_id);
                      
                      const displayStatus = inLibrary ? 'Approved' : req.status;

                      const libraryItem = req.type === 'movie'
                        ? libraryMovies.find(m => m.tmdb_id === req.tmdb_id)
                        : libraryShows.find(s => s.tmdb_id === req.tmdb_id);
                      const effectiveReleaseDate = req.release_date || libraryItem?.release_date || null;
                      const unreleased = isNotYetReleased(effectiveReleaseDate);
                      const releaseYear = effectiveReleaseDate ? new Date(effectiveReleaseDate).getFullYear() : null;

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
                                  ? posterUrl(req.type === 'movie' ? 'movies' : 'shows', req.tmdb_id)
                                  : tmdbImgUrl(req.poster_path || libraryItem?.poster_path, 'w92')}
                                alt={req.title}
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
                                <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg border ${
                                  displayStatus.toLowerCase() === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                  displayStatus.toLowerCase() === 'denied' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                  'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                }`}>
                                  {getStatusIcon(displayStatus)}
                                  <span className="capitalize">{displayStatus}</span>
                                </div>
                                {unreleased && (
                                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
                                    <CalendarClock className="w-3 h-3" />
                                    Soon
                                  </span>
                                )}
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
        isInLibrary={selectedMediaId ? (selectedMediaType === 'movie' ? libraryMovies.some(m => m.tmdb_id === selectedMediaId) : libraryShows.some(s => s.tmdb_id === selectedMediaId)) : false}
        libraryId={selectedMediaId ? (selectedMediaType === 'movie' ? libraryMovies.find(m => m.tmdb_id === selectedMediaId)?.id : libraryShows.find(s => s.tmdb_id === selectedMediaId)?.id) : null}
        mode="details"
        requestStatus={selectedMediaId ? requests.find(r => r.tmdb_id === selectedMediaId)?.status : null}
        onRequest={handleRequest}
      />
    </div>
  );
}
