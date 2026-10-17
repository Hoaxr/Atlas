import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, ArrowRight, ShieldCheck, Mail, Terminal, RotateCcw } from 'lucide-react';
import api from '../lib/api';
import { customAlert } from '../utils/alerts';
import PasswordInput from '../components/shared/PasswordInput';
import AtlasLogo from '../components/common/AtlasLogo';

const BOOT_STEPS = [
  { text: 'Starting Atlas core engine...', log: '[0.021s] Initializing runtime kernel', pct: 25 },
  { text: 'Checking SQLite database & schema...', log: '[0.142s] Database verified (WAL mode active)', pct: 55 },
  { text: 'Mounting media pipeline & scheduler...', log: '[0.288s] Background services ready', pct: 85 },
  { text: 'System ready. Launching setup...', log: '[0.395s] Administrator setup required', pct: 100 },
];

export default function Setup() {
  const [bootStage, setBootStage] = useState('booting'); // 'booting' | 'ready'
  const [bootIndex, setBootIndex] = useState(0);
  const [bootProgress, setBootProgress] = useState(0);
  const [logs, setLogs] = useState([]);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(true);
  const navigate = useNavigate();
  const timersRef = useRef([]);

  // Check backend setup status
  useEffect(() => {
    api.get('/auth/status')
      .then(res => {
        if (res.data.status === 'success') {
          const needs = !!res.data.data.needsSetup;
          setNeedsSetup(needs);
          // If setup is already done and not in preview mode, immediately redirect to login
          const searchParams = new URLSearchParams(window.location.search);
          const isPreview = searchParams.has('preview') || searchParams.has('test');
          if (!needs && !isPreview) {
            navigate('/login', { replace: true });
          }
        }
      })
      .catch(() => {
        navigate('/login', { replace: true });
      })
      .finally(() => setChecking(false));
  }, [navigate]);

  const clearAllBootTimers = () => {
    timersRef.current.forEach(t => clearTimeout(t));
    timersRef.current = [];
  };

  // Boot sequence animation
  const runBootSequence = () => {
    clearAllBootTimers();
    setBootStage('booting');
    setBootIndex(0);
    setBootProgress(12);
    setLogs(['[0.000s] Atlas BIOS boot sequence started']);

    const delays = [600, 1300, 2000, 2650, 3100];

    delays.forEach((delay, idx) => {
      const timer = setTimeout(() => {
        if (idx < BOOT_STEPS.length) {
          setBootIndex(idx);
          setBootProgress(BOOT_STEPS[idx].pct);
          setLogs(prev => {
            // Avoid duplicate lines if strict mode triggers
            const nextLog = BOOT_STEPS[idx].log;
            return [...prev.filter(l => l !== nextLog).slice(-3), nextLog];
          });
        } else {
          setBootProgress(100);
          const finishTimer = setTimeout(() => {
            setBootStage('ready');
          }, 350);
          timersRef.current.push(finishTimer);
        }
      }, delay);
      timersRef.current.push(timer);
    });
  };

  useEffect(() => {
    runBootSequence();
    return () => clearAllBootTimers();
  }, []);

  const handleSkipBoot = () => {
    clearAllBootTimers();
    setBootStage('ready');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!username.trim()) {
      customAlert('Username is required', 'error');
      return;
    }
    if (username.trim().length < 3) {
      customAlert('Username must be at least 3 characters', 'error');
      return;
    }
    if (!password || password.length < 8) {
      customAlert('Password must be at least 8 characters long', 'error');
      return;
    }
    if (password !== confirmPassword) {
      customAlert('Passwords do not match', 'error');
      return;
    }

    if (!needsSetup) {
      setLoading(true);
      setTimeout(() => {
        setLoading(false);
        customAlert('Preview: account setup simulated', 'info');
        navigate('/');
      }, 500);
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/setup', {
        username: username.trim(),
        email: email.trim() || undefined,
        password
      });

      if (res.data?.status === 'success') {
        const { token, user } = res.data.data;
        if (token) localStorage.setItem('atlas_token', token);
        if (user) localStorage.setItem('atlas_user', JSON.stringify(user));
        customAlert('Account created successfully');
        navigate('/');
      } else {
        customAlert(res.data?.message || 'Failed to complete setup', 'error');
      }
    } catch (err) {
      customAlert(err.response?.data?.message || 'Failed to create account', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (checking) return null;

  return (
    <div className="min-h-screen bg-[#070b13] flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[140px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[140px]" />
      </div>

      {/* ─── STAGE 1: BOOTING UP ANIMATION ─── */}
      {bootStage === 'booting' && (
        <div className="w-full max-w-md relative z-10 animate-fade-in flex flex-col items-center text-center">
          {/* Original Atlas Lockup Logo with subtle glow */}
          <div className="relative mb-8 flex items-center justify-center">
            <div className="absolute inset-0 bg-cyan-500/20 blur-2xl rounded-full scale-125 animate-pulse" />
            <AtlasLogo
              variant="lockup"
              className="h-14 sm:h-16 w-auto relative z-10 drop-shadow-[0_0_25px_rgba(56,189,248,0.4)]"
            />
          </div>

          {/* Progress Section */}
          <div className="w-full mb-4">
            <div className="flex justify-between items-center text-xs mb-2 px-0.5">
              <span className="text-slate-300 font-medium truncate">
                {BOOT_STEPS[bootIndex]?.text || 'Initializing...'}
              </span>
              <span className="text-cyan-400 font-mono font-bold shrink-0 ml-3">
                {bootProgress}%
              </span>
            </div>

            {/* Atlas Progress bar */}
            <div className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-full h-2 p-0.5 shadow-inner">
              <div 
                className="bg-gradient-to-r from-cyan-500 via-sky-400 to-blue-500 h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(56,189,248,0.6)]"
                style={{ width: `${bootProgress}%` }}
              />
            </div>
          </div>

          {/* Atlas Telemetry Console Box */}
          <div className="w-full bg-[#090f1d] border border-[#1c2d46] rounded-2xl p-4 text-left font-mono text-xs shadow-2xl">
            <div className="flex items-center justify-between text-[11px] pb-2 mb-2.5 border-b border-[#1c2d46]">
              <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span className="uppercase tracking-wider text-[10px]">Atlas Kernel Telemetry</span>
              </div>
              <span className="text-emerald-400/90 font-semibold text-[10px] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ONLINE
              </span>
            </div>
            <div className="space-y-1.5 min-h-[82px]">
              {logs.map((log, i) => (
                <div key={i} className="truncate text-slate-300 text-[11px]">
                  <span className="text-cyan-400 mr-2 select-none">&gt;</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Skip button */}
          <button
            onClick={handleSkipBoot}
            className="mt-6 text-xs text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1.5 cursor-pointer font-medium"
          >
            <span>Skip to setup</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── STAGE 2: CREATE ADMIN ACCOUNT FORM ─── */}
      {bootStage === 'ready' && (
        <div className="w-full max-w-md relative z-10 animate-fade-in">
          <div className="glass-panel interactive-glow-card p-8 rounded-3xl shadow-2xl border border-slate-800/80 relative overflow-hidden bg-slate-900/40 backdrop-blur-2xl">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-500" />

            {/* Header */}
            <div className="text-center mb-8">
              <div className="group/logo flex items-center justify-center mb-5">
                <AtlasLogo
                  variant="lockup"
                  className="h-12 w-auto drop-shadow-[0_0_18px_rgba(56,189,248,0.35)] group-hover/logo:scale-105 transition-transform duration-300"
                />
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">Create Admin Account</h1>
              <p className="text-slate-400 mt-1.5 text-sm font-medium">Set up your administrator credentials to get started</p>
            </div>

            {!needsSetup && (
              <div className="mb-6 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300/90 text-xs text-center font-medium">
                Preview mode — an admin account already exists
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
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
                    autoFocus
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="w-full bg-slate-950/40 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all placeholder:text-slate-650 shadow-inner text-sm"
                    placeholder="Enter admin username"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Email <span className="text-slate-600 font-normal lowercase">(optional)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="w-5 h-5 text-slate-500" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-slate-950/40 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all placeholder:text-slate-650 shadow-inner text-sm"
                    placeholder="admin@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                    <Lock className="w-5 h-5 text-slate-500" />
                  </div>
                  <PasswordInput
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-slate-950/40 border border-slate-800 rounded-xl pl-11 pr-11 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all placeholder:text-slate-650 shadow-inner text-sm"
                    placeholder="Minimum 8 characters"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                    <ShieldCheck className="w-5 h-5 text-slate-500" />
                  </div>
                  <PasswordInput
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className={`w-full bg-slate-950/40 border rounded-xl pl-11 pr-11 py-3 text-slate-200 focus:outline-none focus:ring-2 transition-all placeholder:text-slate-650 shadow-inner text-sm ${
                      confirmPassword && password !== confirmPassword
                        ? 'border-rose-500/50 focus:border-rose-500 focus:ring-rose-500/20'
                        : 'border-slate-800 focus:ring-cyan-500/20 focus:border-cyan-500/50'
                    }`}
                    placeholder="Repeat password"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.01] hover:brightness-105 active:scale-[0.99] disabled:opacity-50 group bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/20 cursor-pointer text-sm"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Create Account</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            {/* Replay boot sequence button */}
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={runBootSequence}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Replay boot sequence</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
