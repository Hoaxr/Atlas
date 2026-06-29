import { useState, useEffect } from 'react';
import api from '../lib/api';
import { AlertCircle, CheckCircle2, Key, Search, Download, Settings2, FolderTree, Languages, ShieldAlert, Network, Users } from 'lucide-react';
import { customAlert } from '../utils/alerts';

import ApisTab from './settings/ApisTab';
import IndexersTab from './settings/IndexersTab';
import ClientsTab from './settings/ClientsTab';
import ProfilesTab from './settings/ProfilesTab';
import SubtitlesTab from './settings/SubtitlesTab';
import LibraryTab from './settings/LibraryTab';
import BackupTab from './settings/BackupTab';
import NamingTab from './settings/NamingTab';
import ReleaseProfilesTab from './settings/ReleaseProfilesTab';
import ConnectionsTab from './settings/ConnectionsTab';
import SecurityTab from './settings/SecurityTab';
import UsersTab from './settings/UsersTab';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('apis');
  const [settings, setSettings] = useState({
    tmdbApiKey: '',
    traktClientId: '',
    osApiKey: '',
    geminiApiKey: '',
    targetLang: 'Dutch',
    translationProvider: 'googleTranslate',
    subdlApiKey: '',
    subsourceApiKey: '',
    targetLangs: ['Dutch'],
    providerLangs: ['en'],
    autoTranslate: false,
    deepseekApiKey: '',
    claudeApiKey: '',
    traktWatchedSync: false,
    traktAccessToken: '',
    traktClientSecret: '',
    renameMovies: true,
    replaceIllegalCharacters: true,
    colonReplacement: 'dash',
    standardMovieFormat: '{Movie Title} ({Release Year})',
    renameEpisodes: true,
    standardEpisodeFormat: '{Show Title} - S{Season}E{Episode} - {Episode Title}',
    removeCompletedDownloads: false,
    deleteTorrentFiles: false,
    hideCompletedDownloads: true
  });
  const [paths, setPaths] = useState([]);
  const [indexers, setIndexers] = useState([]);
  const [clients, setClients] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [releaseProfiles, setReleaseProfiles] = useState([]);

  const [newPath, setNewPath] = useState('');
  const [newClient, setNewClient] = useState({ name: '', host: '', port: 8080, username: '', password: '', type: 'qbittorrent' });
  const [newProfile, setNewProfile] = useState({ name: '', qualities: ['720p', '1080p', '2160p'], cutoff: '1080p', upgrade_allowed: true });
  const [editingProfile, setEditingProfile] = useState(null);
  const [newReleaseProfile, setNewReleaseProfile] = useState({ name: '', enabled: true, must_contain: [], must_not_contain: [], indexer_id: null, apply_to: 'all' });
  const [editingReleaseProfile, setEditingReleaseProfile] = useState(null);

  const [status, setStatus] = useState({ type: '', message: '' });
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [scanResults, setScanResults] = useState(null);
  const [clientStatuses, setClientStatuses] = useState({});
  const [keyStatuses, setKeyStatuses] = useState({});
  const [checkingKeys, setCheckingKeys] = useState(false);
  const [traktDeviceCode, setTraktDeviceCode] = useState(null);
  const [traktUserCode, setTraktUserCode] = useState('');
  const [traktVerificationUrl, setTraktVerificationUrl] = useState('');
  const [traktPolling, setTraktPolling] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchPaths();
    fetchReleaseProfiles();
    testClients();
    checkScanStatus();
    const interval = setInterval(testClients, 10000);
    return () => clearInterval(interval);
  }, []);

  // Restore last scan results from sessionStorage + auto-retry unreachable paths
  const [isStaleResults, setIsStaleResults] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem('lastScanResults');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setScanResults({ ...parsed, _cached: true });
        setIsStaleResults(true);

        if (parsed.unreachablePaths?.length > 0) {
          const pathsToCheck = parsed.unreachablePaths.map(p => p.path);
          api.post('/library/scan/retry-paths', { paths: pathsToCheck })
            .then(res => {
              if (res.data.status === 'success') {
                const stillUnreachable = res.data.data.filter(p => !p.reachable);
                const nowReachable = res.data.data.filter(p => p.reachable);
                if (nowReachable.length > 0 || stillUnreachable.length > 0) {
                  const updatedPaths = stillUnreachable.map(su => ({
                    path: su.path,
                    error: su.error || 'Still unreachable'
                  }));
                  const updatedData = { ...parsed, unreachablePaths: updatedPaths };
                  const allCleared = stillUnreachable.length === 0;
                  setScanResults({ ...updatedData, _cached: !allCleared });
                  setIsStaleResults(!allCleared);
                  sessionStorage.setItem('lastScanResults', JSON.stringify(updatedData));
                }
              }
            })
            .catch(() => { /* background fetch — ignore errors */ });
        }
      } catch { /* sessionStorage unavailable */ }
    }
  }, []);

  useEffect(() => {
    if (scanResults) {
      const { _cached, ...toStore } = scanResults;
      sessionStorage.setItem('lastScanResults', JSON.stringify(toStore));
    }
  }, [scanResults]);

  const checkScanStatus = async () => {
    try {
      const res = await api.get('/library/scan/progress');
      if (res.data && res.data.isScanning) {
        setIsScanning(true);
        setScanProgress(res.data);
      }
    } catch { /* scan not in progress */ }
  };

  useEffect(() => {
    let progressInterval;
    if (isScanning) {
      progressInterval = setInterval(async () => {
        try {
          const res = await api.get('/library/scan/progress');
          setScanProgress(res.data);
          if (!res.data.isScanning && res.data.currentFile === 'Finished') {
            setIsScanning(false);
            setScanResults(res.data);
            const unreachable = res.data.unreachablePaths || [];
            const empty = res.data.emptyPaths || [];
            const warnings = [];
            if (unreachable.length > 0) warnings.push(`${unreachable.length} path(s) unreachable`);
            if (empty.length > 0) warnings.push(`${empty.length} path(s) empty/no files`);
            const addedMovies = res.data.addedMoviesCount || 0;
            const addedShows = res.data.addedShowsCount || 0;
            let addedSummary = '';
            if (addedMovies > 0 && addedShows > 0) {
              addedSummary = `${addedMovies} movie${addedMovies !== 1 ? 's' : ''} & ${addedShows} TV show${addedShows !== 1 ? 's' : ''} (${res.data.addedEpisodesCount || 0} total episode${res.data.addedEpisodesCount !== 1 ? 's' : ''})`;
            } else if (addedMovies > 0) {
              addedSummary = `${addedMovies} movie${addedMovies !== 1 ? 's' : ''}`;
            } else if (addedShows > 0) {
              addedSummary = `${addedShows} TV show${addedShows !== 1 ? 's' : ''} (${res.data.addedEpisodesCount || 0} total episode${res.data.addedEpisodesCount !== 1 ? 's' : ''})`;
            } else {
              addedSummary = '0 items';
            }
            if (warnings.length > 0) {
              setStatus({ type: 'error', message: `Scan completed. ${addedSummary} added. Warnings: ${warnings.join(', ')}. Check the scan panel for details.` });
            } else {
              setStatus({ type: 'success', message: `Scan completed. Added ${addedSummary}.` });
            }
            setTimeout(() => setStatus({ type: '', message: '' }), 10000);
          }
        } catch { /* poll error — will retry on next interval */ }
      }, 1000);
    } else {
      setScanProgress(null);
    }
    return () => clearInterval(progressInterval);
  }, [isScanning]);

  const testClients = async () => {
    try {
      const res = await api.get('/settings/clients/test');
      if (res.data.status === 'success') {
        setClientStatuses(res.data.data);
      }
    } catch { /* client test unavailable */ }
  };

  const fetchKeyStatuses = async () => {
    setCheckingKeys(true);
    try {
      const res = await api.get('/settings/status');
      if (res.data.status === 'success') {
        setKeyStatuses(res.data.data.services || {});
      }
    } catch(e) {
      console.error('Failed to check API keys', e);
    } finally {
      setCheckingKeys(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'subtitles') {
      fetchKeyStatuses();
    }
  }, [activeTab]);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      if (res.data.status === 'success') {
        setSettings({
          tmdbApiKey: res.data.data.tmdbApiKey || '',
          traktClientId: res.data.data.traktClientId || '',
          osApiKey: res.data.data.osApiKey || '',
          geminiApiKey: res.data.data.geminiApiKey || '',
          targetLang: res.data.data.targetLang || 'Dutch',
          translationProvider: res.data.data.translationProvider || 'googleTranslate',
          subdlApiKey: res.data.data.subdlApiKey || '',
          subsourceApiKey: res.data.data.subsourceApiKey || '',
          targetLangs: res.data.data.targetLangs || ['Dutch'],
          providerLangs: Array.isArray(res.data.data.providerLangs)
            ? res.data.data.providerLangs
            : ['en'],
          prowlarrUrl: res.data.data.prowlarrUrl || '',
          prowlarrApiKey: res.data.data.prowlarrApiKey || '',
          autoTranslate: res.data.data.autoTranslate || false,
          deepseekApiKey: res.data.data.deepseekApiKey || '',
          claudeApiKey: res.data.data.claudeApiKey || '',
          traktWatchedSync: res.data.data.traktWatchedSync || false,
          traktAccessToken: res.data.data.traktAccessToken || '',
          traktClientSecret: res.data.data.traktClientSecret || '',
          renameMovies: res.data.data.renameMovies ?? true,
          replaceIllegalCharacters: res.data.data.replaceIllegalCharacters ?? true,
          colonReplacement: res.data.data.colonReplacement || 'dash',
          standardMovieFormat: res.data.data.standardMovieFormat || '{Movie Title} ({Release Year})',
          renameEpisodes: res.data.data.renameEpisodes ?? true,
          standardEpisodeFormat: res.data.data.standardEpisodeFormat || '{Show Title} - S{Season}E{Episode} - {Episode Title}',
          removeCompletedDownloads: res.data.data.removeCompletedDownloads ?? false,
          deleteTorrentFiles: res.data.data.deleteTorrentFiles ?? false,
          hideCompletedDownloads: res.data.data.hideCompletedDownloads ?? true,
          defaultQualityProfileId: res.data.data.defaultQualityProfileId || null
        });
        setIndexers(res.data.data.indexers || []);
        setClients(res.data.data.clients || []);
        
        const parsedProfiles = (res.data.data.profiles || []).map(p => {
          let parsedQualities = ['1080p'];
          try {
            if (p.qualities) parsedQualities = JSON.parse(p.qualities);
          } catch { /* malformed JSON — use default quality */ }
          return { ...p, qualities: parsedQualities, upgrade_allowed: p.upgrade_allowed !== 0 };
        });
        setProfiles(parsedProfiles);
      }
    } catch (err) {
      console.error('Failed to fetch settings', err);
    }
  };

  const fetchReleaseProfiles = async () => {
    try {
      const res = await api.get('/release-profiles');
      setReleaseProfiles(res.data);
    } catch (err) {
      console.error('Failed to fetch release profiles', err);
    }
  };

  const fetchPaths = async () => {
    try {
      const res = await api.get('/library/paths');
      if (res.data.status === 'success') setPaths(res.data.data);
    } catch { /* paths unavailable */ }
  };

  const handleSave = async () => {
    try {
      await api.post('/settings', settings);
      setStatus({ type: 'success', message: 'Settings saved!' });
      if (settings.traktWatchedSync && settings.traktAccessToken) {
        api.post('/tasks/trakt_watched_sync/run').catch(() => {});
      }
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to save settings.' });
    }
  };

  const handleAddEntity = async (endpoint, payload) => {
    try {
      await api.post(`/settings/${endpoint}`, payload);
      fetchSettings();
      setStatus({ type: 'success', message: 'Added successfully!' });
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to add.' });
    }
  };

  const handleDeleteEntity = async (endpoint, id) => {
    try {
      await api.delete(`/settings/${endpoint}/${id}`);
      fetchSettings();
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to delete.' });
    }
  };

  const handleAddPath = async () => {
    if (!newPath.trim()) return;
    try {
      await api.post('/library/paths', { path: newPath.trim() });
      setNewPath('');
      fetchPaths();
    } catch { /* path add failed silently — fetchPaths not called */ }
  };

  const handleScan = async () => {
    setIsScanning(true);
    setScanResults(null);
    setScanProgress(null);
    setIsStaleResults(false);
    sessionStorage.removeItem('lastScanResults');
    setStatus({ type: '', message: '' });
    try {
      await api.post('/library/scan');
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to start library scan.' });
      setIsScanning(false);
    }
  };

  // Trakt helpers
  const pollTrakt = (deviceCode, interval) => {
    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const res = await api.post('/auth/trakt/device-token', { deviceCode });
        if (res.data.status === 'success') {
          setTraktPolling(false);
          setTraktDeviceCode(null);
          customAlert('Trakt account linked successfully!');
          setSettings(prev => ({ ...prev, traktAccessToken: '*****' }));
          return;
        }
        if (res.data.status === 'pending' && attempts < 60) {
          setTimeout(poll, interval * 1000);
          return;
        }
      } catch { /* Trakt polling error — stop polling */ }
      setTraktPolling(false);
      setTraktDeviceCode(null);
    };
    setTimeout(poll, interval * 1000);
  };

  const connectTrakt = async () => {
    try {
      await api.post('/settings', settings);
      const res = await api.post('/auth/trakt/device-code');
      if (res.data.status !== 'success') return;
      const { device_code, user_code, verification_url, interval } = res.data.data;
      setTraktDeviceCode(device_code);
      setTraktUserCode(user_code);
      setTraktVerificationUrl(verification_url);
      setTraktPolling(true);
      pollTrakt(device_code, interval || 5);
    } catch {
      customAlert('Failed to start Trakt authorization', 'error');
    }
  };

  const handleAddReleaseProfile = async (profile) => {
    try {
      await api.post('/release-profiles', profile);
      fetchReleaseProfiles();
      setStatus({ type: 'success', message: 'Release profile added!' });
      setNewReleaseProfile({ name: '', enabled: true, must_contain: [], must_not_contain: [], indexer_id: null });
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to add release profile' });
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    }
  };

  const handleUpdateReleaseProfile = async (profile) => {
    try {
      await api.put(`/release-profiles/${profile.id}`, profile);
      setEditingReleaseProfile(null);
      fetchReleaseProfiles();
      setStatus({ type: 'success', message: 'Release profile updated!' });
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to update release profile' });
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    }
  };

  const handleDeleteReleaseProfile = async (id) => {
    try {
      await api.delete(`/release-profiles/${id}`);
      fetchReleaseProfiles();
      setStatus({ type: 'success', message: 'Release profile deleted!' });
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to delete release profile' });
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    }
  };

  const TABS = [
    { id: 'apis', label: "API's & Integrations", icon: <Key className="w-4 h-4" /> },
    { id: 'connections', label: "Connections", icon: <Network className="w-4 h-4" /> },
    { id: 'security', label: "Security", icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'indexers', label: "Indexers", icon: <Search className="w-4 h-4" /> },
    { id: 'clients', label: "Download Clients", icon: <Download className="w-4 h-4" /> },
    { id: 'profiles', label: "Quality Profiles", icon: <Settings2 className="w-4 h-4" /> },
    { id: 'release-profiles', label: "Release Profiles", icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'naming', label: "Media Naming", icon: <FolderTree className="w-4 h-4" /> },
    { id: 'subtitles', label: "Subtitles & AI Translation", icon: <Languages className="w-4 h-4" /> },
    { id: 'library', label: "Library Management", icon: <FolderTree className="w-4 h-4" /> },
    { id: 'users', label: "Users", icon: <Users className="w-4 h-4" /> },
    { id: 'backup', label: "Backup & Restore", icon: <Download className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
            <Settings2 className="w-8 h-8 text-cyan-400" /> Settings
          </h1>
          <p className="text-slate-400 mt-1">Manage your integrations, indexers, and application preferences.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Menu */}
        <div className="lg:w-72 flex-shrink-0">
          <div className="glass-panel p-4 rounded-2xl sticky top-8 shadow-2xl">
            <nav className="space-y-1">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-medium text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${activeTab === tab.id ? 'bg-cyan-500/20 text-cyan-400 shadow-sm border border-cyan-500/20' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'}`}
                >
                  <div className={activeTab === tab.id ? 'text-cyan-400' : 'text-slate-500'}>
                    {tab.icon}
                  </div>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 glass-panel rounded-2xl p-6 md:p-8 relative min-h-[60vh] shadow-2xl space-y-6">
          {status.message && (
            <div className={`flex items-center space-x-2 p-4 rounded-xl ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <span className="font-medium">{status.message}</span>
            </div>
          )}

          {activeTab === 'apis' && (
            <ApisTab
              settings={settings}
              setSettings={setSettings}
              handleSave={handleSave}
              traktDeviceCode={traktDeviceCode}
              traktUserCode={traktUserCode}
              traktVerificationUrl={traktVerificationUrl}
              traktPolling={traktPolling}
              connectTrakt={connectTrakt}
              fetchSettings={fetchSettings}
            />
          )}

          {activeTab === 'connections' && <ConnectionsTab />}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'users' && <UsersTab />}

          {activeTab === 'indexers' && (
            <IndexersTab
              settings={settings}
              setSettings={setSettings}
              handleSave={handleSave}
            />
          )}

          {activeTab === 'clients' && (
            <ClientsTab
              clients={clients}
              newClient={newClient}
              setNewClient={setNewClient}
              clientStatuses={clientStatuses}
              handleAddEntity={handleAddEntity}
              handleDeleteEntity={handleDeleteEntity}
              settings={settings}
              setSettings={setSettings}
              handleSave={handleSave}
            />
          )}

          {activeTab === 'profiles' && (
            <ProfilesTab
              profiles={profiles}
              newProfile={newProfile}
              setNewProfile={setNewProfile}
              editingProfile={editingProfile}
              setEditingProfile={setEditingProfile}
              handleAddEntity={handleAddEntity}
              handleDeleteEntity={handleDeleteEntity}
              fetchSettings={fetchSettings}
              setStatus={setStatus}
              settings={settings}
              setSettings={setSettings}
              handleSave={handleSave}
            />
          )}

          {activeTab === 'release-profiles' && (
            <ReleaseProfilesTab
              releaseProfiles={releaseProfiles}
              indexers={indexers}
              newProfile={newReleaseProfile}
              setNewProfile={setNewReleaseProfile}
              editingProfile={editingReleaseProfile}
              setEditingProfile={setEditingReleaseProfile}
              handleAddProfile={handleAddReleaseProfile}
              handleUpdateProfile={handleUpdateReleaseProfile}
              handleDeleteProfile={handleDeleteReleaseProfile}
            />
          )}

          {activeTab === 'naming' && (
            <NamingTab
              settings={settings}
              setSettings={setSettings}
              handleSave={handleSave}
            />
          )}

          {activeTab === 'subtitles' && (
            <SubtitlesTab
              settings={settings}
              setSettings={setSettings}
              keyStatuses={keyStatuses}
              handleSave={handleSave}
            />
          )}

          {activeTab === 'library' && (
            <LibraryTab
              paths={paths}
              newPath={newPath}
              setNewPath={setNewPath}
              handleAddPath={handleAddPath}
              fetchPaths={fetchPaths}
              handleScan={handleScan}
              isScanning={isScanning}
              scanProgress={scanProgress}
              scanResults={scanResults}
              isStaleResults={isStaleResults}
              setScanResults={setScanResults}
              setIsStaleResults={setIsStaleResults}
            />
          )}

          {activeTab === 'backup' && <BackupTab />}
        </div>
      </div>
    </div>
  );
}

