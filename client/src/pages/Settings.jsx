import { useState, useEffect } from 'react';
import api from '../lib/api';
import { AlertCircle, CheckCircle2, Search, Download, Settings2, FolderTree, Languages, ShieldAlert, Network, Users } from 'lucide-react';
import { customAlert } from '../utils/alerts';
import { invalidateSettingsCache } from '../lib/useSettings';
import StickyBar from '../components/shared/StickyBar';
import { useStickyBar } from '../lib/useStickyBar';

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
  const { headerRef, stickyVisible } = useStickyBar();
  const [activeTab, setActiveTab] = useState('connections');
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
    autoTranslate: true,
    preferNativeBeforeTranslate: true,
    deepseekApiKey: '',
    claudeApiKey: '',
    traktWatchedSync: false,
    traktAccessToken: '',
    traktClientSecret: '',
    renameMovies: true,
    replaceIllegalCharacters: true,
    colonReplacement: 'dash',
    standardMovieFormat: '{Movie Title} - {Release Year}',
    renameEpisodes: true,
    standardEpisodeFormat: '{Show Title} - S{Season}E{Episode} - {Episode Title}',
    seasonFolderFormat: 'Season {Season Number}',
    separatorStyle: 'space',
    removeCompletedDownloads: false,
    deleteTorrentFiles: false,
    hideCompletedDownloads: true,
    downloadPathMapping: ['', '']
  });
  const [paths, setPaths] = useState([]);
  const [indexers, setIndexers] = useState([]);
  const [clients, setClients] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [releaseProfiles, setReleaseProfiles] = useState([]);

  const [newPath, setNewPath] = useState('');
  const [newPathType, setNewPathType] = useState('movies');
  const [newClient, setNewClient] = useState({ name: '', host: '', port: 8080, username: '', password: '', type: 'qbittorrent' });
  const [newProfile, setNewProfile] = useState({ name: '', qualities: ['720p', '1080p', '2160p'], cutoff: '1080p', upgrade_allowed: true, media_type: 'both' });
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
            const failedMovies = res.data.failedMovies?.length || 0;
            const failedShows = res.data.failedShows?.length || 0;
            const skipped = res.data.skippedCount || 0;
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
            const failedTotal = failedMovies + failedShows;
            if (failedTotal > 0) warnings.push(`${failedTotal} could not be imported`);
            if (skipped > 0) warnings.push(`${skipped} skipped`);
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
    } catch (e) {
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
          standardMovieFormat: res.data.data.standardMovieFormat || '{Movie Title} - {Release Year}',
          renameEpisodes: res.data.data.renameEpisodes ?? true,
          standardEpisodeFormat: res.data.data.standardEpisodeFormat || '{Show Title} - S{Season}E{Episode} - {Episode Title}',
          seasonFolderFormat: res.data.data.seasonFolderFormat || 'Season {Season Number}',
          removeCompletedDownloads: res.data.data.removeCompletedDownloads ?? false,
          deleteTorrentFiles: res.data.data.deleteTorrentFiles ?? false,
          hideCompletedDownloads: res.data.data.hideCompletedDownloads ?? true,
          downloadPathMapping: Array.isArray(res.data.data.downloadPathMapping) ? res.data.data.downloadPathMapping : ['', ''],
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
      setReleaseProfiles(res.data.data);
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

  // Tab-specific saves — only send the fields that tab manages
  const saveIndexers = async () => {
    try {
      await api.post('/settings', {
        prowlarrUrl: settings.prowlarrUrl,
        prowlarrApiKey: settings.prowlarrApiKey
      });
      invalidateSettingsCache();
      customAlert('Indexer settings saved!', 'success');
    } catch {
      customAlert('Failed to save indexer settings.', 'error');
    }
  };

  const saveClients = async () => {
    try {
      await api.post('/settings', {
        hideCompletedDownloads: settings.hideCompletedDownloads,
        removeCompletedDownloads: settings.removeCompletedDownloads,
        deleteTorrentFiles: settings.deleteTorrentFiles,
        downloadPathMapping: settings.downloadPathMapping
      });
      invalidateSettingsCache();
      customAlert('Client settings saved!', 'success');
    } catch {
      customAlert('Failed to save client settings.', 'error');
    }
  };

  const saveNaming = async () => {
    try {
      await api.post('/settings', {
        renameMovies: settings.renameMovies,
        replaceIllegalCharacters: settings.replaceIllegalCharacters,
        colonReplacement: settings.colonReplacement,
        standardMovieFormat: settings.standardMovieFormat,
        renameEpisodes: settings.renameEpisodes,
        standardEpisodeFormat: settings.standardEpisodeFormat,
        seasonFolderFormat: settings.seasonFolderFormat,
        separatorStyle: settings.separatorStyle
      });
      invalidateSettingsCache();
      customAlert('Naming settings saved!', 'success');
    } catch {
      customAlert('Failed to save naming settings.', 'error');
    }
  };

  const saveSubtitles = async () => {
    try {
      await api.post('/settings', {
        osApiKey: settings.osApiKey,
        subdlApiKey: settings.subdlApiKey,
        subsourceApiKey: settings.subsourceApiKey,
        providerLangs: settings.providerLangs,
        translationProvider: settings.translationProvider,
        geminiApiKey: settings.geminiApiKey,
        deepseekApiKey: settings.deepseekApiKey,
        claudeApiKey: settings.claudeApiKey,
        targetLangs: settings.targetLangs,
        autoTranslate: settings.autoTranslate
      });
      invalidateSettingsCache();
      customAlert('Subtitle settings saved!', 'success');
    } catch {
      customAlert('Failed to save subtitle settings.', 'error');
    }
  };

  const handleSave = async () => {
    try {
      await api.post('/settings', settings);
      invalidateSettingsCache();
      customAlert('Settings saved!', 'success');
      if (settings.traktWatchedSync && settings.traktAccessToken) {
        api.post('/tasks/trakt_watched_sync/run').catch(() => {});
      }
    } catch (err) {
      customAlert('Failed to save settings.', 'error');
    }
  };

  const handleAddEntity = async (endpoint, payload) => {
    try {
      await api.post(`/settings/${endpoint}`, payload);
      fetchSettings();
      customAlert('Added successfully!', 'success');
    } catch (err) {
      customAlert('Failed to add.', 'error');
    }
  };

  const handleDeleteEntity = async (endpoint, id) => {
    try {
      await api.delete(`/settings/${endpoint}/${id}`);
      fetchSettings();
      customAlert('Deleted successfully!', 'success');
    } catch (err) {
      customAlert('Failed to delete.', 'error');
    }
  };

  const handleAddPath = async () => {
    if (!newPath.trim()) return;
    try {
      await api.post('/library/paths', { path: newPath.trim(), type: newPathType });
      setNewPath('');
      fetchPaths();
    } catch { /* path add failed silently — fetchPaths not called */ }
  };

  const handleScan = async (mode = 'full') => {
    setIsScanning(true);
    setScanResults(null);
    setScanProgress(null);
    setIsStaleResults(false);
    sessionStorage.removeItem('lastScanResults');
    setStatus({ type: '', message: '' });
    try {
      await api.post('/library/scan', { mode });
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to start library scan.' });
      setIsScanning(false);
    }
  };

  const handleStopScan = async () => {
    try {
      await api.post('/library/scan/stop');
    } catch { /* ignore */ }
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
          fetchSettings();
          return;
        }
        if (res.data.status === 'pending' && attempts < 60) {
          setTimeout(poll, interval * 1000);
          return;
        }
        // Server returned an error message
        if (res.data.status === 'error') {
          customAlert(res.data.message || 'Trakt authorization failed', 'error');
        }
      } catch (err) {
        const msg = err.response?.data?.message || err.message || 'Connection failed';
        customAlert(`Trakt error: ${msg}`, 'error');
      }
      setTraktPolling(false);
      setTraktDeviceCode(null);
    };
    setTimeout(poll, interval * 1000);
  };

  const connectTrakt = async () => {
    try {
      const res = await api.post('/settings', settings);
      if (res.data.status === 'error') {
        customAlert('Failed to save settings: ' + (res.data.message || ''), 'error');
        return;
      }
      const dcRes = await api.post('/auth/trakt/device-code');
      if (dcRes.data.status !== 'success') {
        customAlert(dcRes.data.message || 'Failed to get Trakt device code', 'error');
        return;
      }
      const { device_code, user_code, verification_url, interval } = dcRes.data.data;
      setTraktDeviceCode(device_code);
      setTraktUserCode(user_code);
      setTraktVerificationUrl(verification_url);
      setTraktPolling(true);
      pollTrakt(device_code, interval || 5);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to start Trakt authorization';
      customAlert(msg, 'error');
    }
  };

  const handleAddReleaseProfile = async (profile) => {
    try {
      await api.post('/release-profiles', profile);
      fetchReleaseProfiles();
      customAlert('Release profile added!', 'success');
      setNewReleaseProfile({ name: '', enabled: true, must_contain: [], must_not_contain: [], indexer_id: null });
    } catch (err) {
      customAlert('Failed to add release profile', 'error');
    }
  };

  const handleUpdateReleaseProfile = async (profile) => {
    try {
      await api.put(`/release-profiles/${profile.id}`, profile);
      setEditingReleaseProfile(null);
      fetchReleaseProfiles();
      customAlert('Release profile updated!', 'success');
    } catch (err) {
      customAlert('Failed to update release profile', 'error');
    }
  };

  const handleDeleteReleaseProfile = async (id) => {
    try {
      await api.delete(`/release-profiles/${id}`);
      fetchReleaseProfiles();
      customAlert('Release profile deleted!', 'success');
    } catch (err) {
      customAlert('Failed to delete release profile', 'error');
    }
  };

  const TABS = [
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
    <div className="space-y-3">
      <div ref={headerRef} className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 sm:gap-3 !mb-0">
            <Settings2 className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400" /> <span className="truncate">Settings</span>
          </h1>
          <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block">Manage your integrations, indexers, and application preferences.</p>
        </div>
      </div>

      <StickyBar visible={stickyVisible} />

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

          {activeTab === 'connections' && (
            <ConnectionsTab
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
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'users' && <UsersTab />}

          {activeTab === 'indexers' && (
            <IndexersTab
              settings={settings}
              setSettings={setSettings}
              handleSave={saveIndexers}
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
              handleSave={saveClients}
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
              handleSave={saveNaming}
            />
          )}

          {activeTab === 'subtitles' && (
            <SubtitlesTab
              settings={settings}
              setSettings={setSettings}
              keyStatuses={keyStatuses}
              handleSave={saveSubtitles}
            />
          )}

          {activeTab === 'library' && (
            <LibraryTab
              paths={paths}
              newPath={newPath}
              newPathType={newPathType}
              setNewPath={setNewPath}
              setNewPathType={setNewPathType}
              handleAddPath={handleAddPath}
              fetchPaths={fetchPaths}
              handleScan={handleScan}
              handleStopScan={handleStopScan}
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

