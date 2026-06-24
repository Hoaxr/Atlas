import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Search, Download, HardDrive, Film, PlayCircle, Bookmark, BookmarkMinus, Star, Subtitles, X } from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';
import TrailerModal from '../components/TrailerModal';

export default function MovieDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trailerKey, setTrailerKey] = useState(null);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);
  const [tmdbDetails, setTmdbDetails] = useState(null);

  // Search Modal State
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    fetchMovieData();
  }, [id]);

  useEffect(() => {
    if (movie && movie.tmdb_id) {
      axios.get(`http://localhost:3000/api/tmdb/movie/${movie.tmdb_id}?_t=${Date.now()}`).then(res => {
        setTmdbDetails(res.data.data);
        if (res.data?.data?.videos?.results) {
          const trailer = res.data.data.videos.results.find(v => v.site === 'YouTube' && v.type === 'Trailer');
          if (trailer) setTrailerKey(trailer.key);
        }
      }).catch(err => console.error(err));
    }
  }, [movie]);

  const fetchMovieData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`http://localhost:3000/api/library/movies/${id}`);
      if (res.data.status === 'success') {
        setMovie(res.data.data);
      }
    } catch (e) {
      console.error(e);
      customAlert('Failed to load movie details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="text-center py-20 text-slate-400">
        <Film className="w-16 h-16 mx-auto mb-4 opacity-50" />
        <h2 className="text-2xl font-bold text-white mb-2">Movie Not Found</h2>
        <button onClick={() => navigate('/movies')} className="text-cyan-400 hover:text-cyan-300">Return to Movies</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <button 
        onClick={() => navigate('/movies')} 
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Movies
      </button>

      {/* Hero / Banner Section */}
      <div className="glass-panel rounded-3xl overflow-hidden flex flex-col md:flex-row relative">
        <div className="md:w-1/3 lg:w-1/4 shrink-0 relative group">
          <img 
            src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`} 
            alt={movie.title}
            className="w-full h-full object-cover aspect-[2/3]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent md:bg-gradient-to-r"></div>
          {trailerKey && (
            <button 
              onClick={() => setIsTrailerOpen(true)}
              className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            >
              <PlayCircle className="w-16 h-16 text-white drop-shadow-xl hover:scale-110 transition-transform duration-300" />
            </button>
          )}
        </div>
        
        <div className="p-8 md:w-2/3 lg:w-3/4 flex flex-col justify-center">
          <h1 className="text-4xl md:text-5xl font-black text-white mb-2 tracking-tight flex items-center gap-3">
            <button 
              onClick={async () => {
                try {
                  const res = await axios.post(`http://localhost:3000/api/library/movies/${movie.id}/toggle-monitor`);
                  if (res.data.status === 'success') {
                    fetchMovieData(); // refresh
                  }
                } catch (err) {
                  customAlert('Failed to toggle monitor status', 'error');
                }
              }}
              className="hover:scale-110 transition-transform cursor-pointer focus:outline-none"
              title={movie.status === 'unmonitored' ? "Unmonitored" : "Monitored"}
            >
              {movie.status !== 'unmonitored' ? (
                <Bookmark className="w-8 h-8 md:w-10 md:h-10 text-cyan-400 fill-cyan-400" />
              ) : (
                <BookmarkMinus className="w-8 h-8 md:w-10 md:h-10 text-slate-500" />
              )}
            </button>
            <span>
              {movie.title} <span className="text-slate-400 font-light">({movie.year})</span>
            </span>
          </h1>
          
          <div className="flex flex-wrap items-center gap-3 mb-6 mt-2">
            {movie.rating > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-950/50 px-2.5 py-1 rounded-lg border border-white/5 shadow-inner">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                <span className="text-sm font-bold text-slate-200">{Number(movie.rating).toFixed(1)}</span>
              </div>
            )}
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              movie.status === 'downloaded' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 
              movie.status === 'downloading' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 
              movie.status === 'monitored' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 
              'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              {movie.status}
            </span>
            {movie.file_path && (
              <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                <HardDrive className="w-3 h-3" /> Available locally
              </span>
            )}
          </div>
          
          <p className="text-slate-300 text-lg leading-relaxed max-w-3xl mb-6">
            {movie.overview || 'No overview available for this movie.'}
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-6 w-full mt-4 text-sm bg-slate-900/50 p-5 rounded-xl border border-white/5">
            <div className="col-span-2">
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Path</p>
              <p className="font-mono text-xs text-slate-300 truncate" title={movie.file_path}>{movie.file_path || 'Not downloaded'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Status</p>
              <p className="font-medium text-slate-300 capitalize">{movie.status}</p>
            </div>
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Quality Profile</p>
              <p className="font-medium text-slate-300">{movie.quality_profile_name || 'Any'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Size</p>
              <p className="font-medium text-slate-300">{formatSize(movie.size)}</p>
            </div>
            
            {tmdbDetails && tmdbDetails.original_language && (
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Language</p>
                <p className="font-medium text-slate-300 uppercase">{tmdbDetails.original_language}</p>
              </div>
            )}
            {tmdbDetails && tmdbDetails.production_companies?.length > 0 && (
              <div className="col-span-2 md:col-span-1">
                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Studio</p>
                <p className="font-medium text-slate-300 truncate" title={tmdbDetails.production_companies[0].name}>{tmdbDetails.production_companies[0].name}</p>
              </div>
            )}
            {tmdbDetails && tmdbDetails.genres?.length > 0 && (
              <div className="col-span-2 md:col-span-4 lg:col-span-2">
                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Genres</p>
                <p className="font-medium text-slate-300 truncate">{tmdbDetails.genres.map(g => g.name).join(', ')}</p>
              </div>
            )}

            {/* Subtitles on a new line within the grid */}
            <div className="col-span-full border-t border-white/5 pt-4 mt-2">
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-2">Subtitles</p>
              {movie.file_path && movie.subtitles && movie.subtitles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {movie.subtitles.map((sub, idx) => (
                    <span key={idx} className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-1 rounded text-xs truncate max-w-xs" title={sub}>
                      {sub}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 italic text-xs">No local subtitles found</p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 mt-6">
            <button 
              onClick={async () => {
                if (await customConfirm(`Start auto-search for ${movie.title}?`)) {
                  try {
                    await axios.post(`http://localhost:3000/api/library/movies/${movie.id}/auto-search`);
                    customAlert('Search initiated. It might take a moment to find and add.', 'info');
                    fetchMovieData(); // refresh status
                  } catch (err) {
                    customAlert('Search failed.', 'error');
                  }
                }
              }}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-6 py-2 rounded-xl flex items-center gap-2 transition-transform hover:scale-105"
            >
              <Search className="w-4 h-4" /> Auto Search
            </button>
            <button 
              onClick={async () => {
                setSearchModalOpen(true);
                setSearchResults([]);
                setHasSearched(false);
                setIsSearching(true);
                try {
                  const res = await axios.get(`http://localhost:3000/api/library/movies/${movie.id}/search`);
                  setSearchResults(res.data.data);
                  setHasSearched(true);
                } catch (e) {
                  customAlert('Search failed', 'error');
                  setHasSearched(true);
                }
                setIsSearching(false);
              }}
              className="bg-purple-500 hover:bg-purple-400 text-white font-bold px-6 py-2 rounded-xl flex items-center gap-2 transition-transform hover:scale-105"
            >
              <Search className="w-4 h-4" /> Manual Search
            </button>
          </div>
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
            
            <div className="overflow-y-auto flex-1 min-h-0 pr-2">
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
                      <p className="text-sm font-bold text-slate-200 truncate" title={res.title}>{res.title}</p>
                      <div className="flex space-x-3 text-xs text-slate-400 mt-1">
                        <span className="text-cyan-400">{res.indexer}</span>
                        <span>{res.seeders} Seeders</span>
                        <span>{(res.size / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                      </div>
                    </div>
                    <button 
                      onClick={async () => {
                        try {
                          await axios.post(`http://localhost:3000/api/library/movies/${movie.id}/download`, { torrentUrl: res.link });
                          customAlert('Sent to download client!');
                          setSearchModalOpen(false);
                          fetchMovieData(); // update state (e.g. status)
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
      
      {isTrailerOpen && trailerKey && (
        <TrailerModal trailerKey={trailerKey} onClose={() => setIsTrailerOpen(false)} />
      )}
    </div>
  );
}
