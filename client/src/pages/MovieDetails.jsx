import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { formatSize, parseResolution, LANG_NAME } from '../lib/format';
import { useSettings } from '../lib/useSettings';
import { useTMDBDetails } from '../lib/useTMDBDetails';
import {
  ArrowLeft, Search, Download, Film, PlayCircle, Bookmark, BookmarkMinus,
  Star, X, RefreshCw, Loader2, ChevronDown, ChevronRight, ChevronLeft,
  Folder, Zap, Trash2, HardDrive, Globe, Eye
} from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';
import { useOutsideClick } from '../lib/useOutsideClick';
import TrailerModal from '../components/TrailerModal';
import ManualSearchModal from '../components/ManualSearchModal';
import RemapModal from '../components/RemapModal';
import SubSearchModal from '../components/SubSearchModal';
import ModalShell from '../components/shared/ModalShell';
import { ProviderLabel } from '../utils/providerColors';
import FolderBrowserModal from '../components/FolderBrowserModal';
import SubtitleLanguageBadge from '../components/shared/SubtitleLanguageBadge';
import MediaDetailsModal from '../components/MediaDetailsModal';

export default function MovieDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [movie, setMovie] = useState(null);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);
  const { providerLangs, profiles } = useSettings();

  const [searchModalOpen, setSearchModalOpen] = useState(false);
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

  const [filesExpanded, setFilesExpanded] = useState(false);
  const [movieFiles, setMovieFiles] = useState([]);

  const { tmdbDetails, trailerKey, refetch: refetchTMDB } = useTMDBDetails('movie', movie?.tmdb_id);

  const [subSearchModal, setSubSearchModal] = useState({ open: false, code: '', label: '' });
  const [subSearchResults, setSubSearchResults] = useState([]);
  const [subSearching, setSubSearching] = useState(false);
  const [subSearched, setSubSearched] = useState(false);

  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const deleteMenuRef = useOutsideClick(() => setDeleteMenuOpen(false), deleteMenuOpen);

  // Similar movies modal state
  const [similarModal, setSimilarModal] = useState({ open: false, mediaId: null, isInLibrary: false, libraryId: null });
  const [libraryMovieMap, setLibraryMovieMap] = useState(new Map()); // tmdb_id → library id

  // Prev/next navigation
  const [siblingIds, setSiblingIds] = useState([]);

  useEffect(() => {
    api.get('/library/movies?badges=true').then(res => {
      if (res.data?.data) {
        setSiblingIds(res.data.data.map(m => m.id));
        const map = new Map(res.data.data.map(m => [m.tmdb_id, m.id]));
        setLibraryMovieMap(map);
      }
    }).catch(() => {});
  }, []);

  const currentIndex = siblingIds.indexOf(Number(id));
  const prevId = currentIndex > 0 ? siblingIds[currentIndex - 1] : null;
  const nextId = currentIndex >= 0 && currentIndex < siblingIds.length - 1 ? siblingIds[currentIndex + 1] : null;

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
        refreshAll();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to remap movie';
      customAlert(msg, 'error');
    } finally {
      setRemapping(false);
    }
  };

  if (!movie) return null;

  /* ─── Derived data ─── */
  const resolution = parseResolution(movie.scene_name || movie.file_path);
  const genres = tmdbDetails?.genres || [];
  const castList = tmdbDetails?.credits?.cast?.slice(0, 5) || [];
  const addedDate = movie.created_at ? new Date(movie.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  // US content rating from release_dates
  let certification = '';
  if (tmdbDetails?.release_dates?.results) {
    const usRelease = tmdbDetails.release_dates.results.find(r => r.iso_3166_1 === 'US');
    if (usRelease) {
      const certEntry = usRelease.release_dates.find(d => d.certification);
      if (certEntry) certification = certEntry.certification;
    }
  }

  // Runtime
  let runtime = '';
  if (tmdbDetails?.runtime) {
    const h = Math.floor(tmdbDetails.runtime / 60);
    const m = tmdbDetails.runtime % 60;
    runtime = h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  // Status label & color
  const isNotReleased = movie.release_date && new Date(movie.release_date) > new Date();
  const statusLabel = (movie.status === 'monitored' && isNotReleased) ? 'Not Released' : movie.status;
  const statusColorClass =
    statusLabel === 'downloaded' ? 'text-emerald-400' :
    statusLabel === 'downloading' ? 'text-blue-400' :
    statusLabel === 'monitored' ? 'text-emerald-400' :
    statusLabel === 'Not Released' ? 'text-blue-400' :
    'text-rose-400';

  return (
    <div className="relative min-h-screen pb-12">
      {/* Backdrop */}
      {tmdbDetails?.backdrop_path ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2 }}
          className="fixed inset-0 z-0"
        >
          <img
            src={`https://image.tmdb.org/t/p/original${tmdbDetails.backdrop_path}`}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/85 via-slate-950/75 to-slate-950/98" />
        </motion.div>
      ) : (
        <div className="fixed inset-0 z-0 bg-slate-950" />
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-4"
      >
        {/* ── Top Navigation ── */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/movies')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-xl border border-white/10 hover:border-white/20 transition-all duration-200 text-sm font-medium backdrop-blur-xl"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => prevId && navigate(`/movies/${prevId}`)}
              disabled={!prevId}
              className="p-2.5 bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-xl border border-white/10 hover:border-white/20 transition-all duration-200 disabled:opacity-25 disabled:cursor-not-allowed backdrop-blur-xl"
              title="Previous movie"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => nextId && navigate(`/movies/${nextId}`)}
              disabled={!nextId}
              className="p-2.5 bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-xl border border-white/10 hover:border-white/20 transition-all duration-200 disabled:opacity-25 disabled:cursor-not-allowed backdrop-blur-xl"
              title="Next movie"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Main Card ── */}
        <div className="bg-slate-900/50 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden">
          <div className="flex flex-col md:flex-row">

            {/* ─── Left: Poster Column ─── */}
            <div className="md:w-[260px] lg:w-[300px] shrink-0 flex flex-col">
              {/* Poster */}
              <div className="relative group">
                <img
                  src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                  alt={movie.title}
                  className="w-full aspect-[2/3] object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none" />
                {trailerKey && (
                  <button
                    onClick={() => setIsTrailerOpen(true)}
                    className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/50 transition-all duration-400"
                    aria-label="Play trailer"
                  >
                    <PlayCircle className="w-14 h-14 text-white/0 group-hover:text-white drop-shadow-2xl group-hover:scale-110 transition-all duration-300" />
                  </button>
                )}
                {/* TMDB link badge */}
                {movie.tmdb_id && (
                  <a
                    href={`https://www.themoviedb.org/movie/${movie.tmdb_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-[#0d253f]/80 hover:bg-[#0d253f] backdrop-blur-sm border border-[#01b4e4]/30 hover:border-[#01b4e4]/60 px-2 py-1 rounded-lg transition-all duration-200 group/tmdb"
                    title="View on TMDB"
                    onClick={e => e.stopPropagation()}
                  >
                    <svg viewBox="0 0 185.04 133.4" className="h-3.5 w-auto" aria-label="TMDB">
                      <defs>
                        <linearGradient id="tmdb-grad" x1="0.5" x2="0.5" y2="1" gradientUnits="objectBoundingBox">
                          <stop offset="0" stopColor="#90cea1"/>
                          <stop offset="1" stopColor="#01b4e4"/>
                        </linearGradient>
                      </defs>
                      <path d="M159.75 0H25.29A25.29 25.29 0 000 25.29v82.82a25.29 25.29 0 0025.29 25.29h134.46a25.29 25.29 0 0025.29-25.29V25.29A25.29 25.29 0 00159.75 0z" fill="url(#tmdb-grad)"/>
                      <path d="M40.38 76.64V56.5h7.96l4.64 12.81 4.64-12.81h7.96v20.14h-5.06V63.19l-5.34 13.45h-4.4L45.44 63.19v13.45zm28.06 0V56.5h5.58v20.14zm8.58 0V56.5h5.58v15.43h9.67v4.71zm18.53 0V56.5h5.58v15.43h9.67v4.71zm26.64.34a10.26 10.26 0 01-7.47-2.97 10.56 10.56 0 010-14.9 10.26 10.26 0 017.47-2.97 10.26 10.26 0 017.47 2.97 10.56 10.56 0 010 14.9 10.26 10.26 0 01-7.47 2.97zm0-5a5.07 5.07 0 003.67-1.45 5.58 5.58 0 000-7.55 5.07 5.07 0 00-3.67-1.45 5.07 5.07 0 00-3.67 1.45 5.58 5.58 0 000 7.55 5.07 5.07 0 003.67 1.45z" fill="#fff"/>
                    </svg>
                    <span className="text-[10px] font-bold text-[#01b4e4] group-hover/tmdb:text-white transition-colors tracking-wide">TMDB</span>
                  </a>
                )}
                {/* Remap button – bottom left */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRemapModalOpen(true);
                    setRemapQuery('');
                    setRemapResults([]);
                    setRemapHasSearched(false);
                  }}
                  className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 backdrop-blur-sm border border-amber-500/20 hover:border-amber-500/40 px-2 py-1 rounded-lg transition-all duration-200"
                  title="Remap movie"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] font-bold text-amber-400 tracking-wide">Remap</span>
                </button>
              </div>

              {/* Action Buttons */}
              <div className="px-4 pt-4 pb-2 space-y-2.5 bg-slate-900/60">
                <button
                  onClick={async () => {
                    try {
                      const res = await api.post(`/library/movies/${movie.id}/toggle-monitor`);
                      if (res.data.status === 'success') fetchMovieData();
                    } catch (err) {
                      customAlert('Failed to toggle monitor status', 'error');
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-slate-800/70 hover:bg-slate-700/80 text-slate-200 border border-white/10 hover:border-white/20 font-semibold px-4 py-2.5 rounded-xl text-sm transition-all duration-200"
                  title={movie.monitored ? 'Monitored' : 'Unmonitored'}
                >
                  {movie.monitored ? (
                    <Bookmark className="w-4 h-4 text-cyan-400 fill-cyan-400" />
                  ) : (
                    <BookmarkMinus className="w-4 h-4 text-slate-400" />
                  )}
                  {movie.monitored ? 'Monitored' : 'Unmonitored'}
                </button>
              </div>

              {/* IMDb Rating + Status */}
              <div className="grid grid-cols-2 gap-2 px-4 pb-3 bg-slate-900/60">
                <div className="bg-slate-800/50 rounded-xl p-3 text-center border border-white/5">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span className="text-base font-bold text-white">{movie.rating > 0 ? Number(movie.rating).toFixed(1) : '—'}</span>
                    <span className="text-xs text-slate-500">/10</span>
                  </div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">TMDB Rating</p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-3 text-center border border-white/5">
                  <p className={`text-sm font-bold capitalize mb-0.5 ${statusColorClass}`}>
                    {statusLabel}
                  </p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Status</p>
                </div>
              </div>

              {/* Search Buttons */}
              <div className="px-4 pb-4 space-y-1.5 bg-slate-900/60">
                <button
                  onClick={async () => {
                    if (await customConfirm(`Start auto-search for ${movie.title}?`)) {
                      try {
                        await api.post(`/library/movies/${movie.id}/auto-search`);
                        customAlert('Search initiated', 'info');
                        fetchMovieData();
                      } catch (err) {
                        customAlert('Search failed.', 'error');
                      }
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 hover:border-cyan-500/30 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" /> Auto Search
                </button>
                <button
                  onClick={() => setSearchModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 hover:border-purple-500/30 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                >
                  <Search className="w-3.5 h-3.5" /> Manual Search
                </button>
              </div>
            </div>

            {/* ─── Right: Content Column ─── */}
            <div className="flex-1 min-w-0 p-6 sm:p-7 flex flex-col">

              {/* Title Row */}
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
                    {movie.title}
                  </h1>
                  {/* Meta Line */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2 text-sm text-slate-400">
                    <span>{movie.year}</span>
                    {genres.length > 0 && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span>{genres.map(g => g.name).join(', ')}</span>
                      </>
                    )}
                    {runtime && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span>{runtime}</span>
                      </>
                    )}
                    {certification && (
                      <>
                        {runtime && <span className="text-slate-600">•</span>}
                        <span className="px-1.5 py-0.5 border border-slate-500 rounded text-xs font-bold text-slate-400">
                          {certification}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Action Icons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={refreshAll}
                    disabled={isRefreshing}
                    className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-cyan-400 disabled:opacity-40 border border-white/5 hover:border-white/10"
                    title="Refresh metadata"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                  <div ref={deleteMenuRef} className="relative">
                    <button
                      onClick={() => setDeleteMenuOpen(!deleteMenuOpen)}
                      className="p-2.5 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors text-red-400 border border-red-500/20 hover:border-red-500/30"
                      title="Delete movie"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {deleteMenuOpen && (
                      <div className="absolute right-0 top-full mt-2 w-60 bg-slate-800 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl">
                        <div className="px-4 py-3 border-b border-white/5">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Remove from Library</p>
                        </div>
                        <button
                          onClick={async () => {
                            setDeleteMenuOpen(false);
                            try {
                              await api.delete(`/library/movies/${movie.id}?deleteFiles=true`);
                              customAlert('Movie and files removed.', 'success');
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
                            <p className="text-xs text-slate-500">Remove from library and delete files</p>
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
                            <p className="text-xs text-slate-500">Remove from library, keep files</p>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Overview */}
              <p className="text-slate-300 text-sm leading-relaxed mb-5 max-w-2xl">
                {movie.overview || 'No overview available.'}
              </p>

              {/* ── Metadata Section ── */}
              <div className="divide-y divide-white/5">

                {/* PATH */}
                <div className="py-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Folder className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Path</span>
                    <button
                      onClick={() => setFolderBrowserOpen(true)}
                      className="ml-auto flex items-center gap-1.5 text-[10px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      <Folder className="w-3 h-3" /> Import
                    </button>
                  </div>
                  <p className="text-xs font-mono text-slate-300 truncate" title={movie.file_path}>
                    {movie.file_path || <span className="text-slate-600 italic">Not downloaded</span>}
                  </p>
                </div>

                {/* RESOLUTION | SIZE | LANGUAGE | WATCHED */}
                <div className="grid grid-cols-4 py-3 gap-4 bg-slate-800/30 rounded-xl px-4">
                  <div className="flex items-center gap-2">
                    <Film className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Resolution</span>
                      <span className="text-sm font-semibold text-slate-200">
                        {resolution !== 'Unknown' ? resolution : 'Any (1080p+)'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Size</span>
                      <span className="text-sm font-semibold text-slate-200">{formatSize(movie.size || movie.file_size)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Language</span>
                      <span className="text-sm font-semibold text-slate-200">{(tmdbDetails?.original_language || movie.language || 'EN').toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-cyan-400 shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Watched</span>
                      <span className={`text-sm font-semibold ${movie.watched ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {movie.watched ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* GRABBED RELEASE | QUALITY PROFILE */}
                <div className="grid grid-cols-2 py-3 gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Grabbed Release</span>
                    {movie.scene_name ? (
                      <p className="text-xs font-mono text-slate-300 truncate" title={movie.scene_name}>{movie.scene_name}</p>
                    ) : (
                      <p className="text-slate-600 italic text-xs">No release grabbed</p>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Quality Profile</span>
                    {updatingQuality ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        <span className="text-xs text-slate-400">Updating...</span>
                      </div>
                    ) : (
                      <select
                        className="bg-slate-800 border border-white/10 rounded-lg text-xs text-slate-300 px-3 py-1.5 focus:border-cyan-500/50 focus:outline-none cursor-pointer w-full"
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
                </div>

                {/* STUDIO | SUBTITLES */}
                <div className="grid grid-cols-2 py-3 gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Studio</span>
                    <p className="text-sm font-semibold text-slate-200 truncate">
                      {tmdbDetails?.production_companies?.[0]?.name || <span className="text-slate-600 italic">Unknown</span>}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Subtitles</span>
                    {!movie.file_path ? (
                      <p className="text-slate-600 italic text-xs">No file on disk</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
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
                </div>

                {/* ADDED */}
                {addedDate && (
                  <div className="py-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Added</span>
                    <p className="text-sm font-semibold text-slate-200">{addedDate}</p>
                  </div>
                )}

                {/* CAST */}
                {castList.length > 0 && (
                  <div className="py-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-2.5">Cast</span>
                    <div className="flex gap-6 overflow-x-auto pb-1">
                      {castList.map((person) => (
                        <Link
                          key={person.credit_id}
                          to={`/person/${person.id}`}
                          className="shrink-0 flex flex-col items-center gap-2 group"
                        >
                          <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-700 ring-2 ring-white/10 group-hover:ring-cyan-500/40 transition-all shadow-md">
                            {person.profile_path ? (
                              <img
                                src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
                                alt={person.name}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-500">
                                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                              </div>
                            )}
                          </div>
                          <p className="text-xs font-semibold text-slate-300 group-hover:text-cyan-400 text-center leading-tight whitespace-nowrap transition-colors">{person.name}</p>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>


        {/* ── Movie Files Section ── */}
        <div className="bg-slate-900/50 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-xl shadow-black/30 overflow-hidden">
          <button
            onClick={toggleFiles}
            className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Folder className="w-4 h-4 text-amber-400" />
              </div>
              <span className="text-sm font-bold text-slate-200">Movie Files</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium bg-white/5 text-slate-400 px-3 py-1.5 rounded-full border border-white/5">
                {movieFiles.length} Files
              </span>
              {filesExpanded ? (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-400" />
              )}
            </div>
          </button>
          <AnimatePresence>
            {filesExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                {movieFiles.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">No files found in directory.</div>
                ) : (
                  <div className="divide-y divide-white/5 border-t border-white/5">
                    {movieFiles.map((file) => (
                      <div key={file.name} className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <Film className="w-4 h-4 text-slate-500 shrink-0" />
                          <span className="text-sm text-slate-300 truncate">{file.name}</span>
                          <span className="text-xs text-slate-500 shrink-0 bg-white/5 px-2 py-0.5 rounded-lg">{formatSize(file.size)}</span>
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
                          className="p-2 hover:bg-red-500/15 text-slate-500 hover:text-red-400 rounded-lg transition-colors ml-3 shrink-0"
                          title="Delete file"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="h-4" />
      </motion.div>

      {/* ── Modals ── */}
      {searchModalOpen && (
        <ManualSearchModal
          mediaId={movie.id}
          mediaType="movie"
          title={movie.title}
          onClose={() => setSearchModalOpen(false)}
          onGrabbed={fetchMovieData}
        />
      )}

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

      {subSearchModal.open && (
        <ModalShell
          open
          onClose={() => setSubSearchModal({ open: false, code: '', label: '' })}
          size="2xl"
          noHeader
          noFloatingClose
          noPadding
        >
          <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <Search className="w-5 h-5 text-cyan-400" />
                Search Subtitles — {subSearchModal.label}
              </h3>
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
                          <div className="md:hidden p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className={`shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded ${
                                  item.rating >= 100 ? 'bg-emerald-500/20 text-emerald-400' :
                                  item.rating >= 80 ? 'bg-emerald-500/20 text-emerald-400' :
                                  item.rating >= 60 ? 'bg-yellow-500/20 text-yellow-400' :
                                  item.rating > 0 ? 'bg-slate-700 text-slate-400' : 'bg-slate-800 text-slate-600'
                                }`}>
                                  {item.rating > 0 ? `${Math.round(item.rating)}%` : '—'}
                                </span>
                                <span className="shrink-0 text-[10px] uppercase font-bold bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded relative">
                                  {item.language || subSearchModal.label}
                                  {item.hearingImpaired && <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full" />}
                                </span>
                                <a href={item.url || '#'} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-slate-500 font-medium truncate hover:underline">
                                  <ProviderLabel provider={provider.provider} />
                                </a>
                              </div>
                              <button
                                onClick={async () => {
                                  setDownloadingSubs(prev => ({ ...prev, [subSearchModal.code]: true }));
                                  try {
                                    const res = await api.post(`/library/movies/${movie.id}/download-subs`, {
                                      langCode: subSearchModal.code, fileId: item.fileId || item.subId || item.subdlId
                                    });
                                    customAlert(res.data.message);
                                    setSubSearchModal({ open: false, code: '', label: '' });
                                    fetchMovieData();
                                  } catch (err) {
                                    customAlert(err.response?.data?.message || 'Download failed', 'error');
                                  } finally {
                                    setDownloadingSubs(prev => ({ ...prev, [subSearchModal.code]: false }));
                                  }
                                }}
                                className="shrink-0 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 px-3 py-2 rounded-lg text-xs font-bold transition-colors"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                            <p className="text-xs text-slate-300 leading-snug line-clamp-2" title={item.release || item.name}>
                              {item.release || item.name}
                            </p>
                            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                              {item.uploader && <span className="text-[10px] text-slate-500 truncate max-w-[100px]">{item.uploader}</span>}
                              {item.fromTrusted && <span className="text-[10px] text-emerald-400/80 font-medium">✓ Trusted</span>}
                              {item.aiTranslated && <span className="text-[10px] text-amber-400/80">AI</span>}
                              {item.downloads > 0 && <span className="text-[10px] text-slate-500">{item.downloads} DL</span>}
                              {item.format && <span className="text-[10px] text-slate-600 uppercase">{item.format}</span>}
                              {item.uploadDate && <span className="text-[10px] text-slate-500 ml-auto">{item.uploadDate}</span>}
                            </div>
                          </div>
                          <div className="hidden md:flex items-center gap-3 px-3 py-2.5">
                            <span className={`w-14 text-center text-xs font-bold shrink-0 ${
                              item.rating >= 100 ? 'text-emerald-400' :
                              item.rating >= 80 ? 'text-emerald-400' :
                              item.rating >= 60 ? 'text-yellow-400' :
                              item.rating > 0 ? 'text-slate-400' : 'text-slate-600'
                            }`}>
                              {item.rating > 0 ? `${Math.round(item.rating)}%` : '—'}
                            </span>
                            <span className="w-10 text-center text-[10px] uppercase font-bold shrink-0 relative">
                              <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                                {item.language || subSearchModal.label}
                              </span>
                              {item.hearingImpaired && <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full" />}
                            </span>
                            <a href={item.url || '#'} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="w-20 text-[10px] truncate shrink-0 font-medium hover:underline">
                              <ProviderLabel provider={provider.provider} />
                            </a>
                            <span className="flex-1 min-w-0">
                              <span className="text-xs text-slate-300 group-hover:text-white truncate block" title={item.release || item.name}>
                                {item.release || item.name}
                              </span>
                              <div className="flex items-center gap-2 mt-0.5">
                                {item.uploader && <span className="text-[10px] text-slate-500 truncate max-w-[120px]">{item.uploader}</span>}
                                {item.fromTrusted && <span className="text-[10px] text-emerald-400/80 font-medium">✓ Trusted</span>}
                                {item.aiTranslated && <span className="text-[10px] text-amber-400/80">AI</span>}
                                {item.downloads > 0 && <span className="text-[10px] text-slate-500">{item.downloads} DL</span>}
                                {item.format && <span className="text-[10px] text-slate-600 uppercase">{item.format}</span>}
                              </div>
                            </span>
                            <span className="text-[10px] text-slate-500 text-right shrink-0 max-w-[80px] truncate hidden lg:block">{item.uploadDate || ''}</span>
                            <button
                              onClick={async () => {
                                setDownloadingSubs(prev => ({ ...prev, [subSearchModal.code]: true }));
                                try {
                                  const res = await api.post(`/library/movies/${movie.id}/download-subs`, {
                                    langCode: subSearchModal.code, fileId: item.fileId || item.subId || item.subdlId
                                  });
                                  customAlert(res.data.message);
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
        </ModalShell>
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

      {/* Similar Movies - MediaDetailsModal */}
      {similarModal.open && (
        <MediaDetailsModal
          isOpen={similarModal.open}
          onClose={() => setSimilarModal({ open: false, mediaId: null, isInLibrary: false, libraryId: null })}
          mediaId={similarModal.mediaId}
          mediaType="movie"
          isInLibrary={similarModal.isInLibrary}
          libraryId={similarModal.libraryId}
          onAdded={() => {
            setSimilarModal({ open: false, mediaId: null, isInLibrary: false, libraryId: null });
            api.get('/library/movies?badges=true').then(res => {
              if (res.data?.data) {
                const map = new Map(res.data.data.map(m => [m.tmdb_id, m.id]));
                setLibraryMovieMap(map);
              }
            }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
