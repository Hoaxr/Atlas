import { useState, useEffect } from 'react';
import api from '../lib/api';
import { DownloadCloud, ArrowDown, ArrowUp, Activity } from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';

export default function Downloads() {
  const [downloads, setDownloads] = useState([]);
  const [stats, setStats] = useState({ dl_info_speed: 0, up_info_speed: 0 });

  useEffect(() => {
    fetchClientData();
    const interval = setInterval(fetchClientData, 3000);
    return () => clearInterval(interval);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 sm:gap-3">
            <DownloadCloud className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-400" /> Downloads
          </h1>
          <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block">Manage your active download client tasks.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-2xl flex items-center space-x-4 border-l-4 border-l-emerald-500">
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
            <DownloadCloud className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-400">Active Torrents</p>
            <div className="flex items-center justify-between">
              <p className="text-2xl font-bold text-slate-100">{downloads.length}</p>
              <div className="flex flex-col text-xs font-mono text-emerald-400 text-right">
                <span className="flex items-center justify-end gap-1"><ArrowDown className="w-3 h-3" /> {formatSpeed(stats.dl_info_speed)}</span>
                <span className="flex items-center justify-end gap-1 text-slate-400"><ArrowUp className="w-3 h-3" /> {formatSpeed(stats.up_info_speed)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl flex items-center space-x-4 border-l-4 border-l-indigo-500">
          <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-400">
            <Activity className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-400">Global Transfer</p>
            <div className="flex items-center justify-end h-8">
              <div className="flex flex-col text-xs font-mono text-indigo-400 text-right">
                <span className="flex items-center justify-end gap-1"><ArrowDown className="w-3 h-3" /> {formatBytes(stats.dl_info_data)}</span>
                <span className="flex items-center justify-end gap-1 text-slate-400"><ArrowUp className="w-3 h-3" /> {formatBytes(stats.up_info_data)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {downloads.length > 0 ? (
        <div className="glass-panel p-6 rounded-2xl border border-emerald-500/20">
          <h2 className="text-lg font-bold text-emerald-400 mb-4 flex items-center gap-2">
            <DownloadCloud className="w-5 h-5" /> Live Downloads
          </h2>
          <div className="space-y-4">
            {downloads.map(t => (
              <div key={t.hash} className="bg-slate-900/50 p-4 rounded-xl border border-white/5">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-bold text-slate-200 truncate pr-4">{t.name}</p>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono text-emerald-400">{formatSpeed(t.dlspeed)}</span>
                    <button 
                      onClick={async () => {
                        if (await customConfirm('Delete this download?')) {
                          try {
                            await api.delete(`/clients/torrents/${t.hash}?deleteFiles=true`);
                            fetchClientData();
                            customAlert('Download cancelled');
                          } catch (e) {
                            console.error('Failed to delete download', e);
                            customAlert('Failed to cancel download', 'error');
                          }
                        }
                      }}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                      title="Cancel Download"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div className="bg-emerald-500 h-2.5 rounded-full transition-all duration-1000" style={{ width: `${Math.round(t.progress * 100)}%` }}></div>
                </div>
                <div className="flex justify-between mt-2 text-xs text-slate-500">
                  <span><span className="uppercase">{t.state}</span> • File Size: {formatBytes(t.total_size || t.size || 0)}</span>
                  <span>{Math.round(t.progress * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="glass-panel flex flex-col items-center justify-center h-[300px] text-slate-400 rounded-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-800/20 to-transparent"></div>
          <div className="relative z-10 flex flex-col items-center">
            <div className="p-4 bg-slate-800/50 rounded-full mb-4 ring-1 ring-white/5 shadow-lg shadow-black/20">
              <DownloadCloud className="w-10 h-10 text-slate-500" />
            </div>
            <p className="text-sm font-medium">No active downloads at the moment.</p>
          </div>
        </div>
      )}
    </div>
  );
}
