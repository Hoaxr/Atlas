import { useState, useEffect } from 'react';
import { Search, Loader2, Plus, Clock, CheckCircle2, XCircle, LogOut, Key, Star, X, Film, Tv, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import Logo from '../components/layout/Logo';
import ChangePasswordModal from '../components/ChangePasswordModal';
import MediaDetailsModal from '../components/MediaDetailsModal';
import MediaRow from '../components/MediaRow';
import { customAlert } from '../utils/alerts';

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
      setRequests(reqsRes.data?.data || []);
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

    const performSearch = async () => {
      setSearching(true);
      try {
        const res = await api.get(`/tmdb/search/multi?query=${encodeURIComponent(query)}`);
        // Filter out people, only keep movies/tv
        setResults(res.data?.data?.filter(item => item.media_type === 'movie' || item.media_type === 'tv') || []);
      } catch (err) {
        customAlert('Search failed');
      } finally {
        setSearching(false);
      }
    };

    performSearch();
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

      const existingRequest = requests.find(r => r.tmdb_id === tmdbId && r.user_id === user?.id);

      if (existingRequest) {
        await api.delete(`/requests/${existingRequest.id}`);
        customAlert('Request cancelled');
      } else {
        await api.post('/requests', {
          tmdb_id: tmdbId,
          type: mediaType,
          title: item.title || item.name
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
      ? "glass-panel rounded-xl overflow-hidden group hover:scale-[1.02] transition-transform duration-300 relative cursor-pointer"
      : "flex-none w-48 sm:w-56 glass-panel rounded-xl overflow-hidden group hover:scale-[1.02] transition-transform duration-300 relative snap-start cursor-pointer";

    return (
      <div 
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
              src={item.poster_path.startsWith('http') ? item.poster_path : `https://image.tmdb.org/t/p/w500${item.poster_path}`} 
              alt={title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500 text-center p-4">No Image</div>
          )}

          <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-3 p-4 z-30 pointer-events-none">
            <div className="w-full pointer-events-auto flex flex-col gap-2">
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
                className={`w-full py-1.5 px-2 text-sm rounded-lg font-bold flex items-center justify-center gap-1.5 shadow-lg transition-colors cursor-pointer
                  ${inLibrary 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30' 
                    : isRequested 
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30' 
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                  }`}
              >
                {inLibrary ? <><CheckCircle2 className="w-4 h-4 flex-shrink-0" /> In Library</> :
                 isRequested ? <><Clock className="w-4 h-4 flex-shrink-0" /> Requested</> : 
                 <><Plus className="w-4 h-4 flex-shrink-0" /> Request</>}
              </button>
              
              {!inLibrary && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMediaId(tmdbId);
                    setSelectedMediaType(isMovie ? 'movie' : 'tv');
                  }}
                  className="w-full py-1.5 px-2 text-sm rounded-lg font-bold flex items-center justify-center gap-1.5 shadow-lg transition-colors cursor-pointer bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700"
                >
                  <Info className="w-4 h-4 flex-shrink-0" /> Info
                </button>
              )}
            </div>
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

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200">
      <header className="border-b border-white/10 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Logo className="w-12 h-12" />
            <span className="text-3xl font-black tracking-wider drop-shadow-[0_0_12px_rgba(6,182,212,0.4)]">
              <span className="bg-gradient-to-r from-cyan-300 via-cyan-400 to-sky-400 bg-clip-text text-transparent">
                Atlas
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            {user && (
              <>
                <span className="hidden sm:inline text-slate-300 font-medium px-2">
                  Welcome back, <span className="font-bold text-white">{user.username}</span>
                </span>
                <div className="hidden sm:block w-px h-5 bg-white/10 mx-1 md:mx-2"></div>
              </>
            )}
            <button 
              onClick={() => setIsPasswordModalOpen(true)}
              className="flex items-center gap-2 px-2 md:px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors text-slate-400 hover:text-white"
              title="Password"
            >
              <Key className="w-4 h-4" />
              <span className="hidden sm:inline">Password</span>
            </button>
            <div className="w-px h-5 bg-white/10 mx-1"></div>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 px-2 md:px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors text-slate-400 hover:text-white"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
          
          {/* Left Column - Trending Movies */}
          <div className="lg:col-span-1 hidden lg:block space-y-6 sticky top-24">
            <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
              <Film className="w-5 h-5 text-orange-400" /> Trending Movies
            </h2>
            <div className="grid grid-cols-2 gap-3 max-h-[calc(100vh-8rem)] overflow-y-auto hide-scrollbar pr-2 pb-8">
              {trendingMovies.map(item => renderMediaCard(item, true, true))}
            </div>
          </div>

          {/* Middle Column - Search, Results, Requests */}
          <div className="lg:col-span-2 space-y-10">
            <div className="text-center space-y-2 max-w-2xl mx-auto mb-6">
              <h1 className="text-3xl font-bold text-white">What do you want to watch?</h1>
              <p className="text-slate-400">Search for movies and TV shows to request them to the server.</p>
            </div>

            <div className="sticky top-16 z-40 pb-4 pt-2 -mt-2">
              <div className="absolute inset-0 bg-[#0f172a]/90 backdrop-blur-md -mx-4 px-4 sm:mx-0 sm:px-0 sm:rounded-b-3xl" />
              <form onSubmit={handleSearch} className="max-w-2xl mx-auto relative flex items-center z-10">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for movies or tv shows..."
                  className="w-full pl-6 pr-24 py-4 bg-slate-900 border border-slate-700 rounded-2xl text-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 shadow-xl"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-16 p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    title="Clear search"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
                <button 
                  type="submit" 
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded-xl transition-colors disabled:opacity-50"
                  disabled={searching}
                >
                  {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                </button>
              </form>
            </div>

              {results.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-8">
                  {results.map(item => renderMediaCard(item))}
                </div>
              )}

            {/* Mobile-only Trending (horizontal) */}
            {!query.trim() && (
              <div className="lg:hidden mt-8 space-y-8">
                <MediaRow title="Trending Movies" items={trendingMovies} renderMediaCard={renderMediaCard} />
                <MediaRow title="Trending TV Shows" items={trendingShows} renderMediaCard={renderMediaCard} />
              </div>
            )}

            <section className="glass-panel p-6 rounded-3xl border border-white/10">
              <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" /> My Requests
              </h2>

              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-cyan-500" /></div>
              ) : requests.filter(r => r.user_id === user?.id).length > 0 ? (
                <div className="space-y-3">
                  {requests.filter(r => r.user_id === user?.id).map(req => {
                    const inLibrary = req.type === 'movie' 
                      ? libraryMovies.some(m => m.tmdb_id === req.tmdb_id)
                      : libraryShows.some(s => s.tmdb_id === req.tmdb_id);
                    
                    const displayStatus = inLibrary ? 'Available' : req.status;

                    return (
                    <div 
                      key={req.id} 
                      onClick={() => {
                        setSelectedMediaId(req.tmdb_id);
                        setSelectedMediaType(req.type === 'movie' ? 'movie' : 'tv');
                      }}
                      className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-white/5 hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <div className="truncate pr-4">
                        <h3 className="font-medium text-white truncate">{req.title}</h3>
                        <div className="text-xs text-slate-400 uppercase tracking-wider mt-1">{req.type}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-medium capitalize text-slate-300">{displayStatus}</span>
                        {getStatusIcon(displayStatus)}
                      </div>
                    </div>
                  )})}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  You haven't requested anything yet.
                </div>
              )}
            </section>
          </div>

          {/* Right Column - Trending Shows */}
          <div className="lg:col-span-1 hidden lg:block space-y-6 sticky top-24">
            <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
              <Tv className="w-5 h-5 text-purple-400" /> Trending TV Shows
            </h2>
            <div className="grid grid-cols-2 gap-3 max-h-[calc(100vh-8rem)] overflow-y-auto hide-scrollbar pr-2 pb-8">
              {trendingShows.map(item => renderMediaCard(item, true, true))}
            </div>
          </div>

        </div>
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
