import { useState, useEffect } from 'react';
import { Activity, Database, HardDrive, Cpu, Clock } from 'lucide-react';
import api from '../../lib/api';
import { formatSize } from '../../lib/format';

const formatUptime = (seconds) => {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export default function HealthWidget() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/library/health')
      .then(res => { if (res.data.status === 'success') setData(res.data.data); })
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
  }, []);

  const allPathsOk = data?.paths?.every(p => p.accessible) ?? true;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/50 overflow-hidden mb-6">
      {/* Header */}
      <div className="w-full flex items-center justify-between px-5 py-3.5 border-b border-white/5 bg-slate-800/20">
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg ${allPathsOk ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
            <Activity className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold text-slate-200">System Health</span>
          {data && !allPathsOk && (
            <span className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium">
              Path issue
            </span>
          )}
        </div>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <p className="text-sm text-slate-500 text-center py-4 animate-pulse">Loading health data…</p>
        ) : !data ? (
          <p className="text-sm text-red-400 text-center py-4">Failed to load health data</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* DB Size */}
            <div className="bg-slate-800/60 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                <Database className="w-3.5 h-3.5" /> Database
              </div>
              <p className="text-base font-bold text-white">{formatSize(data.db?.sizeBytes)}</p>
              <p className="text-[11px] text-slate-500">{data.logs?.count ?? 0} log entries</p>
            </div>

            {/* Uptime */}
            <div className="bg-slate-800/60 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                <Clock className="w-3.5 h-3.5" /> Uptime
              </div>
              <p className="text-base font-bold text-white">{formatUptime(data.process?.uptimeSeconds)}</p>
              <p className="text-[11px] text-slate-500">{data.process?.rssMemMB ?? '?'} MB RSS</p>
            </div>

            {/* Memory */}
            <div className="bg-slate-800/60 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                <Cpu className="w-3.5 h-3.5" /> Memory
              </div>
              <p className="text-base font-bold text-white">
                {data.process?.heapUsedMB ?? '?'}/{data.process?.heapTotalMB ?? '?'} MB
              </p>
              <p className="text-[11px] text-slate-500">
                {data.system?.freeMemMB ?? '?'} MB sys free
              </p>
            </div>

            {/* Library */}
            <div className="bg-slate-800/60 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                <HardDrive className="w-3.5 h-3.5" /> Library
              </div>
              <p className="text-base font-bold text-white">
                {data.library?.movies ?? 0}m / {data.library?.shows ?? 0}s
              </p>
              <p className="text-[11px] text-slate-500">{data.library?.episodes ?? 0} episodes</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
