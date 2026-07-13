import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { formatSize, parseResolution, parseCodec, parseAudio, LANG_LABEL, LANG_NAME } from '../lib/format';
import { useSettings } from '../lib/useSettings';
import { useTMDBDetails } from '../lib/useTMDBDetails';
import { ArrowLeft, HardDrive, Tv, PlayCircle, ChevronDown, ChevronRight, ChevronLeft, Bookmark, BookmarkMinus, Search, Star, X, RefreshCw, Loader2, Download, CheckSquare, Film, Trash2, Globe, Eye, Volume2 } from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';
import { useOutsideClick } from '../lib/useOutsideClick';
import { cachedShows, setCachedShows } from '../lib/libraryCache';
import TrailerModal from '../components/TrailerModal';
import ManualSearchModal from '../components/ManualSearchModal';
import EpisodeDetailsModal from '../components/EpisodeDetailsModal';
import RemapModal from '../components/RemapModal';
import { posterUrl, tmdbImgUrl } from '../lib/posterUrl';

import SubSearchModal from '../components/SubSearchModal';
import SubtitleLanguageBadge from '../components/shared/SubtitleLanguageBadge';
import { ProviderLabel } from '../utils/providerColors';

export default function ShowDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [show, setShow] = useState(null);
  const [detailsModalEpisode, setDetailsModalEpisode] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const { providerLangs, profiles } = useSettings();
  const [downloadingSubs, setDownloadingSubs] = useState({});
  const [openLangMenu, setOpenLangMenu] = useState(null);
  const [updatingQuality, setUpdatingQuality] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const deleteMenuRef = useOutsideClick(() => setDeleteMenuOpen(false), deleteMenuOpen);

  // Prev/next navigation
  const [siblingIds, setSiblingIds] = useState([]);

  // Use cached library data for sibling navigation — avoids a full re-fetch on every detail page visit.
  // Falls back to a lightweight fetch only when cache is cold.
  useEffect(() => {
    if (cachedShows && cachedShows.length > 0) {
      setSiblingIds(cachedShows.map(s => s.id));
      return;
    }
    api.get('/library/shows').then(res => {
      if (res.data?.data) setSiblingIds(res.data.data.map(s => s.id));
    }).catch(() => {});
  }, []);

  const currentIndex = siblingIds.indexOf(Number(id));
  const prevId = currentIndex > 0 ? siblingIds[currentIndex - 1] : null;
  const nextId = currentIndex >= 0 && currentIndex < siblingIds.length - 1 ? siblingIds[currentIndex + 1] : null;

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

  // Subtitle Manual Search Modal
  const [subSearchModal, setSubSearchModal] = useState({ open: false, code: '', label: '', episodeId: null });
  const [subSearchResults, setSubSearchResults] = useState([]);
  const [subSearching, setSubSearching] = useState(false);
  const [subSearched, setSubSearched] = useState(false);

  const handleSubSearch = async () => {
    setSubSearching(true);
    setSubSearchResults([]);
    setSubSearched(false);
    try {
      const res = await api.get(`/library/episodes/${subSearchModal.episodeId}/search-subs`, {
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

  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [seasonSearchModal, setSeasonSearchModal] = useState({ open: false, season: null });
  
  const [collapsedSeasons, setCollapsedSeasons] = useState({});
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);

  // Remap Modal State
  const [remapModalOpen, setRemapModalOpen] = useState(false);
  const [remapQuery, setRemapQuery] = useState('');
  const [remapSearching, setRemapSearching] = useState(false);
  const [remapResults, setRemapResults] = useState([]);
  const [remapHasSearched, setRemapHasSearched] = useState(false);
  const [remapping, setRemapping] = useState(false);

  const { tmdbDetails, trailerKey, refetch: refetchTMDB } = useTMDBDetails('show', show?.tmdb_id);

  const fetchShowData = useCallback(async (silent = true) => {
    try {
      const res = await api.get(`/library/shows/${id}`);
      if (res.data.status === 'success') {
        setShow(res.data.data);
      }
      const epRes = await api.get(`/library/shows/${id}/episodes`);
      if (epRes.data.status === 'success') {
        setEpisodes(epRes.data.data);
      }
    } catch (e) {
      console.error(e);
      if (!silent) customAlert('Failed to load show details', 'error');
    }
  }, [id]);

  useEffect(() => {
    fetchShowData(false);
  }, [fetchShowData]);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await api.post(`/library/shows/${id}/refresh`);
    } catch (e) {
      console.error('Failed to rescan folder', e);
    }
    await fetchShowData(true);
    await refetchTMDB();
    setIsRefreshing(false);
    customAlert('Show refreshed!');
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
    } catch (err) {
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

  // Group by season
  const seasons = episodes.reduce((acc, ep) => {
    if (!acc[ep.season_number]) acc[ep.season_number] = [];
    acc[ep.season_number].push(ep);
    return acc;
  }, {});

  const toggleSeason = (season) => {
    setCollapsedSeasons(prev => {
      // Default: latest season expanded, older seasons collapsed
      const sortedKeys = Object.keys(seasons).sort((a, b) => Number(b) - Number(a));
      const latestSeason = sortedKeys.length > 0 ? sortedKeys[0] : null;
      const defaultCollapsed = season !== latestSeason;
      const isCurrentlyCollapsed = prev[season] !== undefined ? prev[season] : defaultCollapsed;
      return { ...prev, [season]: !isCurrentlyCollapsed };
    });
  };

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
        className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-4"
      >
        {/* ── Top Navigation ── */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/shows')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-xl border border-white/10 hover:border-white/20 transition-all duration-200 text-sm font-medium backdrop-blur-xl"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => prevId && navigate(`/shows/${prevId}`)}
              disabled={!prevId}
              className="p-2.5 bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-xl border border-white/10 hover:border-white/20 transition-all duration-200 disabled:opacity-25 disabled:cursor-not-allowed backdrop-blur-xl"
              title="Previous show"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => nextId && navigate(`/shows/${nextId}`)}
              disabled={!nextId}
              className="p-2.5 bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-xl border border-white/10 hover:border-white/20 transition-all duration-200 disabled:opacity-25 disabled:cursor-not-allowed backdrop-blur-xl"
              title="Next show"
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
                  src={posterUrl('shows', show.tmdb_id)}
                  alt={show.title}
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
              <div className="grid grid-cols-2 gap-2 px-4 pt-4 pb-4 bg-slate-900/60">
                <div className="bg-slate-800/50 rounded-xl p-3 text-center border border-white/5">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span className="text-base font-bold text-white">{show.rating > 0 ? Number(show.rating).toFixed(1) : '—'}</span>
                    <span className="text-xs text-slate-500">/10</span>
                  </div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">TMDB Rating</p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-3 text-center border border-white/5">
                  <p className={`text-sm font-bold capitalize mb-0.5 ${
                    show.status === 'downloaded' ? 'text-emerald-400' : 
                    show.status === 'downloading' ? 'text-blue-400' : 
                    show.status === 'wanted' ? 'text-pink-400' : 
                    show.status === 'monitored' ? 'text-emerald-400' : 
                    'text-rose-400'
                  }`}>
                    {show.status === 'wanted' ? 'Watchlist' : show.status}
                  </p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Status</p>
                </div>
              </div>

              <div className="flex-1 bg-slate-900/60" />
            </div>

            {/* ─── Right: Content Column ─── */}
            <div className="flex-1 min-w-0 p-6 sm:p-7 flex flex-col">

              {/* Title Row */}
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight flex items-center gap-3">
                    <button 
                      onClick={async () => {
                        try {
                          const res = await api.post(`/library/shows/${show.id}/toggle-monitor`);
                          if (res.data.status === 'success') {
                            fetchShowData();
                            customAlert(res.data.data.monitored ? 'Show is now monitored' : 'Show is now unmonitored', 'success');
                          }
                        } catch (err) {
                          customAlert('Failed to toggle monitor status', 'error');
                        }
                      }}
                      className="shrink-0 hover:scale-110 transition-transform"
                      title={show.monitored ? "Monitored" : "Unmonitored"}
                    >
                      {show.monitored ? (
                        <Bookmark className="w-7 h-7 text-purple-400 fill-purple-400" />
                      ) : (
                        <BookmarkMinus className="w-7 h-7 text-slate-500" />
                      )}
                    </button>
                    {show.title}
                  </h1>
                  {/* Meta Line */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2 text-sm text-slate-400">
                    <span>{show.year}</span>
                    {tmdbDetails?.genres?.length > 0 && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span>{tmdbDetails.genres.map(g => g.name).join(', ')}</span>
                      </>
                    )}
                    {tmdbDetails?.number_of_seasons > 0 && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span>{tmdbDetails.number_of_seasons} Season{tmdbDetails.number_of_seasons > 1 ? 's' : ''}</span>
                      </>
                    )}
                    {tmdbDetails?.networks?.[0]?.name && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span>{tmdbDetails.networks[0].name}</span>
                      </>
                    )}
                    {show.tmdb_status && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                          show.tmdb_status === 'Ended' ? 'text-rose-400 bg-rose-500/10' :
                          show.tmdb_status === 'Returning Series' ? 'text-emerald-400 bg-emerald-500/10' :
                          'text-slate-400 bg-slate-500/10'
                        }`}>{show.tmdb_status}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Action Icons */}
                <div className="flex items-center gap-1.5 shrink-0">
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

              {/* Overview */}
              <p className="text-slate-300 text-sm leading-relaxed mb-5 max-w-2xl">
                {show.overview || 'No overview available.'}
              </p>

              {/* ── Metadata Section ── */}
              <div className="divide-y divide-white/5">

                {/* PATH */}
                <div className="py-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Path</span>
                  <p className="text-xs font-mono text-slate-300 truncate" title={show.folder_path}>
                    {show.folder_path || <span className="text-slate-600 italic">Not downloaded</span>}
                  </p>
                </div>

                {/* RESOLUTION | SIZE | LANGUAGE | WATCHED */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="flex items-center gap-3 bg-slate-800/30 dark:bg-slate-900/35 border border-slate-700/30 dark:border-white/5 rounded-xl p-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Resolution</span>
                      {(() => {
                        let res = 'Unknown';
                        let codec = 'Unknown';
                        if (episodes && episodes.length > 0) {
                          for (const ep of episodes) {
                            if (ep.status === 'downloaded') {
                              const epRes = parseResolution(ep.scene_name || ep.file_path);
                              if (epRes !== 'Unknown') res = epRes;
                              const epCodec = ep.codec || parseCodec(ep.scene_name || ep.file_path);
                              if (epCodec !== 'Unknown') codec = epCodec;
                              if (res !== 'Unknown' && codec !== 'Unknown') break;
                            }
                          }
                        }
                        if (res === 'Unknown') return <span className="text-sm font-semibold text-slate-200">—</span>;
                        return (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-sm font-semibold text-slate-200">{res}</span>
                            {codec !== 'Unknown' && (
                              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase bg-slate-800/50 px-1.5 py-0.5 rounded border border-white/5 whitespace-nowrap">
                                {codec}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-slate-800/30 dark:bg-slate-900/35 border border-slate-700/30 dark:border-white/5 rounded-xl p-3">
                    <HardDrive className="w-5 h-5 text-purple-400 shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Size</span>
                      <span className="text-sm font-semibold text-slate-200">{formatSize(show.folder_size)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-slate-800/30 dark:bg-slate-900/35 border border-slate-700/30 dark:border-white/5 rounded-xl p-3">
                    <Volume2 className="w-5 h-5 text-purple-400 shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Audio</span>
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
                        return <span className="text-sm font-semibold text-slate-200">{audio !== 'Unknown' ? audio : '-'}</span>;
                      })()}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-slate-800/30 dark:bg-slate-900/35 border border-slate-700/30 dark:border-white/5 rounded-xl p-3">
                    <Globe className="w-5 h-5 text-purple-400 shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Language</span>
                      <span className="text-sm font-semibold text-slate-200">{(tmdbDetails?.original_language || 'EN').toUpperCase()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-slate-800/30 dark:bg-slate-900/35 border border-slate-700/30 dark:border-white/5 rounded-xl p-3">
                    <Eye className="w-5 h-5 text-purple-400 shrink-0" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">Watched</span>
                      <span className={`text-sm font-semibold ${show.watched ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {show.watched ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* QUALITY PROFILE */}
                <div className="py-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">Quality Profile</span>
                    {updatingQuality ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                        <span className="text-xs text-slate-400">Updating...</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <select
                          className="bg-slate-900/50 border border-white/5 rounded-lg text-xs text-slate-400 pl-3 pr-8 py-2 focus:border-purple-500/50 focus:outline-none cursor-pointer w-full max-w-[200px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)] hover:bg-slate-800/50 hover:text-slate-200 transition-colors appearance-none"
                          value={show.quality_profile_id || ''}
                          onChange={(e) => handleQualityChange(e.target.value ? parseInt(e.target.value) : null)}
                        >
                          <option value="">Unassigned</option>
                          {profiles.filter(p => !p.media_type || p.media_type === 'both' || p.media_type === 'shows').map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                      </div>
                    )}
                  </div>
                </div>

                {/* CAST */}
                {(() => {
                  const castList = tmdbDetails?.credits?.cast?.slice(0, 5) || [];
                  if (castList.length === 0) return null;
                  return (
                    <div className="py-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-2.5">Cast</span>
                      <div className="flex gap-6 overflow-x-auto pb-1">
                        {castList.map((person) => (
                          <Link
                            key={person.credit_id}
                            to={`/person/${person.id}`}
                            className="shrink-0 flex flex-col items-center gap-2 group"
                          >
                            <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-700 ring-2 ring-white/10 group-hover:ring-purple-500/40 transition-all shadow-md">
                              {person.profile_path ? (
                                <img
                                  src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
                                  alt={person.name}
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-500">
                                  <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                </div>
                              )}
                            </div>
                            <p className="text-xs font-semibold text-slate-300 group-hover:text-purple-400 text-center leading-tight whitespace-nowrap transition-colors">{person.name}</p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })()}

              </div>
            </div>
          </div>
        </div>

        {/* ── Episodes Section ── */}
        <div className="bg-slate-900/50 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-xl shadow-black/30 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <h3 className="text-sm font-bold text-slate-200">Episodes</h3>
          </div>
          <div className="p-4 space-y-3">
          {(() => {
            const sortedSeasonKeys = Object.keys(seasons).sort((a, b) => Number(b) - Number(a));
            const latestSeason = sortedSeasonKeys.length > 0 ? sortedSeasonKeys[0] : null;

            return sortedSeasonKeys.map(season => {
              const isCollapsed = collapsedSeasons[season] !== undefined 
                ? collapsedSeasons[season] 
                : season !== latestSeason;

              return (
              <div key={season} className="glass-panel rounded-2xl border border-white/5">
                <div 
                  onClick={() => toggleSeason(season)}
                  className="w-full flex justify-between items-center p-4 sm:p-5 bg-slate-800/50 hover:bg-slate-800 transition-colors border-b border-white/5 cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 sm:gap-3">
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation(); e.preventDefault();
                        try {
                          await api.post(`/library/shows/${show.id}/seasons/${season}/toggle-monitor`);
                          fetchShowData();
                        } catch (err) {
                          customAlert('Failed to toggle season monitor', 'error');
                        }
                      }}
                      className="p-1.5 sm:p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
                      title="Toggle Monitor for entire Season"
                    >
                      {seasons[season].some(ep => ep.monitored) ? (
                        <Bookmark className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400 fill-purple-400" />
                      ) : (
                        <BookmarkMinus className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />
                      )}
                    </button>
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation(); e.preventDefault();
                        const allWatched = seasons[season].every(ep => ep.watched);
                        try {
                          await api.post(`/library/shows/${show.id}/seasons/${season}/watched`, { watched: allWatched ? 0 : 1 });
                          fetchShowData();
                        } catch (err) {
                          customAlert('Failed to mark season as watched', 'error');
                        }
                      }}
                      className={`p-2 rounded-lg transition-colors ${seasons[season].every(ep => ep.watched) ? 'bg-emerald-500/20 text-emerald-400 hover:bg-slate-700 hover:text-white' : 'text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-400'}`}
                      title="Toggle season watched status"
                    >
                      <CheckSquare className="w-5 h-5" />
                    </button>
                    <h3 className="text-xl font-bold text-purple-400">Season {season}</h3>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4">
                    {seasons[season].every(ep => ep.air_date && new Date(ep.air_date) <= new Date()) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); e.preventDefault();
                          setSeasonSearchModal({ open: true, season: Number(season) });
                        }}
                        className="p-1.5 sm:p-2 hover:bg-purple-500/20 rounded-lg transition-colors text-slate-400 hover:text-purple-400"
                        title={`Search for Season ${season} pack`}
                      >
                        <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    )}
                    <span className="text-xs sm:text-sm font-medium text-slate-400 bg-slate-900 px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg">
                      <span className="sm:hidden">{seasons[season].length}</span>
                      <span className="hidden sm:inline">{seasons[season].length} Episodes</span>
                    </span>
                    {isCollapsed ? <ChevronRight className="w-4 h-4 sm:w-6 sm:h-6 text-slate-400" /> : <ChevronDown className="w-4 h-4 sm:w-6 sm:h-6 text-slate-400" />}
                  </div>
                </div>
                
                <AnimatePresence>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      {/* Desktop table */}
                    <table className="hidden md:table w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900/50 text-slate-400 text-sm uppercase tracking-wider border-b border-white/5">
                          <th className="px-6 py-4 font-medium w-16">#</th>
                          <th className="px-6 py-4 font-medium">Title</th>
                          <th className="px-6 py-4 font-medium w-32 text-center">Status</th>
                          <th className="px-6 py-4 font-medium w-48">Subtitles</th>
                          <th className="px-6 py-4 font-medium w-32 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {(() => {
                          const seasonHasDownloads = seasons[season].some(e => e.file_path || e.status === 'downloaded');
                          return seasons[season].map(ep => (
                          <tr 
                            key={ep.id} 
                            className="hover:bg-slate-800/50 transition-colors group cursor-pointer"
                            onClick={() => setDetailsModalEpisode(ep)}
                          >
                            <td className="px-6 py-4 font-mono text-slate-500">{ep.episode_number}</td>
                            <td className="px-6 py-4">
                              <p className="font-bold text-slate-700 dark:text-slate-200 group-hover:text-purple-400 transition-colors">{ep.title}</p>
                              {ep.overview && <p className="text-xs text-slate-500 line-clamp-1 mt-1 max-w-xl">{ep.overview}</p>}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button 
                                onClick={async (e) => {
                                  e.stopPropagation(); e.preventDefault();
                                  if (ep.status === 'downloading') {
                                    if (await customConfirm("Reset status to monitored?")) {
                                      try {
                                        await api.post(`/library/episodes/${ep.id}/reset`);
                                        fetchShowData();
                                        customAlert('Status reset to monitored');
                                      } catch (e) {
                                        console.error('Failed to reset status', e);
                                        customAlert('Failed to reset status', 'error');
                                      }
                                    }
                                  } else {
                                    try {
                                      await api.post(`/library/episodes/${ep.id}/toggle-monitor`);
                                      fetchShowData();
                                    } catch (e) {
                                      console.error('Failed to toggle monitor status', e);
                                      customAlert('Failed to toggle monitor status', 'error');
                                    }
                                  }
                                }}
                                className={`text-[10px] uppercase font-bold px-3 py-1 rounded-full mx-auto inline-block cursor-pointer transition-colors whitespace-nowrap ${
                                  ep.status === 'downloading' ? 'hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 bg-blue-500/20 text-blue-400 border border-blue-500/30' : 
                                  ep.status === 'downloaded' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-slate-700' : 
                                  !ep.monitored ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-emerald-500/20 hover:text-emerald-400 hover:border-emerald-500/30' :
                                  (!ep.file_path && !ep.air_date && !seasonHasDownloads) || (ep.air_date && new Date(ep.air_date) > new Date()) ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 cursor-default' :
                                  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/30'
                                }`}
                                title={
                                  ep.status === 'downloading' ? "Click to reset if stuck" :
                                  (!ep.file_path && !ep.air_date && !seasonHasDownloads) ? "Season has not started airing yet" :
                                  (ep.air_date && new Date(ep.air_date) > new Date()) ? `Airs on ${new Date(ep.air_date).toLocaleDateString()}` :
                                  "Click to toggle monitor status"
                                }
                              >
                                {ep.status === 'downloading' ? 'Downloading' : ep.status === 'downloaded' ? 'Downloaded' : !ep.monitored ? 'Unmonitored' : (!ep.file_path && !ep.air_date && !seasonHasDownloads) || (ep.air_date && new Date(ep.air_date) > new Date()) ? 'Not released' : 'Monitored'}
                              </button>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {!ep.file_path ? (
                                  <span className="text-[10px] text-slate-600">—</span>
                                ) : (
                                  <>
                                    {(() => {
                                      const subsData = (() => { const raw = ep.subtitles; if (!raw) return []; if (Array.isArray(raw)) return raw; try { return JSON.parse(raw); } catch { return []; } })(); const existingCodes = subsData.map(s => typeof s === 'string' ? s : s.lang).filter(Boolean);
                                      const hasExistingSub = subsData.length > 0;
                                      const subKey = `${ep.id}`;
                                      return providerLangs.map(code => (
                                        <SubtitleLanguageBadge
                                          key={code}
                                          code={code}
                                          exists={existingCodes.includes(code)}
                                          hasExistingSub={hasExistingSub}
                                          isOpen={openLangMenu === `${subKey}-${code}`}
                                          downloading={downloadingSubs[`${subKey}-${code}`]}
                                          onOpenMenu={() => setOpenLangMenu(openLangMenu === `${subKey}-${code}` ? null : `${subKey}-${code}`)}
                                          onAutoSearch={async () => {
                                            setOpenLangMenu(null);
                                            setDownloadingSubs(prev => ({ ...prev, [`${subKey}-${code}`]: true }));
                                            try {
                                              const res = await api.post(`/library/episodes/${ep.id}/download-subs`, { langCode: code });
                                              customAlert(res.data.message);
                                              fetchShowData();
                                            } catch (err) {
                                              customAlert(err.response?.data?.message || 'Auto search failed', 'error');
                                            } finally {
                                              setDownloadingSubs(prev => ({ ...prev, [`${subKey}-${code}`]: false }));
                                            }
                                          }}
                                          onManualSearch={() => {
                                            setOpenLangMenu(null);
                                            setSubSearchModal({ open: true, code, label: LANG_NAME[code] || code, episodeId: ep.id });
                                            setSubSearchResults([]);
                                            setSubSearched(false);
                                          }}
                                          onAutoTranslate={async () => {
                                            setOpenLangMenu(null);
                                            customAlert(`Translating to ${LANG_NAME[code]}...`, 'info');
                                            try {
                                              const res = await api.post(`/library/episodes/${ep.id}/translate-subs`, { targetLang: LANG_NAME[code] });
                                              if (res.data.status === 'success') {
                                                customAlert(res.data.message);
                                                fetchShowData();
                                              }
                                            } catch (err) {
                                              customAlert(err.response?.data?.message || 'Translation failed', 'error');
                                            }
                                          }}
                                        />
                                      ));
                                    })()}
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button 
                                    onClick={async (e) => {
                                      e.stopPropagation(); e.preventDefault();
                                      customAlert(`Starting auto-search for S${ep.season_number}E${ep.episode_number}...`);
                                      try {
                                        const res = await api.post(`/library/episodes/${ep.id}/auto-search`);
                                        if (res.data.status === 'success') {
                                          customAlert(`Found & downloading: ${res.data.data.title}`);
                                          fetchShowData();
                                        }
                                      } catch (err) {
                                        console.error(err);
                                        customAlert('Auto-search failed to find any results', 'error');
                                      }
                                    }}
                                    className="bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 border border-emerald-500/30 text-xs font-bold p-2 rounded-lg inline-flex items-center justify-center transition-colors tooltip"
                                    title="Auto Search & Download (Best Result)"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-zap"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation(); e.preventDefault();
                                      setSelectedEpisode(ep);
                                      setSearchModalOpen(true);
                                    }}
                                    className="bg-purple-500/20 hover:bg-purple-500/40 text-purple-400 border border-purple-500/30 text-xs font-bold p-2 rounded-lg inline-flex items-center justify-center transition-colors tooltip"
                                    title="Manual Search"
                                  >
                                    <Search className="w-4 h-4" />
                                  </button>
                                </div>
                            </td>
                          </tr>
                        ));
                        })()}
                      </tbody>
                    </table>

                    {/* Mobile episode cards */}
                    <div className="md:hidden">
                      {(() => {
                        const seasonHasDownloads = seasons[season].some(e => e.file_path || e.status === 'downloaded');
                        return seasons[season].map(ep => (
                          <div
                            key={ep.id}
                            className="flex items-start gap-3 px-4 py-3.5 border-b border-white/5 last:border-b-0 hover:bg-slate-800/30 transition-colors cursor-pointer"
                            onClick={() => setDetailsModalEpisode(ep)}
                          >
                            <span className="font-mono text-xs text-slate-500 shrink-0 mt-1 w-5 text-right">{ep.episode_number}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-bold text-slate-200 truncate pr-2">{ep.title}</p>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation(); e.preventDefault();
                                    if (ep.status === 'downloading') {
                                      if (await customConfirm("Reset status to monitored?")) {
                                        try {
                                          await api.post(`/library/episodes/${ep.id}/reset`);
                                          fetchShowData();
                                          customAlert('Status reset to monitored');
                                        } catch (e) {
                                          customAlert('Failed to reset status', 'error');
                                        }
                                      }
                                    } else {
                                      try {
                                        await api.post(`/library/episodes/${ep.id}/toggle-monitor`);
                                        fetchShowData();
                                      } catch (e) {
                                        customAlert('Failed to toggle monitor status', 'error');
                                      }
                                    }
                                  }}
                                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full shrink-0 transition-colors whitespace-nowrap ${
                                    ep.status === 'downloading' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                    ep.status === 'downloaded' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                    !ep.monitored ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                                    (!ep.file_path && !ep.air_date && !seasonHasDownloads) || (ep.air_date && new Date(ep.air_date) > new Date()) ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                    'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  }`}
                                >
                                  {ep.status === 'downloading' ? 'Downloading' : ep.status === 'downloaded' ? 'Downloaded' : !ep.monitored ? 'Unmonitored' : (!ep.file_path && !ep.air_date && !seasonHasDownloads) || (ep.air_date && new Date(ep.air_date) > new Date()) ? 'Not released' : 'Monitored'}
                                </button>
                              </div>
                              <div className="flex items-center gap-2 mt-1.5">
                                <div className="flex items-center gap-1 flex-wrap min-w-0 flex-1">
                                  {!ep.file_path ? (
                                    <span className="text-[10px] text-slate-600">—</span>
                                  ) : (
                                    (() => {
                                      const subsData = (() => { const raw = ep.subtitles; if (!raw) return []; if (Array.isArray(raw)) return raw; try { return JSON.parse(raw); } catch { return []; } })(); const existingCodes = subsData.map(s => typeof s === 'string' ? s : s.lang).filter(Boolean);
                                      const hasExistingSub = subsData.length > 0;
                                      const subKey = `m-${ep.id}`;
                                      return providerLangs.map(code => (
                                        <SubtitleLanguageBadge
                                          key={code}
                                          code={code}
                                          exists={existingCodes.includes(code)}
                                          hasExistingSub={hasExistingSub}
                                          isOpen={openLangMenu === `${subKey}-${code}`}
                                          downloading={downloadingSubs[`${subKey}-${code}`]}
                                          onOpenMenu={() => setOpenLangMenu(openLangMenu === `${subKey}-${code}` ? null : `${subKey}-${code}`)}
                                          onAutoSearch={async () => {
                                            setOpenLangMenu(null);
                                            setDownloadingSubs(prev => ({ ...prev, [`${subKey}-${code}`]: true }));
                                            try {
                                              const res = await api.post(`/library/episodes/${ep.id}/download-subs`, { langCode: code });
                                              customAlert(res.data.message);
                                              fetchShowData();
                                            } catch (err) {
                                              customAlert(err.response?.data?.message || 'Auto search failed', 'error');
                                            } finally {
                                              setDownloadingSubs(prev => ({ ...prev, [`${subKey}-${code}`]: false }));
                                            }
                                          }}
                                          onManualSearch={() => {
                                            setOpenLangMenu(null);
                                            setSubSearchModal({ open: true, code, label: LANG_NAME[code] || code, episodeId: ep.id });
                                            setSubSearchResults([]);
                                            setSubSearched(false);
                                          }}
                                          onAutoTranslate={async () => {
                                            setOpenLangMenu(null);
                                            customAlert(`Translating to ${LANG_NAME[code]}...`, 'info');
                                            try {
                                              const res = await api.post(`/library/episodes/${ep.id}/translate-subs`, { targetLang: LANG_NAME[code] });
                                              if (res.data.status === 'success') {
                                                customAlert(res.data.message);
                                                fetchShowData();
                                              }
                                            } catch (err) {
                                              customAlert(err.response?.data?.message || 'Translation failed', 'error');
                                            }
                                          }}
                                        />
                                      ));
                                    })()
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation(); e.preventDefault();
                                      customAlert(`Starting auto-search for S${ep.season_number}E${ep.episode_number}...`);
                                      try {
                                        const res = await api.post(`/library/episodes/${ep.id}/auto-search`);
                                        if (res.data.status === 'success') {
                                          customAlert(`Found & downloading: ${res.data.data.title}`);
                                          fetchShowData();
                                        }
                                      } catch (err) {
                                        customAlert('Auto-search failed', 'error');
                                      }
                                    }}
                                    className="bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/25 p-1.5 rounded-lg transition-colors"
                                    title="Auto Search"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation(); e.preventDefault();
                                      setSelectedEpisode(ep);
                                      setSearchModalOpen(true);
                                    }}
                                    className="bg-purple-500/15 hover:bg-purple-500/30 text-purple-400 border border-purple-500/25 p-1.5 rounded-lg transition-colors"
                                    title="Manual Search"
                                  >
                                    <Search className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
            });
          })()}
        </div>
      </div>

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
        episode={detailsModalEpisode} 
        show={show} 
        onClose={() => setDetailsModalEpisode(null)}
        onAutoSearch={async (ep) => {
          setDetailsModalEpisode(null);
          customAlert(`Starting auto-search for S${ep.season_number}E${ep.episode_number}...`);
          try {
            const res = await api.post(`/library/episodes/${ep.id}/auto-search`);
            if (res.data.status === 'success') {
              customAlert(`Found & downloading: ${res.data.data.title}`);
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
      {subSearchModal.open && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" onClick={() => setSubSearchModal({ open: false, code: '', label: '', episodeId: null })}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-slate-900 border border-white/10 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                  <Search className="w-5 h-5 text-cyan-400" />
                  Search Subtitles — {subSearchModal.label}
                </h3>
              </div>
              <button onClick={() => setSubSearchModal({ open: false, code: '', label: '', episodeId: null })} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors">
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
                            {/* Mobile card layout */}
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
                                    const subKey = `${subSearchModal.episodeId}`;
                                    setDownloadingSubs(prev => ({ ...prev, [`${subKey}-${subSearchModal.code}`]: true }));
                                    try {
                                      const res = await api.post(`/library/episodes/${subSearchModal.episodeId}/download-subs`, {
                                        langCode: subSearchModal.code,
                                        url: provider.provider === 'SubDL' ? (item.url || null) : null,
                                        fileId: item.fileId || null,
                                        provider: provider.provider
                                      });
                                      customAlert(res.data.message);
                                      setSubSearchModal({ open: false, code: '', label: '', episodeId: null });
                                      fetchShowData();
                                    } catch (err) {
                                      customAlert(err.response?.data?.message || 'Download failed', 'error');
                                    } finally {
                                      setDownloadingSubs(prev => ({ ...prev, [`${subKey}-${subSearchModal.code}`]: false }));
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
                                {item.uploader && (
                                  <span className="text-[10px] text-slate-500 truncate max-w-[100px]" title={item.uploader}>{item.uploader}</span>
                                )}
                                {item.fromTrusted && <span className="text-[10px] text-emerald-400/80 font-medium">✓ Trusted</span>}
                                {item.aiTranslated && <span className="text-[10px] text-amber-400/80">AI</span>}
                                {item.downloads > 0 && <span className="text-[10px] text-slate-500">{item.downloads} DL</span>}
                                {item.format && <span className="text-[10px] text-slate-600 uppercase">{item.format}</span>}
                                {item.uploadDate && <span className="text-[10px] text-slate-500 ml-auto">{item.uploadDate}</span>}
                              </div>
                            </div>
                            {/* Desktop row layout */}
                            <div className="hidden md:flex items-center gap-3 px-3 py-2.5">
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
                                <ProviderLabel provider={provider.provider} />
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
                                  const subKey = `${subSearchModal.episodeId}`;
                                  setDownloadingSubs(prev => ({ ...prev, [`${subKey}-${subSearchModal.code}`]: true }));
                                  try {
                                    const res = await api.post(`/library/episodes/${subSearchModal.episodeId}/download-subs`, {
                                      langCode: subSearchModal.code,
                                      url: provider.provider === 'SubDL' ? (item.url || null) : null,
                                      fileId: item.fileId || null,
                                      provider: provider.provider
                                    });
                                    customAlert(res.data.message);
                                    setSubSearchModal({ open: false, code: '', label: '', episodeId: null });
                                    fetchShowData();
                                  } catch (err) {
                                    customAlert(err.response?.data?.message || 'Download failed', 'error');
                                  } finally {
                                    setDownloadingSubs(prev => ({ ...prev, [`${subKey}-${subSearchModal.code}`]: false }));
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
              <button onClick={() => setSubSearchModal({ open: false, code: '', label: '', episodeId: null })} className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">
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
    </motion.div>
    </div>
  );
}
