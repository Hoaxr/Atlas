import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, User, ArrowRight } from 'lucide-react';
import api from '../lib/api';
import { customAlert } from '../utils/alerts';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // If already logged in, redirect immediately
    const token = (() => { try { return localStorage.getItem('atlas_token'); } catch { return null; } })();
    if (token) {
      navigate('/');
      return;
    }

    api.get('/auth/status').then(res => {
      if (res.data.status === 'success') {
        const { authEnabled, isPrivate } = res.data.data;
        if (!authEnabled || isPrivate) {
          navigate('/');
        }
      }
    }).catch(() => {}).finally(() => setChecking(false));
  }, [navigate]);

  if (checking) return null;

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await api.post('/auth/login', { username, password });
      if (res.data.status === 'success') {
        if (res.data.data?.token) {
          try { localStorage.setItem('atlas_token', res.data.data.token); } catch {}
          try { localStorage.setItem('atlas_user', JSON.stringify(res.data.data.user)); } catch {}
        }
        customAlert('Login successful');
        
        if (res.data.data?.user?.role === 'user') {
          navigate('/portal');
        } else {
          navigate('/');
        }
      } else {
        customAlert(res.data.message || 'Login failed');
      }
    } catch (err) {
      if (err.response?.status === 401) {
        customAlert('Invalid username or password');
      } else {
        customAlert('Failed to connect to server');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <div className="glass-panel p-8 rounded-3xl shadow-2xl border border-slate-700/50 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-blue-500"></div>
          
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 shadow-inner mb-4 border border-slate-700">
              <Shield className="w-8 h-8 text-cyan-400" />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">Atlas Login</h1>
            <p className="text-slate-400 mt-2">Sign in to access your media manager</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Username</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User className="w-5 h-5 text-slate-500" />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all placeholder:text-slate-600"
                    placeholder="Enter username"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="w-5 h-5 text-slate-500" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all placeholder:text-slate-600"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold rounded-xl shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 group"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Sign In
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
