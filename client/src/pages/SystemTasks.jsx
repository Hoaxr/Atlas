import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../lib/api';
import { motion } from 'framer-motion';
import {
  Play, Clock, CheckCircle2, AlertCircle, Activity, Loader2, Timer,
  ListTodo, RefreshCw, MessageSquare, Trash2, Sparkles, ShieldCheck
} from 'lucide-react';
import StickyBar from '../components/shared/StickyBar';
import LoadingState from '../components/shared/LoadingState';
import { useStickyBar } from '../lib/useStickyBar';
import { customConfirm, customAlert } from '../utils/alerts';

const LEVEL_CONFIG = {
  success: {
    icon: CheckCircle2,
    badgeBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
  error: {
    icon: AlertCircle,
    badgeBg: 'bg-rose-500/10',
    iconColor: 'text-rose-400',
    border: 'border-rose-500/20',
  },
  warn: {
    icon: AlertCircle,
    badgeBg: 'bg-amber-500/10',
    iconColor: 'text-amber-400',
    border: 'border-amber-500/20',
  },
  info: {
    icon: Activity,
    badgeBg: 'bg-cyan-500/10',
    iconColor: 'text-cyan-400',
    border: 'border-cyan-500/20',
  },
};

const TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit',
});

const getTaskIcon = (id, name) => {
  const lower = ((id || '') + ' ' + (name || '')).toLowerCase();
  if (lower.includes('subtitle')) return MessageSquare;
  if (lower.includes('sync') || lower.includes('simkl') || lower.includes('refresh')) return RefreshCw;
  if (lower.includes('clean') || lower.includes('retention') || lower.includes('delete')) return Trash2;
  if (lower.includes('ai') || lower.includes('translat')) return Sparkles;
  if (lower.includes('health')) return ShieldCheck;
  return ListTodo;
};

export default function SystemTasks() {
  const { headerRef, stickyVisible } = useStickyBar();
  const [activeTab, setActiveTab] = useState('tasks');
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningTaskId, setRunningTaskId] = useState(null);
  const [recentlyRan, setRecentlyRan] = useState({});
  const prevLastRunRef = useRef({});
  const prevLogCountRef = useRef(0);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.get('/tasks');
      if (res.data.status === 'success') {
        const newTasks = res.data.data;
        setTasks(newTasks);

        const prev = prevLastRunRef.current;
        // On first fetch, seed the ref so we don't flash all tasks as "just ran"
        if (Object.keys(prev).length === 0) {
          for (const t of newTasks) {
            prev[t.id] = t.lastRun;
          }
        } else {
          const updated = {};
          for (const t of newTasks) {
            if (t.lastRun && t.lastRun !== prev[t.id] && t.status !== 'running') {
              updated[t.id] = true;
            }
            prev[t.id] = t.lastRun;
          }
          if (Object.keys(updated).length > 0) {
            setRecentlyRan(prev => ({ ...prev, ...updated }));
            setTimeout(() => {
              setRecentlyRan(prev => {
                const next = { ...prev };
                for (const id of Object.keys(updated)) delete next[id];
                return next;
              });
            }, 4000);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch tasks', err);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await api.get('/logs', { params: { limit: 30 } });
      if (res.data.status === 'success' && res.data.data.length !== prevLogCountRef.current) {
        setLogs(res.data.data);
        prevLogCountRef.current = res.data.data.length;
      }
    } catch (err) {
      console.error('Failed to fetch logs', err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchTasks(), fetchLogs()]).finally(() => {
      setLoading(false);
    });
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      fetchTasks();
      fetchLogs();
    }, 3000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchTasks();
        fetchLogs();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchTasks, fetchLogs]);

  const isRunning = (task) => task.status === 'running' || recentlyRan[task.id];

  const formatTime = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 60000) return 'Just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatNextRun = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    const diffMs = date.getTime() - Date.now();
    if (diffMs <= 0) return 'Due now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `in ${hours}h`;
    const days = Math.floor(hours / 24);
    return `in ${days}d`;
  };

  const formatDuration = (ms) => {
    if (ms === null || ms === undefined) return null;
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  };

  const handleRunTask = async (id) => {
    setRunningTaskId(id);
    try {
      await api.post(`/tasks/${id}/run`);
      // Trigger an immediate fetch so the UI updates
      fetchTasks();
    } catch (err) {
      console.error('Failed to run task', err);
    } finally {
      setRunningTaskId(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div ref={headerRef} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold font-display tracking-tight text-slate-100 flex items-center gap-2.5 sm:gap-3 !mb-0">
            <ListTodo className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 shrink-0" /> <span className="truncate">System Tasks</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 hidden sm:block !mb-0 font-sans">
            Monitor and manually trigger background automation tasks.
          </p>
        </div>
      </div>

      <StickyBar visible={stickyVisible} />

      {/* Tabs */}
      <div className="relative flex items-center bg-[#101e31] p-1 rounded-xl border border-[#1c2d46] shadow-inner select-none w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('tasks')}
          className={`relative flex items-center justify-center gap-2.5 px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors duration-150 ${
            activeTab === 'tasks' ? 'text-slate-950 font-bold' : 'text-slate-100 hover:text-white'
          }`}
        >
          {activeTab === 'tasks' && (
            <motion.div
              layoutId="tasks-tab-slider"
              className="absolute inset-0 rounded-lg bg-gradient-to-b from-[#38a7f4] to-[#2291ea] shadow-sm"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <ListTodo className={`relative z-10 w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0 transition-colors duration-150 ${activeTab === 'tasks' ? 'text-slate-950' : 'text-slate-100'}`} />
          <span className="relative z-10">Tasks</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('activity')}
          className={`relative flex items-center justify-center gap-2.5 px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors duration-150 ${
            activeTab === 'activity' ? 'text-slate-950 font-bold' : 'text-slate-100 hover:text-white'
          }`}
        >
          {activeTab === 'activity' && (
            <motion.div
              layoutId="tasks-tab-slider"
              className="absolute inset-0 rounded-lg bg-gradient-to-b from-[#38a7f4] to-[#2291ea] shadow-sm"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <Clock className={`relative z-10 w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0 transition-colors duration-150 ${activeTab === 'activity' ? 'text-slate-950' : 'text-slate-100'}`} />
          <span className="relative z-10">Activity Log</span>
        </button>
      </div>

      {loading ? (
        <LoadingState className="min-h-[40vh] py-16" />
      ) : activeTab === 'tasks' ? (
        <div className="space-y-3 sm:space-y-3.5">
          {tasks.map(task => {
            const Icon = getTaskIcon(task.id, task.name);
            const running = isRunning(task);
            return (
              <div
                key={task.id}
                className="glass-panel rounded-2xl p-4 sm:p-5 border border-white/10 hover:border-slate-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group relative overflow-hidden"
              >
                {/* Left accent bar for status */}
                <div className={`absolute top-0 left-0 w-1 sm:w-1.5 h-full transition-colors ${
                  running ? 'bg-cyan-400 animate-pulse' :
                  task.status === 'error' ? 'bg-rose-500' :
                  'bg-emerald-500/80'
                }`} />

                {/* Left + Middle Content */}
                <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 flex-1 min-w-0 pl-1.5 sm:pl-2">
                  {/* Icon squircle */}
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#101e31] border border-[#1c2d46] flex items-center justify-center shrink-0 shadow-inner group-hover:border-cyan-500/30 transition-colors">
                    <Icon className={`w-5 h-5 transition-colors ${
                      running ? 'text-cyan-400 animate-spin' :
                      task.status === 'error' ? 'text-rose-400' :
                      'text-cyan-400'
                    }`} />
                  </div>

                  {/* Text details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm sm:text-base font-bold font-display text-slate-100 group-hover:text-white transition-colors">
                        {task.name}
                      </h3>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-[#101e31] border border-[#1c2d46] px-2 py-0.5 rounded-lg">
                        <Clock className="w-3 h-3 text-cyan-400/80 shrink-0" />
                        <span className="font-mono">{task.cronExpression}</span>
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-400 mt-1 line-clamp-1 leading-relaxed">
                      {task.description}
                    </p>

                    {/* Metadata chips */}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5" title={task.lastRun ? new Date(task.lastRun).toLocaleString() : ''}>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />
                        <span>Last: <strong className="text-slate-300 font-semibold">{formatTime(task.lastRun)}</strong></span>
                      </span>

                      {task.lastRunDuration && (
                        <span className="inline-flex items-center gap-1.5">
                          <Timer className="w-3.5 h-3.5 text-violet-400/80 shrink-0" />
                          <span>Duration: <strong className="text-slate-300 font-semibold">{formatDuration(task.lastRunDuration)}</strong></span>
                        </span>
                      )}

                      <span className="inline-flex items-center gap-1.5" title={task.nextRun ? new Date(task.nextRun).toLocaleString() : ''}>
                        <Activity className="w-3.5 h-3.5 text-cyan-400/80 shrink-0" />
                        <span>Next: <strong className="text-slate-300 font-semibold">{formatNextRun(task.nextRun)}</strong></span>
                      </span>

                      {task.lastMessage && !running && (
                        <span className={`truncate max-w-[200px] sm:max-w-[260px] text-[11px] px-2 py-0.5 rounded-md ${
                          task.status === 'error' ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400 bg-slate-800/60'
                        }`} title={task.lastMessage}>
                          {task.lastMessage}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Actions & Status */}
                <div className="flex items-center justify-end gap-3 shrink-0 self-end sm:self-center pl-1.5 sm:pl-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-white/5 w-full sm:w-auto">
                  {running ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 rounded-full whitespace-nowrap">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {task.status === 'running' ? 'Running' : 'Just Ran'}
                    </span>
                  ) : task.status === 'error' ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-full whitespace-nowrap">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Error
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full whitespace-nowrap">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Idle
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRunTask(task.id)}
                    disabled={running || runningTaskId === task.id}
                    className="flex items-center gap-2 bg-[#101e31] hover:bg-[#162740] text-slate-100 hover:text-white border border-[#1c2d46] hover:border-cyan-500/40 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    {runningTaskId === task.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400/20" />
                    )}
                    Run Now
                  </button>
                </div>
              </div>
            );
          })}

          {tasks.length === 0 && (
            <div className="glass-panel rounded-2xl p-12 text-center border border-white/10">
              <ListTodo className="w-10 h-10 mx-auto text-slate-600 mb-3" />
              <p className="text-slate-400 font-medium">No tasks registered yet.</p>
            </div>
          )}
        </div>
      ) : (
        /* Activity Log */
        <div className="space-y-6">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm sm:text-base font-bold font-display text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" /> Recent Events
              {logs.length > 0 && (
                <span className="text-xs font-semibold text-slate-400 bg-[#101e31] border border-[#1c2d46] px-2 py-0.5 rounded-full">{logs.length}</span>
              )}
            </h2>

            <button
              type="button"
              onClick={async () => {
                const confirmed = await customConfirm('Are you sure you want to clear all activity logs?', {
                  title: 'Clear Logs',
                  confirmText: 'Clear',
                  type: 'error',
                });
                if (confirmed) {
                  try {
                    await api.delete('/logs');
                    setLogs([]);
                    customAlert('Activity logs cleared', 'success');
                  } catch (e) {
                    console.error('Failed to clear logs', e);
                    customAlert('Failed to clear logs', 'error');
                  }
                }
              }}
              disabled={logs.length === 0}
              className="text-xs text-rose-400 hover:text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors font-semibold px-3 py-1.5 rounded-xl bg-[#101e31] border border-[#1c2d46] hover:border-rose-500/30 hover:bg-rose-500/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Logs
            </button>
          </div>

          {logs.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-slate-500 border border-white/10 text-center">
              <Activity className="w-10 h-10 mb-3 text-slate-600" />
              <p className="text-sm font-semibold text-slate-300">No activity yet</p>
              <p className="text-xs mt-1 text-slate-500 max-w-sm">Events like downloads, subtitle fetches, and task runs will appear here as tasks execute.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {(() => {
                const groups = {};
                const now = new Date();
                const today = now.toDateString();
                const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toDateString();

                logs.forEach(log => {
                  const d = new Date(log.created_at);
                  const key = d.toDateString() === today ? 'Today' :
                              d.toDateString() === yesterdayStr ? 'Yesterday' :
                              d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(log);
                });

                const groupKeys = Object.keys(groups);

                return groupKeys.map((groupKey) => (
                  <div key={groupKey} className="space-y-2.5">
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{groupKey}</span>
                      <span className="text-[11px] font-semibold text-slate-400 bg-[#101e31] border border-[#1c2d46] px-2 py-0.5 rounded-full">
                        {groups[groupKey].length}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {groups[groupKey].map((log) => {
                        const cfg = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
                        const Icon = cfg.icon;
                        const rel = (() => {
                          const diff = Date.now() - new Date(log.created_at).getTime();
                          const mins = Math.floor(diff / 60000);
                          if (mins < 1) return 'Just now';
                          if (mins < 60) return `${mins}m ago`;
                          const hours = Math.floor(mins / 60);
                          if (hours < 24) return `${hours}h ago`;
                          return TIME_FORMAT.format(new Date(log.created_at));
                        })();

                        return (
                          <div
                            key={log.id}
                            className="glass-panel rounded-2xl p-3.5 sm:p-4 border border-white/10 hover:border-slate-700/80 transition-all flex items-start gap-3.5 group"
                          >
                            <div className={`p-2 rounded-xl shrink-0 ${cfg.badgeBg} ${cfg.iconColor} border ${cfg.border} shadow-sm`}>
                              <Icon className="w-4 h-4" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors leading-snug">
                                  {log.message}
                                </p>
                                <span className="text-[11px] text-slate-500 font-mono shrink-0 whitespace-nowrap mt-0.5">
                                  {rel}
                                </span>
                              </div>

                              {(log.title || log.type || log.language) && (
                                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-400">
                                  {log.type && (
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-md shrink-0">
                                      {log.type}
                                    </span>
                                  )}
                                  {log.title && (
                                    <span className="truncate text-slate-300 font-medium">
                                      {log.title}
                                    </span>
                                  )}
                                  {log.language && (
                                    <span className="text-[10px] font-semibold uppercase bg-[#101e31] px-1.5 py-0.5 rounded text-slate-400 border border-[#1c2d46] shrink-0">
                                      {log.language}
                                    </span>
                                  )}
                                </div>
                              )}

                              {log.details && (
                                <p className="text-xs text-slate-500 font-mono mt-1.5 bg-slate-900/60 p-2 rounded-lg border border-white/5 break-all">
                                  {log.details}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}
  </div>
  );
}
