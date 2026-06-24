import { useState, useEffect } from 'react';
import axios from 'axios';
import { DownloadCloud, ArrowDown, ArrowUp } from 'lucide-react';
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
        axios.get('http://localhost:3000/api/clients/stats'),
        axios.get('http://localhost:3000/api/clients/torrents')
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

  const formatSpeed = (bytes) => {
    if (!bytes || bytes === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-100 flex items-center gap-3">
            <DownloadCloud className="w-8 h-8 text-emerald-400" /> Downloads
          </h1>
          <p className="text-slate-400 mt-1">Manage your active download client tasks.</p>
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
                            await axios.delete(`http://localhost:3000/api/clients/torrents/${t.hash}?deleteFiles=true`);
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
                  <span className="uppercase">{t.state}</span>
                  <span>{Math.round(t.progress * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-[300px] text-slate-500 border-2 border-dashed border-slate-700/50 rounded-xl">
          <DownloadCloud className="w-12 h-12 mb-4 opacity-50" />
          <p>No active downloads at the moment.</p>
        </div>
      )}
    </div>
  );
}
