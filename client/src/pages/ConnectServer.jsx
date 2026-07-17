import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, ArrowRight, Loader2, Link as LinkIcon } from 'lucide-react';
import axios from 'axios';

export default function ConnectServer() {
  const navigate = useNavigate();
  const [url, setUrl] = useState(localStorage.getItem('atlas_server_url') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!url) {
      setError('Please enter a server URL');
      return;
    }

    setLoading(true);
    setError('');

    let formattedUrl = url.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'http://' + formattedUrl;
    }

    try {
      const checkApi = axios.create({
        baseURL: formattedUrl.replace(/\/$/, '') + '/api',
        timeout: 5000
      });
      
      await checkApi.get('/settings');

      localStorage.setItem('atlas_server_url', formattedUrl);
      window.location.href = '/login';
    } catch (err) {
      if (err.response && err.response.status === 401) {
        localStorage.setItem('atlas_server_url', formattedUrl);
        window.location.href = '/login';
      } else {
        setError('Could not connect to server. Please check the URL and ensure the server is running.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-tr from-cyan-500 to-blue-600 mb-6 shadow-[0_0_40px_rgba(6,182,212,0.3)]">
            <Server className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-3">
            Connect to Atlas
          </h1>
          <p className="text-slate-400 text-sm md:text-base">
            Enter your Atlas server address to connect
          </p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl">
          <form onSubmit={handleConnect} className="space-y-6">
            
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-2xl text-sm font-medium">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Server URL</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <LinkIcon className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="text"
                  placeholder="e.g. http://192.168.1.100:4000"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-2xl py-3.5 pl-11 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all text-sm"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !url}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3.5 px-4 rounded-2xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] disabled:opacity-50 flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Connect Server
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
