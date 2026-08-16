import { useState, useEffect } from 'react';
import api from '../lib/api';
import { DownloadCloud, ArrowDown, ArrowUp, Activity } from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';
import useWebSocket from '../lib/useWebSocket';
import StickyBar from '../components/shared/StickyBar';
import { useStickyBar } from '../lib/useStickyBar';

export default function Downloads() {
  const { headerRef, stickyVisible } = useStickyBar();
  const { onEvent } = useWebSocket();
  const [downloads, setDownloads] = useState([]);
  const [stats, setStats] = useState({ dl_info_speed: 0, up_info_speed: 0 });

  useEffect(() => {
    // Initial fetch
    fetchClientData();

    // Listen for WebSocket push updates (replaces 3s polling)
    const cleanup = onEvent((data) => {
      if (data.type === 'TORRENTS_UPDATE' && data.data) {
        setDownloads(data.data.torrents || []);
        setStats(data.data.clientStats || { dl_info_speed: 0, up_info_speed: 0 });
      }
    });

    return () => { if (cleanup) cleanup(); };
  }, []);

  const fetchClientData = async () => {
    try {
      const [statsResult, torrentsResult] = await Promise.allSettled([
        api.get('/clients/stats'),
        api.get('/clients/torrents')
      ]);
      
      if (statsResult.status === 'fulfilled' && statsResult.value.data.status === 'success' && statsResult.value.data.data) {
        setStats(statsResult.value.data.data);
      } else {
        setStats({ dl_info_speed: 0, up_info_speed: 0 });
      }

      if (torrentsResult.status === 'fulfilled' && torrentsResult.value.data.status === 'success' && torrentsResult.value.data.data) {
        setDownloads(torrentsResult.value.data.data);
      } else {
        setDownloads([]);
      }
    } catch (err) {
      console.error('Failed to fetch client data', err);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytes) => {
    return formatBytes(bytes) + '/s';
  };

  const formatEta = (totalSize, progress, speed) => {
    if (!speed || speed <= 0 || !totalSize || progress >= 1) return null;
    const remainingBytes = totalSize * (1 - progress);
    const seconds = Math.floor(remainingBytes / speed);
    if (seconds <= 0) return 'Few seconds left';
    if (seconds < 60) return `${seconds}s left`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s left`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m left`;
  };

  const getStateBadge = (state) => {
    const s = (state || '').toLowerCase();
    if (s.includes('download') || s.includes('dl')) {
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    }
    if (s.includes('upload') || s.includes('seed') || s.includes('up')) {
      return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
    }
    if (s.includes('pause') || s.includes('stop')) {
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    }
    if (s.includes('error') || s.includes('stall')) {
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    }
    return 'bg-slate-700/30 text-slate-400 border-slate-700/50';
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div ref={headerRef} className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 sm:gap-3 !mb-0">
            <DownloadCloud className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-400" /> <span className="truncate">Downloads</span>
          </h1>
          <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block">Monitor and manage active downloads across connected clients in real-time.</p>
        </div>
      </div>

      <StickyBar visible={stickyVisible}>
        <div className="flex items-center gap-3 ml-auto sm:hidden text-xs">
          <span className="font-bold text-slate-300">{downloads.length} active</span>
          <span className="flex items-center gap-1 text-emerald-400"><ArrowDown className="w-3 h-3" />{formatSpeed(stats.dl_info_speed)}</span>
          <span className="flex items-center gap-1 text-slate-400"><ArrowUp className="w-3 h-3" />{formatSpeed(stats.up_info_speed)}</span>
        </div>
      </StickyBar>

      <div className="hidden sm:grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-2xl flex items-center space-x-4 border-l-4 border-l-emerald-500 shadow-lg shadow-black/10">
          <div className="p-3.5 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
            <DownloadCloud className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Downloads</p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-3xl font-black text-slate-100">{downloads.length}</p>
              <div className="flex flex-col text-xs font-mono text-emerald-400 text-right space-y-0.5">
                <span className="flex items-center justify-end gap-1.5 font-bold"><ArrowDown className="w-3.5 h-3.5" /> {formatSpeed(stats.dl_info_speed)}</span>
                <span className="flex items-center justify-end gap-1.5 text-slate-400"><ArrowUp className="w-3.5 h-3.5" /> {formatSpeed(stats.up_info_speed)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl flex items-center space-x-4 border-l-4 border-l-cyan-500 shadow-lg shadow-black/10">
          <div className="p-3.5 bg-cyan-500/10 rounded-xl text-cyan-400 border border-cyan-500/20">
            <Activity className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Session Transfer</p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-sm font-semibold text-slate-400">Total Traffic</p>
              <div className="flex flex-col text-xs font-mono text-cyan-400 text-right space-y-0.5">
                <span className="flex items-center justify-end gap-1.5 font-bold"><ArrowDown className="w-3.5 h-3.5" /> {formatBytes(stats.dl_info_data)}</span>
                <span className="flex items-center justify-end gap-1.5 text-slate-400"><ArrowUp className="w-3.5 h-3.5" /> {formatBytes(stats.up_info_data)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {downloads.length > 0 ? (
        <div className="glass-panel p-6 rounded-2xl border border-white/5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <DownloadCloud className="w-5 h-5 text-emerald-400" /> Live Queue
            </h2>
            <span className="text-xs font-medium text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-white/5">
              {downloads.length} {downloads.length === 1 ? 'task' : 'tasks'} running
            </span>
          </div>
          <div className="space-y-3.5">
            {downloads.map(t => {
              const totalSize = t.total_size || t.size || 0;
              const progressPct = Math.min(100, Math.max(0, Math.round((t.progress || 0) * 100)));
              const eta = formatEta(totalSize, t.progress || 0, t.dlspeed || 0);

              return (
                <div key={t.hash} className="bg-slate-900/60 hover:bg-slate-900/90 transition-colors p-4.5 rounded-xl border border-white/5 space-y-2.5">
                  <div className="flex justify-between items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-100 truncate hover:text-cyan-300 transition-colors" title={t.name}>
                        {t.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {t.dlspeed > 0 && (
                        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          {formatSpeed(t.dlspeed)}
                        </span>
                      )}
                      <button 
                        onClick={async () => {
                          if (await customConfirm('Cancel and delete this download?')) {
                            try {
                              await api.delete(`/clients/torrents/${t.hash}?deleteFiles=true`);
                              setDownloads(prev => prev.filter(d => d.hash !== t.hash));
                              customAlert('Download cancelled');
                            } catch (e) {
                              console.error('Failed to delete download', e);
                              customAlert('Failed to cancel download', 'error');
                            }
                          }
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all border border-transparent hover:border-rose-500/20"
                        title="Cancel Download"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar with Gradient & Shimmer */}
                  <div className="w-full bg-slate-800/80 rounded-full h-2.5 overflow-hidden ring-1 ring-white/5 relative">
                    <div 
                      className="bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 h-2.5 rounded-full transition-all duration-500 relative" 
                      style={{ width: `${progressPct}%` }}
                    >
                      {t.dlspeed > 0 && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border ${getStateBadge(t.state)}`}>
                        {t.state || 'Active'}
                      </span>
                      <span>Size: <strong className="text-slate-300 font-mono">{formatBytes(totalSize)}</strong></span>
                      {eta && <span className="text-cyan-400 font-medium">· {eta}</span>}
                    </div>
                    <span className="font-mono font-bold text-slate-200">{progressPct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="glass-panel flex flex-col items-center justify-center h-[320px] text-slate-400 rounded-2xl relative overflow-hidden border border-white/5 shadow-xl">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-800/20 to-transparent"></div>
          <div className="relative z-10 flex flex-col items-center text-center max-w-sm px-4">
            <div className="p-4 bg-slate-800/60 rounded-2xl mb-4 ring-1 ring-white/10 shadow-xl text-emerald-400">
              <DownloadCloud className="w-10 h-10" />
            </div>
            <h3 className="text-base font-bold text-slate-200">No Active Downloads</h3>
            <p className="text-xs text-slate-400 mt-1">When media downloads are triggered, their real-time progress and speeds will appear here.</p>
          </div>
        </div>
      )}
    </div>
  );
}
