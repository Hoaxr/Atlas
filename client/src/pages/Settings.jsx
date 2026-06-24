import { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, AlertCircle, CheckCircle2, Trash2, RefreshCw, Plus, Key, Search, Download, Settings2, FileText, FolderTree, Languages } from 'lucide-react';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('apis');
  const [settings, setSettings] = useState({
    tmdbApiKey: '',
    traktClientId: '',
    osApiKey: '',
    geminiApiKey: '',
    targetLang: 'Dutch'
  });
  const [paths, setPaths] = useState([]);
  const [indexers, setIndexers] = useState([]);
  const [clients, setClients] = useState([]);
  const [profiles, setProfiles] = useState([]);

  const [newPath, setNewPath] = useState('');
  const [newIndexer, setNewIndexer] = useState({ name: '', url: '', api_key: '', type: 'torznab' });
  const [newClient, setNewClient] = useState({ name: '', host: '', port: 8080, username: '', password: '', type: 'qbittorrent' });
  const [newProfile, setNewProfile] = useState({ name: '', qualities: ['720p', '1080p', '2160p'], cutoff: '1080p', upgrade_allowed: true });
  const [editingProfile, setEditingProfile] = useState(null);

  const [status, setStatus] = useState({ type: '', message: '' });
  const [isScanning, setIsScanning] = useState(false);
  const [clientStatuses, setClientStatuses] = useState({});

  useEffect(() => {
    fetchSettings();
    fetchPaths();
    testClients();
    const interval = setInterval(testClients, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const testClients = async () => {
    try {
      const res = await axios.get('http://localhost:3000/api/settings/clients/test');
      if (res.data.status === 'success') {
        setClientStatuses(res.data.data);
      }
    } catch(err) {}
  };

  const fetchSettings = async () => {
    try {
      const res = await axios.get('http://localhost:3000/api/settings');
      if (res.data.status === 'success') {
        setSettings({
          tmdbApiKey: res.data.data.tmdbApiKey || '',
          traktClientId: res.data.data.traktClientId || '',
          osApiKey: res.data.data.osApiKey || '',
          geminiApiKey: res.data.data.geminiApiKey || '',
          targetLang: res.data.data.targetLang || 'Dutch'
        });
        setIndexers(res.data.data.indexers || []);
        setClients(res.data.data.clients || []);
        
        // Parse qualities safely
        const parsedProfiles = (res.data.data.profiles || []).map(p => {
          let parsedQualities = ['1080p'];
          try {
            if (p.qualities) parsedQualities = JSON.parse(p.qualities);
          } catch(e) {}
          return { ...p, qualities: parsedQualities, upgrade_allowed: p.upgrade_allowed !== 0 };
        });
        setProfiles(parsedProfiles);
      }
    } catch (err) {
      console.error('Failed to fetch settings', err);
    }
  };

  const fetchPaths = async () => {
    try {
      const res = await axios.get('http://localhost:3000/api/library/paths');
      if (res.data.status === 'success') setPaths(res.data.data);
    } catch (err) {}
  };

  const handleSave = async () => {
    try {
      await axios.post('http://localhost:3000/api/settings', settings);
      setStatus({ type: 'success', message: 'Settings saved!' });
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to save settings.' });
    }
  };

  const handleAddEntity = async (endpoint, payload, fetcher) => {
    try {
      await axios.post(`http://localhost:3000/api/settings/${endpoint}`, payload);
      fetchSettings();
      setStatus({ type: 'success', message: 'Added successfully!' });
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to add.' });
    }
  };

  const handleDeleteEntity = async (endpoint, id) => {
    try {
      await axios.delete(`http://localhost:3000/api/settings/${endpoint}/${id}`);
      fetchSettings();
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to delete.' });
    }
  };

  const handleAddPath = async () => {
    if (!newPath.trim()) return;
    try {
      await axios.post('http://localhost:3000/api/library/paths', { path: newPath.trim() });
      setNewPath('');
      fetchPaths();
    } catch (err) {}
  };

  const handleScan = async () => {
    setIsScanning(true);
    setStatus({ type: '', message: '' });
    try {
      const res = await axios.post('http://localhost:3000/api/library/scan');
      setStatus({ type: 'success', message: res.data.message });
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to scan library.' });
    } finally {
      setIsScanning(false);
      setTimeout(() => setStatus({ type: '', message: '' }), 5000);
    }
  };

  const TABS = [
    { id: 'apis', label: "API's & Integrations", icon: <Key className="w-4 h-4" /> },
    { id: 'indexers', label: "Indexers", icon: <Search className="w-4 h-4" /> },
    { id: 'clients', label: "Download Clients", icon: <Download className="w-4 h-4" /> },
    { id: 'profiles', label: "Quality Profiles", icon: <Settings2 className="w-4 h-4" /> },
    { id: 'subtitles', label: "Subtitles & AI Translation", icon: <Languages className="w-4 h-4" /> },
    { id: 'library', label: "Library Management", icon: <FolderTree className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-6rem)]">
      <div className="glass-panel flex h-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
        {/* Sidebar Menu */}
        <div className="w-72 bg-slate-950/50 border-r border-white/5 p-6 space-y-2 overflow-y-auto flex-shrink-0">
          <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400 mb-8 px-2">Settings</h2>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-medium text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${activeTab === tab.id ? 'bg-cyan-500/10 text-cyan-400 shadow-[inset_0_0_10px_rgba(6,182,212,0.1)] border border-cyan-500/20' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'}`}
            >
              <div className={activeTab === tab.id ? 'text-cyan-400' : 'text-slate-500'}>
                {tab.icon}
              </div>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 p-10 overflow-y-auto bg-slate-900/20 relative space-y-6">
          {status.message && (
            <div className={`flex items-center space-x-2 p-4 rounded-xl ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <span className="font-medium">{status.message}</span>
            </div>
          )}

        {activeTab === 'apis' && (
          <div className="max-w-3xl space-y-2">
            <h2 className="text-2xl font-bold text-cyan-400 mb-2">API's & Integrations</h2>
            <div className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 p-4 rounded-xl mb-6 flex gap-3 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>This is the core of the application. The TMDB API is required for fetching metadata, posters, and discovering new media. Trakt is required for fetching trending lists.</p>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="flex justify-between items-center text-sm font-medium text-slate-300">
                  <span>TMDB API Key</span>
                  <a href="https://www.themoviedb.org/settings/api?language=en-US" target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300 underline">Get an API key here</a>
                </label>
                <input type="password" placeholder="Enter your TMDB API Key" className="glass-input w-full mt-2" value={settings.tmdbApiKey} onChange={(e) => setSettings({ ...settings, tmdbApiKey: e.target.value })} />
              </div>
              <div>
                <label className="flex justify-between items-center text-sm font-medium text-slate-300">
                  <span>Trakt Client ID</span>
                  <a href="https://trakt.tv/oauth/applications" target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300 underline">Create an app here</a>
                </label>
                <input type="text" placeholder="Enter your Trakt Client ID" className="glass-input w-full mt-2" value={settings.traktClientId} onChange={(e) => setSettings({ ...settings, traktClientId: e.target.value })} />
              </div>
              <div className="pt-4">
                <button onClick={handleSave} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 px-6 rounded-xl flex items-center gap-2">
                  <Save className="w-4 h-4" /> Save APIs
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'indexers' && (
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-bold text-purple-400 mb-2">Indexers</h2>
            <div className="bg-purple-500/10 border border-purple-500/20 text-purple-400 p-4 rounded-xl mb-6 flex gap-3 text-sm">
              <FileText className="w-5 h-5 shrink-0" />
              <p>Indexers are platforms (like ThePirateBay, 1337x, YTS) that host torrent files. Add your preferred indexers here to allow MediaManager to scrape them directly.</p>
            </div>
            
            <div className="bg-slate-900/50 p-6 rounded-xl border border-white/5 space-y-4 mb-6">
              <h3 className="font-semibold text-slate-200">Add New Indexer</h3>
              
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-xs text-slate-400 flex items-center mr-2">Popular:</span>
                {['1337x', 'YTS', 'ThePirateBay', 'EZTV'].map(name => (
                  <button 
                    key={name}
                    onClick={() => {
                      let url = '';
                      if (name === '1337x') url = 'https://1337x.to';
                      if (name === 'YTS') url = 'https://yts.mx';
                      if (name === 'ThePirateBay') url = 'https://apibay.org';
                      if (name === 'EZTV') url = 'https://eztvx.to';
                      setNewIndexer({...newIndexer, name, url});
                    }}
                    className="text-xs bg-slate-800 hover:bg-purple-500/20 text-slate-300 hover:text-purple-400 border border-white/5 hover:border-purple-500/30 px-3 py-1 rounded-full transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="Name (e.g. 1337x)" className="glass-input" value={newIndexer.name} onChange={e => setNewIndexer({...newIndexer, name: e.target.value})} />
                <input type="text" placeholder="Base URL (e.g. https://1337x.to)" className="glass-input" value={newIndexer.url} onChange={e => setNewIndexer({...newIndexer, url: e.target.value})} />
                <button onClick={() => handleAddEntity('indexers', newIndexer)} className="col-span-1 md:col-span-2 bg-purple-500 hover:bg-purple-400 text-white font-bold py-2 px-4 rounded-xl flex justify-center items-center gap-2">
                  <Plus className="w-5 h-5" /> Add Indexer
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {indexers.length === 0 ? <p className="text-slate-500 italic">No indexers configured yet.</p> : indexers.map(idx => (
                <div key={idx.id} className="flex justify-between items-center bg-slate-950/50 p-4 rounded-xl border border-white/5">
                  <div>
                    <p className="text-base font-bold text-slate-200">{idx.name}</p>
                    <p className="text-sm text-slate-500 mt-1">{idx.url}</p>
                  </div>
                  <button onClick={() => handleDeleteEntity('indexers', idx.id)} className="text-red-400 hover:text-red-300 p-2"><Trash2 className="w-5 h-5" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'clients' && (
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-bold text-emerald-400 mb-2">Download Clients</h2>
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl mb-6 flex gap-3 text-sm">
              <Download className="w-5 h-5 shrink-0" />
              <p>Configure where your torrents are sent. We currently support qBittorrent via its WebUI API. Make sure your WebUI is enabled in qBittorrent settings!</p>
            </div>
            
            <div className="bg-slate-900/50 p-6 rounded-xl border border-white/5 space-y-4 mb-6">
              <h3 className="font-semibold text-slate-200">Add New Client</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="Name (e.g. My qBittorrent)" className="glass-input" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} />
                <input type="text" placeholder="Host (e.g. http://localhost)" className="glass-input" value={newClient.host} onChange={e => setNewClient({...newClient, host: e.target.value})} />
                <input type="number" placeholder="Port (e.g. 8080)" className="glass-input" value={newClient.port} onChange={e => setNewClient({...newClient, port: parseInt(e.target.value)})} />
                <input type="text" placeholder="Username" className="glass-input" value={newClient.username} onChange={e => setNewClient({...newClient, username: e.target.value})} />
                <input type="password" placeholder="Password" className="glass-input" value={newClient.password} onChange={e => setNewClient({...newClient, password: e.target.value})} />
                <button onClick={() => handleAddEntity('clients', newClient)} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2 px-4 rounded-xl flex justify-center items-center gap-2">
                  <Plus className="w-5 h-5" /> Add Client
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {clients.length === 0 ? <p className="text-slate-500 italic">No clients configured yet.</p> : clients.map(c => (
                <div key={c.id} className="flex justify-between items-center bg-slate-950/50 p-4 rounded-xl border border-white/5">
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
        )}

        {activeTab === 'profiles' && (
          <div className="max-w-4xl space-y-2">
            <h2 className="text-2xl font-bold text-amber-400 mb-2">Quality Profiles</h2>
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-4 rounded-xl mb-6 flex gap-3 text-sm">
              <Settings2 className="w-5 h-5 shrink-0" />
              <p>Quality profiles allow you to restrict automated searches to specific resolutions. They are assigned per movie or TV show. Qualities at the top of the list are preferred over the ones at the bottom.</p>
            </div>
            
            <div className="bg-slate-900/50 p-6 rounded-xl border border-white/5 space-y-4 mb-6">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-slate-200">{editingProfile ? 'Edit Profile' : 'Add New Profile'}</h3>
                {editingProfile && (
                  <button onClick={() => { setEditingProfile(null); setNewProfile({ name: '', qualities: ['720p', '1080p', '2160p'], cutoff: '1080p', upgrade_allowed: true }); }} className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-700">Cancel Edit</button>
                )}
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Profile Name</label>
                  <input type="text" placeholder="e.g. Strict 1080p" className="glass-input w-full" value={editingProfile ? editingProfile.name : newProfile.name} onChange={e => editingProfile ? setEditingProfile({...editingProfile, name: e.target.value}) : setNewProfile({...newProfile, name: e.target.value})} />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Allowed Qualities</label>
                  <div className="flex flex-wrap gap-3">
                    {['SD', '720p', '1080p', '2160p', 'Unknown'].map(q => {
                      const activeObj = editingProfile ? editingProfile : newProfile;
                      const isSelected = activeObj.qualities.includes(q);
                      return (
                        <button
                          key={q}
                          onClick={() => {
                            const newQualities = isSelected 
                              ? activeObj.qualities.filter(i => i !== q)
                              : [...activeObj.qualities, q];
                            if (editingProfile) setEditingProfile({...editingProfile, qualities: newQualities});
                            else setNewProfile({...newProfile, qualities: newQualities});
                          }}
                          className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors flex items-center gap-2 ${isSelected ? 'bg-amber-500/20 text-amber-400 border-amber-500/50' : 'bg-slate-950 border-white/10 text-slate-500 hover:text-slate-300'}`}
                        >
                          {isSelected && <CheckCircle2 className="w-4 h-4" />} {q}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Cutoff Quality</label>
                    <select className="glass-input w-full" value={editingProfile ? editingProfile.cutoff : newProfile.cutoff} onChange={e => editingProfile ? setEditingProfile({...editingProfile, cutoff: e.target.value}) : setNewProfile({...newProfile, cutoff: e.target.value})}>
                      {['SD', '720p', '1080p', '2160p', 'Unknown'].map(q => (
                        <option key={`cutoff-${q}`} value={q}>{q}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">Once this quality is met, downloading stops.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Upgrades Allowed</label>
                    <button 
                      onClick={() => {
                        if (editingProfile) setEditingProfile({...editingProfile, upgrade_allowed: !editingProfile.upgrade_allowed});
                        else setNewProfile({...newProfile, upgrade_allowed: !newProfile.upgrade_allowed});
                      }}
                      className={`w-full py-2.5 rounded-xl text-sm font-medium border flex justify-center items-center gap-2 transition-colors ${
                        (editingProfile ? editingProfile.upgrade_allowed : newProfile.upgrade_allowed) 
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                        : 'bg-red-500/20 text-red-400 border-red-500/30'
                      }`}
                    >
                      {(editingProfile ? editingProfile.upgrade_allowed : newProfile.upgrade_allowed) ? <CheckCircle2 className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                      {(editingProfile ? editingProfile.upgrade_allowed : newProfile.upgrade_allowed) ? 'Yes, search for upgrades' : 'No, keep what I have'}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button 
                    onClick={async () => {
                      if (editingProfile) {
                        try {
                          await axios.put(`http://localhost:3000/api/settings/profiles/${editingProfile.id}`, editingProfile);
                          setEditingProfile(null);
                          fetchSettings();
                          setStatus({ type: 'success', message: 'Profile updated!' });
                          setTimeout(() => setStatus({ type: '', message: '' }), 3000);
                        } catch(e) {}
                      } else {
                        handleAddEntity('profiles', newProfile);
                        setNewProfile({ name: '', qualities: ['720p', '1080p', '2160p'], cutoff: '1080p', upgrade_allowed: true });
                      }
                    }} 
                    disabled={!(editingProfile ? editingProfile.name : newProfile.name)}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 px-6 rounded-xl flex items-center gap-2 disabled:opacity-50"
                  >
                    {editingProfile ? <Save className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                    {editingProfile ? 'Save Changes' : 'Add Profile'}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {profiles.length === 0 ? <p className="text-slate-500 italic">No profiles configured yet.</p> : profiles.map(p => (
                <div key={p.id} className="flex justify-between items-center bg-slate-950/50 p-4 rounded-xl border border-white/5">
                  <div>
                    <p className="text-base font-bold text-slate-200">{p.name}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {p.qualities.map(q => <span key={q} className="text-xs bg-white/10 px-2 py-0.5 rounded text-amber-400">{q}</span>)}
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Cutoff: <strong className="text-slate-300">{p.cutoff}</strong> &bull; Upgrades: <strong className={p.upgrade_allowed ? 'text-emerald-400' : 'text-red-400'}>{p.upgrade_allowed ? 'Yes' : 'No'}</strong>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingProfile(p)} className="text-slate-400 hover:text-amber-400 p-2 bg-slate-900 rounded-lg border border-white/5"><Settings2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDeleteEntity('profiles', p.id)} className="text-red-400 hover:text-red-300 p-2 bg-slate-900 rounded-lg border border-white/5"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'subtitles' && (
          <div className="max-w-3xl space-y-2">
            <h2 className="text-2xl font-bold text-pink-400 mb-2">Subtitles & AI Translation</h2>
            <div className="bg-pink-500/10 border border-pink-500/20 text-pink-400 p-4 rounded-xl mb-6 flex gap-3 text-sm">
              <Languages className="w-5 h-5 shrink-0" />
              <p>MediaManager functions like Bazarr. It downloads English subtitles from OpenSubtitles, and uses Google's Gemini AI to automatically translate the SRT files into your preferred language!</p>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300">OpenSubtitles REST API Key</label>
                <input type="password" placeholder="Required for fetching english base .srt files" className="glass-input w-full mt-2" value={settings.osApiKey} onChange={(e) => setSettings({ ...settings, osApiKey: e.target.value })} />
                <p className="text-xs text-slate-500 mt-2">Get an API key at opensubtitles.com (REST API).</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Gemini API Key</label>
                <input type="password" placeholder="AI key for translation" className="glass-input w-full mt-2" value={settings.geminiApiKey} onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })} />
                <p className="text-xs text-slate-500 mt-2">Get a free key from Google AI Studio.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Target Translation Language</label>
                <select className="glass-input w-full mt-2" value={settings.targetLang} onChange={(e) => setSettings({ ...settings, targetLang: e.target.value })}>
                  <option value="Dutch">Dutch</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                  <option value="Spanish">Spanish</option>
                  <option value="Italian">Italian</option>
                  <option value="Portuguese">Portuguese</option>
                </select>
              </div>
              <div className="pt-4">
                <button onClick={handleSave} className="bg-pink-500 hover:bg-pink-400 text-white font-bold py-2.5 px-6 rounded-xl flex items-center gap-2">
                  <Save className="w-4 h-4" /> Save Subtitle Settings
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="max-w-4xl space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-2xl font-bold text-blue-400">Library & Root Folders</h2>
                <p className="text-slate-400 text-sm mt-1">Configure where MediaManager moves your completed downloads.</p>
              </div>
              <button 
                onClick={handleScan}
                disabled={isScanning}
                className="bg-blue-500 hover:bg-blue-400 text-white font-bold py-2 px-4 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {isScanning ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <RefreshCw className="w-4 h-4" />}
                {isScanning ? 'Scanning...' : 'Scan Library Now'}
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-3">
                <input type="text" className="glass-input flex-1" placeholder="e.g. /mnt/nas/movies" value={newPath} onChange={(e) => setNewPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddPath()} />
                <button onClick={handleAddPath} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2"><Plus className="w-4 h-4"/> Add Path</button>
              </div>
              
              <div className="space-y-3 pt-4">
                {paths.length === 0 ? <p className="text-slate-500 italic">No root folders configured yet.</p> : paths.map((p) => (
                  <div key={p.id} className="flex items-center justify-between bg-slate-950/50 p-4 rounded-xl border border-white/5">
                    <span className="text-slate-200 font-mono text-sm">{p.path}</span>
                    <button onClick={() => axios.delete(`http://localhost:3000/api/library/paths/${p.id}`).then(fetchPaths)} className="text-red-400 hover:text-red-300 p-2"><Trash2 className="w-5 h-5" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
