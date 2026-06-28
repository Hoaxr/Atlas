import { useState, useEffect } from 'react';
import { Plus, Trash2, FileText, CheckCircle2, AlertCircle, Edit2, PlayCircle, Loader2, Search, Edit3 } from 'lucide-react';
import CustomSelect from '../../components/shared/CustomSelect';
import api from '../../lib/api';
import { customAlert } from '../../utils/alerts';

export default function IndexersTab({ indexers, setIndexers, handleAddEntity, handleDeleteEntity, fetchSettings, settings, setSettings, handleSave }) {
  const [newIndexer, setNewIndexer] = useState({ name: '', url: '', api_key: '', type: 'generic' });
  const [editingId, setEditingId] = useState(null);
  const [statuses, setStatuses] = useState({});
  const [isTesting, setIsTesting] = useState(false);

  const testIndexers = async () => {
    setIsTesting(true);
    try {
      const res = await api.get('/settings/indexers/test');
      setStatuses(res.data.data);
    } catch (e) {
      customAlert('Failed to test indexers', 'error');
    }
    setIsTesting(false);
  };

  const [isTestingFs, setIsTestingFs] = useState(false);
  const testFlareSolverr = async () => {
    setIsTestingFs(true);
    try {
      const res = await api.post('/settings/indexers/test-flaresolverr', { url: settings.flareSolverrUrl });
      if (res.data.status === 'success' && res.data.data.status === 'ok') {
        customAlert('Successfully connected to FlareSolverr!', 'success');
      } else {
        customAlert('FlareSolverr returned an unexpected response.', 'error');
      }
    } catch (e) {
      customAlert('Failed to connect to FlareSolverr.', 'error');
    }
    setIsTestingFs(false);
  };

  useEffect(() => {
    if (indexers && indexers.length > 0) {
      testIndexers();
    }
  }, [indexers]);

  const handleUpdate = async () => {
    if (!newIndexer.name || !newIndexer.url) {
      customAlert('Name and URL are required', 'error');
      return;
    }
    try {
      await api.put(`/settings/indexers/${editingId}`, newIndexer);
      customAlert('Indexer updated successfully', 'success');
      setEditingId(null);
      setNewIndexer({ name: '', url: '', api_key: '', type: 'generic' });
      if (fetchSettings) fetchSettings(); 
    } catch (e) {
      customAlert('Failed to update indexer', 'error');
    }
  };

  const handleAdd = async () => {
    if (!newIndexer.name || !newIndexer.url) {
      customAlert('Name and URL are required', 'error');
      return;
    }
    await handleAddEntity('indexers', newIndexer);
    setNewIndexer({ name: '', url: '', api_key: '', type: 'generic' });
    testIndexers();
  };

  const startEdit = (idx) => {
    setEditingId(idx.id);
    setNewIndexer({ name: idx.name, url: idx.url, api_key: idx.api_key || '', type: idx.type || 'generic' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewIndexer({ name: '', url: '', api_key: '', type: 'generic' });
  };

  const applyPreset = (name) => {
    const presets = {
      'Jackett': { name: 'Jackett', url: 'http://localhost:9117/api/v2.0/indexers/all/results/torznab/', type: 'torznab', api_key: '' },
      'Prowlarr': { name: 'Prowlarr', url: 'http://localhost:9696/api/v1/search', type: 'torznab', api_key: '' },
      '1337x': { name: '1337x', url: 'https://1337x.to', type: 'generic', api_key: '' },
      'YTS': { name: 'YTS', url: 'https://yts.mx', type: 'generic', api_key: '' },
      'ThePirateBay': { name: 'ThePirateBay', url: 'https://apibay.org', type: 'generic', api_key: '' },
      'Nyaa.si': { name: 'Nyaa', url: 'https://nyaa.si', type: 'generic', api_key: '' },
      'TorrentGalaxy': { name: 'TorrentGalaxy', url: 'https://torrentgalaxy.mx', type: 'generic', api_key: '' },
      'EZTV': { name: 'EZTV', url: 'https://eztvx.to', type: 'generic', api_key: '' }
    };
    if (presets[name]) {
      setNewIndexer(presets[name]);
      if (editingId) setEditingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold text-purple-400 flex items-center gap-2">
          <Search className="w-7 h-7" /> Indexers
        </h2>
        <button 
          onClick={testIndexers} 
          disabled={isTesting || indexers.length === 0}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
        >
          {isTesting ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}
          Test All
        </button>
      </div>

      <div className="bg-purple-500/10 border border-purple-500/20 text-purple-400 p-4 rounded-xl mb-6 flex gap-3 text-sm">
        <FileText className="w-5 h-5 shrink-0" />
        <p>Indexers provide search results. Use generic web scrapers or Torznab APIs (like Jackett or Prowlarr) for the best experience.</p>
      </div>

      {/* FlareSolverr Section */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg text-slate-200 flex items-center gap-2">Cloudflare Bypass</h3>
            <p className="text-sm text-slate-400 mt-1">Configure a FlareSolverr URL to bypass aggressive Cloudflare protections on generic web scrapers.</p>
          </div>
        </div>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-300 mb-2">FlareSolverr URL (e.g. http://localhost:8191)</label>
            <input 
              type="text" 
              placeholder="Leave empty to disable" 
              className="glass-input w-full" 
              value={settings?.flareSolverrUrl || ''} 
              onChange={(e) => setSettings({ ...settings, flareSolverrUrl: e.target.value })} 
            />
          </div>
          <button 
            onClick={testFlareSolverr} 
            disabled={!settings?.flareSolverrUrl || isTestingFs}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50 h-[42px]"
          >
            {isTestingFs ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            Test
          </button>
          <button 
            onClick={handleSave} 
            className="bg-purple-500 hover:bg-purple-400 text-white font-bold px-6 py-2.5 rounded-xl transition-all h-[42px]"
          >
            Save
          </button>
        </div>
      </div>
      
      <div className="glass-panel p-8 rounded-2xl border border-white/10 space-y-6 mb-8 shadow-xl relative overflow-hidden">
        <h3 className="font-bold text-lg text-slate-200">{editingId ? 'Edit Indexer' : 'Add New Indexer'}</h3>
        
        {!editingId && (
          <div className="flex flex-wrap gap-2">
            <span className="text-sm font-medium text-slate-400 flex items-center mr-2">Presets:</span>
            {['Jackett', 'Prowlarr', '1337x', 'YTS', 'ThePirateBay', 'Nyaa.si', 'TorrentGalaxy', 'EZTV'].map(name => (
              <button 
                key={name}
                onClick={() => applyPreset(name)}
                className="text-sm bg-slate-800/80 hover:bg-purple-500/20 text-slate-300 hover:text-purple-400 border border-white/5 hover:border-purple-500/30 px-4 py-1.5 rounded-full transition-all"
              >
                {name}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-slate-400 mb-2">Name</label>
            <input type="text" placeholder="e.g. Jackett" className="glass-input w-full" value={newIndexer.name} onChange={e => setNewIndexer({...newIndexer, name: e.target.value})} />
          </div>
          <div className="md:col-span-4">
            <label className="block text-sm font-medium text-slate-400 mb-2">Base URL</label>
            <input type="text" placeholder="e.g. http://localhost:9117..." className="glass-input w-full" value={newIndexer.url} onChange={e => setNewIndexer({...newIndexer, url: e.target.value})} />
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-slate-400 mb-2">API Key</label>
            <input type="text" placeholder="(Optional)" className="glass-input w-full" value={newIndexer.api_key} onChange={e => setNewIndexer({...newIndexer, api_key: e.target.value})} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-400 mb-2">Type</label>
            <CustomSelect 
              value={newIndexer.type} 
              onChange={e => setNewIndexer({...newIndexer, type: e.target.value})}
              options={[
                { label: 'Generic', value: 'generic' },
                { label: 'Torznab', value: 'torznab' }
              ]}
            />
          </div>
          <div className="md:col-span-12 flex gap-3 justify-end mt-2">
            {editingId && (
              <button onClick={cancelEdit} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2.5 px-6 rounded-xl transition-all">
                Cancel
              </button>
            )}
            <button 
              onClick={editingId ? handleUpdate : handleAdd} 
              className="bg-purple-500 hover:bg-purple-400 text-white font-bold py-2.5 px-6 rounded-xl flex justify-center items-center gap-2 shadow-lg shadow-purple-500/20 transition-all"
            >
              <Plus className="w-5 h-5" /> {editingId ? 'Save' : 'Add'}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {indexers.length === 0 ? <p className="text-slate-500 italic p-4 text-center">No indexers configured yet.</p> : indexers.map(idx => {
          const status = statuses[idx.id];
          return (
          <div key={idx.id} className="flex justify-between items-center glass-panel p-5 rounded-2xl border border-white/5 hover:border-purple-500/30 transition-colors group shadow-lg">
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center justify-center">
                {status === 'live' ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : 
                 status === 'offline' ? <AlertCircle className="w-6 h-6 text-red-400" /> :
                 status === 'error_auth' ? <AlertCircle className="w-6 h-6 text-amber-400" title="Authentication failed" /> :
                 <div className="w-6 h-6 rounded-full border-2 border-slate-600 border-t-slate-400 animate-spin" />}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <p className="text-base font-bold text-slate-200">{idx.name}</p>
                  <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">{idx.type || 'generic'}</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">{idx.url}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => startEdit(idx)} className="text-slate-400 hover:text-purple-400 p-2 transition-colors"><Edit2 className="w-5 h-5" /></button>
              <button onClick={() => handleDeleteEntity('indexers', idx.id)} className="text-red-400/50 hover:text-red-400 p-2 transition-colors"><Trash2 className="w-5 h-5" /></button>
            </div>
          </div>
        )})}
      </div>
    </div>
  );
}
