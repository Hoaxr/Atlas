import { useState, useEffect } from 'react';
import { Clock, Save, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../../lib/api';

const TASKS = [
  { id: 'search_cycle',       name: 'Torrent Search Cycle',  desc: 'Searches indexers for monitored movies and episodes.' },
  { id: 'update_ratings',     name: 'Update Ratings',         desc: 'Refreshes TMDB ratings for all movies and shows.' },
  { id: 'update_air_dates',   name: 'Update Air Dates',       desc: 'Fetches upcoming episode air dates from TMDB.' },
  { id: 'trakt_watched_sync', name: 'Trakt Watched Sync',     desc: 'Syncs your Trakt watch history to Atlas.' },
];

const PRESETS = [
  { label: 'Every 30 min', value: '*/30 * * * *' },
  { label: 'Every hour',   value: '0 * * * *' },
  { label: 'Every 4 hrs',  value: '0 */4 * * *' },
  { label: 'Every 6 hrs',  value: '0 */6 * * *' },
  { label: 'Every 12 hrs', value: '0 */12 * * *' },
  { label: 'Daily',        value: '0 0 * * *' },
  { label: 'Weekly',       value: '0 0 * * 0' },
];

const cronToHuman = (expr) => {
  const match = PRESETS.find(p => p.value === expr);
  if (match) return match.label;
  return expr; // Return raw if no preset matches
};

export default function ScheduleTab() {
  const [schedules, setSchedules] = useState({});
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [status, setStatus]       = useState({ type: '', message: '' });

  useEffect(() => {
    api.get('/settings/schedules')
      .then(res => { if (res.data.status === 'success') setSchedules(res.data.data); })
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/settings/schedules', { schedules });
      setStatus({ type: 'success', message: 'Schedules saved and applied immediately.' });
      setTimeout(() => setStatus({ type: '', message: '' }), 4000);
    } catch {
      setStatus({ type: 'error', message: 'Failed to save schedules.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-slate-500 text-sm animate-pulse text-center py-12">Loading schedules…</p>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-cyan-400 mb-1">Task Schedules</h2>
        <p className="text-slate-400 text-sm">
          Control when each background task runs. Changes take effect immediately — no restart needed.
        </p>
      </div>

      {status.message && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium ${
          status.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {status.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />
          }
          {status.message}
        </div>
      )}

      <div className="space-y-4">
        {TASKS.map(task => {
          const current = schedules[task.id] || '';
          return (
            <div key={task.id} className="glass-panel p-5 rounded-2xl border border-white/10">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h3 className="font-semibold text-slate-200">{task.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{task.desc}</p>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-800/60 px-2.5 py-1 rounded-lg shrink-0">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs text-slate-300 font-medium">{cronToHuman(current)}</span>
                </div>
              </div>

              {/* Preset buttons */}
              <div className="flex flex-wrap gap-2 mb-3">
                {PRESETS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setSchedules(s => ({ ...s, [task.id]: p.value }))}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      current === p.value
                        ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                        : 'bg-slate-800 text-slate-400 border border-transparent hover:border-white/10 hover:text-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Custom cron input */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 shrink-0">Custom cron:</label>
                <input
                  type="text"
                  value={current}
                  onChange={e => setSchedules(s => ({ ...s, [task.id]: e.target.value }))}
                  placeholder="e.g. 0 */2 * * *"
                  className="flex-1 bg-slate-800/60 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500/40 transition-colors"
                />
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 hover:border-cyan-500/40 transition-all font-semibold disabled:opacity-60"
      >
        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving…' : 'Save Schedules'}
      </button>
    </div>
  );
}
