import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { Play, Clock, CheckCircle2, AlertCircle, Activity, Loader2, Timer, Download, Film, Tv, RefreshCw, ChevronRight } from 'lucide-react';

const LEVEL_ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warn: AlertCircle,
  info: Activity,
};

const LEVEL_COLORS = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  warn: 'text-amber-400',
  info: 'text-blue-400',
};

const TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit',
});

export default function SystemTasks() {
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
    fetchTasks();
    fetchLogs();
    setLoading(false);
    const interval = setInterval(() => {
      fetchTasks();
      fetchLogs();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchTasks, fetchLogs]);

  const isRunning = (task) => task.status === 'running' || recentlyRan[task.id];

  const formatTime = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleString();
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

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-cyan-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 sm:gap-3">
          <Activity className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 shrink-0" /> System Tasks
        </h1>
        <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block">Monitor and manually trigger background automation tasks.</p>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
        <div className="px-5 py-3 border-b border-white/5 bg-slate-800/20 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" /> Scheduled Tasks
            {tasks.length > 0 && (
              <span className="text-xs font-medium text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{tasks.length}</span>
            )}
          </h2>
        </div>
        <div className="divide-y divide-white/5">
          {tasks.map(task => (
            <div key={task.id} className="relative group hover:bg-slate-800/20 transition-colors">
              {/* Background status indicator */}
              <div className={`absolute top-0 left-0 w-1 h-full ${
                isRunning(task) ? 'bg-blue-500 animate-pulse' : 
                task.status === 'error' ? 'bg-red-500' : 'bg-emerald-500'
              }`} />

              <div className="pl-5 pr-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                {/* Name + description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-200 truncate">{task.name}</h3>
                    <p className="text-xs text-slate-500 truncate hidden sm:block">{task.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3 shrink-0" /> <span className="truncate">{task.cronExpression}</span></span>
                    <span className="flex items-center gap-1"><Timer className="w-3 h-3 text-violet-400 shrink-0" /> {formatDuration(task.lastRunDuration) || <span className="text-slate-600 italic">N/A</span>}</span>
                    {task.lastMessage && task.status !== 'running' && (
                      <span className={`truncate max-w-[160px] sm:max-w-[200px] ${task.status === 'error' ? 'text-red-400' : 'text-slate-500'}`}>{task.lastMessage}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-600">
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" /> Last: {formatTime(task.lastRun)}</span>
                    <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-blue-500 shrink-0" /> Next: {formatTime(task.nextRun)}</span>
                  </div>
                </div>

                {/* Status badge + Run button */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  {isRunning(task) ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded-full whitespace-nowrap"><Loader2 className="w-3 h-3 animate-spin"/>{task.status === 'running' ? ' Running' : ' Just Ran'}</span>
                  ) : task.status === 'error' ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded-full whitespace-nowrap"><AlertCircle className="w-3 h-3"/> Error</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full whitespace-nowrap"><CheckCircle2 className="w-3 h-3"/> Idle</span>
                  )}

                  <button
                    onClick={() => handleRunTask(task.id)}
                    disabled={task.status === 'running' || runningTaskId === task.id}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
                  >
                    {runningTaskId === task.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    Run
                  </button>
                </div>
              </div>
            </div>
          ))}

          {tasks.length === 0 && (
            <div className="flex justify-center py-12">
              <p className="text-slate-500 italic">No tasks registered yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Activity Log */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-cyan-400" /> Recent Activity
          {logs.length > 0 && (
            <span className="text-xs font-medium text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{logs.length}</span>
          )}
        </h2>
        {logs.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 flex flex-col items-center justify-center text-slate-500">
            <Activity className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No activity yet</p>
            <p className="text-xs mt-1">Events like downloads, subtitle fetches, and task runs will appear here.</p>
          </div>
        ) : (
          <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
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

              return groupKeys.map((groupKey, gi) => (
                <div key={groupKey}>
                  <div className="px-5 py-2 bg-slate-800/30 border-b border-white/5">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{groupKey}</span>
                    <span className="text-xs text-slate-600 ml-2">{groups[groupKey].length} event{groups[groupKey].length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="divide-y divide-white/5">
                    {groups[groupKey].map((log) => {
                      const Icon = LEVEL_ICONS[log.level] || Activity;
                      const borderColor = log.level === 'error' ? 'border-l-red-500/50' :
                                          log.level === 'warn' ? 'border-l-amber-500/50' :
                                          log.level === 'success' ? 'border-l-emerald-500/50' :
                                          'border-l-blue-500/30';
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
                        <div key={log.id} className={`flex items-start gap-3 px-5 py-3 border-l-2 ${borderColor} hover:bg-slate-800/20 transition-colors group`}>
                          <div className="mt-0.5 shrink-0 p-1.5 rounded-lg bg-slate-800/50 group-hover:bg-slate-800 transition-colors">
                            <Icon className={`w-3.5 h-3.5 ${LEVEL_COLORS[log.level] || 'text-slate-400'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm text-slate-300 group-hover:text-slate-200 transition-colors leading-snug">{log.message}</p>
                              <span className="text-[10px] text-slate-600 shrink-0 whitespace-nowrap mt-0.5">{rel}</span>
                            </div>
                            {log.title && (
                              <p className="text-xs text-slate-500 mt-1 truncate flex items-center gap-2">
                                {log.type === 'movie' && <span className="text-[10px] font-bold uppercase text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded shrink-0">Movie</span>}
                                {log.type === 'episode' && <span className="text-[10px] font-bold uppercase text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded shrink-0">Episode</span>}
                                <span className="truncate">{log.title}</span>
                                {log.language && <span className="text-[10px] font-bold uppercase bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 shrink-0">{log.language}</span>}
                              </p>
                            )}
                            {log.details && (
                              <p className="text-xs text-slate-600 mt-1 font-mono">{log.details}</p>
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
    </div>
  );
}
