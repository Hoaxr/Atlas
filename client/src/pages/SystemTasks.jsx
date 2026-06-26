import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../lib/api';
import { Play, Clock, CheckCircle2, AlertCircle, Activity, Loader2, Timer, Download, Film, Tv, RefreshCw } from 'lucide-react';

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
        <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
          <Activity className="w-8 h-8 text-cyan-400" /> System Tasks
        </h1>
        <p className="text-slate-400 mt-1">Monitor and manually trigger background automation tasks.</p>
      </div>

      <div className="space-y-3">
        {tasks.map(task => (
          <div key={task.id} className="glass-panel rounded-2xl relative overflow-hidden group">
            {/* Background status indicator */}
            <div className={`absolute top-0 left-0 w-1 h-full ${
              isRunning(task) ? 'bg-blue-500 animate-pulse' : 
              task.status === 'error' ? 'bg-red-500' : 'bg-emerald-500'
            }`} />

            <div className="pl-5 pr-4 py-3 flex items-center gap-3">
              {/* Name + description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-100 truncate">{task.name}</h3>
                  <p className="text-xs text-slate-500 truncate hidden sm:block">{task.description}</p>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {task.cronExpression}</span>
                  <span className="flex items-center gap-1"><Timer className="w-3 h-3 text-violet-400" /> {formatDuration(task.lastRunDuration) || <span className="text-slate-600 italic">N/A</span>}</span>
                  {task.lastMessage && task.status !== 'running' && (
                    <span className={`truncate max-w-[200px] ${task.status === 'error' ? 'text-red-400' : 'text-slate-500'}`}>{task.lastMessage}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-0.5 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Last: {formatTime(task.lastRun)}</span>
                  <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-blue-500" /> Next: {formatTime(task.nextRun)}</span>
                </div>
              </div>

              {/* Status badge */}
              <div className="flex items-center gap-2 shrink-0">
                {isRunning(task) ? (
                  <span className="flex items-center gap-1 text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded-full"><Loader2 className="w-3 h-3 animate-spin"/>{task.status === 'running' ? ' Running' : ' Just Ran'}</span>
                ) : task.status === 'error' ? (
                  <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded-full"><AlertCircle className="w-3 h-3"/> Error</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full"><CheckCircle2 className="w-3 h-3"/> Idle</span>
                )}
              </div>

              {/* Run button */}
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
        ))}

        {tasks.length === 0 && (
          <div className="flex justify-center py-12">
            <p className="text-slate-500 italic">No tasks registered yet.</p>
          </div>
        )}
      </div>

      {/* Activity Log */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-cyan-400" /> Recent Activity
        </h2>
        {logs.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 flex flex-col items-center justify-center text-slate-500">
            <Activity className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No activity yet</p>
            <p className="text-xs mt-1">Events like downloads, subtitle fetches, and task runs will appear here.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log) => {
              const Icon = LEVEL_ICONS[log.level] || Activity;
              return (
                <div key={log.id} className="flex items-start gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-800/30 transition-colors group">
                  <div className="mt-0.5 shrink-0">
                    <Icon className={`w-4 h-4 ${LEVEL_COLORS[log.level] || 'text-slate-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-300 group-hover:text-slate-200 transition-colors">{log.message}</p>
                    {log.title && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {log.title}
                        {log.language && ` — ${log.language}`}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-600 shrink-0 mt-0.5">
                    {TIME_FORMAT.format(new Date(log.created_at))}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
