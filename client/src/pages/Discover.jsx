import { useState, useEffect } from 'react';
import axios from 'axios';
import { Search as SearchIcon, Plus, Info, Tv, Film, Star, CheckCircle2 } from 'lucide-react';
import MediaDetailsModal from '../components/MediaDetailsModal';
import { customAlert } from '../utils/alerts';

export default function Discover() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('movies'); // 'movies' or 'shows'
  const [libraryItems, setLibraryItems] = useState(new Set());
  
  // Modal state
  const [selectedMediaId, setSelectedMediaId] = useState(null);
  const [selectedMediaType, setSelectedMediaType] = useState('movie');

  useEffect(() => {
    if (!query) {
      setResults([]);
      fetchTrending();
    } else {
      const timer = setTimeout(() => {
        executeSearch(query);
      }, 500);
      return () => clearTimeout(timer);
    }
    fetchLibrary();
  }, [query, mode]);

  const fetchLibrary = async () => {
    try {
      const endpoint = mode === 'movies' ? '/api/library/movies' : '/api/library/shows';
      const res = await axios.get(`http://localhost:3000${endpoint}`);
      if (res.data.status === 'success') {
        const itemIds = new Set(res.data.data.map(item => item.tmdb_id));
        setLibraryItems(itemIds);
      }
    } catch (err) {
      console.error('Failed to fetch library', err);
    }
  };

  const fetchTrending = async () => {
    setLoading(true);
    setError('');
    setTrending([]); // Clear existing items while loading new mode
    try {
      const endpoint = mode === 'movies' ? '/api/trakt/trending/movies' : '/api/trakt/trending/shows';
      const res = await axios.get(`http://localhost:3000${endpoint}`);
      if (res.data.status === 'success') {
        setTrending(res.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load trending media. Is Trakt Client ID set in Settings?');
    } finally {
      setLoading(false);
    }
  };

  const executeSearch = async (searchQuery) => {
    if (!searchQuery) return;
    
    setLoading(true);
    setError('');
    try {
      const endpoint = mode === 'movies' ? '/api/tmdb/search/movie' : '/api/tmdb/search/show';
      const res = await axios.get(`http://localhost:3000${endpoint}?query=${encodeURIComponent(searchQuery)}`);
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
  };

  const handleAddMedia = async (tmdbId, type) => {
    try {
      const endpoint = type === 'movie' ? '/api/library/movies' : '/api/library/shows';
      const res = await axios.post(`http://localhost:3000${endpoint}`, { tmdbId });
      if (res.data.status === 'success') {
        customAlert(`${type === 'movie' ? 'Movie' : 'Show'} added to library successfully!`);
        setLibraryItems(prev => new Set(prev).add(tmdbId));
      }
    } catch (err) {
      customAlert(err.response?.data?.message || `Failed to add ${type} to library.`, 'error');
    }
  };

  const displayItems = query ? results : trending;
  const isTrending = !query;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-100 flex items-center gap-3">
            <SearchIcon className="w-8 h-8 text-emerald-400" /> Discover
          </h1>
          <p className="text-slate-400 mt-1">Search and add new media to your library.</p>
        </div>
        
        {/* Mode Toggle */}
        <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/5">
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
      </div>

      <div className="glass-panel rounded-2xl p-6">
        <form onSubmit={searchMovies} className="flex gap-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by title, IMDb ID (e.g. tt1234567), or TMDB ID..."
              className="glass-input w-full !pl-12 h-12 text-lg"
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

      {isTrending && !loading && !error && displayItems.length > 0 && (
        <h2 className="text-xl font-bold text-slate-200 flex items-center space-x-2">
          <span className="bg-gradient-to-r from-orange-400 to-pink-500 text-transparent bg-clip-text">Trending Right Now</span>
          <span className="text-sm font-normal text-slate-500 bg-slate-900 px-2 py-1 rounded-md ml-4 border border-white/5">
            Powered by Trakt.tv
          </span>
        </h2>
      )}

      {displayItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {displayItems.map((item) => {
            // Both TMDB search and our custom backend Trakt proxy return flattened objects
            const media = item;
            
            // Safely skip if media is undefined
            if (!media) return null;

            // The poster comes from the TMDB merge in the backend, or directly from TMDB in search
            const title = media.title || media.name;
            const releaseYear = (media.release_date || media.first_air_date || '')?.split('-')[0] || 'Unknown';
            const rating = media.vote_average ? media.vote_average.toFixed(1) : '?';
            // Trakt responses inject watchers at the top level
            const watchers = media.watchers;
            // The backend merged poster_path directly onto the media object
            const poster = media.poster_path ? `https://image.tmdb.org/t/p/w500${media.poster_path}` : null;
            const tmdbId = media.id || (media.ids && media.ids.tmdb);
            const keyId = tmdbId || Math.random();
            const isInLibrary = tmdbId ? libraryItems.has(tmdbId) : false;
            // Mode defines whether it's a movie or show for the buttons
            const displayType = media.media_type === 'tv' ? 'show' : media.media_type === 'movie' ? 'movie' : mode === 'movies' ? 'movie' : 'show';

            return (
              <div key={keyId} className="glass-panel rounded-xl overflow-hidden group hover:scale-[1.02] transition-transform duration-300 relative">
                
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
                  {poster ? (
                    <img 
                      src={poster} 
                      alt={title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500">No Image</div>
                  )}
                  
                  <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-3 p-4 z-10">
                    <button 
                      onClick={() => handleAddMedia(tmdbId, displayType)}
                      className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 w-full py-2 rounded-lg font-bold flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Add {mode === 'movies' ? 'Movie' : 'Show'}
                    </button>
                    <button 
                      onClick={() => handleDetailsClick(tmdbId, displayType)}
                      className="bg-white/10 hover:bg-white/20 text-white w-full py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <Info className="w-4 h-4" /> Details
                    </button>
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
          })}
        </div>
      )}

      <MediaDetailsModal 
        isOpen={!!selectedMediaId}
        onClose={() => setSelectedMediaId(null)}
        mediaId={selectedMediaId}
        mediaType={selectedMediaType}
      />
    </div>
  );
}
