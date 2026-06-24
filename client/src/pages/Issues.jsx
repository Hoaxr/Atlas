import { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertCircle, ArrowRight, Activity, Settings, Zap, Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Issues() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchIssues();
  }, []);

  const fetchIssues = async () => {
    try {
      const res = await axios.get('http://localhost:3000/api/settings/issues');
      if (res.data.status === 'success') {
        setIssues(res.data.data);
      }
    } catch (e) {
      console.error('Failed to fetch issues', e);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (id) => {
    if (id.includes('tmdb')) return <Database className="w-8 h-8 text-rose-400" />;
    if (id.includes('indexer')) return <Zap className="w-8 h-8 text-amber-400" />;
    return <Activity className="w-8 h-8 text-rose-400" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-100 flex items-center gap-3">
            <AlertCircle className={`w-8 h-8 ${issues.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
            System Issues
          </h1>
          <p className="text-slate-400 mt-1">
            {issues.length > 0 
              ? `You have ${issues.length} active issue${issues.length > 1 ? 's' : ''} that need attention.`
              : 'All systems are running smoothly!'}
          </p>
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="glass-panel p-10 rounded-3xl text-center flex flex-col items-center justify-center">
          <Activity className="w-20 h-20 text-emerald-500/50 mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2">Everything is Healthy</h2>
          <p className="text-slate-400 max-w-md mx-auto">
            Your MediaManager is fully configured. API keys are present, indexers are active, and download clients are connected.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {issues.map(issue => (
            <div key={issue.id} className="glass-panel p-6 rounded-2xl border-l-4 overflow-hidden relative group"
                 style={{ borderLeftColor: issue.type === 'error' ? '#f43f5e' : '#f59e0b' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-5">
                  <div className={`p-4 rounded-2xl ${issue.type === 'error' ? 'bg-rose-500/10' : 'bg-amber-500/10'}`}>
                    {getIcon(issue.id)}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">
                      {issue.id === 'tmdb_key_missing' ? 'TMDB Configuration Required' : 
                       issue.id === 'no_indexers' ? 'No Indexers Found' : 
                       issue.id === 'no_clients' ? 'No Download Client' : 'Client Connection Error'}
                    </h3>
                    <p className="text-slate-300 text-sm max-w-2xl">{issue.message}</p>
                  </div>
                </div>
                
                <button
                  onClick={() => navigate(issue.actionLink)}
                  className={`flex items-center gap-2 font-bold px-6 py-3 rounded-xl transition-all shadow-lg hover:scale-105 ${
                    issue.type === 'error' 
                      ? 'bg-rose-500 text-white hover:bg-rose-400' 
                      : 'bg-amber-500 text-slate-900 hover:bg-amber-400'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  {issue.actionText}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
