import { Plus, Trash2, Download, Save, Info, CheckSquare, Square, Search } from 'lucide-react';
import api from '../../lib/api';
import { customAlert } from '../../utils/alerts';
import CustomSelect from '../../components/shared/CustomSelect';

export default function ClientsTab({ clients, newClient, setNewClient, clientStatuses, handleAddEntity, handleDeleteEntity, settings, setSettings, handleSave }) {
  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <h2 className="text-2xl font-bold text-emerald-400 flex items-center gap-2">
        <Download className="w-7 h-7" /> Download Clients
      </h2>
      <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-6 mb-8 shadow-xl relative overflow-hidden">
        <h3 className="font-bold text-lg text-slate-200">Global Preferences</h3>
        <p className="text-xs text-slate-500">Configure global download behavior, cleanup rules, and remote path mappings for your download clients.</p>
        
        <div className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl bg-slate-900/50 border border-white/5 hover:border-emerald-500/30 transition-colors group">
            <div className="mt-0.5">
              <input type="checkbox" className="sr-only" checked={settings?.hideCompletedDownloads || false} onChange={e => setSettings({...settings, hideCompletedDownloads: e.target.checked})} />
              {settings?.hideCompletedDownloads ? <CheckSquare className="w-5 h-5 text-emerald-400" /> : <Square className="w-5 h-5 text-slate-500" />}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">Hide Completed Downloads from UI</p>
              <p className="text-xs text-slate-400 mt-1">Hides 100% completed/seeding torrents from the Downloads page.</p>
            </div>
          </label>
          
          <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl bg-slate-900/50 border border-white/5 hover:border-emerald-500/30 transition-colors group">
            <div className="mt-0.5">
              <input type="checkbox" className="sr-only" checked={settings?.removeCompletedDownloads || false} onChange={e => setSettings({...settings, removeCompletedDownloads: e.target.checked})} />
              {settings?.removeCompletedDownloads ? <CheckSquare className="w-5 h-5 text-emerald-400" /> : <Square className="w-5 h-5 text-slate-500" />}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">Remove Torrents When Finished</p>
              <p className="text-xs text-slate-400 mt-1">Automatically tells your download client to remove the torrent once Atlas has imported it.</p>
            </div>
          </label>

          {settings?.removeCompletedDownloads && (
            <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl bg-red-900/20 border border-red-500/20 hover:border-red-500/40 transition-colors group ml-8">
              <div className="mt-0.5">
                <input type="checkbox" className="sr-only" checked={settings?.deleteTorrentFiles || false} onChange={e => setSettings({...settings, deleteTorrentFiles: e.target.checked})} />
                {settings?.deleteTorrentFiles ? <CheckSquare className="w-5 h-5 text-red-500" /> : <Square className="w-5 h-5 text-red-900/50" />}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-200 group-hover:text-red-400 transition-colors">Also Delete Files (Warning)</p>
                <p className="text-xs text-red-400/80 mt-1">Permanently deletes the original downloaded file from the torrent folder. This will stop the torrent from seeding, but cleans up your downloads directory regardless of whether you use hardlinks or copies.</p>
              </div>
            </label>
          )}
          
          <div className="p-4 rounded-xl bg-slate-900/50 border border-white/5 mt-6">
            <h4 className="text-sm font-bold text-slate-200 mb-2">Remote Path Mapping</h4>
            <p className="text-xs text-slate-400 mb-4">If your download client runs on a different machine or inside Docker, Atlas needs to know how to map the client's path to a local path.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Remote Path (e.g. /downloads/)</label>
                <input 
                  type="text" 
                  className="glass-input w-full text-sm py-2" 
                  value={(settings?.downloadPathMapping || ['', ''])[0]} 
                  onChange={e => {
                    const newMapping = [...(settings?.downloadPathMapping || ['', ''])];
                    newMapping[0] = e.target.value;
                    setSettings({...settings, downloadPathMapping: newMapping});
                  }} 
                  placeholder="Path reported by download client" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Local Path (e.g. /data/downloads/)</label>
                <input 
                  type="text" 
                  className="glass-input w-full text-sm py-2" 
                  value={(settings?.downloadPathMapping || ['', ''])[1]} 
                  onChange={e => {
                    const newMapping = [...(settings?.downloadPathMapping || ['', ''])];
                    newMapping[1] = e.target.value;
                    setSettings({...settings, downloadPathMapping: newMapping});
                  }} 
                  placeholder="Path Atlas can access" 
                />
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await api.get('/settings/clients/detect-mapping');
                  if (res.data.status === 'success' && res.data.data) {
                    setSettings({...settings, downloadPathMapping: res.data.data});
                    customAlert('Mapping detected: ' + res.data.data.join(' → '), 'success');
                  } else {
                    customAlert('Could not detect mapping — set it manually', 'error');
                  }
                } catch {
                  customAlert('Detection failed', 'error');
                }
              }}
              className="text-xs text-cyan-400 hover:text-cyan-300 underline mt-2"
            >
              Auto-detect mapping
            </button>
          </div>
        </div>
        <div className="flex justify-end">
          <button onClick={handleSave} className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all">
            <Save className="w-5 h-5" /> Save Changes
          </button>
        </div>      </div>
      
      <div className="glass-panel p-8 rounded-2xl border border-white/10 space-y-6 mb-8 shadow-xl relative z-10">
        <h3 className="font-bold text-lg text-slate-200">Add New Client</h3>
        <p className="text-xs text-slate-500">Add a download client for Atlas to send downloads to.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Name</label>
            <input type="text" placeholder="e.g. My Downloader" className="glass-input w-full" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Type</label>
            <CustomSelect
              value={newClient.type || 'qbittorrent'}
              onChange={(e) => setNewClient({...newClient, type: e.target.value})}
              options={[
                { label: 'qBittorrent', value: 'qbittorrent' },
                { label: 'Deluge', value: 'deluge' },
                { label: 'Transmission', value: 'transmission' },
                { label: 'rTorrent', value: 'rtorrent' },
                { label: 'NZBGet', value: 'nzbget' },
                { label: 'SABnzbd', value: 'sabnzbd' },
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Host URL</label>
            <input type="text" placeholder="e.g. http://localhost" className="glass-input w-full" value={newClient.host} onChange={e => setNewClient({...newClient, host: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Port</label>
            <input type="number" placeholder="e.g. 8080" className="glass-input w-full" value={newClient.port} onChange={e => setNewClient({...newClient, port: parseInt(e.target.value)})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Username</label>
            <input type="text" placeholder="Username" className="glass-input w-full" value={newClient.username} onChange={e => setNewClient({...newClient, username: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Password</label>
            <input type="password" placeholder="Password" className="glass-input w-full" value={newClient.password} onChange={e => setNewClient({...newClient, password: e.target.value})} />
          </div>
          <div className="flex items-end">
            <button onClick={() => handleAddEntity('clients', newClient)} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 px-4 rounded-xl flex justify-center items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all">
              <Plus className="w-5 h-5" /> Add Client
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {clients.length === 0 ? <p className="text-slate-500 italic p-4 text-center">No clients configured yet.</p> : clients.map(c => (
          <div key={c.id} className="flex justify-between items-center glass-panel p-5 rounded-2xl border border-white/5 hover:border-emerald-500/30 transition-colors group shadow-lg">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-base font-bold text-slate-200">{c.name}</p>
                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">{c.type}</span>
                {clientStatuses[c.id] === 'live' && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Live
                  </span>
                )}
                {clientStatuses[c.id] === 'offline' && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span> Offline
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-1">{c.host}:{c.port}</p>
            </div>
            <button onClick={() => handleDeleteEntity('clients', c.id)} className="text-red-400 hover:text-red-300 p-2"><Trash2 className="w-5 h-5" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
