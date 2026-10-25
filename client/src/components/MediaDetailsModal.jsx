import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import clsx from 'clsx';
import { 
  X, Star, Calendar, Clock, Plus, PlayCircle, CheckCircle2, 
  CheckSquare, Square, XCircle, Trash2, Loader2, ChevronDown, 
  Clapperboard, ShieldCheck, Bookmark, BookmarkMinus 
} from 'lucide-react';
import { customAlert } from '../utils/alerts';
import TrailerModal from './TrailerModal';
import Spinner from './shared/Spinner';
import { posterUrl, tmdbImgUrl } from '../lib/posterUrl';
import { setCachedMovies, setCachedShows } from '../lib/libraryCache';
import { invalidateLibraryIndex } from '../lib/libraryIndex';

export default function MediaDetailsModal({ 
  isOpen, 
  onClose, 
  mediaId, 
  mediaType, 
  isInLibrary, 
  libraryId, 
  onAdded, 
  onRequest, 
  mode: _mode = 'add', 
  requestStatus, 
  onDelete,
  navigateOnAdd = true
}) {
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [autoSearch, setAutoSearch] = useState(true);
  const [trailerKey, setTrailerKey] = useState(null);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const deleteBtnRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [monitorLevel, setMonitorLevel] = useState('all');
  const [monitoredSeasons, setMonitoredSeasons] = useState(new Set());
  const [togglingSeason, setTogglingSeason] = useState(null);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      if (res.data?.status === 'success') {
        const data = res.data.data;
        if (data.profiles) {
          setProfiles(data.profiles);
          const filteredProfiles = data.profiles.filter(p => 
            !p.media_type || p.media_type === 'both' || p.media_type === (mediaType === 'movie' ? 'movies' : 'shows')
          );
          const defaultProfileId = data.defaultQualityProfileId;
          const defaultIdStr = defaultProfileId ? String(defaultProfileId) : null;
          const filteredIds = filteredProfiles.map(p => String(p.id));
          if (defaultIdStr && filteredIds.includes(defaultIdStr)) {
            setSelectedProfile(defaultIdStr);
          } else if (filteredProfiles.length > 0) {
            setSelectedProfile(String(filteredProfiles[0].id));
          }
        }
        if (data.libraryPaths) {
          const preferredPath = data.libraryPaths.find(p => 
            p.path.toLowerCase().includes(mediaType === 'movie' ? 'movie' : (mediaType === 'tv' || mediaType === 'show' ? 'tv' : 'show'))
          );
          if (preferredPath) {
            setSelectedPath(preferredPath.path);
          } else if (data.libraryPaths.length > 0) {
            setSelectedPath(data.libraryPaths[0].path);
          }
        }
      }
    } catch {
      // Settings unavailable — profiles will remain empty
    }
  };

  const fetchDetails = async () => {
    setLoading(true);
    setError('');
    try {
      const endpointType = mediaType === 'tv' ? 'show' : mediaType;
      const res = await api.get(`/tmdb/${endpointType}/${mediaId}?_t=${Date.now()}`);
      if (res.data?.status === 'success') {
        setDetails(res.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && mediaId) {
      setDeleting(false);
      setDeleteOpen(false);
      setIsAdding(false);
      fetchDetails();
      fetchSettings();
    } else {
      setDetails(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mediaId]);

  useEffect(() => {
    if (details?.seasons && (mediaType === 'show' || mediaType === 'tv' || mediaType === 'shows')) {
      const validSeasons = details.seasons.filter(s => s.season_number > 0);
      if (isInLibrary && libraryId) {
        api.get(`/library/shows/${libraryId}/episodes`)
          .then(res => {
            if (res.data?.status === 'success') {
              const eps = res.data.data || [];
              const monitoredNums = new Set(
                eps.filter(e => e.monitored).map(e => e.season_number)
              );
              setMonitoredSeasons(monitoredNums);
            }
          })
          .catch(() => {
            setMonitoredSeasons(new Set(validSeasons.map(s => s.season_number)));
          });
      } else {
        // Monitored standard ON by default
        setMonitoredSeasons(new Set(validSeasons.map(s => s.season_number)));
        setMonitorLevel('all');
      }
    }
  }, [details, isInLibrary, libraryId, mediaType]);

  const handleMonitorLevelChange = (level) => {
    setMonitorLevel(level);
    if (!details?.seasons) return;
    const validSeasons = details.seasons.filter(s => s.season_number > 0);
    const seasonNums = validSeasons.map(s => s.season_number);
    const latestNum = seasonNums.length > 0 ? Math.max(...seasonNums) : 1;

    if (level === 'all' || level === 'future') {
      setMonitoredSeasons(new Set(seasonNums));
    } else if (level === 'none') {
      setMonitoredSeasons(new Set());
    } else if (level === 'first') {
      setMonitoredSeasons(new Set([1]));
    } else if (level === 'latest') {
      setMonitoredSeasons(new Set([latestNum]));
    }
  };

  const handleToggleSeason = async (seasonNumber) => {
    if (isInLibrary && libraryId) {
      setTogglingSeason(seasonNumber);
      try {
        const res = await api.post(`/library/shows/${libraryId}/seasons/${seasonNumber}/toggle-monitor`);
        if (res.data?.status === 'success') {
          const isNowMonitored = res.data.data.monitored === 1;
          setMonitoredSeasons(prev => {
            const next = new Set(prev);
            if (isNowMonitored) next.add(seasonNumber);
            else next.delete(seasonNumber);
            return next;
          });
          customAlert(`Season ${seasonNumber} is now ${res.data.data.monitored ? 'monitored' : 'unmonitored'}`);
        }
      } catch {
        customAlert('Failed to toggle season monitor', 'error');
      } finally {
        setTogglingSeason(null);
      }
      return;
    }

    setMonitoredSeasons(prev => {
      const next = new Set(prev);
      if (next.has(seasonNumber)) {
        next.delete(seasonNumber);
      } else {
        next.add(seasonNumber);
      }

      const validSeasons = (details?.seasons || []).filter(s => s.season_number > 0);
      const allNums = validSeasons.map(s => s.season_number);
      const latestNum = allNums.length > 0 ? Math.max(...allNums) : 1;

      if (next.size === 0) {
        setMonitorLevel('none');
      } else if (next.size === allNums.length) {
        setMonitorLevel(prevLevel => prevLevel === 'future' ? 'future' : 'all');
      } else if (next.size === 1 && next.has(1)) {
        setMonitorLevel('first');
      } else if (next.size === 1 && next.has(latestNum)) {
        setMonitorLevel('latest');
      } else {
        setMonitorLevel('custom');
      }

      return next;
    });
  };

  const handleSelectAllSeasons = () => {
    if (!details?.seasons) return;
    const allNums = details.seasons.filter(s => s.season_number > 0).map(s => s.season_number);
    setMonitoredSeasons(new Set(allNums));
    setMonitorLevel('all');
  };

  const handleSelectNoneSeasons = () => {
    setMonitoredSeasons(new Set());
    setMonitorLevel('none');
  };

  if (!isOpen) return null;

  // Extract trailer
  const trailer = details?.videos?.results?.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));

  // Extract director / creator
  const director = details?.credits?.crew?.find(c => c.job === 'Director')?.name;
  const creators = details?.created_by?.map(c => c.name).join(', ');

  // Extract certification
  let certification = '';
  if (details?.release_dates?.results) {
    const usRelease = details.release_dates.results.find(r => r.iso_3166_1 === 'US');
    if (usRelease) {
      const cert = usRelease.release_dates?.find(rd => rd.certification)?.certification;
      if (cert) certification = cert;
    }
  }
  if (!certification && details?.content_ratings?.results) {
    const usRating = details.content_ratings.results.find(r => r.iso_3166_1 === 'US');
    if (usRating?.rating) certification = usRating.rating;
  }


  const handleAddMedia = async () => {
    setIsAdding(true);
    try {
      const isMovie = mediaType === 'movie';
      const endpoint = isMovie ? '/library/movies' : '/library/shows';
      const payload = { 
        tmdbId: details.id, 
        qualityProfileId: parseInt(selectedProfile) || null,
        rootFolderPath: selectedPath,
        autoSearch,
        monitorLevel: !isMovie ? monitorLevel : undefined,
        monitoredSeasons: !isMovie ? Array.from(monitoredSeasons) : undefined
      };
      const res = await api.post(endpoint, payload);
      setCachedMovies(null);
      setCachedShows(null);
      invalidateLibraryIndex();
      if (onAdded) onAdded(details.id, details, res.data?.data);
      onClose();
      customAlert(`${isMovie ? 'Movie' : 'TV Show'} added to library successfully!`);
      if (autoSearch && isMovie && res.data?.data?.id) {
        api.post(`/library/movies/${res.data.data.id}/auto-search`).catch(() => {});
      }
      const addedId = res.data?.data?.id;
      if (navigateOnAdd && addedId) {
        navigate(isMovie ? `/movies/${addedId}` : `/shows/${addedId}`);
      }
    } catch (err) {
      console.error('Add to library error:', err.response?.data || err);
      customAlert(err.response?.data?.message || 'Failed to add to library', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const title = details?.title || details?.name || 'Media Details';
  const releaseYear = (details?.release_date || details?.first_air_date || '').split('-')[0];
  const runtime = details?.runtime || (details?.episode_run_time && details.episode_run_time[0]) || null;

  return createPortal(
    <>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-fade-in" 
        onClick={onClose}
      >
      <div 
        className="bg-slate-900 border border-slate-800/80 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col relative shadow-2xl overflow-hidden" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Close Button */}
        <button 
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-2.5 right-2.5 z-30 p-1.5 rounded-full bg-slate-950/70 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10 backdrop-blur-md transition-all shadow-lg"
        >
          <X className="w-4 h-4" />
        </button>

        {loading && (
          <div className="flex flex-col items-center justify-center h-80 text-slate-400 gap-3">
            <Spinner className="w-7 h-7 text-cyan-400" />
            <span className="text-xs font-medium">Loading details...</span>
          </div>
        )}

        {error && (
          <div className="p-8 text-center text-rose-400">
            <p className="font-semibold text-sm">{error}</p>
          </div>
        )}

        {details && !loading && (
          <div className="overflow-y-auto flex-1 flex flex-col">
            
            {/* ─── Hero Backdrop Banner ─── */}
            <div className="relative h-32 sm:h-40 w-full shrink-0 overflow-hidden bg-slate-950">
              {details.backdrop_path ? (
                <img 
                  src={tmdbImgUrl(details.backdrop_path, 'original')}
                  alt={title}
                  className="w-full h-full object-cover object-top opacity-80"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900" />
              )}
              {/* Cinematic Vignette Gradients */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-black/30" />
              <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-transparent to-slate-900/50" />
            </div>

            {/* ─── Modal Main Body ─── */}
            <div className="p-4 sm:p-5 pt-0 flex-1 flex flex-col">
              
              {/* Header Info Area overlapping the banner: side-by-side on mobile & desktop */}
              <div className="flex flex-row gap-3 sm:gap-4 items-start -mt-10 sm:-mt-16 relative z-20 mb-3.5">
                
                {/* Poster on the left */}
                <div className="w-24 sm:w-28 shrink-0 aspect-[2/3] rounded-lg overflow-hidden shadow-xl border border-slate-700/70 bg-slate-950 relative group">
                  {details.poster_path ? (
                    <img 
                      src={isInLibrary
                        ? posterUrl(mediaType === 'movie' ? 'movies' : 'shows', details.id, details.poster_path)
                        : tmdbImgUrl(details.poster_path)} 
                      alt={title}
                      onError={(e) => {
                        if (details.poster_path && !e.currentTarget.dataset.fallback) {
                          e.currentTarget.dataset.fallback = 'true';
                          e.currentTarget.src = `https://image.tmdb.org/t/p/w500${details.poster_path}`;
                        }
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">No Poster</div>
                  )}

                  {trailer && (
                    <button
                      onClick={() => {
                        setTrailerKey(trailer.key);
                        setIsTrailerOpen(true);
                      }}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center cursor-pointer"
                      title="Play Trailer"
                    >
                      <PlayCircle className="w-9 h-9 sm:w-10 sm:h-10 text-white drop-shadow-2xl transform scale-90 group-hover:scale-110 transition-transform" />
                    </button>
                  )}
                </div>

                {/* Title & Key Meta on the right */}
                <div className="flex-1 text-left min-w-0 pt-0.5 sm:pt-4">
                  
                  {/* Title & Year */}
                  <h1 className="text-base sm:text-xl font-bold text-white tracking-tight leading-snug">
                    {title} {releaseYear && <span className="text-slate-400 font-semibold font-mono text-sm sm:text-lg">({releaseYear})</span>}
                  </h1>

                  {/* Tagline */}
                  {details.tagline && (
                    <p className="text-xs text-cyan-400/90 italic font-medium mt-0.5 line-clamp-2">
                      "{details.tagline}"
                    </p>
                  )}

                  {/* Director / Creator */}
                  {(director || creators) && (
                    <div className="flex items-center justify-start gap-1.5 text-xs text-slate-400 mt-1">
                      <Clapperboard className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>{director ? `Directed by ` : `Created by `}</span>
                      <strong className="text-slate-200 font-semibold truncate">{director || creators}</strong>
                    </div>
                  )}

                  {/* Metadata Chips */}
                  <div className="mt-2 flex flex-wrap items-center justify-start gap-1.5">
                    {/* Rating */}
                    {details.vote_average > 0 ? (
                      <span className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold px-1.5 sm:px-2 py-0.5 rounded-md text-[11px]">
                        <Star className="w-3 h-3 fill-current" />
                        {details.vote_average.toFixed(1)}
                      </span>
                    ) : (
                      <span className="bg-slate-800 text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded-md text-[11px]">Unrated</span>
                    )}

                    {/* Year */}
                    {releaseYear && (
                      <span className="flex items-center gap-1 bg-slate-800/80 border border-slate-700/60 text-slate-300 font-medium px-1.5 sm:px-2 py-0.5 rounded-md text-[11px]">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {releaseYear}
                      </span>
                    )}

                    {/* Runtime */}
                    {runtime && (
                      <span className="flex items-center gap-1 bg-slate-800/80 border border-slate-700/60 text-slate-300 font-medium px-1.5 sm:px-2 py-0.5 rounded-md text-[11px]">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {runtime} min
                      </span>
                    )}

                    {/* Certification */}
                    {certification && (
                      <span className="bg-slate-800/80 border border-slate-700/60 text-slate-300 font-semibold px-1.5 sm:px-2 py-0.5 rounded-md text-[11px] tracking-wider">
                        {certification}
                      </span>
                    )}

                    {/* In Library Status */}
                    {isInLibrary && (
                      <span className="flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold px-1.5 sm:px-2 py-0.5 rounded-md text-[11px]">
                        <ShieldCheck className="w-3 h-3" />
                        In Library
                      </span>
                    )}
                  </div>

                  {/* Genres */}
                  {details.genres && details.genres.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center justify-start gap-1">
                      {details.genres.map(g => (
                        <span key={g.id} className="text-[10px] font-medium bg-slate-800/60 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700/50">
                          {g.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Quick Action Button for In-Library / Request mode */}
                  <div className="mt-2.5 flex flex-wrap items-center justify-start gap-2">
                    {isInLibrary && libraryId && (
                      <button
                        onClick={() => {
                          onClose();
                          navigate(mediaType === 'movie' ? `/movies/${libraryId}` : `/shows/${libraryId}`);
                        }}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-1.5 px-3.5 rounded-lg flex items-center gap-1.5 transition-colors text-xs cursor-pointer shadow-md shadow-cyan-950/40"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        View in Library
                      </button>
                    )}

                    {requestStatus && (
                      <div className="flex items-center gap-2">
                        <span className={`border font-semibold py-1 px-2.5 rounded-lg flex items-center gap-1.5 text-xs capitalize
                          ${requestStatus === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                            requestStatus === 'denied'   ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                                          'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}
                        >
                          {requestStatus}
                          {requestStatus === 'approved' ? <CheckCircle2 className="w-3 h-3" /> :
                           requestStatus === 'denied'   ? <XCircle className="w-3 h-3" /> :
                                                         <Clock className="w-3 h-3" />}
                        </span>
                        {requestStatus === 'pending' && onRequest && !isInLibrary && (
                          <button
                            onClick={() => onRequest(details)}
                            className="border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-medium py-1 px-2.5 rounded-lg flex items-center gap-1 text-xs transition-colors cursor-pointer"
                          >
                            <XCircle className="w-3 h-3" />
                            Cancel Request
                          </button>
                        )}
                      </div>
                    )}

                    {!isInLibrary && !requestStatus && onRequest && (
                      <button
                        onClick={() => onRequest(details)}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-1.5 px-3.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer text-xs shadow-md shadow-cyan-950/40"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Request {mediaType === 'movie' ? 'Movie' : 'Show'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ─── Overview ─── */}
              <div className="mb-3.5">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Overview</h3>
                <p className="text-slate-300 leading-relaxed text-xs sm:text-sm font-normal">
                  {details.overview || 'No overview available for this title.'}
                </p>
              </div>

              {/* ─── TV Seasons (Interactive Monitor Toggle) ─── */}
              {details.seasons && details.seasons.length > 0 && (
                <div className="mb-4 bg-slate-950/40 border border-slate-800/80 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Seasons</h3>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-800/50">
                        {monitoredSeasons.size} of {details.seasons.filter(s => s.season_number > 0).length} monitored
                      </span>
                    </div>
                    {details.seasons.filter(s => s.season_number > 0).length > 1 && !isInLibrary && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={handleSelectAllSeasons}
                          className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors hover:underline cursor-pointer"
                        >
                          All
                        </button>
                        <span className="text-slate-600">·</span>
                        <button
                          type="button"
                          onClick={handleSelectNoneSeasons}
                          className="text-slate-400 hover:text-slate-300 font-medium transition-colors hover:underline cursor-pointer"
                        >
                          None
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-0.5">
                    {details.seasons.filter(s => s.season_number > 0).map(season => {
                      const isMonitored = monitoredSeasons.has(season.season_number);
                      const isToggling = togglingSeason === season.season_number;
                      return (
                        <button
                          key={season.id || season.season_number}
                          type="button"
                          onClick={() => handleToggleSeason(season.season_number)}
                          disabled={isToggling}
                          title={isMonitored ? `Season ${season.season_number} is monitored (click to unmonitor)` : `Season ${season.season_number} is unmonitored (click to monitor)`}
                          className={clsx(
                            "w-full px-2.5 py-2 rounded-lg text-xs font-medium flex items-center justify-between gap-1.5 border transition-all cursor-pointer select-none active:scale-95 text-left",
                            isMonitored 
                              ? "bg-cyan-950/50 border-cyan-500/50 text-cyan-100 hover:bg-cyan-900/50 hover:border-cyan-400 shadow-sm shadow-cyan-950/30" 
                              : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300 opacity-60 hover:opacity-100"
                          )}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 truncate">
                            {isToggling ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400 shrink-0" />
                            ) : isMonitored ? (
                              <Bookmark className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400 shrink-0" />
                            ) : (
                              <BookmarkMinus className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            )}
                            <span className={clsx("truncate", isMonitored ? "font-semibold text-slate-100" : "text-slate-400")}>
                              {season.name}
                            </span>
                          </div>
                          <span className={clsx(
                            "text-[10px] shrink-0 font-normal",
                            isMonitored ? "text-cyan-300/80" : "text-slate-500"
                          )}>
                            ({season.episode_count} eps)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1.5">
                    <Bookmark className="w-3 h-3 text-cyan-400 fill-cyan-400 shrink-0" />
                    <span>Click seasons to toggle monitoring. Unmonitored seasons will not be searched or downloaded.</span>
                  </p>
                </div>
              )}

              {/* ─── Delete Button (if in library / onDelete provided) ─── */}
              {onDelete && (
                <div className="mb-3.5">
                  <button
                    ref={deleteBtnRef}
                    onClick={() => {
                      const rect = deleteBtnRef.current?.getBoundingClientRect();
                      if (rect) setDropdownPos({ top: rect.bottom + 4, left: rect.left });
                      setDeleteOpen(!deleteOpen);
                    }}
                    disabled={deleting}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 font-medium text-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    {deleting ? 'Deleting...' : `Delete ${mediaType === 'movie' ? 'Movie' : 'Show'}`}
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </button>
                  {deleteOpen && createPortal(
                    <div
                      className="fixed w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-xl z-50 py-1"
                      style={{ top: dropdownPos.top, left: dropdownPos.left }}
                    >
                      <button
                        onClick={async () => {
                          setDeleting(true);
                          setDeleteOpen(false);
                          try { await onDelete(false); } catch { setDeleting(false); return; }
                          setDeleting(false);
                          onClose();
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                      >
                        Delete from library
                      </button>
                      <button
                        onClick={async () => {
                          setDeleting(true);
                          setDeleteOpen(false);
                          try { await onDelete(true); } catch { setDeleting(false); return; }
                          setDeleting(false);
                          onClose();
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-rose-400 hover:bg-slate-800 hover:text-rose-300 transition-colors"
                      >
                        Delete with files
                      </button>
                    </div>,
                    document.body
                  )}
                </div>
              )}

              {/* ─── Add to Library Settings & Configuration ─── */}
              {!isInLibrary && !onRequest && (
                <div className="mt-auto pt-3 border-t border-slate-800/80">
                  <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 sm:p-3.5">
                    <div className={mediaType !== 'movie' ? "grid grid-cols-1 sm:grid-cols-2 gap-2.5" : ""}>
                      {/* Quality Profile */}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Quality Profile</label>
                        <select 
                          className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg text-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500"
                          value={selectedProfile} 
                          onChange={(e) => setSelectedProfile(e.target.value)}
                        >
                          {profiles
                            .filter(p => !p.media_type || p.media_type === 'both' || p.media_type === (mediaType === 'movie' ? 'movies' : 'shows'))
                            .map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))
                          }
                        </select>
                      </div>

                      {/* Monitor Level (for TV shows) */}
                      {mediaType !== 'movie' && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Monitor</label>
                          <select 
                            className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg text-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500"
                            value={monitorLevel}
                            onChange={(e) => handleMonitorLevelChange(e.target.value)}
                          >
                            <option value="all">All Episodes</option>
                            <option value="future">Future Episodes Only</option>
                            <option value="latest">Latest Season Only</option>
                            <option value="first">First Season Only</option>
                            <option value="none">None</option>
                            {monitorLevel === 'custom' && (
                              <option value="custom">Custom Selection ({monitoredSeasons.size} monitored)</option>
                            )}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Bottom action row: Checkbox on the left, Add button on the right */}
                    <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white transition-colors select-none text-xs">
                        <input 
                          type="checkbox" 
                          className="sr-only" 
                          checked={autoSearch} 
                          onChange={(e) => setAutoSearch(e.target.checked)} 
                        />
                        {autoSearch ? <CheckSquare className="w-4 h-4 text-cyan-400 shrink-0" /> : <Square className="w-4 h-4 text-slate-500 shrink-0" />}
                        <span>Start search for missing {mediaType === 'movie' ? 'movie' : 'show'}</span>
                      </label>

                      <button 
                        onClick={handleAddMedia}
                        disabled={isAdding}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-1.5 px-4 rounded-lg transition-all shadow-md shadow-cyan-950/40 flex items-center gap-1.5 text-xs disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        <span>{isAdding ? 'Adding...' : `Add ${mediaType === 'movie' ? 'Movie' : 'Show'}`}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </div>
      </div>

      {/* Trailer Modal */}
      {isTrailerOpen && trailerKey && (
        <TrailerModal trailerKey={trailerKey} onClose={() => setIsTrailerOpen(false)} />
      )}
    </>,
    document.body
  );
}
