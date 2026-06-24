import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Activity, HardDrive, DownloadCloud, Film, Tv, ArrowDown, ArrowUp, Search, CheckCircle2, AlertCircle, Bookmark, BookmarkMinus, LayoutGrid, List, Star, Info, X } from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [movies, setMovies] = useState([]);
  const [shows, setShows] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [stats, setStats] = useState({ dl_info_speed: 0, up_info_speed: 0 });
  
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchMovieId, setSearchMovieId] = useState(null);
  
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  const [filter, setFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [sort, setSort] = useState('added_desc');
  const [viewStyle, setViewStyle] = useState('grid');
  
  const viewMode = location.pathname.includes('shows') ? 'shows' : 'movies';

  useEffect(() => {
    fetchLibrary();
    fetchClientData();
    const interval = setInterval(fetchClientData, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchClientData = async () => {
    try {
      const [statsResult, torrentsResult] = await Promise.allSettled([
        axios.get('http://localhost:3000/api/clients/stats'),
        axios.get('http://localhost:3000/api/clients/torrents')
      ]);
      
      if (statsResult.status === 'fulfilled' && statsResult.value.data.status === 'success' && statsResult.value.data.data) {
        setStats(statsResult.value.data.data);
      } else {
        setStats({ dl_info_speed: 0, up_info_speed: 0 });
      }

      if (torrentsResult.status === 'fulfilled' && torrentsResult.value.data.status === 'success' && torrentsResult.value.data.data) {
        setDownloads(torrentsResult.value.data.data);
      } else {
        setDownloads([]);
      }
    } catch (err) {
      console.error('Failed to fetch client data', err);
    }
  };

  const fetchLibrary = async () => {
    try {
      const [moviesRes, showsRes] = await Promise.all([
        axios.get('http://localhost:3000/api/library/movies'),
        axios.get('http://localhost:3000/api/library/shows')
      ]);
      if (moviesRes.data.status === 'success') setMovies(moviesRes.data.data);
      if (showsRes.data.status === 'success') setShows(showsRes.data.data);
    } catch (err) {
      console.error('Failed to fetch library', err);
    }
  };

  const formatSpeed = (bytes) => {
    if (!bytes || bytes === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  let displayItems = viewMode === 'movies' ? [...movies] : [...shows];
  
  const uniqueYears = [...new Set(displayItems.map(item => item.year).filter(Boolean))].sort((a, b) => b - a);

  if (filter === 'monitored') {
    displayItems = displayItems.filter(item => item.status === 'monitored');
  } else if (filter === 'unmonitored') {
    displayItems = displayItems.filter(item => item.status === 'unmonitored');
  }
  
  if (yearFilter !== 'all') {
    displayItems = displayItems.filter(item => item.year == yearFilter);
  }
  
  displayItems.sort((a, b) => {
    if (sort === 'added_desc') {
      return new Date(b.added_at) - new Date(a.added_at);
    } else if (sort === 'rating_desc') {
      return (b.rating || 0) - (a.rating || 0);
    } else if (sort === 'rating_asc') {
      return (a.rating || 0) - (b.rating || 0);
    }
    return 0;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-100 flex items-center gap-3">
            {viewMode === 'movies' ? <Film className="w-8 h-8 text-cyan-400" /> : <Tv className="w-8 h-8 text-purple-400" />} {viewMode === 'movies' ? 'Movies' : 'TV Shows'}
          </h1>
          <p className="text-slate-400 mt-1">Your tracked and imported media collection.</p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="glass-panel p-6 rounded-2xl min-h-[400px]">
        <div className={`flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b ${viewMode === 'movies' ? 'border-cyan-500/30' : 'border-purple-500/30'} pb-5 bg-slate-900/50 -mx-6 -mt-6 p-6 rounded-t-2xl`}>
          <h2 className="text-xl font-bold text-slate-200">Your {viewMode === 'movies' ? 'Movies' : 'TV Shows'}</h2>
          
          {/* Control Bar */}
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <select 
              value={yearFilter} 
              onChange={e => setYearFilter(e.target.value)}
              className="bg-slate-900 border border-white/10 text-slate-200 text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 p-2"
            >
              <option value="all">All Years</option>
              {uniqueYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <select 
              value={filter} 
              onChange={e => setFilter(e.target.value)}
              className="bg-slate-900 border border-white/10 text-slate-200 text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 p-2"
            >
              <option value="all">All Statuses</option>
              <option value="monitored">Monitored Only</option>
              <option value="unmonitored">Unmonitored Only</option>
            </select>
            
            <select 
              value={sort} 
              onChange={e => setSort(e.target.value)}
              className="bg-slate-900 border border-white/10 text-slate-200 text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 p-2"
            >
              <option value="added_desc">Recently Added</option>
              <option value="rating_desc">Highest Rating</option>
              <option value="rating_asc">Lowest Rating</option>
            </select>
            
            <div className="flex bg-slate-900 rounded-lg p-1 border border-white/10 shrink-0">
              <button 
                onClick={() => setViewStyle('grid')}
                className={`p-1.5 rounded-md transition-colors ${viewStyle === 'grid' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewStyle('list')}
                className={`p-1.5 rounded-md transition-colors ${viewStyle === 'list' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        
        {displayItems.length > 0 ? (
          viewStyle === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {displayItems.map(item => (
                <div 
                  key={item.id} 
                  className="glass-panel rounded-xl overflow-hidden group hover:scale-[1.02] transition-transform duration-300 relative flex flex-col"
                >
                  <div className="absolute top-2 left-2 z-20">
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const endpoint = viewMode === 'movies' ? `/api/library/movies/${item.id}/toggle-monitor` : `/api/library/shows/${item.id}/toggle-monitor`;
                          const res = await axios.post(`http://localhost:3000${endpoint}`);
                          if (res.data.status === 'success') {
                            fetchLibrary();
                            customAlert(`Status changed to ${res.data.data.status}`);
                          }
                        } catch (err) {
                          customAlert('Failed to toggle monitor status', 'error');
                        }
                      }}
                      className="p-1.5 rounded-full bg-slate-900/80 hover:bg-slate-800 transition-colors shadow-lg group/btn"
                      title={item.status === 'unmonitored' ? 'Monitor' : 'Unmonitor'}
                    >
                      {item.status === 'unmonitored' ? (
                        <Bookmark className="w-5 h-5 text-rose-400 group-hover/btn:text-emerald-400" />
                      ) : (
                        <Bookmark className="w-5 h-5 text-emerald-500 fill-emerald-500 group-hover/btn:text-rose-400 group-hover/btn:fill-transparent" />
                      )}
                    </button>
                  </div>

                  <div className="absolute top-2 right-2 z-20 flex gap-2">
                    {item.status === 'downloaded' && (
                      <div className="bg-slate-900/80 rounded-full shadow-lg" title="Available">
                        <CheckCircle2 className="w-6 h-6 text-emerald-400 fill-emerald-400/20" />
                      </div>
                    )}
                    {item.status === 'monitored' && (
                      <div className="bg-slate-900/80 rounded-full shadow-lg p-0.5" title="Missing">
                        <AlertCircle className="w-5 h-5 text-amber-500" />
                      </div>
                    )}
                    {item.status === 'downloading' && (
                      <div className="bg-slate-900/80 rounded-full shadow-lg p-0.5" title="Downloading">
                        <Activity className="w-5 h-5 text-blue-400 animate-pulse" />
                      </div>
                    )}
                  </div>

                  <div className="aspect-[2/3] relative bg-slate-800">
                    <img 
                      src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} 
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                    
                    <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-3 p-4 z-10">
                      <div className="flex flex-col gap-2 w-full">
                        {item.status === 'monitored' && (
                          <div className="flex gap-2 justify-center">
                            <button 
                              onClick={async (e) => { 
                                e.stopPropagation(); 
                                customAlert(`Starting auto-search for ${item.title}...`);
                                try {
                                  const endpoint = viewMode === 'movies' ? `/api/library/movies/${item.id}/auto-search` : `/api/library/shows/${item.id}/auto-search`;
                                  const res = await axios.post(`http://localhost:3000${endpoint}`);
                                  if (res.data.status === 'success') {
                                    customAlert(res.data.message || `Found & downloading: ${res.data.data?.title || 'torrents'}`);
                                    fetchLibrary();
                                  }
                                } catch (err) {
                                  console.error(err);
                                  customAlert('Auto-search failed to find any results', 'error');
                                }
                              }}
                              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 w-12 h-12 rounded-full font-bold flex items-center justify-center transition-transform hover:scale-110 shadow-lg"
                              title="Auto Search"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setSearchMovieId(item.id); setSearchModalOpen(true); }}
                              className="bg-purple-500 hover:bg-purple-400 text-slate-950 w-12 h-12 rounded-full font-bold flex items-center justify-center transition-transform hover:scale-110 shadow-lg"
                              title="Manual Search"
                            >
                              <Search className="w-5 h-5" />
                            </button>
                          </div>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (viewMode === 'shows') navigate(`/shows/${item.id}`);
                            else navigate(`/movies/${item.id}`);
                          }}
                          className="bg-white/10 hover:bg-white/20 text-white w-full py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors mt-2"
                        >
                          <Info className="w-4 h-4" /> Details
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 relative z-20 bg-slate-900/90 border-t border-white/5">
                    <h3 className="font-bold text-slate-200 truncate" title={item.title}>{item.title}</h3>
                    <div className="flex justify-between items-center mt-1">
                      <p className="text-sm text-slate-400 font-medium">{item.year}</p>
                      {item.rating > 0 && (
                        <div className="flex items-center gap-1.5 bg-slate-950/50 px-2.5 py-0.5 rounded-lg border border-white/5 shadow-inner">
                          <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                          <span className="text-sm font-bold text-slate-200">{Number(item.rating).toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : viewStyle === 'list' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-slate-400 text-sm">
                  <th className="py-3 px-4 font-medium">Title</th>
                  <th className="py-3 px-4 font-medium w-24">Year</th>
                  <th className="py-3 px-4 font-medium w-32">Rating</th>
                  <th className="py-3 px-4 font-medium w-32">Status</th>
                  <th className="py-3 px-4 font-medium w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {displayItems.map(item => (
                  <tr 
                    key={item.id}
                    onClick={() => {
                      if (viewMode === 'shows') {
                        navigate(`/shows/${item.id}`);
                      } else {
                        navigate(`/movies/${item.id}`);
                      }
                    }}
                    className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
                  >
                    <td className="py-2.5 px-4 text-slate-200 font-medium group-hover:text-cyan-400 transition-colors">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const endpoint = viewMode === 'movies' ? `/api/library/movies/${item.id}/toggle-monitor` : `/api/library/shows/${item.id}/toggle-monitor`;
                              const res = await axios.post(`http://localhost:3000${endpoint}`);
                              if (res.data.status === 'success') {
                                fetchLibrary();
                                customAlert(`Status changed to ${res.data.data.status}`);
                              }
                            } catch (err) {
                              customAlert('Failed to toggle monitor status', 'error');
                            }
                          }}
                          className="hover:bg-slate-800 transition-colors p-1 rounded-md group/btn"
                          title={item.status === 'unmonitored' ? 'Monitor' : 'Unmonitor'}
                        >
                          {item.status === 'unmonitored' ? (
                            <Bookmark className="w-4 h-4 text-rose-400 group-hover/btn:text-emerald-400" />
                          ) : (
                            <Bookmark className="w-4 h-4 text-emerald-500 fill-emerald-500 group-hover/btn:text-rose-400 group-hover/btn:fill-transparent" />
                          )}
                        </button>
                        <span>{item.title}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 text-sm">
                      {item.year}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 text-sm font-medium">
                      {item.rating > 0 ? (
                        <div className="flex items-center gap-1.5 w-fit bg-slate-950/50 px-2.5 py-0.5 rounded-lg border border-white/5 shadow-inner">
                          <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                          <span className="text-sm font-bold text-slate-200">{Number(item.rating).toFixed(1)}</span>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        item.status === 'downloaded' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 
                        item.status === 'downloading' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 
                        item.status === 'monitored' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 
                        'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {item.status === 'monitored' && (
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={async (e) => { 
                              e.stopPropagation(); 
                              customAlert(`Starting auto-search for ${item.title}...`);
                              try {
                                const endpoint = viewMode === 'movies' ? `/api/library/movies/${item.id}/auto-search` : `/api/library/shows/${item.id}/auto-search`;
                                const res = await axios.post(`http://localhost:3000${endpoint}`);
                                if (res.data.status === 'success') {
                                  customAlert(res.data.message || `Found & downloading: ${res.data.data?.title || 'torrents'}`);
                                  fetchLibrary();
                                }
                              } catch (err) {
                                console.error(err);
                                customAlert('Auto-search failed to find any results', 'error');
                              }
                            }}
                            className="text-slate-400 hover:text-emerald-400 transition-colors p-1"
                            title="Auto Search & Download"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>
                          </button>
                          <button 
                            onClick={async (e) => { 
                              e.stopPropagation(); 
                              setSearchMovieId(item.id); 
                              setSearchModalOpen(true); 
                              setIsSearching(true);
                              setHasSearched(false);
                              setSearchResults([]);
                              try {
                                const endpoint = viewMode === 'movies' ? `/api/library/movies/${item.id}/search` : `/api/library/shows/${item.id}/search`;
                                const res = await axios.get(`http://localhost:3000${endpoint}`);
                                setSearchResults(res.data.data);
                                setHasSearched(true);
                              } catch (e) {
                                customAlert('Search failed', 'error');
                                setHasSearched(true);
                              }
                              setIsSearching(false);
                            }}
                            className="text-slate-400 hover:text-purple-400 transition-colors p-1"
                            title="Manual Search"
                          >
                            <Search className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null
        ) : (
          <div className="flex flex-col items-center justify-center h-[300px] text-slate-500 border-2 border-dashed border-slate-700/50 rounded-xl">
            {viewMode === 'movies' ? <Film className="w-12 h-12 mb-4 opacity-50" /> : <Tv className="w-12 h-12 mb-4 opacity-50" />}
            <p>No {viewMode === 'movies' ? 'movies' : 'TV shows'} in your library yet.</p>
            <p className="text-sm mt-1">Add them from the Discover page or scan your NAS in Settings.</p>
          </div>
        )}
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
            <div className="flex-1 overflow-y-auto min-h-[200px]">
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
                          const endpoint = viewMode === 'movies' ? `/api/library/movies/${searchMovieId}/download` : `/api/library/shows/${searchMovieId}/download`;
                          await axios.post(`http://localhost:3000${endpoint}`, { torrentUrl: res.link });
                          customAlert('Sent to download client!');
                          setSearchModalOpen(false);
                          fetchLibrary();
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
    </div>
  );
}
