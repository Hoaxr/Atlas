import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatSize } from '../lib/format';
import { useSettings } from '../lib/useSettings';
import { useTMDBDetails } from '../lib/useTMDBDetails';
import { ArrowLeft, HardDrive, Tv, PlayCircle, ChevronDown, ChevronRight, Bookmark, BookmarkMinus, Search, Star, X, RefreshCw, Loader2 } from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';
import TrailerModal from '../components/TrailerModal';

export default function ShowDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [show, setShow] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const { providerLangs, profiles } = useSettings();
  const [downloadingSubs, setDownloadingSubs] = useState({});
  const [openLangMenu, setOpenLangMenu] = useState(null);
  const [updatingQuality, setUpdatingQuality] = useState(false);

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
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  const [collapsedSeasons, setCollapsedSeasons] = useState({});
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);

  // Remap Modal State
  const [remapModalOpen, setRemapModalOpen] = useState(false);
  const [remapQuery, setRemapQuery] = useState('');
  const [remapSearching, setRemapSearching] = useState(false);
  const [remapResults, setRemapResults] = useState([]);
  const [remapHasSearched, setRemapHasSearched] = useState(false);
  const [remapping, setRemapping] = useState(false);

  const { tmdbDetails, trailerKey, clear: clearTMDB } = useTMDBDetails('show', show?.tmdb_id);

  useEffect(() => {
    fetchShowData();
  }, [id]);

  const fetchShowData = useCallback(async () => {
    setLoading(true);
    try {
      const [showRes, epRes] = await Promise.all([
        api.get(`/library/shows/${id}`),
        api.get(`/library/shows/${id}/episodes`)
      ]);
      
      if (showRes.data.status === 'success') {
        setShow(showRes.data.data);
      }
      if (epRes.data.status === 'success') {
        setEpisodes(epRes.data.data);
      }
    } catch (e) {
      console.error(e);
      customAlert('Failed to load show details', 'error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const refreshAll = useCallback(() => {
    clearTMDB();
    fetchShowData();
  }, [clearTMDB, fetchShowData]);

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
    setCollapsedSeasons(prev => ({
      ...prev,
      [season]: !prev[season]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (!show) {
    return (
      <div className="text-center py-20 text-slate-400">
        <Tv className="w-16 h-16 mx-auto mb-4 opacity-50" />
        <h2 className="text-2xl font-bold text-white mb-2">Show Not Found</h2>
        <button onClick={() => navigate('/shows')} className="text-purple-400 hover:text-purple-300">Return to Shows</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <button 
        onClick={() => navigate('/shows')} 
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Shows
      </button>

      {/* Hero / Banner Section */}
      <div className="glass-panel rounded-3xl overflow-hidden flex flex-col md:flex-row relative">
        <div className="md:w-1/3 lg:w-1/4 shrink-0 relative group">
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
                  const res = await api.post(`/library/shows/${show.id}/toggle-monitor`);
                  if (res.data.status === 'success') {
                    fetchShowData(); // refresh
                  }
                } catch (err) {
                  customAlert('Failed to toggle monitor status', 'error');
                }
              }}
              className="hover:scale-110 transition-transform cursor-pointer focus:outline-none"
              title={show.monitored ? "Monitored" : "Unmonitored"}
            >
              {show.monitored ? (
                <Bookmark className="w-8 h-8 md:w-10 md:h-10 text-purple-400 fill-purple-400" />
              ) : (
                <BookmarkMinus className="w-8 h-8 md:w-10 md:h-10 text-slate-500" />
              )}
            </button>
            <span>
              {show.title} <span className="text-slate-400 font-light">({show.year})</span>
            </span>
            <button
              onClick={refreshAll}
              className="mr-2 p-2 bg-slate-800/50 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-purple-400"
              title="Refresh show information from TMDB"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </h1>
          
          <div className="flex flex-wrap items-center gap-3 mb-6 mt-2">
            {show.rating > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-950/50 px-2.5 py-1 rounded-lg border border-white/5 shadow-inner">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{Number(show.rating).toFixed(1)}</span>
              </div>
            )}
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              show.status === 'downloaded' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 
              show.status === 'downloading' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 
              show.status === 'monitored' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 
              'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              {show.status}
            </span>
            {show.folder_size > 0 && (
              <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                <HardDrive className="w-3 h-3" /> {formatSize(show.folder_size)}
              </span>
            )}
          </div>
          
          <p className="text-slate-300 text-lg leading-relaxed max-w-3xl mb-6">
            {show.overview || 'No overview available for this show.'}
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-6 w-full mt-4 text-sm bg-slate-900/50 p-5 rounded-xl border border-white/5">
            <div className="col-span-2">
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Path</p>
              <p className="font-mono text-xs text-slate-300 truncate" title={show.folder_path}>{show.folder_path || 'Not created yet'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Status</p>
              <p className="font-medium text-slate-300 capitalize">{show.status}</p>
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
                  value={show.quality_profile_id || ''}
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
              <p className="font-medium text-slate-300">{formatSize(show.folder_size)}</p>
            </div>
            
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Watched</p>
              <p className={`font-bold ${show.watched ? 'text-emerald-400' : 'text-slate-500'}`}>
                {show.watched ? '✓ Yes' : 'No'}
              </p>
            </div>
            {tmdbDetails && tmdbDetails.original_language && (
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Language</p>
                <p className="font-medium text-slate-300 uppercase">{tmdbDetails.original_language}</p>
              </div>
            )}
            {tmdbDetails && tmdbDetails.networks?.length > 0 && (
              <div className="col-span-2 md:col-span-1">
                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Network</p>
                <p className="font-medium text-slate-300 truncate" title={tmdbDetails.networks[0].name}>{tmdbDetails.networks[0].name}</p>
              </div>
            )}
            {tmdbDetails && tmdbDetails.genres?.length > 0 && (
              <div className="col-span-2 md:col-span-4 lg:col-span-2">
                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Genres</p>
                <p className="font-medium text-slate-300 truncate">{tmdbDetails.genres.map(g => g.name).join(', ')}</p>
              </div>
            )}

            {/* TMDB Link / Remap */}
            <div className="col-span-full border-t border-white/5 pt-4 mt-2 flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">TMDB ID</p>
                <p className="font-mono text-sm text-slate-300">
                  {show.tmdb_id}
                  <a
                    href={`https://www.themoviedb.org/tv/${show.tmdb_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-purple-400 hover:text-purple-300 underline text-xs"
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
              <div key={season} className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
                <div 
                  onClick={() => toggleSeason(season)}
                  className="w-full flex justify-between items-center p-5 bg-slate-800/50 hover:bg-slate-800 transition-colors border-b border-white/5 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await api.post(`/library/shows/${show.id}/seasons/${season}/toggle-monitor`);
                          fetchShowData();
                        } catch (err) {
                          customAlert('Failed to toggle season monitor', 'error');
                        }
                      }}
                      className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
                      title="Toggle Monitor for entire Season"
                    >
                      {seasons[season].some(ep => ep.monitored) ? (
                        <Bookmark className="w-5 h-5 text-purple-400 fill-purple-400" />
                      ) : (
                        <BookmarkMinus className="w-5 h-5 text-slate-500" />
                      )}
                    </button>
                    <h3 className="text-xl font-bold text-purple-400">Season {season}</h3>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-slate-400 bg-slate-900 px-3 py-1 rounded-lg">
                      {seasons[season].length} Episodes
                    </span>
                    {isCollapsed ? <ChevronRight className="w-6 h-6 text-slate-400" /> : <ChevronDown className="w-6 h-6 text-slate-400" />}
                  </div>
                </div>
                
                {!isCollapsed && (
                  <div className="p-0">
                    <table className="w-full text-left border-collapse">
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
                        {seasons[season].map(ep => (
                          <tr key={ep.id} className="hover:bg-slate-800/50 transition-colors group">
                            <td className="px-6 py-4 font-mono text-slate-500">{ep.episode_number}</td>
                            <td className="px-6 py-4">
                              <p className="font-bold text-slate-700 dark:text-slate-200 group-hover:text-purple-400 transition-colors">{ep.title}</p>
                              {ep.overview && <p className="text-xs text-slate-500 line-clamp-1 mt-1 max-w-xl">{ep.overview}</p>}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button 
                                onClick={async () => {
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
                                className={`text-[10px] uppercase font-bold px-3 py-1 rounded-full mx-auto inline-block cursor-pointer transition-colors ${
                                  ep.status === 'downloading' ? 'hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 bg-blue-500/20 text-blue-400 border border-blue-500/30' : 
                                  ep.status === 'downloaded' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-slate-700' : 
                                  !ep.monitored ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-emerald-500/20 hover:text-emerald-400 hover:border-emerald-500/30' : 
                                  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/30'
                                }`}
                                title={ep.status === 'downloading' ? "Click to reset if stuck" : "Click to toggle monitor status"}
                              >
                                {ep.status === 'downloading' ? 'Downloading' : ep.status === 'downloaded' ? 'Downloaded' : ep.monitored ? 'Monitored' : 'Unmonitored'}
                              </button>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {!ep.file_path ? (
                                  <span className="text-[10px] text-slate-600">—</span>
                                ) : (
                                  <>
                                    {/* Clickable badges for all provider languages */}
                                    {(() => {
                                      const langCode = { en: 'EN', nl: 'NL', fr: 'FR', de: 'DE', es: 'ES', it: 'IT', pt: 'PT' };
                                      const langName = { en: 'English', nl: 'Dutch', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese' };
                                      const existingCodes = ep.subtitles?.map(s => s.lang) || [];
                                      const hasExistingSub = ep.subtitles?.length > 0;
                                      const subKey = `${ep.id}`;
                                      return providerLangs.map(code => {
                                        const exists = existingCodes.includes(code);
                                        return (
                                          <span key={code} className="relative">
                                            <span
                                              data-lang-badge
                                              role="button"
                                              tabIndex={0}
                                              onClick={() => setOpenLangMenu(openLangMenu === `${subKey}-${code}` ? null : `${subKey}-${code}`)}
                                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenLangMenu(openLangMenu === `${subKey}-${code}` ? null : `${subKey}-${code}`); } }}
                                              className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded transition-colors cursor-pointer ${
                                                exists
                                                  ? 'bg-slate-800 text-slate-300 border border-white/5 hover:bg-slate-700 hover:text-white'
                                                  : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 hover:text-amber-300 border border-amber-500/30 hover:border-amber-400/50'
                                              }`}
                                            >
                                              {langCode[code] || code}
                                            </span>
                                            {openLangMenu === `${subKey}-${code}` && (
                                              <div data-lang-menu className="absolute left-0 top-full mt-1 bg-slate-800 border border-white/10 rounded-xl py-1 shadow-2xl z-50 min-w-[150px]">
                                                {!exists && (
                                                  <button
                                                    onClick={async () => {
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
                                                    disabled={downloadingSubs[`${subKey}-${code}`]}
                                                    className="block w-full text-left text-xs font-medium px-3 py-2 text-slate-300 hover:bg-slate-700/50 transition-colors disabled:opacity-50 flex items-center gap-2"
                                                  >
                                                    {downloadingSubs[`${subKey}-${code}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                                                    Auto Search
                                                  </button>
                                                )}
                                                <button
                                                  onClick={() => {
                                                    setOpenLangMenu(null);
                                                    setSubSearchModal({ open: true, code, label: langName[code] || code, episodeId: ep.id });
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
                                                        const res = await api.post(`/library/episodes/${ep.id}/translate-subs`, { targetLang: langName[code] });
                                                        if (res.data.status === 'success') {
                                                          customAlert(res.data.message);
                                                          fetchShowData();
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
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button 
                                    onClick={async () => {
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
                                    onClick={async () => {
                                      setSelectedEpisode(ep);
                                      setSearchModalOpen(true);
                                      setIsSearching(true);
                                      setHasSearched(false);
                                      setSearchResults([]);
                                      try {
                                        const res = await api.get(`/library/episodes/${ep.id}/search`);
                                        setSearchResults(res.data.data);
                                        setHasSearched(true);
                                      } catch (e) {
                                        customAlert('Search failed', 'error');
                                        setHasSearched(true);
                                      }
                                      setIsSearching(false);
                                    }}
                                    className="bg-purple-500/20 hover:bg-purple-500/40 text-purple-400 border border-purple-500/30 text-xs font-bold p-2 rounded-lg inline-flex items-center justify-center transition-colors tooltip"
                                    title="Manual Search"
                                  >
                                    <Search className="w-4 h-4" />
                                  </button>
                                </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
            });
          })()}
        </div>
      </div>

      {/* Episode Search Modal (Still needed for the search overlay!) */}
      {searchModalOpen && selectedEpisode && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 p-6 rounded-2xl w-full max-w-3xl border border-white/10 max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-2 shrink-0">
              <h2 className="text-2xl font-bold text-white">
                Search S{selectedEpisode.season_number}E{selectedEpisode.episode_number}: {selectedEpisode.title}
              </h2>
              <button onClick={() => { setSearchModalOpen(false); setSearchResults([]); }} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto py-4">
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
                            await api.post(`/library/episodes/${selectedEpisode.id}/download`, { torrentUrl: res.link });
                            customAlert('Sent to download client!');
                            setSearchModalOpen(false);
                            setSearchResults([]);
                            fetchShowData(); // Refresh UI
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
                <RefreshCw className="w-6 h-6 text-amber-400" /> Remap Show
              </h2>
              <button onClick={() => setRemapModalOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              Search TMDB for the correct show to link <strong className="text-slate-700 dark:text-slate-200">{show.title}</strong> to.
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
                placeholder="Search for the correct show..."
                className="flex-1 bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 text-sm"
              />
              <button
                onClick={handleRemapSearch}
                disabled={!remapQuery.trim() || remapSearching}
                className="bg-purple-500 hover:bg-purple-400 text-white font-bold px-5 py-2 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 text-sm"
              >
                {remapSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </button>
            </div>

            <div className="overflow-y-auto flex-1 min-h-0 space-y-2">
              {remapSearching ? (
                <div className="flex flex-col items-center justify-center py-10 text-purple-400">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mb-4"></div>
                  <p className="font-bold">Searching TMDB...</p>
                </div>
              ) : !remapResults.length && remapHasSearched ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <p>No shows found. Try a different search term.</p>
                </div>
              ) : (
                remapResults.map((result, i) => {
                  const resultYear = result.first_air_date ? result.first_air_date.split('-')[0] : '—';
                  const isCurrent = result.id === show.tmdb_id;
                  return (
                    <div
                      key={i}
                      className={`bg-slate-800 p-3 rounded-xl flex gap-3 items-center border transition-colors ${
                        isCurrent ? 'border-purple-500/40 bg-purple-500/5' : 'border-white/5 hover:bg-slate-750'
                      }`}
                    >
                      <div className="w-12 h-[66px] rounded-lg shrink-0 bg-slate-700 flex items-center justify-center overflow-hidden">
                        {result.poster_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${result.poster_path}`}
                            alt={result.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-500 font-medium text-center leading-tight px-1">No<br/>Image</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-200 truncate">
                          {result.name} <span className="text-slate-400 font-light">({resultYear})</span>
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
                            <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">Current</span>
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
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" onClick={() => setSubSearchModal({ open: false, code: '', label: '', episodeId: null })}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-slate-900 border border-white/10 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                  <Search className="w-5 h-5 text-cyan-400" />
                  Search Subtitles — {subSearchModal.label}
                </h3>
                {(() => {
                  const ep = episodes.find(e => e.id === subSearchModal.episodeId);
                  if (!ep?.file_path) return null;
                  const parts = ep.file_path.split('/');
                  const sceneName = parts[parts.length - 1].replace(/\.[^.]+$/, '');
                  return <>
                    <p className="text-xs text-slate-500 mt-2 font-mono truncate max-w-[550px]" title={ep.file_path}>{ep.file_path}</p>
                    <p className="text-[10px] text-slate-600 mt-1 font-mono truncate max-w-[550px]">{sceneName}</p>
                  </>;
                })()}
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
                                  const subKey = `${subSearchModal.episodeId}`;
                                  setDownloadingSubs(prev => ({ ...prev, [`${subKey}-${subSearchModal.code}`]: true }));
                                  try {
                                    if (item.fileId) {
                                      const res = await api.post(`/library/episodes/${subSearchModal.episodeId}/download-subs`, {
                                        langCode: subSearchModal.code, fileId: item.fileId
                                      });
                                      customAlert(res.data.message);
                                    } else {
                                      const res = await api.post(`/library/episodes/${subSearchModal.episodeId}/download-subs`, {
                                        langCode: subSearchModal.code, fileId: item.fileId || item.subId || item.subdlId
                                      });
                                      customAlert(res.data.message);
                                    }
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
  );
}
