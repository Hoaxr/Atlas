import { useState, useEffect } from 'react';
import axios from 'axios';
import { Play, Clock, CheckCircle2, AlertCircle, Activity, Loader2 } from 'lucide-react';

export default function SystemTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningTaskId, setRunningTaskId] = useState(null);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await axios.get('http://localhost:3000/api/tasks');
      if (res.data.status === 'success') {
        setTasks(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch tasks', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunTask = async (id) => {
    setRunningTaskId(id);
    try {
      await axios.post(`http://localhost:3000/api/tasks/${id}/run`);
      // Optimistic update
      setTasks(tasks.map(t => t.id === id ? { ...t, status: 'running', lastMessage: 'Task triggered' } : t));
    } catch (err) {
      console.error('Failed to run task', err);
    } finally {
      setTimeout(() => setRunningTaskId(null), 1000);
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-cyan-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-100 flex items-center gap-3">
          <Activity className="w-8 h-8 text-cyan-400" /> System Tasks
        </h1>
        <p className="text-slate-400 mt-1">Monitor and manually trigger background automation tasks.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {tasks.map(task => (
          <div key={task.id} className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
            {/* Background status indicator */}
            <div className={`absolute top-0 left-0 w-1 h-full ${
              task.status === 'running' ? 'bg-blue-500 animate-pulse' : 
              task.status === 'error' ? 'bg-red-500' : 'bg-emerald-500'
            }`} />

            <div className="flex justify-between items-start mb-4 pl-2">
              <div>
                <h3 className="text-lg font-bold text-slate-100">{task.name}</h3>
                <p className="text-sm text-slate-400 mt-1">{task.description}</p>
              </div>
              
              <div className="flex items-center gap-2">
                {task.status === 'running' && <span className="flex items-center gap-1 text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded-full"><Loader2 className="w-3 h-3 animate-spin"/> Running</span>}
                {task.status === 'idle' && <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full"><CheckCircle2 className="w-3 h-3"/> Idle</span>}
                {task.status === 'error' && <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded-full"><AlertCircle className="w-3 h-3"/> Error</span>}
              </div>
            </div>

            <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5 space-y-3 pl-2">
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <Clock className="w-4 h-4 text-slate-500" />
                <span className="w-24 text-slate-500">Schedule:</span> 
                <span className="font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">{task.cronExpression}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="w-24 text-slate-500">Last Run:</span> 
                <span>{formatTime(task.lastRun)}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <Activity className="w-4 h-4 text-blue-500" />
                <span className="w-24 text-slate-500">Next Run:</span> 
                <span className="font-medium text-slate-200">{formatTime(task.nextRun)}</span>
              </div>
              {task.lastMessage && (
                <div className="pt-2 border-t border-white/5 mt-2">
                  <p className="text-xs text-slate-500">Last Output:</p>
                  <p className={`text-sm ${task.status === 'error' ? 'text-red-400' : 'text-slate-300'}`}>{task.lastMessage}</p>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end pl-2">
              <button
                onClick={() => handleRunTask(task.id)}
                disabled={task.status === 'running' || runningTaskId === task.id}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {runningTaskId === task.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Run Now
              </button>
            </div>
          </div>
        ))}

        {tasks.length === 0 && (
          <div className="col-span-2 flex justify-center py-12">
            <p className="text-slate-500 italic">No tasks registered yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
