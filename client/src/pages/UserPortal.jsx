import { useState, useEffect } from 'react';
import { Search, Loader2, Plus, Clock, CheckCircle2, XCircle, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import toast from 'react-hot-toast';

export default function UserPortal() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchRequests = async () => {
    try {
      const res = await api.get('/requests');
      setRequests(res.data.data);
    } catch (err) {
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await api.get(`/tmdb/search/multi?query=${encodeURIComponent(query)}`);
      // Filter out people, only keep movies/tv
      setResults(res.data.filter(item => item.media_type === 'movie' || item.media_type === 'tv'));
    } catch (err) {
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleRequest = async (item) => {
    try {
      await api.post('/requests', {
        tmdb_id: item.id,
        type: item.media_type,
        title: item.title || item.name
      });
      toast.success('Requested successfully!');
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to request');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('atlas_token');
    localStorage.removeItem('atlas_user');
    navigate('/login');
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved': return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case 'denied': return <XCircle className="w-5 h-5 text-rose-400" />;
      default: return <Clock className="w-5 h-5 text-amber-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200">
      <header className="border-b border-white/10 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center font-bold text-white shadow-lg">
              A
            </div>
            <span className="font-bold text-xl tracking-tight">Atlas Requests</span>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors text-slate-400 hover:text-white"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-12">
        <section className="space-y-6">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-white">What do you want to watch?</h1>
            <p className="text-slate-400">Search for movies and TV shows to request them to the server.</p>
          </div>

          <form onSubmit={handleSearch} className="max-w-2xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for movies or tv shows..."
              className="w-full pl-12 pr-4 py-4 bg-slate-900 border border-slate-700 rounded-2xl text-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 shadow-xl"
            />
            <button 
              type="submit" 
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded-xl transition-colors disabled:opacity-50"
              disabled={searching}
            >
              {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
            </button>
          </form>

          {results.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-8">
              {results.map(item => {
                const isRequested = requests.some(r => r.tmdb_id === item.id);
                return (
                  <div key={item.id} className="glass-panel rounded-xl overflow-hidden group border border-white/5 relative">
                    <div className="aspect-[2/3] relative bg-slate-800">
                      {item.poster_path ? (
                        <img 
                          src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} 
                          alt={item.title || item.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">No Image</div>
                      )}
                      
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-4">
                        <button
                          onClick={() => handleRequest(item)}
                          disabled={isRequested}
                          className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-900 py-2 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isRequested ? 'Requested' : <><Plus className="w-4 h-4" /> Request</>}
                        </button>
                      </div>
                    </div>
                    <div className="p-3">
                      <h3 className="font-medium text-white truncate" title={item.title || item.name}>
                        {item.title || item.name}
                      </h3>
                      <div className="text-xs text-slate-400 mt-1 uppercase tracking-wider">
                        {item.media_type} • {item.release_date ? item.release_date.split('-')[0] : item.first_air_date ? item.first_air_date.split('-')[0] : 'N/A'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="glass-panel p-6 rounded-3xl border border-white/10">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-400" /> My Requests
          </h2>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-cyan-500" /></div>
          ) : requests.length > 0 ? (
            <div className="space-y-3">
              {requests.map(req => (
                <div key={req.id} className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-white/5 hover:bg-slate-800 transition-colors">
                  <div>
                    <h3 className="font-medium text-white">{req.title}</h3>
                    <div className="text-xs text-slate-400 uppercase tracking-wider mt-1">{req.type}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium capitalize text-slate-300">{req.status}</span>
                    {getStatusIcon(req.status)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              You haven't requested anything yet.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
