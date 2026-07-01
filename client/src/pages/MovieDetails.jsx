import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { formatSize, parseResolution, LANG_LABEL, LANG_NAME } from '../lib/format';
import { useSettings } from '../lib/useSettings';
import { useTMDBDetails } from '../lib/useTMDBDetails';
import { ArrowLeft, Search, Download, HardDrive, Film, PlayCircle, Bookmark, BookmarkMinus, Star, X, RefreshCw, Loader2, Heart, Trash2, ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';
import { useOutsideClick } from '../lib/useOutsideClick';
import TrailerModal from '../components/TrailerModal';
import ManualSearchModal from '../components/ManualSearchModal';
import RemapModal from '../components/RemapModal';
import SubSearchModal from '../components/SubSearchModal';
import FolderBrowserModal from '../components/FolderBrowserModal';
import SubtitleLanguageBadge from '../components/shared/SubtitleLanguageBadge';

export default function MovieDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);
  const { providerLangs, profiles } = useSettings();

  // Search Modal State
  const [searchModalOpen, setSearchModalOpen] = useState(false);

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
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Files State
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [movieFiles, setMovieFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const { tmdbDetails, trailerKey, refetch: refetchTMDB } = useTMDBDetails('movie', movie?.tmdb_id);

  // Subtitle Manual Search Modal
  const [subSearchModal, setSubSearchModal] = useState({ open: false, code: '', label: '' });
  const [subSearchResults, setSubSearchResults] = useState([]);
  const [subSearching, setSubSearching] = useState(false);
  const [subSearched, setSubSearched] = useState(false);

  // Folder browser modal
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);

  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const deleteMenuRef = useOutsideClick(() => setDeleteMenuOpen(false), deleteMenuOpen);

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

  const fetchMovieData = useCallback(async (silent = true) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get(`/library/movies/${id}`);
      if (res.data.status === 'success') {
        const data = res.data.data;
        setMovie(data);
        if (data.files) setMovieFiles(data.files);
      }
    } catch (e) {
      console.error(e);
      if (!silent) customAlert('Failed to load movie details', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  const toggleFiles = () => setFilesExpanded(prev => !prev);

  useEffect(() => {
    fetchMovieData(false);
  }, [fetchMovieData]);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await api.post(`/library/movies/${id}/refresh`);
    } catch (e) {
      console.error('Failed to rescan folder', e);
    }
    await fetchMovieData(true);
    await refetchTMDB();
    setIsRefreshing(false);
    customAlert('Movie refreshed!');
  }, [fetchMovieData, refetchTMDB, id]);

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
      <div className="glass-panel rounded-3xl flex flex-col md:flex-row relative z-10">
        <div className="md:w-1/3 lg:w-1/4 shrink-0 relative group overflow-hidden rounded-t-3xl md:rounded-l-3xl">
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
              aria-label="Play trailer"
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
              disabled={isRefreshing}
              className="mr-2 p-2 bg-slate-800/50 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-purple-400 disabled:opacity-50"
              title="Refresh movie information from TMDB"
              aria-label="Refresh movie information from TMDB"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </h1>
          
          <div className="flex flex-wrap items-center gap-3 mb-6 mt-2">
            {movie.rating > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-950/50 px-2.5 py-1 rounded-lg border border-white/5 shadow-inner">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{Number(movie.rating).toFixed(1)}</span>
              </div>
            )}
            {(() => {
              const isNotReleased = movie.release_date && new Date(movie.release_date) > new Date();
              const statusLabel = (movie.status === 'monitored' && isNotReleased) ? 'not released' : movie.status;
              const statusColor = (movie.status === 'monitored' && isNotReleased)
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : movie.status === 'downloaded' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : movie.status === 'downloading' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : movie.status === 'monitored' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
              return (
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${statusColor}`}>
                  {statusLabel}
                </span>
              );
            })()}
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
            <div className="col-span-full">
              <div className="flex items-center justify-between gap-2">
                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Path</p>
                <button
                  onClick={() => setFolderBrowserOpen(true)}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-2 py-1 rounded-lg transition-colors"
                  title="Browse and import folder"
                >
                  <Folder className="w-3 h-3" /> Import
                </button>
              </div>
              <p className="font-mono text-xs text-slate-300 truncate" title={movie.file_path}>{movie.file_path || 'Not downloaded'}</p>
            </div>
            {movie.scene_name && (
              <div className="col-span-full">
                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Grabbed Release Name (History)</p>
                <p className="font-mono text-xs text-slate-300 truncate" title={movie.scene_name}>{movie.scene_name}</p>
              </div>
            )}
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Resolution</p>
              {parseResolution(movie.scene_name || movie.file_path) !== 'Unknown' ? (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                  {parseResolution(movie.scene_name || movie.file_path)}
                </span>
              ) : (
                <p className="font-medium text-slate-500">-</p>
              )}
            </div>
            <div className="lg:col-span-2">
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
                  <option value="">Unassigned</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Size</p>
              <p className="font-medium text-slate-300">{formatSize(movie.size || movie.file_size)}</p>
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
              <div className="col-span-2 md:col-span-2 lg:col-span-2">
                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Studio</p>
                <p className="font-medium text-slate-300 truncate" title={tmdbDetails.production_companies[0].name}>{tmdbDetails.production_companies[0].name}</p>
              </div>
            )}
            {tmdbDetails && tmdbDetails.genres?.length > 0 && (
              <div className="col-span-2 md:col-span-3 lg:col-span-3">
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
                  {(() => {
                    const existingCodes = movie.subtitles?.map(s => s.lang) || [];
                    const hasExistingSub = movie.subtitles?.length > 0;
                    return providerLangs.map(code => (
                      <SubtitleLanguageBadge
                        key={code}
                        code={code}
                        exists={existingCodes.includes(code)}
                        hasExistingSub={hasExistingSub}
                        isOpen={openLangMenu === `${movie.id}-${code}`}
                        downloading={downloadingSubs[code]}
                        onOpenMenu={() => setOpenLangMenu(openLangMenu === `${movie.id}-${code}` ? null : `${movie.id}-${code}`)}
                        onAutoSearch={async () => {
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
                        onManualSearch={() => {
                          setOpenLangMenu(null);
                          setSubSearchModal({ open: true, code, label: LANG_NAME[code] || code });
                          setSubSearchResults([]);
                          setSubSearched(false);
                        }}
                        onAutoTranslate={async () => {
                          setOpenLangMenu(null);
                          customAlert(`Translating to ${LANG_NAME[code]}...`, 'info');
                          try {
                            const res = await api.post(`/library/movies/${movie.id}/translate-subs`, { targetLang: LANG_NAME[code] });
                            if (res.data.status === 'success') {
                              customAlert(res.data.message);
                              fetchMovieData();
                            }
                          } catch (err) {
                            customAlert(err.response?.data?.message || 'Translation failed', 'error');
                          }
                        }}
                      />
                    ));
                  })()}
                </div>
              )}
            </div>

            {/* TMDB Link / Remap */}
            <div className="col-span-full border-t border-white/5 pt-4 mt-2 flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">TMDB ID</p>
                <a
                  href={`https://www.themoviedb.org/movie/${movie.tmdb_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm text-cyan-400 hover:text-cyan-300 underline"
                >
                  {movie.tmdb_id}
                </a>
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
              onClick={() => setSearchModalOpen(true)}
              className="bg-purple-500 hover:bg-purple-400 text-white font-bold px-6 py-2 rounded-xl flex items-center gap-2 transition-transform hover:scale-105"
            >
              <Search className="w-4 h-4" /> Manual Search
            </button>
            <div ref={deleteMenuRef} className="relative ml-auto">
              <button
                onClick={() => setDeleteMenuOpen(!deleteMenuOpen)}
                className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Delete
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              </button>

              {deleteMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="p-2 border-b border-white/5">
                    <p className="text-xs font-semibold text-slate-400 px-2 py-1">Remove from Library</p>
                  </div>
                  <button
                    onClick={async () => {
                      setDeleteMenuOpen(false);
                      try {
                        await api.delete(`/library/movies/${movie.id}?deleteFiles=true`);
                        customAlert('Movie and files removed from library.', 'success');
                        navigate('/movies');
                      } catch (err) {
                        customAlert(err.response?.data?.message || 'Failed to remove movie.', 'error');
                      }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Delete + Files</p>
                      <p className="text-xs text-slate-500">Remove from library and delete files from disk</p>
                    </div>
                  </button>
                  <div className="border-t border-white/5" />
                  <button
                    onClick={async () => {
                      setDeleteMenuOpen(false);
                      try {
                        await api.delete(`/library/movies/${movie.id}?deleteFiles=false`);
                        customAlert('Movie removed from library.', 'success');
                        navigate('/movies');
                      } catch (err) {
                        customAlert(err.response?.data?.message || 'Failed to remove movie.', 'error');
                      }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 transition-colors text-left"
                  >
                    <X className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Remove Only</p>
                      <p className="text-xs text-slate-500">Remove from library, keep files on disk</p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Files Section */}
      <div className="mt-8">
        <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
          <div 
            onClick={toggleFiles}
            className="w-full flex justify-between items-center p-5 bg-slate-800/50 hover:bg-slate-800 transition-colors cursor-pointer border-b border-white/5"
          >
            <div className="flex items-center gap-3">
              <Folder className="w-5 h-5 text-purple-400" />
              <h3 className="text-base font-bold text-slate-200 group-hover:text-purple-400 transition-colors">Movie Files</h3>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs font-medium bg-slate-900/50 text-slate-400 px-3 py-1 rounded-full border border-white/5">
                {movieFiles.length} Files
              </div>
              {filesExpanded ? (
                <ChevronDown className="w-5 h-5 text-slate-400 transition-transform duration-300" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-400 transition-transform duration-300" />
              )}
            </div>
          </div>
          {filesExpanded && (
            <div className="p-0">
              {loadingFiles ? (
                <div className="p-6 text-center text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Loading files...
                </div>
              ) : movieFiles.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  No files found in directory.
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {movieFiles.map((file) => (
                    <div key={file.name} className="flex items-center justify-between p-4 bg-slate-900/20 hover:bg-slate-800/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <HardDrive className="w-4 h-4 text-slate-500 shrink-0" />
                        <span className="text-sm text-slate-300 truncate">{file.name}</span>
                        <span className="text-xs text-slate-500 shrink-0">{formatSize(file.size)}</span>
                      </div>
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (await customConfirm(`Delete file "${file.name}"? This cannot be undone.`)) {
                            try {
                              const res = await api.delete(`/library/movies/${movie.id}/files/${encodeURIComponent(file.name)}`);
                              if (res.data.status === 'success') {
                                customAlert('File deleted', 'success');
                                setMovieFiles(movieFiles.filter(f => f.name !== file.name));
                                fetchMovieData();
                              }
                            } catch (err) {
                              customAlert('Failed to delete file', 'error');
                            }
                          }
                        }}
                        className="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors ml-4 shrink-0"
                        title="Delete File"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cast & Crew Section */}
      {tmdbDetails?.credits?.cast?.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-bold text-white mb-4">Cast</h2>
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
            {tmdbDetails.credits.cast.slice(0, 15).map(person => (
              <Link key={person.credit_id} to={`/person/${person.id}`} className="shrink-0 w-32 group snap-start">
                <div className="aspect-[2/3] rounded-xl overflow-hidden bg-slate-800 mb-2 border border-white/5 group-hover:border-white/20 transition-colors">
                  {person.profile_path ? (
                    <img src={`https://image.tmdb.org/t/p/w185${person.profile_path}`} alt={person.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-600"><Search className="w-6 h-6 mb-1" />No Image</div>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-200 truncate group-hover:text-cyan-400 transition-colors">{person.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{person.character}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {searchModalOpen && (
        <ManualSearchModal
          mediaId={movie.id}
          mediaType="movie"
          title={movie.title}
          onClose={() => setSearchModalOpen(false)}
          onGrabbed={fetchMovieData}
        />
      )}
      
      {/* Remap Modal */}
      <RemapModal
        type="movie"
        title={movie?.title}
        currentTmdbId={movie?.tmdb_id}
        open={remapModalOpen}
        onClose={() => setRemapModalOpen(false)}
        query={remapQuery}
        setQuery={setRemapQuery}
        searching={remapSearching}
        hasSearched={remapHasSearched}
        results={remapResults}
        remapping={remapping}
        onSearch={handleRemapSearch}
        onConfirm={handleRemapConfirm}
      />

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
                  {subSearchResults.map((provider) => (
                    <div key={provider.provider}>
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

      {/* Folder Browser Modal */}
      <FolderBrowserModal
        open={folderBrowserOpen}
        onClose={() => setFolderBrowserOpen(false)}
        onSelect={(folderPath, message) => {
          customAlert(message);
          fetchMovieData();
        }}
        itemId={movie?.id}
        itemType="movies"
      />
    </div>
  );
}
