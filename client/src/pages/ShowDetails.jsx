import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, HardDrive, Tv, PlayCircle, ChevronDown, ChevronRight, Bookmark, BookmarkMinus, Search, Download, Star, ArrowUp, X } from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';
import TrailerModal from '../components/TrailerModal';

export default function ShowDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [show, setShow] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  const [collapsedSeasons, setCollapsedSeasons] = useState({});
  const [trailerKey, setTrailerKey] = useState(null);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);
  const [tmdbDetails, setTmdbDetails] = useState(null);

  useEffect(() => {
    fetchShowData();
  }, [id]);

  useEffect(() => {
    if (show && show.tmdb_id) {
      axios.get(`http://localhost:3000/api/tmdb/show/${show.tmdb_id}?_t=${Date.now()}`).then(res => {
        setTmdbDetails(res.data.data);
        if (res.data?.data?.videos?.results) {
          const trailer = res.data.data.videos.results.find(v => v.site === 'YouTube' && v.type === 'Trailer');
          if (trailer) setTrailerKey(trailer.key);
        }
      }).catch(err => console.error(err));
    }
  }, [show]);

  const fetchShowData = async () => {
    setLoading(true);
    try {
      const [showRes, epRes] = await Promise.all([
        axios.get(`http://localhost:3000/api/library/shows/${id}`),
        axios.get(`http://localhost:3000/api/library/shows/${id}/episodes`)
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
  };

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
                  const res = await axios.post(`http://localhost:3000/api/library/shows/${show.id}/toggle-monitor`);
                  if (res.data.status === 'success') {
                    fetchShowData(); // refresh
                  }
                } catch (err) {
                  customAlert('Failed to toggle monitor status', 'error');
                }
              }}
              className="hover:scale-110 transition-transform cursor-pointer focus:outline-none"
              title={show.status === 'unmonitored' ? "Unmonitored" : "Monitored"}
            >
              {show.status !== 'unmonitored' ? (
                <Bookmark className="w-8 h-8 md:w-10 md:h-10 text-purple-400 fill-purple-400" />
              ) : (
                <BookmarkMinus className="w-8 h-8 md:w-10 md:h-10 text-slate-500" />
              )}
            </button>
            <span>
              {show.title} <span className="text-slate-400 font-light">({show.year})</span>
            </span>
          </h1>
          
          <div className="flex flex-wrap items-center gap-3 mb-6 mt-2">
            {show.rating > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-950/50 px-2.5 py-1 rounded-lg border border-white/5 shadow-inner">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                <span className="text-sm font-bold text-slate-200">{Number(show.rating).toFixed(1)}</span>
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
              <p className="font-medium text-slate-300">{show.quality_profile_name || 'Any'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Size</p>
              <p className="font-medium text-slate-300">{formatSize(show.folder_size)}</p>
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
                          await axios.post(`http://localhost:3000/api/library/shows/${show.id}/seasons/${season}/toggle-monitor`);
                          fetchShowData();
                        } catch (err) {
                          customAlert('Failed to toggle season monitor', 'error');
                        }
                      }}
                      className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
                      title="Toggle Monitor for entire Season"
                    >
                      {seasons[season].some(ep => ep.status !== 'unmonitored') ? (
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
                          <th className="px-6 py-4 font-medium w-40 text-center">Status</th>
                          <th className="px-6 py-4 font-medium w-32 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {seasons[season].map(ep => (
                          <tr key={ep.id} className="hover:bg-slate-800/50 transition-colors group">
                            <td className="px-6 py-4 font-mono text-slate-500">{ep.episode_number}</td>
                            <td className="px-6 py-4">
                              <p className="font-bold text-slate-200 group-hover:text-purple-400 transition-colors">{ep.title}</p>
                              {ep.overview && <p className="text-xs text-slate-500 line-clamp-1 mt-1 max-w-xl">{ep.overview}</p>}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button 
                                onClick={async () => {
                                  if (ep.status === 'downloading') {
                                    if (await customConfirm("Reset status to monitored?")) {
                                      try {
                                        await axios.post(`http://localhost:3000/api/library/episodes/${ep.id}/reset`);
                                        fetchShowData();
                                        customAlert('Status reset to monitored');
                                      } catch (e) {
                                        console.error('Failed to reset status', e);
                                        customAlert('Failed to reset status', 'error');
                                      }
                                    }
                                  } else {
                                    try {
                                      await axios.post(`http://localhost:3000/api/library/episodes/${ep.id}/toggle-monitor`);
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
                                  ep.status === 'unmonitored' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-emerald-500/20 hover:text-emerald-400 hover:border-emerald-500/30' : 
                                  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/30'
                                }`}
                                title={ep.status === 'downloading' ? "Click to reset if stuck" : "Click to toggle monitor status"}
                              >
                                {ep.status}
                              </button>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button 
                                    onClick={async () => {
                                      customAlert(`Starting auto-search for S${ep.season_number}E${ep.episode_number}...`);
                                      try {
                                        const res = await axios.post(`http://localhost:3000/api/library/episodes/${ep.id}/auto-search`);
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
                                        const res = await axios.get(`http://localhost:3000/api/library/episodes/${ep.id}/search`);
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
                            await axios.post(`http://localhost:3000/api/library/episodes/${selectedEpisode.id}/download`, { torrentUrl: res.link });
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
      
      {isTrailerOpen && trailerKey && (
        <TrailerModal trailerKey={trailerKey} onClose={() => setIsTrailerOpen(false)} />
      )}
    </div>
  );
}
