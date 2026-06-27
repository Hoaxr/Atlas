import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatSize } from '../lib/format';
import { useSettings } from '../lib/useSettings';
import { useTMDBDetails } from '../lib/useTMDBDetails';
import { ArrowLeft, Search, Download, HardDrive, Film, PlayCircle, Bookmark, BookmarkMinus, Star, X, RefreshCw, Loader2 } from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';
import TrailerModal from '../components/TrailerModal';

export default function MovieDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);
  const { providerLangs, profiles } = useSettings();

  // Search Modal State
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Remap Modal State
  const [remapModalOpen, setRemapModalOpen] = useState(false);
  const [remapQuery, setRemapQuery] = useState('');
  const [remapSearching, setRemapSearching] = useState(false);
  const [remapResults, setRemapResults] = useState([]);
  const [remapHasSearched, setRemapHasSearched] = useState(false);
  const [remapping, setRemapping] = useState(false);
  const [downloadingSubs, setDownloadingSubs] = useState({});
  const [openLangMenu, setOpenLangMenu] = useState(null);
  const [updatingQuality, setUpdatingQuality] = useState(false);

  const { tmdbDetails, trailerKey, clear: clearTMDB } = useTMDBDetails('movie', movie?.tmdb_id);

  // Subtitle Manual Search Modal
  const [subSearchModal, setSubSearchModal] = useState({ open: false, code: '', label: '' });
  const [subSearchResults, setSubSearchResults] = useState([]);
  const [subSearching, setSubSearching] = useState(false);
  const [subSearched, setSubSearched] = useState(false);

  // Close lang menu on outside click
  useEffect(() => {
    if (!openLangMenu) return;
    const handler = (e) => {
      if (e.target.closest('[data-lang-badge]') || e.target.closest('[data-lang-menu]')) return;
      setOpenLangMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openLangMenu]);

  useEffect(() => {
    fetchMovieData();
  }, [id]);

  const fetchMovieData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/library/movies/${id}`);
      if (res.data.status === 'success') {
        setMovie(res.data.data);
      }
    } catch (e) {
      console.error(e);
      customAlert('Failed to load movie details', 'error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const refreshAll = useCallback(() => {
    clearTMDB();
    fetchMovieData();
  }, [clearTMDB, fetchMovieData]);

  const handleQualityChange = async (profileId) => {
    setUpdatingQuality(true);
    try {
      const res = await api.put(`/library/movies/${movie.id}/quality`, { profileId: profileId || null });
      if (res.data.status === 'success') {
        setMovie(prev => ({ ...prev, quality_profile_id: profileId || null, quality_profile_name: profiles.find(p => p.id === profileId)?.name || null }));
      }
    } catch (err) {
      console.error('Failed to update quality profile', err);
    } finally {
      setUpdatingQuality(false);
    }
  };

  const handleSubSearch = async () => {
    setSubSearching(true);
    setSubSearchResults([]);
    setSubSearched(false);
    try {
      const res = await api.get(`/library/movies/${movie.id}/search-subs`, {
        params: { lang: subSearchModal.code }
      });
      if (res.data.status === 'success') {
        setSubSearchResults(res.data.data);
      }
    } catch (err) {
      customAlert('Search failed', 'error');
    } finally {
      setSubSearching(false);
      setSubSearched(true);
    }
  };

  const handleRemapSearch = async () => {
    if (!remapQuery.trim()) return;
    setRemapSearching(true);
    setRemapResults([]);
    setRemapHasSearched(false);
    try {
      const res = await api.get(`/tmdb/search/movie`, {
        params: { query: remapQuery.trim() }
      });
      if (res.data.status === 'success') {
        setRemapResults(res.data.data);
      }
    } catch (err) {
      customAlert('Search failed', 'error');
    } finally {
      setRemapSearching(false);
      setRemapHasSearched(true);
    }
  };

  const handleRemapConfirm = async (newMovie) => {
    if (!await customConfirm(`Remap "${movie.title}" to "${newMovie.title}"?\n\nThis will update the poster, overview, rating and all metadata from the new TMDB entry.`)) return;
    
    setRemapping(true);
    try {
      const res = await api.put(`/library/movies/${movie.id}/remap`, {
        tmdbId: newMovie.id,
        title: newMovie.title,
        year: newMovie.release_date ? newMovie.release_date.split('-')[0] : null,
        poster_path: newMovie.poster_path,
        overview: newMovie.overview,
        vote_average: newMovie.vote_average || 0
      });
      if (res.data.status === 'success') {
        customAlert(`Remapped to "${newMovie.title}" successfully!`);
        setRemapModalOpen(false);
        // Clear stale TMDB details so the UI doesn't show old data while re-fetching
        refreshAll();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to remap movie';
      customAlert(msg, 'error');
    } finally {
      setRemapping(false);
    }
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
                  const res = await api.post(`/library/movies/${movie.id}/toggle-monitor`);
                  if (res.data.status === 'success') {
                    fetchMovieData(); // refresh
                  }
                } catch (err) {
                  customAlert('Failed to toggle monitor status', 'error');
                }
              }}
              className="hover:scale-110 transition-transform cursor-pointer focus:outline-none"
              title={movie.monitored ? "Monitored" : "Unmonitored"}
            >
              {movie.monitored ? (
                <Bookmark className="w-8 h-8 md:w-10 md:h-10 text-cyan-400 fill-cyan-400" />
              ) : (
                <BookmarkMinus className="w-8 h-8 md:w-10 md:h-10 text-slate-500" />
              )}
            </button>
            <span>
              {movie.title} <span className="text-slate-400 font-light">({movie.year})</span>
            </span>
            <button
              onClick={refreshAll}
              className="mr-2 p-2 bg-slate-800/50 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-cyan-400"
              title="Refresh movie information from TMDB"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </h1>
          
          <div className="flex flex-wrap items-center gap-3 mb-6 mt-2">
            {movie.rating > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-950/50 px-2.5 py-1 rounded-lg border border-white/5 shadow-inner">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{Number(movie.rating).toFixed(1)}</span>
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
              {updatingQuality ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                  <span className="text-xs text-slate-400">Updating...</span>
                </div>
              ) : (
                <select
                  className="bg-slate-800 border border-white/10 rounded-lg text-xs text-slate-300 px-2 py-1.5 focus:border-cyan-500/50 focus:outline-none cursor-pointer max-w-[140px]"
                  value={movie.quality_profile_id || ''}
                  onChange={(e) => handleQualityChange(e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">Any</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Size</p>
              <p className="font-medium text-slate-300">{formatSize(movie.size)}</p>
            </div>
            
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Watched</p>
              <p className={`font-bold ${movie.watched ? 'text-emerald-400' : 'text-slate-500'}`}>
                {movie.watched ? '✓ Yes' : 'No'}
              </p>
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

            {/* Subtitles */}
            <div className="col-span-full border-t border-white/5 pt-4 mt-2">
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-2">Subtitles</p>
              {!movie.file_path ? (
                <p className="text-slate-500 italic text-xs">No file on disk</p>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Clickable badges for all provider languages */}
                  {(() => {
                    const langCode = { en: 'EN', nl: 'NL', fr: 'FR', de: 'DE', es: 'ES', it: 'IT', pt: 'PT' };
                    const langName = { en: 'English', nl: 'Dutch', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese' };
                    const existingCodes = movie.subtitles?.map(s => s.lang) || [];
                    const hasExistingSub = movie.subtitles?.length > 0;
                    return providerLangs.map(code => {
                      const exists = existingCodes.includes(code);
                      return (
                        <span key={code} className="relative">
                          <span
                            data-lang-badge
                            role="button"
                            tabIndex={0}
                            onClick={() => setOpenLangMenu(openLangMenu === `${movie.id}-${code}` ? null : `${movie.id}-${code}`)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenLangMenu(openLangMenu === `${movie.id}-${code}` ? null : `${movie.id}-${code}`); } }}
                            className={`text-xs uppercase font-bold px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                              exists
                                ? 'bg-slate-800 text-slate-300 border border-white/5 hover:bg-slate-700 hover:text-white'
                                : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 hover:text-amber-300 border border-amber-500/30 hover:border-amber-400/50'
                            }`}
                          >
                            {langCode[code] || code}
                          </span>
                          {openLangMenu === `${movie.id}-${code}` && (
                            <div data-lang-menu className="absolute left-0 top-full mt-1 bg-slate-800 border border-white/10 rounded-xl py-1 shadow-2xl z-50 min-w-[150px]">
                              {!exists && (
                                <button
                                  onClick={async () => {
                                    setOpenLangMenu(null);
                                    setDownloadingSubs(prev => ({ ...prev, [code]: true }));
                                    try {
                                      const res = await api.post(`/library/movies/${movie.id}/download-subs`, { langCode: code });
                                      customAlert(res.data.message);
                                      fetchMovieData();
                                    } catch (err) {
                                      customAlert(err.response?.data?.message || 'Auto search failed', 'error');
                                    } finally {
                                      setDownloadingSubs(prev => ({ ...prev, [code]: false }));
                                    }
                                  }}
                                  disabled={downloadingSubs[code]}
                                  className="block w-full text-left text-xs font-medium px-3 py-2 text-slate-300 hover:bg-slate-700/50 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                  {downloadingSubs[code] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                                  Auto Search
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setOpenLangMenu(null);
                                  setSubSearchModal({ open: true, code, label: langName[code] || code });
                                  setSubSearchResults([]);
                                  setSubSearched(false);
                                }}
                                className="block w-full text-left text-xs font-medium px-3 py-2 text-slate-300 hover:bg-slate-700/50 transition-colors flex items-center gap-2"
                              >
                                <Download className="w-3 h-3" />
                                Manual Search
                              </button>
                              {hasExistingSub && (
                                <button
                                  onClick={async () => {
                                    setOpenLangMenu(null);
                                    customAlert(`Translating to ${langName[code]}...`, 'info');
                                    try {
                                      const targetName = Object.entries(langName).find(([, v]) => v === langName[code])?.[0] || langName[code];
                                      const res = await api.post(`/library/movies/${movie.id}/translate-subs`, { targetLang: langName[code] });
                                      if (res.data.status === 'success') {
                                        customAlert(res.data.message);
                                        fetchMovieData();
                                      }
                                    } catch (err) {
                                      customAlert(err.response?.data?.message || 'Translation failed', 'error');
                                    }
                                  }}
                                  className="block w-full text-left text-xs font-medium px-3 py-2 text-slate-300 hover:bg-slate-700/50 transition-colors flex items-center gap-2"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  Auto Translate
                                </button>
                              )}
                            </div>
                          )}
                        </span>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            {/* TMDB Link / Remap */}
            <div className="col-span-full border-t border-white/5 pt-4 mt-2 flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">TMDB ID</p>
                <p className="font-mono text-sm text-slate-300">
                  {movie.tmdb_id}
                  <a
                    href={`https://www.themoviedb.org/movie/${movie.tmdb_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-cyan-400 hover:text-cyan-300 underline text-xs"
                  >
                    View on TMDB
                  </a>
                </p>
              </div>
              <button
                onClick={() => {
                  setRemapModalOpen(true);
                  setRemapQuery('');
                  setRemapResults([]);
                  setRemapHasSearched(false);
                }}
                className="flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Remap
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 mt-6">
            <button 
              onClick={async () => {
                if (await customConfirm(`Start auto-search for ${movie.title}?`)) {
                  try {
                    await api.post(`/library/movies/${movie.id}/auto-search`);
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
                  const res = await api.get(`/library/movies/${movie.id}/search`);
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
                          await api.post(`/library/movies/${movie.id}/download`, { torrentUrl: res.link });
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
      
      {/* Remap Modal */}
      {remapModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 p-6 rounded-2xl w-full max-w-2xl border border-white/10 max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <RefreshCw className="w-6 h-6 text-amber-400" /> Remap Movie
              </h2>
              <button onClick={() => setRemapModalOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              Search TMDB for the correct movie to link <strong className="text-slate-700 dark:text-slate-200">{movie.title}</strong> to.
            </p>

            <div className="flex gap-2 mb-4 shrink-0">
              <input
                type="text"
                value={remapQuery}
                onChange={(e) => setRemapQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRemapSearch();
                  }
                }}
                placeholder="Search for the correct movie..."
                className="flex-1 bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 text-sm"
              />
              <button
                onClick={handleRemapSearch}
                disabled={!remapQuery.trim() || remapSearching}
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-5 py-2 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 text-sm"
              >
                {remapSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
            </div>

            <div className="overflow-y-auto flex-1 min-h-0 space-y-2">
              {remapSearching ? (
                <div className="flex flex-col items-center justify-center py-10 text-cyan-400">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500 mb-4"></div>
                  <p className="font-bold">Searching TMDB...</p>
                </div>
              ) : !remapResults.length && remapHasSearched ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <p>No movies found. Try a different search term.</p>
                </div>
              ) : (
                remapResults.map((result, i) => {
                  const resultYear = result.release_date ? result.release_date.split('-')[0] : '—';
                  const isCurrent = result.id === movie.tmdb_id;
                  return (
                    <div
                      key={i}
                      className={`bg-slate-800 p-3 rounded-xl flex gap-3 items-center border transition-colors ${
                        isCurrent ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-white/5 hover:bg-slate-750'
                      }`}
                    >
                      <div className="w-12 h-[66px] rounded-lg shrink-0 bg-slate-700 flex items-center justify-center overflow-hidden">
                        {result.poster_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${result.poster_path}`}
                            alt={result.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-500 font-medium text-center leading-tight px-1">No<br/>Image</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-200 truncate">
                          {result.title} <span className="text-slate-400 font-light">({resultYear})</span>
                        </p>
                        {result.overview && (
                          <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{result.overview}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {result.vote_average > 0 && (
                            <span className="flex items-center gap-0.5 text-xs text-yellow-400">
                              <Star className="w-3 h-3 fill-yellow-400" /> {result.vote_average.toFixed(1)}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-slate-600">TMDB: {result.id}</span>
                          {isCurrent && (
                            <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">Current</span>
                          )}
                        </div>
                      </div>
                      {!isCurrent && (
                        <button
                          onClick={() => handleRemapConfirm(result)}
                          disabled={remapping}
                          className="shrink-0 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-2 rounded-lg text-xs transition-colors disabled:opacity-50"
                        >
                          {remapping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Use This'}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {isTrailerOpen && trailerKey && (
        <TrailerModal trailerKey={trailerKey} onClose={() => setIsTrailerOpen(false)} />
      )}

      {/* Subtitle Manual Search Modal */}
      {subSearchModal.open && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" onClick={() => setSubSearchModal({ open: false, code: '', label: '' })}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-slate-900 border border-white/10 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                  <Search className="w-5 h-5 text-cyan-400" />
                  Search Subtitles — {subSearchModal.label}
                </h3>
                <p className="text-xs text-slate-500 mt-2 font-mono truncate max-w-[550px]" title={movie.file_path}>{movie.file_path}</p>
                {movie.file_path && (() => {
                  const parts = movie.file_path.split('/');
                  const filename = parts[parts.length - 1];
                  const sceneName = filename.replace(/\.[^.]+$/, '');
                  return <p className="text-[10px] text-slate-600 mt-1 font-mono truncate max-w-[550px]">{sceneName}</p>;
                })()}
              </div>
              <button onClick={() => setSubSearchModal({ open: false, code: '', label: '' })} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 min-h-0">
              {!subSearched ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <p className="text-sm">Click <strong>Search Providers</strong> to find "{subSearchModal.label}" subtitles.</p>
                </div>
              ) : subSearchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <p className="text-sm">No subtitles found from any provider.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {subSearchResults.map((provider, pi) => (
                    <div key={pi}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{provider.provider}</span>
                        <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded-full">{provider.items.length} result{provider.items.length > 1 ? 's' : ''}</span>
                      </div>
                      {/* Table header */}
                      <div className="hidden md:flex items-center gap-3 px-3 py-1.5 text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">
                        <span className="w-14 text-center">Score</span>
                        <span className="w-10 text-center">Lang</span>
                        <span className="w-20">Provider</span>
                        <span className="flex-1">Release / Uploader</span>
                        <span className="w-16 text-center hidden lg:block">Date</span>
                        <span className="w-10 text-center">Get</span>
                      </div>
                      <div className="space-y-1">
                        {provider.items.map((item, ii) => (
                          <div
                            key={ii}
                            className="w-full bg-slate-800/30 hover:bg-slate-700/50 rounded-lg border border-white/5 hover:border-cyan-500/30 transition-all group"
                          >
                            <div className="flex items-center gap-3 px-3 py-2.5">
                              {/* Score */}
                              <span className={`w-14 text-center text-xs font-bold shrink-0 ${
                                item.rating >= 100 ? 'text-emerald-400' :
                                item.rating >= 80 ? 'text-emerald-400' :
                                item.rating >= 60 ? 'text-yellow-400' :
                                item.rating > 0 ? 'text-slate-400' : 'text-slate-600'
                              }`}>
                                {item.rating > 0 ? `${Math.round(item.rating)}%` : '—'}
                              </span>
                              {/* Language */}
                              <span className="w-10 text-center text-[10px] uppercase font-bold shrink-0 relative">
                                <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                                  {item.language || subSearchModal.label}
                                </span>
                                {(item.hearingImpaired) && (
                                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full" title="Hearing Impaired" />
                                )}
                              </span>
                              {/* Provider */}
                              <a
                                href={item.url || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="w-20 text-[10px] truncate shrink-0 font-medium hover:underline"
                              >
                                {provider.provider === 'OpenSubtitles' ? (
                                  <span className="text-cyan-400">OpenSubtitles</span>
                                ) : provider.provider === 'SubDL' ? (
                                  <span className="text-amber-400">SubDL</span>
                                ) : provider.provider === 'SubSource' ? (
                                  <span className="text-purple-400">SubSource</span>
                                ) : (
                                  provider.provider
                                )}
                              </a>
                              {/* Release & Uploader */}
                              <span className="flex-1 min-w-0">
                                <span className="text-xs text-slate-300 group-hover:text-white truncate block" title={item.release || item.name}>
                                  {item.release || item.name}
                                </span>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {item.uploader && (
                                    <span className="text-[10px] text-slate-500 truncate max-w-[120px]" title={item.uploader}>
                                      {item.uploader}
                                    </span>
                                  )}
                                  {item.fromTrusted && (
                                    <span className="text-[10px] text-emerald-400/80 font-medium">✓ Trusted</span>
                                  )}
                                  {item.aiTranslated && (
                                    <span className="text-[10px] text-amber-400/80">AI</span>
                                  )}
                                  {item.downloads > 0 && (
                                    <span className="text-[10px] text-slate-500">{item.downloads} DL</span>
                                  )}
                                  {item.format && (
                                    <span className="text-[10px] text-slate-600 uppercase">{item.format}</span>
                                  )}
                                </div>
                              </span>
                              {/* Upload date */}
                              <span className="text-[10px] text-slate-500 text-right shrink-0 max-w-[80px] truncate hidden lg:block" title={item.uploadDate || ''}>
                                {item.uploadDate || ''}
                              </span>
                              {/* Download button */}
                              <button
                                onClick={async () => {
                                  setDownloadingSubs(prev => ({ ...prev, [subSearchModal.code]: true }));
                                  try {
                                    if (item.fileId) {
                                      const res = await api.post(`/library/movies/${movie.id}/download-subs`, {
                                        langCode: subSearchModal.code, fileId: item.fileId
                                      });
                                      customAlert(res.data.message);
                                    } else {
                                      const res = await api.post(`/library/movies/${movie.id}/download-subs`, {
                                        langCode: subSearchModal.code, fileId: item.fileId || item.subId || item.subdlId
                                      });
                                      customAlert(res.data.message);
                                    }
                                    setSubSearchModal({ open: false, code: '', label: '' });
                                    fetchMovieData();
                                  } catch (err) {
                                    customAlert(err.response?.data?.message || 'Download failed', 'error');
                                  } finally {
                                    setDownloadingSubs(prev => ({ ...prev, [subSearchModal.code]: false }));
                                  }
                                }}
                                className="shrink-0 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-white/5 flex justify-end gap-2 shrink-0">
              <button onClick={() => setSubSearchModal({ open: false, code: '', label: '' })} className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSubSearch}
                disabled={subSearching}
                className="px-5 py-2 text-sm font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/30 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {subSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search Providers
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
