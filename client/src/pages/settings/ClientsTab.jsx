import { Plus, Trash2, Download, Save, CheckSquare, Square } from 'lucide-react';
import api from '../../lib/api';
import { customAlert } from '../../utils/alerts';
import CustomSelect from '../../components/shared/CustomSelect';
import PasswordInput from '../../components/shared/PasswordInput';
import Button from '../../components/shared/Button';
import { SettingsSection, SettingsHeader, SettingsGroup, SettingsLabel, SettingsHelper } from '../../components/settings/layout';
import ToggleRow from '../../components/shared/ToggleRow';

export default function ClientsTab({ clients, newClient, setNewClient, clientStatuses, handleAddEntity, handleDeleteEntity, settings, setSettings }) {
  return (
    <div className="w-full space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg sm:text-xl font-bold font-display text-slate-100 flex items-center gap-2.5 mb-1.5">
          <Download className="w-5 h-5 text-cyan-400 shrink-0" /> Download Clients
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
          Manage your download clients and global download preferences.
        </p>
      </div>

      {/* Global Preferences */}
      <SettingsSection>
        <SettingsHeader 
          title="Download Preferences" 
          icon={Download}
          description="Configure global download behavior, cleanup rules, and remote path mappings."
        />
        
        <div className="space-y-3">
          <ToggleRow
            checked={settings?.hideCompletedDownloads || false}
            onChange={e => setSettings({...settings, hideCompletedDownloads: e.target.checked})}
            title="Hide Completed Downloads from UI"
            description="Hides 100% completed/seeding torrents from the Downloads page."
          />
          
          <ToggleRow
            checked={settings?.removeCompletedDownloads || false}
            onChange={e => setSettings({...settings, removeCompletedDownloads: e.target.checked})}
            title="Remove Torrents When Finished"
            description="Automatically tells your download client to remove the torrent once Atlas has imported it."
          />

          {settings?.removeCompletedDownloads && (
            <div className="ml-4 sm:ml-6">
              <ToggleRow
                checked={settings?.deleteTorrentFiles || false}
                onChange={e => setSettings({...settings, deleteTorrentFiles: e.target.checked})}
                title="Also Delete Files (Warning)"
                description="Permanently deletes the original downloaded file from the torrent folder. Stops seeding but cleans up storage."
                className="!bg-rose-950/20 !border-rose-900/40 hover:!border-rose-800/60"
              />
            </div>
          )}
          
          <div className="p-4 rounded-xl bg-[#101e31] border border-[#1c2d46] mt-4 space-y-3">
            <div>
              <h4 className="text-sm font-bold font-display text-slate-200 mb-0.5">Remote Path Mapping</h4>
              <p className="text-xs text-slate-400">If your download client runs on a different machine or inside Docker, Atlas needs to map the reported path to a local mount.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <SettingsLabel title="Remote Path (e.g. /downloads/)" />
                <input 
                  type="text" 
                  className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600" 
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
                <SettingsLabel title="Local Path (e.g. /data/downloads/)" />
                <input 
                  type="text" 
                  className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600" 
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
                  if (res.data?.status === 'success' && res.data.data) {
                    const { remotePath, localPath } = res.data.data;
                    setSettings({ ...settings, downloadPathMapping: [remotePath, localPath] });
                    customAlert(`Auto-detected mapping: ${remotePath} → ${localPath}`, 'success');
                  } else {
                    customAlert(res.data?.message || 'Could not auto-detect path mapping', 'info');
                  }
                } catch {
                  customAlert('Failed to auto-detect path mapping', 'error');
                }
              }}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold underline pt-1 inline-block"
            >
              Auto-detect path mapping
            </button>
          </div>
        </div>
      </SettingsSection>
      
      {/* Add New Client */}
      <SettingsSection>
        <SettingsHeader 
          title="Add Download Client" 
          icon={Plus}
          description="Add a torrent or Usenet client for Atlas to dispatch download packages to."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <SettingsLabel title="Name" />
            <input type="text" placeholder="e.g. My Downloader" className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} />
          </div>
          <div>
            <SettingsLabel title="Type" />
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
            <SettingsLabel title="Host URL" />
            <input type="text" placeholder="e.g. http://localhost" className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600" value={newClient.host} onChange={e => setNewClient({...newClient, host: e.target.value})} />
          </div>
          <div>
            <SettingsLabel title="Port" />
            <input type="number" placeholder="e.g. 8080" className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600" value={newClient.port} onChange={e => setNewClient({...newClient, port: parseInt(e.target.value)})} />
          </div>
          <div>
            <SettingsLabel title="Username" />
            <input type="text" placeholder="Username" className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600" value={newClient.username} onChange={e => setNewClient({...newClient, username: e.target.value})} />
          </div>
          <div>
            <SettingsLabel title="Password" />
            <PasswordInput placeholder="Password" className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600" value={newClient.password} onChange={e => setNewClient({...newClient, password: e.target.value})} />
          </div>
          <div className="flex items-end md:col-span-3">
            <Button
              variant="primary"
              onClick={() => {
                if (!newClient.name?.trim()) {
                  customAlert('Please enter a name for the download client.', 'error');
                  return;
                }
                if (!newClient.host?.trim()) {
                  customAlert('Please enter a host URL (e.g. http://localhost).', 'error');
                  return;
                }
                handleAddEntity('clients', newClient);
              }}
              icon={Plus}
            >
              Add Client
            </Button>
          </div>
        </div>
      </SettingsSection>

      {/* Existing Clients List */}
      <div className="space-y-3">
        {clients.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 text-center border border-white/10">
            <p className="text-xs text-slate-400 font-medium">No download clients configured yet.</p>
          </div>
        ) : (
          clients.map(c => (
            <div key={c.id} className="flex justify-between items-center rounded-xl border border-[#1c2d46] bg-[#101e31] p-4 transition-colors hover:border-[#274063]">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{
                  backgroundColor: clientStatuses[c.id] === 'live' ? '#34d399' : clientStatuses[c.id] === 'offline' ? '#f87171' : '#64748b'
                }} />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-200">{c.name}</p>
                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/60 uppercase">{c.type}</span>
                    {clientStatuses[c.id] === 'live' && (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">Live</span>
                    )}
                    {clientStatuses[c.id] === 'offline' && (
                      <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">Offline</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{c.host}:{c.port}</p>
                </div>
              </div>
              <button 
                onClick={() => handleDeleteEntity('clients', c.id)} 
                className="text-slate-500 hover:text-rose-400 p-2 rounded-lg hover:bg-rose-500/10 transition-colors"
                title="Remove client"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
