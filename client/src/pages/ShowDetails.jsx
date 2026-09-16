import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatSize, parseResolution, parseCodec, parseAudio, LANG_NAME } from '../lib/format';
import { useSettings } from '../lib/useSettings';
import { useTMDBDetails } from '../lib/useTMDBDetails';
import { ArrowLeft, HardDrive, PlayCircle, ChevronLeft, ChevronRight, Bookmark, BookmarkMinus, Star, X, RefreshCw, Loader2, Film, Trash2, Globe, Eye, Volume2 } from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';
import { useOutsideClick } from '../lib/useOutsideClick';
import TrailerModal from '../components/TrailerModal';
import ManualSearchModal from '../components/ManualSearchModal';
import EpisodeDetailsModal from '../components/EpisodeDetailsModal';
import RemapModal from '../components/RemapModal';
import { posterUrl, tmdbImgUrl } from '../lib/posterUrl';
import InlineError from '../components/shared/InlineError';

import SubtitleLanguageBadge from '../components/shared/SubtitleLanguageBadge';
import SubtitleManagerModal from '../components/subtitles/SubtitleManagerModal';
import CustomSelect from '../components/shared/CustomSelect';
import ShowCastList from '../components/shows/ShowCastList';
import ShowSeasonList from '../components/shows/ShowSeasonList';
import SubtitleSearchModal from '../components/shows/SubtitleSearchModal';

export default function ShowDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [show, setShow] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [detailsModalEpisode, setDetailsModalEpisode] = useState(null);
  const [modalOpenLangMenu, setModalOpenLangMenu] = useState(null);
  const [modalDownloadingSubs, setModalDownloadingSubs] = useState({});
  const [episodes, setEpisodes] = useState([]);
  const { providerLangs, profiles } = useSettings();
  const [updatingQuality, setUpdatingQuality] = useState(false);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const deleteMenuRef = useOutsideClick(() => setDeleteMenuOpen(false), deleteMenuOpen);
  const [mobileDeleteMenuOpen, setMobileDeleteMenuOpen] = useState(false);
  const mobileDeleteMenuRef = useOutsideClick(() => setMobileDeleteMenuOpen(false), mobileDeleteMenuOpen);
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);
  const [subManagerEpisode, setSubManagerEpisode] = useState(null);

  // Prev/next navigation
  const [siblingIds, setSiblingIds] = useState([]);
  const fetchRequestIdRef = useRef(0);

  // Use cached library data for sibling navigation — avoids a full re-fetch on every detail page visit.
  // Falls back to a lightweight fetch only when cache is cold.
  useEffect(() => {
    const cached = sessionStorage.getItem('library_shows_cache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSiblingIds(parsed.map(s => s.id));
          return;
        }
      } catch { /* use live fetch */ }
    }
    api.get('/library/shows').then(res => {
      if (res.data?.data) setSiblingIds(res.data.data.map(s => s.id));
    }).catch(() => {});
  }, []);

  const currentIndex = siblingIds.indexOf(Number(id));
  const prevId = currentIndex > 0 ? siblingIds[currentIndex - 1] : null;
  const nextId = currentIndex >= 0 && currentIndex < siblingIds.length - 1 ? siblingIds[currentIndex + 1] : null;

  // Subtitle Manual Search Modal
  const [subSearchModal, setSubSearchModal] = useState({ open: false, code: '', label: '', episodeId: null, subKey: null });

  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [seasonSearchModal, setSeasonSearchModal] = useState({ open: false, season: null });
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);

  // Remap Modal State
  const [remapModalOpen, setRemapModalOpen] = useState(false);
  const [remapQuery, setRemapQuery] = useState('');
  const [remapSearching, setRemapSearching] = useState(false);
  const [remapResults, setRemapResults] = useState([]);
  const [remapHasSearched, setRemapHasSearched] = useState(false);
  const [remapping, setRemapping] = useState(false);

  const { tmdbDetails, trailerKey, refetch: refetchTMDB } = useTMDBDetails('show', show?.tmdb_id);

  const fetchShowData = useCallback(async (silent = false) => {
    const reqId = ++fetchRequestIdRef.current;
    try {
      const [res, epRes] = await Promise.all([
        api.get(`/library/shows/${id}`),
        api.get(`/library/shows/${id}/episodes`)
      ]);
      if (reqId !== fetchRequestIdRef.current) return;
      if (res.data.status === 'success') {
        setLoadError(false);
        setShow(res.data.data);
      }
      if (epRes.data.status === 'success') {
        setEpisodes(epRes.data.data);
      }
    } catch (e) {
      if (reqId !== fetchRequestIdRef.current) return;
      if (e.response?.status === 404) {
        navigate('/');
        return;
      }
      console.error(e);
      if (!silent) setLoadError(true);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchShowData(false);
  }, [fetchShowData]);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await api.post(`/library/shows/${id}/refresh`);
      await fetchShowData(true);
      await refetchTMDB();
      customAlert('Show refreshed!');
    } catch (e) {
      console.error('Failed to rescan folder', e);
      customAlert('Failed to refresh show', 'error');
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchShowData, refetchTMDB, id]);

  const handleQualityChange = async (profileId) => {
    setUpdatingQuality(true);
    try {
      const res = await api.put(`/library/shows/${show.id}/quality`, { profileId: profileId || null });
      if (res.data.status === 'success') {
        setShow(prev => ({ ...prev, quality_profile_id: profileId || null, quality_profile_name: profiles.find(p => p.id === profileId)?.name || null }));
      }
    } catch (err) {
      console.error('Failed to update quality profile', err);
      customAlert('Failed to update quality profile', 'error');
    } finally {
      setUpdatingQuality(false);
    }
  };

  const handleRemapSearch = async () => {
    if (!remapQuery.trim()) return;
    setRemapSearching(true);
    setRemapResults([]);
    setRemapHasSearched(false);
    try {
      const res = await api.get(`/tmdb/search/show`, {
        params: { query: remapQuery.trim() }
      });
      if (res.data.status === 'success') {
        setRemapResults(res.data.data);
      }
    } catch {
      customAlert('Search failed', 'error');
    } finally {
      setRemapSearching(false);
      setRemapHasSearched(true);
    }
  };

  const handleRemapConfirm = async (newShow) => {
    if (!await customConfirm(`Remap "${show.title}" to "${newShow.name}"?\n\nThis will update the poster, overview, rating and all metadata from the new TMDB entry.`)) return;
    
    setRemapping(true);
    try {
      const res = await api.put(`/library/shows/${show.id}/remap`, {
        tmdbId: newShow.id,
        title: newShow.name,
        year: newShow.first_air_date ? newShow.first_air_date.split('-')[0] : null,
        poster_path: newShow.poster_path,
        overview: newShow.overview,
        vote_average: newShow.vote_average || 0
      });
      if (res.data.status === 'success') {
        customAlert(`Remapped to "${newShow.name}" successfully!`);
        setRemapModalOpen(false);
        // Clear stale TMDB details so the UI doesn't show old data while re-fetching
        refreshAll();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to remap show';
      customAlert(msg, 'error');
    } finally {
      setRemapping(false);
    }
  };

  // Group by season (season 0 = specials — hidden per user preference)
  const seasons = useMemo(() => {
    return episodes.reduce((acc, ep) => {
      if (ep.season_number === 0) return acc;
      if (!acc[ep.season_number]) acc[ep.season_number] = [];
      acc[ep.season_number].push(ep);
      return acc;
    }, {});
  }, [episodes]);

  if (loadError && !show) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative z-10">
        <InlineError
          message="Failed to load show details. Please check your connection and try again."
          onRetry={() => { setLoadError(false); fetchShowData(false); }}
        />
      </div>
    );
  }

  if (!show) return null;

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
            src={tmdbImgUrl(tmdbDetails.backdrop_path, 'original')}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 via-slate-950/70 to-slate-950/95" />
        </motion.div>
      ) : (
        <div className="fixed inset-0 z-0 bg-slate-950" />
      )}

      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} 
        className="relative z-10 max-w-6xl mx-auto w-full space-y-4"
      >
        {/* ── Top Navigation ── */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/shows')}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-slate-900/80 hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors text-sm font-medium shrink-0"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          {/* Center action buttons on mobile */}
          <div className="flex items-center gap-1.5 md:hidden">
            <button
              onClick={refreshAll}
              disabled={isRefreshing}
              className="p-2 bg-slate-900/80 hover:bg-slate-800 rounded-lg transition-colors text-slate-300 hover:text-cyan-400 disabled:opacity-40 border border-slate-800"
              title="Refresh metadata"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <div ref={mobileDeleteMenuRef} className="relative">
              <button
                onClick={() => setMobileDeleteMenuOpen(!mobileDeleteMenuOpen)}
                className="p-2 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg transition-colors text-rose-400 border border-rose-500/20"
                title="Delete show"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              {mobileDeleteMenuOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-60 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl shadow-black/60 z-50 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-800">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Remove from Library</p>
                  </div>
                  <button
                    onClick={async () => {
                      setMobileDeleteMenuOpen(false);
                      if (!await customConfirm(`Delete "${show.title}" and permanently delete its files from disk?\n\nThis cannot be undone.`, { title: 'Delete Show + Files', type: 'warning', confirmText: 'Delete Files' })) return;
                      try {
                        await api.delete(`/library/shows/${show.id}?deleteFiles=true`);
                        customAlert('Show and files removed.', 'success');
                        navigate('/shows');
                      } catch (err) {
                        customAlert(err.response?.data?.message || 'Failed to remove show.', 'error');
                      }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors text-left"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="font-semibold text-xs">Delete + Files</p>
                      <p className="text-[11px] text-slate-500">Remove from library and delete files</p>
                    </div>
                  </button>
                  <div className="border-t border-slate-800" />
                  <button
                    onClick={async () => {
                      setMobileDeleteMenuOpen(false);
                      if (!await customConfirm(`Remove "${show.title}" from your library? Files on disk will be kept.`)) return;
                      try {
                        await api.delete(`/library/shows/${show.id}?deleteFiles=false`);
                        customAlert('Show removed from library.', 'success');
                        navigate('/shows');
                      } catch (err) {
                        customAlert(err.response?.data?.message || 'Failed to remove show.', 'error');
                      }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800/60 transition-colors text-left"
                  >
                    <X className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="font-semibold text-xs">Remove Only</p>
                      <p className="text-[11px] text-slate-500">Remove from library, keep files</p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => prevId && navigate(`/shows/${prevId}`)}
              disabled={!prevId}
              className="p-2 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 hover:border-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous show"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => nextId && navigate(`/shows/${nextId}`)}
              disabled={!nextId}
              className="p-2 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 hover:border-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next show"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Main Card ── */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl shadow-xl shadow-black/50 p-4 sm:p-6 lg:p-7">
          <div className="flex flex-col md:flex-row gap-6 lg:gap-8 items-start">

            {/* ─── Left: Poster Column ─── */}
            <div className="w-full max-w-[280px] mx-auto md:max-w-none md:w-[260px] lg:w-[280px] shrink-0 flex flex-col gap-3">
              {/* Poster */}
              <div className="relative group rounded-lg overflow-hidden shadow-lg border border-slate-800 aspect-[2/3]">
                <img
                  src={posterUrl('shows', show.tmdb_id, show.poster_path)}
                  alt={show.title}
                  onError={(e) => {
                    if (show.poster_path && !e.currentTarget.dataset.fallback) {
                      e.currentTarget.dataset.fallback = 'true';
                      e.currentTarget.src = `https://image.tmdb.org/t/p/w500${show.poster_path}`;
                    }
                  }}
                  className="w-full h-full object-cover"
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
                {/* TMDB badge – bottom right */}
                {show.tmdb_id && (
                  <a
                    href={`https://www.themoviedb.org/tv/${show.tmdb_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-[#0d253f]/80 hover:bg-[#0d253f] backdrop-blur-sm border border-[#01b4e4]/30 hover:border-[#01b4e4]/60 px-2 py-1 rounded-lg transition-all duration-200 group/tmdb"
                    title="View on TMDB"
                    onClick={e => e.stopPropagation()}
                  >
                    <svg viewBox="0 0 185.04 133.4" className="h-3.5 w-auto" aria-label="TMDB">
                      <defs>
                        <linearGradient id="tmdb-grad-show" x1="0.5" x2="0.5" y2="1" gradientUnits="objectBoundingBox">
                          <stop offset="0" stopColor="#90cea1"/>
                          <stop offset="1" stopColor="#01b4e4"/>
                        </linearGradient>
                      </defs>
                      <path d="M159.75 0H25.29A25.29 25.29 0 000 25.29v82.82a25.29 25.29 0 0025.29 25.29h134.46a25.29 25.29 0 0025.29-25.29V25.29A25.29 25.29 0 00159.75 0z" fill="url(#tmdb-grad-show)"/>
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
                  title="Remap show"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[10px] font-bold text-amber-400 tracking-wide">Remap</span>
                </button>
              </div>

              {/* Rating + Status */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950/40 border border-white/5 rounded-2xl p-2.5">
                <div className="bg-slate-800/40 rounded-xl p-2.5 text-center border border-white/5">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span className="text-sm font-bold text-white">{show.rating > 0 ? Number(show.rating).toFixed(1) : '—'}</span>
                    <span className="text-xs text-slate-500">/10</span>
                  </div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">TMDB Rating</p>
                </div>
                <div className="bg-slate-800/40 rounded-xl p-2.5 text-center border border-white/5">
                  <p className={`text-xs font-bold capitalize mb-0.5 ${
                    show.status === 'downloaded' ? 'text-emerald-400' : 
                    show.status === 'downloading' ? 'text-blue-400' : 
                    show.status === 'wanted' ? 'text-pink-400' : 
                    show.status === 'monitored' ? 'text-amber-400' : 
                    show.status === 'unmonitored' ? 'text-slate-400' : 
                    'text-rose-400'
                  }`}>
                    {show.status === 'wanted' ? 'Watchlist' : show.status}
                  </p>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Status</p>
                </div>
              </div>
            </div>

            {/* ─── Right: Content Column ─── */}
            <div className="flex-1 min-w-0 w-full flex flex-col">

              {/* Title Row */}
              <div className="flex items-start justify-between gap-3 mb-2 w-full">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <button 
                      onClick={async () => {
                        try {
                          const res = await api.post(`/library/shows/${show.id}/toggle-monitor`);
                          if (res.data.status === 'success') {
                            fetchShowData();
                            customAlert(res.data.data.monitored ? 'Show is now monitored' : 'Show is now unmonitored', 'success');
                          }
                        } catch {
                          customAlert('Failed to toggle monitor status', 'error');
                        }
                      }}
                      className="shrink-0 mt-0.5 hover:scale-110 transition-transform"
                      title={show.monitored ? "Monitored" : "Unmonitored"}
                    >
                      {show.monitored ? (
                        <Bookmark className="w-6 h-6 sm:w-7 sm:h-7 text-purple-400 fill-purple-400" />
                      ) : (
                        <BookmarkMinus className="w-6 h-6 sm:w-7 sm:h-7 text-slate-500" />
                      )}
                    </button>
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight leading-tight break-words min-w-0 flex-1">
                      {show.title}
                    </h1>
                  </div>
                  {/* Meta Details Line: Year, Seasons, Status, Network */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-xs sm:text-sm text-slate-400">
                    <span className="font-semibold text-slate-300">{show.year}</span>
                    {tmdbDetails?.number_of_seasons > 0 && (
                      <>
                        <span className="text-slate-600 font-bold">•</span>
                        <span>{tmdbDetails.number_of_seasons} Season{tmdbDetails.number_of_seasons > 1 ? 's' : ''}</span>
                      </>
                    )}
                    {tmdbDetails?.networks?.[0]?.name && (
                      <>
                        <span className="text-slate-600 font-bold">•</span>
                        <span className="text-slate-300 font-medium">{tmdbDetails.networks[0].name}</span>
                      </>
                    )}
                    {show.tmdb_status && (
                      <>
                        <span className="text-slate-600 font-bold">•</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-bold ${
                          show.tmdb_status === 'Ended' ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20' :
                          show.tmdb_status === 'Returning Series' ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' :
                          'text-slate-400 bg-slate-500/10 border border-slate-500/20'
                        }`}>{show.tmdb_status}</span>
                      </>
                    )}
                  </div>

                  {/* Genres text */}
                  {tmdbDetails?.genres?.length > 0 && (
                    <p className="text-xs text-slate-400/80 mt-1 font-medium tracking-wide">
                      {tmdbDetails.genres.map(g => g.name).join(' · ')}
                    </p>
                  )}
                </div>

                {/* Action Icons (Desktop) */}
                <div className="hidden md:flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={refreshAll}
                    disabled={isRefreshing}
                    className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-purple-400 disabled:opacity-40 border border-white/5 hover:border-white/10"
                    title="Refresh metadata"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                  <div ref={deleteMenuRef} className="relative">
                    <button
                      onClick={() => setDeleteMenuOpen(!deleteMenuOpen)}
                      className="p-2.5 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors text-red-400 border border-red-500/20 hover:border-red-500/30"
                      title="Delete show"
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
                            if (!await customConfirm(`Delete "${show.title}" and permanently delete its files from disk?\n\nThis cannot be undone.`, { title: 'Delete Show + Files', type: 'warning', confirmText: 'Delete Files' })) return;
                            try {
                              await api.delete(`/library/shows/${show.id}?deleteFiles=true`);
                              customAlert('Show and files removed.', 'success');
                              navigate('/shows');
                            } catch (err) {
                              customAlert(err.response?.data?.message || 'Failed to remove show.', 'error');
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
                            if (!await customConfirm(`Remove "${show.title}" from your library? Files on disk will be kept.`)) return;
                            try {
                              await api.delete(`/library/shows/${show.id}?deleteFiles=false`);
                              customAlert('Show removed from library.', 'success');
                              navigate('/shows');
                            } catch (err) {
                              customAlert(err.response?.data?.message || 'Failed to remove show.', 'error');
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

              {/* Tagline & Overview */}
              {tmdbDetails?.tagline && (
                <p className="text-sm font-medium italic text-purple-400/90 mb-2 max-w-2xl tracking-wide">
                  &ldquo;{tmdbDetails.tagline}&rdquo;
                </p>
              )}
              {show.overview ? (
                <div className="mb-5 max-w-2xl">
                  <p className={`text-slate-300 text-sm leading-relaxed ${!isOverviewExpanded ? 'line-clamp-3 sm:line-clamp-none' : ''}`}>
                    {show.overview}
                  </p>
                  {show.overview.length > 160 && (
                    <button
                      onClick={() => setIsOverviewExpanded(!isOverviewExpanded)}
                      className="sm:hidden text-xs font-semibold text-purple-400 hover:text-purple-300 mt-1 inline-flex items-center gap-1 transition-colors"
                    >
                      {isOverviewExpanded ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-slate-500 italic text-sm leading-relaxed mb-5">
                  No overview available.
                </p>
              )}

              {/* ── Metadata Section ── */}
              <div className="divide-y divide-white/5">

                {/* PATH */}
                <div className="py-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Path</span>
                  <p className="text-xs font-mono text-slate-300 truncate" title={show.folder_path}>
                    {show.folder_path || <span className="text-slate-600 italic">Not downloaded</span>}
                  </p>
                </div>

                {/* RESOLUTION | SIZE | LANGUAGE | WATCHED | AUDIO */}
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3 w-full">
                  <div className="flex items-center gap-2 sm:gap-2.5 bg-slate-800/30 dark:bg-slate-900/35 border border-slate-700/30 dark:border-white/5 rounded-xl p-2 sm:p-2.5 lg:p-3 min-w-0">
                    <Film className="w-4 h-4 text-purple-400 shrink-0" />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-500 block truncate">Resolution</span>
                      {(() => {
                        let res = 'Unknown';
                        let codec = 'Unknown';
                        if (episodes && episodes.length > 0) {
                          for (const ep of episodes) {
                            if (ep.status === 'downloaded') {
                              const epRes = ep.resolution || parseResolution(ep.scene_name || ep.file_path);
                              if (epRes !== 'Unknown') res = epRes;
                              const epCodec = ep.codec || parseCodec(ep.scene_name || ep.file_path);
                              if (epCodec !== 'Unknown') codec = epCodec;
                              if (res !== 'Unknown' && codec !== 'Unknown') break;
                            }
                          }
                        }
                        if (res === 'Unknown') return <span className="text-xs sm:text-sm font-semibold text-slate-200 truncate">—</span>;
                        return (
                          <div className="flex items-center gap-1.5 mt-0.5 flex-nowrap whitespace-nowrap">
                            <span className="text-xs sm:text-sm font-semibold text-slate-200 shrink-0 whitespace-nowrap">{res}</span>
                            {codec !== 'Unknown' && (
                              <span className="text-[9px] sm:text-[10px] font-bold text-slate-300 uppercase bg-slate-800/80 px-1.5 py-0.5 rounded border border-white/10 shrink-0 whitespace-nowrap">
                                {codec}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 sm:gap-3 bg-slate-800/30 dark:bg-slate-900/35 border border-slate-700/30 dark:border-white/5 rounded-xl p-2.5 sm:p-3">
                    <HardDrive className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-500 block truncate">Size</span>
                      <span className="text-xs sm:text-sm font-semibold text-slate-200 block truncate">{formatSize(show.size || show.folder_size || 0)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 sm:gap-3 bg-slate-800/30 dark:bg-slate-900/35 border border-slate-700/30 dark:border-white/5 rounded-xl p-2.5 sm:p-3">
                    <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-500 block truncate">Audio</span>
                      {(() => {
                        let audio = 'Unknown';
                        if (episodes && episodes.length > 0) {
                          for (const ep of episodes) {
                            if (ep.status === 'downloaded') {
                              const epAudio = ep.audio || parseAudio(ep.scene_name || ep.file_path);
                              if (epAudio !== 'Unknown') {
                                audio = epAudio;
                                break;
                              }
                            }
                          }
                        }
                        return <span className="text-xs sm:text-sm font-semibold text-slate-200 block truncate">{audio !== 'Unknown' ? audio : '-'}</span>;
                      })()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 sm:gap-3 bg-slate-800/30 dark:bg-slate-900/35 border border-slate-700/30 dark:border-white/5 rounded-xl p-2.5 sm:p-3">
                    <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-500 block truncate">Language</span>
                      <span className="text-xs sm:text-sm font-semibold text-slate-200 block truncate">{(tmdbDetails?.original_language || 'EN').toUpperCase()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 sm:gap-3 bg-slate-800/30 dark:bg-slate-900/35 border border-slate-700/30 dark:border-white/5 rounded-xl p-2.5 sm:p-3">
                    <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-500 block truncate">Watched</span>
                      <span className={`text-xs sm:text-sm font-semibold block truncate ${
                        episodes.length > 0 && episodes.every(e => e.watched) ? 'text-emerald-400' : 'text-slate-400'
                      }`}>
                        {episodes.length > 0
                          ? `${episodes.filter(e => e.watched && e.season_number > 0).length}/${episodes.filter(e => e.season_number > 0).length}`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* QUALITY PROFILE & CALENDAR RELEASE DAY */}
                <div className="py-3 flex flex-wrap gap-4 sm:gap-6 items-center">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Quality Profile</span>
                    {updatingQuality ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                        <span className="text-xs text-slate-400">Updating...</span>
                      </div>
                    ) : (
                      <div className="min-w-[180px]">
                        <CustomSelect
                          theme="purple"
                          value={show.quality_profile_id || ''}
                          onChange={(e) => handleQualityChange(e.target.value ? parseInt(e.target.value) : null)}
                          options={[
                            { label: 'Unassigned', value: '' },
                            ...profiles.filter(p => !p.media_type || p.media_type === 'both' || p.media_type === 'shows').map(p => ({
                              label: p.name,
                              value: p.id
                            }))
                          ]}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* CAST */}
                <ShowCastList credits={tmdbDetails?.credits} />

              </div>
            </div>
          </div>
        </div>

        {/* ── Episodes Section ── */}
        <ShowSeasonList
          show={show}
          seasons={seasons}
          episodes={episodes}
          setEpisodes={setEpisodes}
          fetchShowData={fetchShowData}
          providerLangs={providerLangs}
          onSelectEpisode={(ep) => setDetailsModalEpisode(ep)}
          onManualSearch={(ep) => {
            setSelectedEpisode(ep);
            setSearchModalOpen(true);
          }}
          onSeasonSearch={(seasonNum) => {
            setSeasonSearchModal({ open: true, season: seasonNum });
          }}
          onOpenSubSearch={({ code, label, episodeId, subKey }) => {
            const ep = episodes.find((e) => e.id === episodeId);
            setSubSearchModal({
              open: true,
              code,
              label,
              episodeId,
              subKey,
              filePath: ep?.file_path,
              sceneName: ep?.scene_name,
            });
          }}
        />

      {/* Episode Search Modal */}
      {searchModalOpen && selectedEpisode && (
        <ManualSearchModal
          mediaId={selectedEpisode.id}
          mediaType="episode"
          title={`S${selectedEpisode.season_number}E${selectedEpisode.episode_number}: ${selectedEpisode.title}`}
          onClose={() => setSearchModalOpen(false)}
          onGrabbed={fetchShowData}
        />
      )}

      {/* Season Pack Search Modal */}
      {seasonSearchModal.open && (
        <ManualSearchModal
          mediaId={show.id}
          mediaType="season"
          season={seasonSearchModal.season}
          title={`${show.title} — Season ${seasonSearchModal.season} Pack`}
          onClose={() => setSeasonSearchModal({ open: false, season: null })}
          onGrabbed={fetchShowData}
        />
      )}

      {/* Episode Details Modal */}
      <EpisodeDetailsModal 
        key={detailsModalEpisode?.id ?? 'none'}
        episode={detailsModalEpisode} 
        show={show} 
        onClose={() => setDetailsModalEpisode(null)}
        onAutoSearch={async (ep) => {
          setDetailsModalEpisode(null);
          customAlert(`Starting auto-search for S${ep.season_number}E${ep.episode_number}...`);
          try {
            const res = await api.post(`/library/episodes/${ep.id}/auto-search`);
            if (res.data.status === 'success') {
              customAlert(`Found & downloading: ${res.data.data?.title || res.data.message || 'Search started'}`);
              fetchShowData();
            }
          } catch (err) {
            console.error(err);
            customAlert('Auto-search failed to find any results', 'error');
          }
        }}
        onManualSearch={(ep) => {
          setDetailsModalEpisode(null);
          setSelectedEpisode(ep);
          setSearchModalOpen(true);
        }}
        onDeleteFile={async (ep) => {
          const deleteFiles = await customConfirm(
            `Delete the downloaded file for S${ep.season_number}E${ep.episode_number}?\n\nThis will remove it from your disk but keep the episode monitored in your library.`,
            { confirmText: 'Delete File', cancelText: 'Cancel' }
          );
          if (deleteFiles !== true) return;
          try {
            await api.delete(`/library/episodes/${ep.id}/file?deleteFiles=true`);
            customAlert('Episode file deleted successfully.', 'success');
            setDetailsModalEpisode(null);
            fetchShowData();
          } catch (err) {
            customAlert(err.response?.data?.message || 'Failed to delete episode file.', 'error');
          }
        }}
        renderMonitored={() => {
          const ep = detailsModalEpisode;
          if (!ep) return null;
          return (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (ep.status === 'downloading') {
                  if (await customConfirm("Reset status to monitored?")) {
                    try {
                      await api.post(`/library/episodes/${ep.id}/reset`);
                      customAlert('Status reset to monitored');
                      fetchShowData();
                      setDetailsModalEpisode(prev => ({...prev, status: 'monitored', monitored: true}));
                    } catch {
                      customAlert('Failed to reset status', 'error');
                    }
                  }
                } else {
                  try {
                    await api.post(`/library/episodes/${ep.id}/toggle-monitor`);
                    fetchShowData();
                    setDetailsModalEpisode(prev => ({...prev, monitored: !prev.monitored}));
                  } catch {
                    customAlert('Failed to toggle monitor status', 'error');
                  }
                }
              }}
              className={`px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-md transition-colors border
                ${ep.status === 'downloading' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' :
                  ep.status === 'downloaded' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                  !ep.monitored ? 'bg-rose-500/20 text-rose-400 border-rose-500/30 hover:bg-emerald-500/20 hover:text-emerald-400 hover:border-emerald-500/30' :
                  (!ep.file_path && !ep.air_date) || (ep.air_date && new Date(ep.air_date) > new Date()) ? 'bg-slate-800/80 text-slate-500 border-white/5' :
                  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/30'
                }`}
              title={
                ep.status === 'downloading' ? "Click to reset if stuck" :
                (!ep.file_path && !ep.air_date) ? "Season has not started airing yet" :
                (ep.air_date && new Date(ep.air_date) > new Date()) ? `Airs on ${new Date(ep.air_date).toLocaleDateString()}` :
                "Click to toggle monitor status"
              }
            >
              {ep.status === 'downloading' ? 'Downloading' : ep.status === 'downloaded' ? 'Downloaded' : !ep.monitored ? 'Unmonitored' : (!ep.file_path && !ep.air_date) || (ep.air_date && new Date(ep.air_date) > new Date()) ? 'Not released' : 'Monitored'}
            </button>
          );
        }}
        renderSubtitles={() => {
          const ep = detailsModalEpisode;
          if (!ep || !ep.file_path) return <span className="text-[10px] text-slate-600">—</span>;
          const subsData = (() => { const raw = ep.subtitles; if (!raw) return []; if (Array.isArray(raw)) return raw; try { return JSON.parse(raw); } catch { return []; } })(); 
          const existingCodes = subsData.map(s => typeof s === 'string' ? s : s.lang).filter(Boolean);
          const hasExistingSub = subsData.length > 0;
          const subKey = `modal-${ep.id}`;
          return providerLangs.map(code => (
            <SubtitleLanguageBadge
              key={code}
              code={code}
              exists={existingCodes.includes(code)}
              hasExistingSub={hasExistingSub}
              isOpen={modalOpenLangMenu === `${subKey}-${code}`}
              downloading={modalDownloadingSubs[`${subKey}-${code}`]}
              onOpenMenu={() => setModalOpenLangMenu(modalOpenLangMenu === `${subKey}-${code}` ? null : `${subKey}-${code}`)}
              onAutoSearch={async () => {
                setModalOpenLangMenu(null);
                setModalDownloadingSubs(prev => ({ ...prev, [`${subKey}-${code}`]: true }));
                try {
                  const res = await api.post(`/library/episodes/${ep.id}/download-subs`, { langCode: code });
                  customAlert(res.data.message);
                  fetchShowData();
                  setDetailsModalEpisode(prev => {
                     const newSubs = Array.isArray(prev.subtitles) ? [...prev.subtitles, code] : (prev.subtitles ? JSON.parse(prev.subtitles).concat(code) : [code]);
                     return {...prev, subtitles: JSON.stringify(newSubs)};
                  });
                } catch (err) {
                  customAlert(err.response?.data?.message || 'Auto search failed', 'error');
                } finally {
                  setModalDownloadingSubs(prev => ({ ...prev, [`${subKey}-${code}`]: false }));
                }
              }}
              onManualSearch={() => {
                setModalOpenLangMenu(null);
                setSubSearchModal({
                  open: true,
                  code,
                  label: LANG_NAME[code] || code,
                  episodeId: ep.id,
                  subKey,
                  filePath: ep?.file_path,
                  sceneName: ep?.scene_name,
                });
              }}
              onAutoTranslate={async () => {
                setModalOpenLangMenu(null);
                try {
                  const res = await api.post('/library/subtitles/translate', {
                    mediaType: 'episode',
                    mediaId: ep.id,
                    targetLangs: [LANG_NAME[code] || 'Dutch']
                  });
                  if (res.data.status === 'success') {
                    customAlert(`Started translating ${LANG_NAME[code] || code} in background`, 'success');
                  }
                } catch (err) {
                  customAlert(err.response?.data?.message || 'Translation failed', 'error');
                }
              }}
              onDelete={async () => {
                setModalOpenLangMenu(null);
                const confirm = await customConfirm(`Delete ${LANG_NAME[code] || code} subtitle?`);
                if (!confirm) return;
                try {
                  const res = await api.delete(`/library/episodes/${ep.id}/subs/${code}`);
                  customAlert(res.data.message || 'Subtitle deleted');
                  fetchShowData();
                  setDetailsModalEpisode(prev => {
                     const subs = Array.isArray(prev.subtitles) ? prev.subtitles : (prev.subtitles ? JSON.parse(prev.subtitles) : []);
                     const newSubs = subs.filter(s => (typeof s === 'string' ? s : s.lang) !== code);
                     return {...prev, subtitles: JSON.stringify(newSubs)};
                  });
                } catch (err) {
                  console.error(err);
                  customAlert(err.response?.data?.message || 'Failed to delete subtitle', 'error');
                }
              }}
            />
          ));
        }}
      />
      
      {/* Remap Modal */}
      <RemapModal
        type="tv"
        title={show?.title}
        currentTmdbId={show?.tmdb_id}
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
      <SubtitleSearchModal
        modalState={subSearchModal}
        onClose={() => setSubSearchModal({ open: false, code: '', label: '', episodeId: null, subKey: null })}
        onRefresh={fetchShowData}
      />
      {/* Subtitle Manager Modal */}
      {subManagerEpisode && (
        <SubtitleManagerModal
          open={Boolean(subManagerEpisode)}
          onClose={() => setSubManagerEpisode(null)}
          mediaType="episode"
          mediaId={subManagerEpisode.id}
          title={`${show?.title} - S${String(subManagerEpisode.season_number).padStart(2, '0')}E${String(subManagerEpisode.episode_number).padStart(2, '0')} (${subManagerEpisode.title || 'Episode'})`}
          onRefresh={fetchShowData}
          onOpenSubSearch={() => {
            setSubSearchModal({
              open: true,
              code: 'en',
              label: 'English',
              episodeId: subManagerEpisode.id,
              subKey: `m-${subManagerEpisode.id}`
            });
          }}
        />
      )}
    </motion.div>
    </div>
  );
}
