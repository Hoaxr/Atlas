
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, User, ArrowRight, PlaySquare, Server, Smartphone, X } from 'lucide-react';
import api from '../lib/api';
import { customAlert } from '../utils/alerts';
import PasswordInput from '../components/shared/PasswordInput';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMethod, setLoadingMethod] = useState(null); // 'atlas' | 'jellyfin' | 'plex'
  const [checking, setChecking] = useState(true);
  const [authOptions, setAuthOptions] = useState({ plexConfigured: false, jellyfinConfigured: false });
  
  // Jellyfin Quick Connect State
  const [qcModalOpen, setQcModalOpen] = useState(false);
  const [showAtlasLogin, setShowAtlasLogin] = useState(false);
  const [qcCode, setQcCode] = useState('');
  const [qcSecret, setQcSecret] = useState('');
  
  const navigate = useNavigate();
  const pollIntervalRef = useRef(null);
  const qcPollIntervalRef = useRef(null);

  useEffect(() => {
    const token = (() => { try { return localStorage.getItem('atlas_token'); } catch { return null; } })();
    if (token) {
      navigate('/');
      return;
    }

    api.get('/auth/status').then(res => {
      if (res.data.status === 'success') {
        const { authEnabled, isPrivate, plexConfigured, jellyfinConfigured } = res.data.data;
        if (!authEnabled || isPrivate) {
          navigate('/');
        } else {
          setAuthOptions({ plexConfigured, jellyfinConfigured });
        }
      }
    }).catch(() => {}).finally(() => setChecking(false));
    
    return () => {
      clearInterval(pollIntervalRef.current);
      clearInterval(qcPollIntervalRef.current);
    };
  }, [navigate]);

  if (checking) return null;

  const handleSuccessfulLogin = (res) => {
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
  };

  const executeLogin = async (method) => {
    if (!username || !password) {
      customAlert('Username and password are required');
      return;
    }
    
    setLoading(true);
    setLoadingMethod(method);

    try {
      const endpoint = method === 'jellyfin' ? '/auth/jellyfin/login' : '/auth/login';
      const res = await api.post(endpoint, { username, password });
      
      if (res.data.status === 'success') {
        handleSuccessfulLogin(res);
      } else {
        customAlert(res.data.message || 'Login failed');
      }
    } catch (err) {
      if (err.response?.status === 401) {
        customAlert('Invalid username or password');
      } else {
        customAlert(err.response?.data?.message || 'Failed to connect to server');
      }
    } finally {
      setLoading(false);
      setLoadingMethod(null);
    }
  };

  const handleAtlasLogin = (e) => {
    e.preventDefault();
    executeLogin('atlas');
  };

  const handleJellyfinLogin = () => {
    executeLogin('jellyfin');
  };

  const handlePlexLogin = async () => {
    setLoading(true);
    setLoadingMethod('plex');
    try {
      const clientId = 'Atlas-' + Math.random().toString(36).substring(2, 15);
      const pinRes = await fetch('https://plex.tv/api/v2/pins?strong=true', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'X-Plex-Client-Identifier': clientId,
          'X-Plex-Product': 'Atlas'
        }
      });
      const pinData = await pinRes.json();
      
      const authUrl = `https://app.plex.tv/auth/#!?clientID=${clientId}&code=${pinData.code}&context[device][product]=Atlas`;
      
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(authUrl, 'PlexAuth', `width=${width},height=${height},left=${left},top=${top}`);
      
      pollIntervalRef.current = setInterval(async () => {
        if (popup?.closed) {
          clearInterval(pollIntervalRef.current);
          setLoading(false);
          setLoadingMethod(null);
        }
        
        try {
          const pollRes = await fetch(`https://plex.tv/api/v2/pins/${pinData.id}`, {
            headers: {
              'Accept': 'application/json',
              'X-Plex-Client-Identifier': clientId
            }
          });
          const pollData = await pollRes.json();
          if (pollData.authToken) {
            clearInterval(pollIntervalRef.current);
            if (!popup?.closed) popup.close();
            
            // Send token to Atlas
            const atlasRes = await api.post('/auth/plex/login', { authToken: pollData.authToken });
            if (atlasRes.data.status === 'success') {
              handleSuccessfulLogin(atlasRes);
            } else {
              setLoading(false);
              setLoadingMethod(null);
            }
          }
        } catch (pollErr) {
          console.error('Plex polling error', pollErr);
        }
      }, 2000);
      
    } catch (err) {
      console.error(err);
      customAlert('Failed to initialize Plex login');
      setLoading(false);
      setLoadingMethod(null);
    }
  };

  const handleJellyfinQCInit = async () => {
    try {
      setQcCode('');
      setQcSecret('');
      setQcModalOpen(true);
      
      const res = await api.get('/auth/jellyfin/quickconnect/initiate');
      if (res.data.status === 'success' && res.data.data) {
        setQcCode(res.data.data.Code);
        setQcSecret(res.data.data.Secret);
        
        // Start polling
        qcPollIntervalRef.current = setInterval(async () => {
          try {
            const statusRes = await api.get(`/auth/jellyfin/quickconnect/status?secret=${res.data.data.Secret}`);
            if (statusRes.data.status === 'success' && statusRes.data.data?.Authenticated) {
              clearInterval(qcPollIntervalRef.current);
              
              // Proceed to login
              const loginRes = await api.post('/auth/jellyfin/quickconnect/login', { secret: res.data.data.Secret });
              if (loginRes.data.status === 'success') {
                setQcModalOpen(false);
                handleSuccessfulLogin(loginRes);
              } else {
                customAlert('Quick connect login failed on Atlas backend');
                setQcModalOpen(false);
              }
            }
          } catch (pollErr) {
            console.error('Jellyfin QC Poll error:', pollErr);
          }
        }, 3000);
      } else {
        customAlert('Failed to initialize Quick Connect');
        setQcModalOpen(false);
      }
    } catch (err) {
      console.error(err);
      customAlert('Failed to connect to Jellyfin server');
      setQcModalOpen(false);
    }
  };

  const closeQCModal = () => {
    clearInterval(qcPollIntervalRef.current);
    setQcModalOpen(false);
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

          <form onSubmit={handleAtlasLogin} className="space-y-6">
            <div className="flex flex-col gap-3">
              {authOptions.jellyfinConfigured && (
                <button
                  type="button"
                  onClick={handleJellyfinQCInit}
                  disabled={loading}
                  className="w-full py-3 px-4 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.01] hover:brightness-105 active:scale-[0.99] disabled:opacity-50 group bg-gradient-to-r from-[#00a4dc] to-[#0085b2] text-white shadow-[#00a4dc]/20"
                >
                  {loadingMethod === 'jellyfin' ? (
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Smartphone className="w-5 h-5" />
                      Sign In with Jellyfin
                    </>
                  )}
                </button>
              )}

              {authOptions.plexConfigured && (
                <button
                  type="button"
                  onClick={handlePlexLogin}
                  disabled={loading}
                  className="w-full py-3 px-4 bg-[#e5a00d] hover:bg-[#cc8e0c] text-slate-900 font-bold rounded-xl shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                >
                  {loadingMethod === 'plex' ? (
                    <span className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                  ) : (
                    <>
                      <PlaySquare className="w-5 h-5" />
                      Sign In with Plex
                    </>
                  )}
                </button>
              )}

              {(authOptions.jellyfinConfigured || authOptions.plexConfigured) && (
                <div className="flex items-center gap-4 my-2">
                  <div className="h-px bg-slate-800 flex-1"></div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">OR</span>
                  <div className="h-px bg-slate-800 flex-1"></div>
                </div>
              )}

              {!showAtlasLogin ? (
                <button
                  type="button"
                  onClick={() => setShowAtlasLogin(true)}
                  className="w-full py-3 px-4 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all hover:bg-slate-800 text-slate-300 border border-slate-700 bg-slate-900/50 hover:text-white"
                >
                  <Shield className="w-5 h-5" />
                  Sign In with Atlas Account
                </button>
              ) : (
                <div className="space-y-6 animate-fade-in">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Username
                      </label>
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
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Password
                      </label>
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
                    className="w-full py-3 px-4 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.01] hover:brightness-105 active:scale-[0.99] disabled:opacity-50 group bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/20"
                  >
                    {loadingMethod === 'atlas' ? (
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        Sign In to Atlas
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Quick Connect Modal */}
      {qcModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col relative">
            <button 
              onClick={closeQCModal}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-[#00a4dc]/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[#00a4dc]/20">
                <Smartphone className="w-8 h-8 text-[#00a4dc]" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Jellyfin Quick Connect</h2>
              <p className="text-slate-400 text-sm mb-6">
                Open Jellyfin on an already authorized device (like your phone or PC), go to <strong className="text-white">Quick Connect</strong> in the menu, and enter the code below:
              </p>
              
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-6">
                {qcCode ? (
                  <div className="text-4xl font-black text-white tracking-[0.2em]">{qcCode}</div>
                ) : (
                  <div className="flex justify-center py-2">
                    <span className="w-8 h-8 border-2 border-[#00a4dc]/30 border-t-[#00a4dc] rounded-full animate-spin" />
                  </div>
                )}
              </div>
              
              <p className="text-xs text-slate-500">
                Waiting for authorization...
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
