import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { formatSize, parseResolution, LANG_LABEL, LANG_NAME } from '../lib/format';
import { useSettings } from '../lib/useSettings';
import { useTMDBDetails } from '../lib/useTMDBDetails';
import { ArrowLeft, HardDrive, Tv, PlayCircle, ChevronDown, ChevronRight, ChevronLeft, Bookmark, BookmarkMinus, Search, Star, X, RefreshCw, Loader2, Download, CheckSquare, Film, Trash2 } from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';
import { useOutsideClick } from '../lib/useOutsideClick';
import TrailerModal from '../components/TrailerModal';
import ManualSearchModal from '../components/ManualSearchModal';
import EpisodeDetailsModal from '../components/EpisodeDetailsModal';
import RemapModal from '../components/RemapModal';
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

  useEffect(() => {
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
    <div className="relative min-h-screen">
      {/* Backdrop background */}
      {tmdbDetails?.backdrop_path && (
        <div className="fixed inset-0 z-0">
          <img
            src={`https://image.tmdb.org/t/p/original${tmdbDetails.backdrop_path}`}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/85 via-slate-950/60 to-slate-950" />
        </div>
      )}

      <div className="relative z-10 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
      <button 
        onClick={() => navigate('/shows')} 
        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/70 hover:bg-slate-700/70 text-slate-300 hover:text-white rounded-xl border border-white/10 hover:border-white/20 transition-all duration-200 text-sm font-medium backdrop-blur-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div className="flex items-center gap-1">
        <button
          onClick={() => prevId && navigate(`/shows/${prevId}`)}
          disabled={!prevId}
          className="p-2 bg-slate-800/70 hover:bg-slate-700/70 text-slate-300 hover:text-white rounded-full border border-white/10 hover:border-white/20 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Previous show"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => nextId && navigate(`/shows/${nextId}`)}
          disabled={!nextId}
          className="p-2 bg-slate-800/70 hover:bg-slate-700/70 text-slate-300 hover:text-white rounded-full border border-white/10 hover:border-white/20 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Next show"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      </div>

      {/* Hero / Banner Section */}
      <div className="glass-panel rounded-3xl flex flex-col md:flex-row relative z-10">
        <div className="md:w-1/3 lg:w-1/4 shrink-0 relative group overflow-hidden rounded-t-3xl md:rounded-l-3xl md:rounded-tr-none">
          <img 
            src={`https://image.tmdb.org/t/p/w500${show.poster_path}`} 
            alt={show.title}
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
          <h1 className="text-2xl md:text-5xl font-black text-white mb-2 tracking-tight flex items-center gap-2 md:gap-3 min-w-0">
            <button 
              onClick={async () => {
                try {
                  const res = await api.post(`/library/shows/${show.id}/toggle-monitor`);
                  if (res.data.status === 'success') {
                    fetchShowData();
                  }
                } catch (err) {
                  customAlert('Failed to toggle monitor status', 'error');
                }
              }}
              className="shrink-0 hover:scale-110 transition-transform cursor-pointer focus:outline-none"
              title={show.monitored ? "Monitored" : "Unmonitored"}
              aria-label={show.monitored ? "Unmonitor show" : "Monitor show"}
            >
              {show.monitored ? (
                <Bookmark className="w-7 h-7 md:w-10 md:h-10 text-purple-400 fill-purple-400" />
              ) : (
                <BookmarkMinus className="w-7 h-7 md:w-10 md:h-10 text-slate-500" />
              )}
            </button>

            <span className="flex-1 min-w-0 truncate text-2xl md:text-5xl">
              {show.title} <span className="text-slate-400 font-light whitespace-nowrap">({show.year})</span>
            </span>
            <button
              onClick={refreshAll}
              disabled={isRefreshing}
              className="shrink-0 p-1.5 md:p-2 bg-slate-800/50 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-purple-400 disabled:opacity-50"
              title="Refresh show information from TMDB"
              aria-label="Refresh show information from TMDB"
            >
              <RefreshCw className={`w-4 h-4 md:w-5 md:h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <div ref={deleteMenuRef} className="relative shrink-0 inline-flex">
              <button
                onClick={() => setDeleteMenuOpen(!deleteMenuOpen)}
                className="p-1.5 md:p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors text-red-400"
                title="Delete show"
                aria-label="Delete show"
              >
                <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
              </button>
              {deleteMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-white/5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Remove from Library</p>
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
                      <p className="text-xs text-slate-500">Remove from library and delete files from disk</p>
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
                      <p className="text-xs text-slate-500">Remove from library, keep files on disk</p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </h1>
          
          <div className="flex items-center gap-1.5 sm:gap-3 mb-6 mt-2 flex-nowrap overflow-x-auto">
            {show.rating > 0 && (
              <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-950/50 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-lg border border-white/5 shadow-inner shrink-0">
                <Star className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                <span className="text-xs sm:text-sm font-bold text-slate-200">{Number(show.rating).toFixed(1)}</span>
              </div>
            )}
            <span className={`px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-xs font-bold capitalize tracking-wider ${
              show.status === 'downloaded' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 
              show.status === 'downloading' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 
              show.status === 'wanted' ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' : 
              show.status === 'monitored' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 
              'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            } shrink-0`}>
              {show.status === 'wanted' ? 'Watchlist' : show.status}
            </span>
            {show.folder_size > 0 && (
              <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-xs font-bold shrink-0 whitespace-nowrap">
                Available locally
              </span>
            )}
          </div>
          
          <p className="text-slate-300 text-lg leading-relaxed max-w-3xl mb-6">
            {show.overview || 'No overview available for this show.'}
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-5 w-full mt-4 text-sm bg-slate-900/50 p-5 rounded-xl border border-white/5">
            <div className="col-span-full">
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">
                <HardDrive className="w-3 h-3" /> Path
              </div>
              <p className="font-mono text-xs text-slate-300 truncate" title={show.folder_path}>{show.folder_path || <span className="text-slate-600 italic">Not downloaded</span>}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1.5">
                <Film className="w-3 h-3" /> Resolution
              </div>
              {(() => {
                let res = 'Unknown';
                if (episodes && episodes.length > 0) {
                  for (const ep of episodes) {
                    if (ep.status === 'downloaded') {
                      const epRes = parseResolution(ep.scene_name || ep.file_path);
                      if (epRes !== 'Unknown') {
                        res = epRes;
                        break;
                      }
                    }
                  }
                }
                return res !== 'Unknown' ? (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">{res}</span>
                ) : (
                  <p className="font-medium text-slate-500">—</p>
                );
              })()}
            </div>
            <div className="lg:col-span-2">
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1.5">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Quality Profile
              </div>
              {updatingQuality ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                  <span className="text-xs text-slate-400">Updating...</span>
                </div>
              ) : (
                <select
                  className="bg-slate-800 border border-white/10 rounded-lg text-xs text-slate-300 px-2 py-1.5 focus:border-cyan-500/50 focus:outline-none cursor-pointer max-w-[140px]"
                  value={show.quality_profile_id || ''}
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
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1.5">
                <HardDrive className="w-3 h-3" /> Size
              </div>
              <p className="font-medium text-slate-300">{formatSize(show.folder_size)}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1.5">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Watched
              </div>
              <p className={`font-bold ${show.watched ? 'text-emerald-400' : 'text-slate-500'}`}>{show.watched ? '✓ Yes' : 'No'}</p>
            </div>
            {tmdbDetails?.original_language && (
              <div>
                <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1.5">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Language
                </div>
                <p className="font-medium text-slate-300 uppercase">{tmdbDetails.original_language}</p>
              </div>
            )}
            {tmdbDetails?.networks?.length > 0 && (
              <div className="col-span-2">
                <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1.5">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><path d="M8 21h8M12 17v4"/></svg> Network
                </div>
                <p className="font-medium text-slate-300 truncate" title={tmdbDetails.networks[0].name}>{tmdbDetails.networks[0].name}</p>
              </div>
            )}
            {tmdbDetails?.genres?.length > 0 && (
              <div className="col-span-full">
                <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-2">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> Genres
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tmdbDetails.genres.map(g => (
                    <span key={g.id} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">{g.name}</span>
                  ))}
                </div>
              </div>
            )}

            {/* TMDB Link / Remap */}
            <div className="col-span-full border-t border-white/5 pt-4 mt-1 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div>
                  <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> TMDB ID
                  </div>
                  <a href={`https://www.themoviedb.org/tv/${show.tmdb_id}`} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-purple-400 hover:text-purple-300 underline">{show.tmdb_id}</a>
                </div>
                {show.tmdb_status && (
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Status</p>
                    <span className={`text-xs sm:text-xs font-bold capitalize tracking-wider px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full border ${
                      show.tmdb_status === 'Ended' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                      show.tmdb_status === 'Returning Series' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                      show.tmdb_status === 'Canceled' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                      show.tmdb_status === 'In Production' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                      'bg-slate-500/20 text-slate-400 border-slate-500/30'
                    }`}>{show.tmdb_status}</span>
                  </div>
                )}
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

        </div>
      </div>

      {/* Episodes Section */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold text-white mb-6">Episodes</h2>
        
        <div className="space-y-6">
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
                
                {!isCollapsed && (
                  <>
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
                                {ep.status === 'downloading' ? 'Downloading' : ep.status === 'downloaded' ? 'Downloaded' : !ep.monitored ? 'Unmonitored' : (!ep.file_path && !ep.air_date && !seasonHasDownloads) || (ep.air_date && new Date(ep.air_date) > new Date()) ? 'Not Released' : 'Monitored'}
                              </button>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {!ep.file_path ? (
                                  <span className="text-[10px] text-slate-600">—</span>
                                ) : (
                                  <>
                                    {(() => {
                                      const existingCodes = ep.subtitles?.map(s => s.lang) || [];
                                      const hasExistingSub = ep.subtitles?.length > 0;
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
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-slate-200 truncate">{ep.title}</p>
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
                                  {ep.status === 'downloading' ? 'DL' : ep.status === 'downloaded' ? 'Ready' : !ep.monitored ? 'Off' : 'On'}
                                </button>
                              </div>
                              <div className="flex items-center gap-2 mt-1.5">
                                <div className="flex items-center gap-1 flex-wrap min-w-0 flex-1">
                                  {!ep.file_path ? (
                                    <span className="text-[10px] text-slate-600">—</span>
                                  ) : (
                                    (() => {
                                      const existingCodes = ep.subtitles?.map(s => s.lang) || [];
                                      const hasExistingSub = ep.subtitles?.length > 0;
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
                  </>
                )}
              </div>
            );
            });
          })()}
        </div>
      </div>

      {/* Cast & Crew Section */}
      {tmdbDetails?.credits?.cast?.length > 0 && (
        <div className="mt-8 bg-slate-900/60 p-5 rounded-xl border border-white/5">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Cast
            <span className="text-xs font-medium text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{tmdbDetails.credits.cast.slice(0, 15).length}</span>
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x hide-scrollbar">
            {tmdbDetails.credits.cast.slice(0, 15).map(person => (
              <Link key={person.credit_id} to={`/person/${person.id}`} className="shrink-0 w-32 group snap-start">
                <div className="aspect-[2/3] rounded-xl overflow-hidden bg-slate-800 mb-2 border border-white/5 group-hover:border-white/20 transition-colors">
                  {person.profile_path ? (
                    <img src={`https://image.tmdb.org/t/p/w185${person.profile_path}`} alt={person.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-600"><Search className="w-6 h-6 mb-1" />No Image</div>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-200 truncate group-hover:text-purple-400 transition-colors">{person.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{person.character}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

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
    </div>
    </div>
  );
}
