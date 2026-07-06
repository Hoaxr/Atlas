import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, User, ArrowRight } from 'lucide-react';
import api from '../lib/api';
import { customAlert } from '../utils/alerts';
import PasswordInput from '../components/shared/PasswordInput';

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
          try { localStorage.setItem('atlas_token', res.data.data.token); } catch { /* ignore */ }
          try { localStorage.setItem('atlas_user', JSON.stringify(res.data.data.user)); } catch { /* ignore */ }
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
    <div className="min-h-screen bg-[#070b13] flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[140px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[140px]"></div>
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <div className="glass-panel interactive-glow-card p-8 rounded-3xl shadow-2xl border border-slate-800/80 relative overflow-hidden bg-slate-900/40 backdrop-blur-2xl">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-500"></div>
          
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 shadow-inner mb-4 border border-slate-800">
              <Shield className="w-8 h-8 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]" />
            </div>
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-350 tracking-tight font-display">Atlas Login</h1>
            <p className="text-slate-400 mt-2 text-sm font-medium">Sign in to access your media manager</p>
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
                    className="w-full bg-slate-950/40 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all placeholder:text-slate-650 shadow-inner text-sm"
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
                  <PasswordInput
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-slate-950/40 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all placeholder:text-slate-650 shadow-inner text-sm"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] hover:brightness-105 active:scale-[0.99] disabled:opacity-50 group"
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
