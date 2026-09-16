import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../lib/api';
import { AlertCircle, CheckCircle2, Search, Download, Settings2, FolderTree, Languages, ShieldAlert, Network, Users, Sliders, FileText } from 'lucide-react';
import { customAlert } from '../utils/alerts';
import { invalidateSettingsCache } from '../lib/useSettings';
import StickyBar from '../components/shared/StickyBar';
import { useStickyBar } from '../lib/useStickyBar';

import IndexersTab from './settings/IndexersTab';
import ClientsTab from './settings/ClientsTab';
import ProfilesTab from './settings/ProfilesTab';
import SubtitlesTab from './settings/SubtitlesTab';
import LibraryTab from './settings/LibraryTab';
import NamingTab from './settings/NamingTab';
import ReleaseProfilesTab from './settings/ReleaseProfilesTab';
import ConnectionsTab from './settings/ConnectionsTab';
import GeneralTab from './settings/GeneralTab';
import UsersTab from './settings/UsersTab';

const SETTINGS_GROUPS = [
  {
    id: 'general',
    label: 'General',
    icon: Sliders,
    tabs: [
      { id: 'general', label: 'General', icon: Sliders },
    ]
  },
  {
    id: 'integrations',
    label: 'Services & Integrations',
    icon: Network,
    tabs: [
      { id: 'connections', label: 'Connections', icon: Network },
      { id: 'indexers', label: 'Indexers', icon: Search },
      { id: 'clients', label: 'Download Clients', icon: Download },
      { id: 'subtitles', label: 'Subtitles & AI', icon: Languages },
    ]
  },
  {
    id: 'media',
    label: 'Media Rules',
    icon: FolderTree,
    tabs: [
      { id: 'profiles', label: 'Quality Profiles', icon: Settings2 },
      { id: 'release-profiles', label: 'Release Profiles', icon: ShieldAlert },
      { id: 'naming', label: 'Media Naming', icon: FileText },
      { id: 'library', label: 'Library Management', icon: FolderTree },
    ]
  },
  {
    id: 'users',
    label: 'Users',
    icon: Users,
    tabs: [
      { id: 'users', label: 'Users', icon: Users },
    ]
  }
];

export default function Settings() {
  const { headerRef, stickyVisible } = useStickyBar();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  // Legacy tab ids that now live inside the General tab
  const LEGACY_TAB_ALIASES = { security: 'general', backup: 'general' };
  const [activeTab, setActiveTab] = useState(() => {
    if (initialTab && SETTINGS_GROUPS.some(g => g.tabs.some(t => t.id === initialTab))) {
      return initialTab;
    }
    if (initialTab && LEGACY_TAB_ALIASES[initialTab]) return LEGACY_TAB_ALIASES[initialTab];
    return 'general';
  });

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const resolved = LEGACY_TAB_ALIASES[tabParam] || tabParam;
    if (resolved && resolved !== activeTab && SETTINGS_GROUPS.some(g => g.tabs.some(t => t.id === resolved))) {
      setActiveTab(resolved);
    }
  }, [searchParams, activeTab]);

  const [settings, setSettings] = useState({
    authEnabled: false,
    timezone: '',
    tmdbApiKey: '',
    osApiKey: '',
    geminiApiKey: '',
    targetLang: 'Dutch',
    translationProvider: 'gemini',
    subdlApiKey: '',
    subsourceApiKey: '',
    targetLangs: ['Dutch'],
    providerLangs: ['en'],
    autoTranslate: true,
    preferNativeBeforeTranslate: true,
    deepseekApiKey: '',
    claudeApiKey: '',
    renameMovies: true,
    replaceIllegalCharacters: true,
    colonReplacement: 'dash',
    standardMovieFormat: '{Movie Title} - {Release Year}',
    renameEpisodes: true,
    standardEpisodeFormat: '{Show Title} - S{Season}E{Episode} - {Episode Title}',
    seasonFolderFormat: 'Season {Season Number}',
    musicArtistFolderFormat: '{Artist Name}',
    musicAlbumFolderFormat: '{Album Title} ({Year})',
    musicTrackFileFormat: '{TrackNumber:00} - {Track Title}',
    writeMusicMetadata: 'true',
    musicMonitorNewReleases: 'true',
    separatorStyle: 'space',
    removeCompletedDownloads: false,
    deleteTorrentFiles: false,
    hideCompletedDownloads: true,
    downloadPathMapping: ['', ''],
    autoDeleteWatchedDays: ''
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
  const [, setCheckingKeys] = useState(false);
  const [simklDeviceCode, setSimklDeviceCode] = useState(null);
  const [simklUserCode, setSimklUserCode] = useState('');
  const [simklVerificationUrl, setSimklVerificationUrl] = useState('');
  const [simklPolling, setSimklPolling] = useState(false);

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
            const addedTracks = res.data.addedTracksCount || 0;
            const addedMusicAlbums = res.data.addedMusicAlbumsCount || 0;
            const failedMovies = res.data.failedMovies?.length || 0;
            const failedShows = res.data.failedShows?.length || 0;
            const skipped = res.data.skippedCount || 0;
            const parts = [];
            if (addedMovies > 0) parts.push(`${addedMovies} movie${addedMovies !== 1 ? 's' : ''}`);
            if (addedShows > 0) parts.push(`${addedShows} TV show${addedShows !== 1 ? 's' : ''} (${res.data.addedEpisodesCount || 0} total episode${res.data.addedEpisodesCount !== 1 ? 's' : ''})`);
            if (addedTracks > 0) parts.push(`${addedTracks} music track${addedTracks !== 1 ? 's' : ''}${addedMusicAlbums > 0 ? ` (${addedMusicAlbums} album${addedMusicAlbums !== 1 ? 's' : ''})` : ''}`);
            const addedSummary = parts.length > 0 ? parts.join(', ') : '0 items';
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
    if (activeTab === 'subtitles' || activeTab === 'connections') {
      fetchKeyStatuses();
    }
  }, [activeTab]);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      if (res.data.status === 'success') {
        setSettings({
          authEnabled: res.data.data.authEnabled === 'true',
          timezone: res.data.data.timezone || '',
          tmdbApiKey: res.data.data.tmdbApiKey || '',
          osApiKey: res.data.data.osApiKey || '',
          geminiApiKey: res.data.data.geminiApiKey || '',
          targetLang: res.data.data.targetLang || 'Dutch',
          translationProvider: (res.data.data.translationProvider && res.data.data.translationProvider !== 'googleTranslate') ? res.data.data.translationProvider : 'gemini',
          subdlApiKey: res.data.data.subdlApiKey || '',
          subsourceApiKey: res.data.data.subsourceApiKey || '',
          targetLangs: res.data.data.targetLangs || ['Dutch'],
          providerLangs: Array.isArray(res.data.data.providerLangs)
            ? res.data.data.providerLangs
            : ['en'],
          prowlarrUrl: res.data.data.prowlarrUrl || '',
          prowlarrApiKey: res.data.data.prowlarrApiKey || '',
          autoTranslate: res.data.data.autoTranslate || false,
          preferNativeBeforeTranslate: res.data.data.preferNativeBeforeTranslate ?? false,
          autoDeleteWatchedEnabled: res.data.data.autoDeleteWatchedEnabled ?? false,
          autoDeleteWatchedDays: res.data.data.autoDeleteWatchedDays || '',
          deepseekApiKey: res.data.data.deepseekApiKey || '',
          claudeApiKey: res.data.data.claudeApiKey || '',
          simklClientId: res.data.data.simklClientId || '',
          simklWatchedSync: res.data.data.simklWatchedSync || false,
          simklAccessToken: res.data.data.simklAccessToken || '',
          renameMovies: res.data.data.renameMovies ?? true,
          replaceIllegalCharacters: res.data.data.replaceIllegalCharacters ?? true,
          colonReplacement: res.data.data.colonReplacement || 'dash',
          standardMovieFormat: res.data.data.standardMovieFormat || '{Movie Title} - {Release Year}',
          renameEpisodes: res.data.data.renameEpisodes ?? true,
          standardEpisodeFormat: res.data.data.standardEpisodeFormat || '{Show Title} - S{Season}E{Episode} - {Episode Title}',
          seasonFolderFormat: res.data.data.seasonFolderFormat || 'Season {Season Number}',
          musicArtistFolderFormat: res.data.data.musicArtistFolderFormat || '{Artist Name}',
          musicAlbumFolderFormat: res.data.data.musicAlbumFolderFormat || '{Album Title} ({Year})',
          musicTrackFileFormat: res.data.data.musicTrackFileFormat || '{TrackNumber:00} - {Track Title}',
          writeMusicMetadata: String(res.data.data.writeMusicMetadata ?? true),
          musicMonitorNewReleases: String(res.data.data.musicMonitorNewReleases ?? true),
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
        musicArtistFolderFormat: settings.musicArtistFolderFormat,
        musicAlbumFolderFormat: settings.musicAlbumFolderFormat,
        musicTrackFileFormat: settings.musicTrackFileFormat
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
      const payload = { ...settings };
      if (payload.authEnabled !== undefined) {
        payload.authEnabled = payload.authEnabled.toString();
      }
      await api.post('/settings', payload);
      invalidateSettingsCache();
      customAlert('Settings saved!', 'success');
      if (settings.simklWatchedSync && settings.simklAccessToken) {
        api.post('/tasks/simkl_watched_sync/run').catch(() => {});
      }
    } catch {
      customAlert('Failed to save settings.', 'error');
    }
  };

  const handleAddEntity = async (endpoint, payload) => {
    try {
      await api.post(`/settings/${endpoint}`, payload);
      fetchSettings();
      customAlert('Added successfully!', 'success');
    } catch {
      customAlert('Failed to add.', 'error');
    }
  };

  const handleDeleteEntity = async (endpoint, id) => {
    try {
      await api.delete(`/settings/${endpoint}/${id}`);
      fetchSettings();
      customAlert('Deleted successfully!', 'success');
    } catch {
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
    } catch {
      setStatus({ type: 'error', message: 'Failed to start library scan.' });
      setIsScanning(false);
    }
  };

  const handleStopScan = async () => {
    try {
      await api.post('/library/scan/stop');
    } catch { /* ignore */ }
  };

  // Simkl helpers
  const pollSimkl = (userCode, interval) => {
    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const res = await api.post('/auth/simkl/device-token', { userCode });
        if (res.data.status === 'success') {
          setSimklPolling(false);
          setSimklDeviceCode(null);
          customAlert('Simkl account linked successfully!');
          fetchSettings();
          return;
        }
        if (res.data.status === 'pending' && attempts < 60) {
          setTimeout(poll, (interval || 5) * 1000);
          return;
        }
        if (res.data.status === 'error') {
          customAlert(res.data.message || 'Simkl authorization failed', 'error');
        }
      } catch (err) {
        const msg = err.response?.data?.message || err.message || 'Connection failed';
        customAlert(`Simkl error: ${msg}`, 'error');
      }
      setSimklPolling(false);
      setSimklDeviceCode(null);
    };
    setTimeout(poll, (interval || 5) * 1000);
  };

  const connectSimkl = async () => {
    try {
      const res = await api.post('/settings', settings);
      if (res.data.status === 'error') {
        customAlert('Failed to save settings: ' + (res.data.message || ''), 'error');
        return;
      }
      const dcRes = await api.post('/auth/simkl/device-code');
      if (dcRes.data.status !== 'success') {
        customAlert(dcRes.data.message || 'Failed to get Simkl PIN', 'error');
        return;
      }
      const { user_code, verification_url, interval } = dcRes.data.data;
      setSimklDeviceCode(user_code);
      setSimklUserCode(user_code);
      setSimklVerificationUrl(verification_url || 'https://simkl.com/pin');
      setSimklPolling(true);
      pollSimkl(user_code, interval || 5);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to start Simkl authorization';
      customAlert(msg, 'error');
    }
  };

  const handleAddReleaseProfile = async (profile) => {
    try {
      await api.post('/release-profiles', profile);
      fetchReleaseProfiles();
      customAlert('Release profile added!', 'success');
      setNewReleaseProfile({ name: '', enabled: true, must_contain: [], must_not_contain: [], indexer_id: null });
    } catch {
      customAlert('Failed to add release profile', 'error');
    }
  };

  const handleUpdateReleaseProfile = async (profile) => {
    try {
      await api.put(`/release-profiles/${profile.id}`, profile);
      setEditingReleaseProfile(null);
      fetchReleaseProfiles();
      customAlert('Release profile updated!', 'success');
    } catch {
      customAlert('Failed to update release profile', 'error');
    }
  };

  const handleDeleteReleaseProfile = async (id) => {
    try {
      await api.delete(`/release-profiles/${id}`);
      fetchReleaseProfiles();
      customAlert('Release profile deleted!', 'success');
    } catch {
      customAlert('Failed to delete release profile', 'error');
    }
  };

  const currentGroup = SETTINGS_GROUPS.find(g => g.tabs.some(t => t.id === activeTab)) || SETTINGS_GROUPS[0];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div ref={headerRef} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-slate-100 font-display flex items-center gap-2.5 sm:gap-3 !mb-0">
            <Settings2 className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 shrink-0" /> <span className="truncate">Settings</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 hidden sm:block !mb-0 font-sans">
            Manage your integrations, indexers, and application preferences.
          </p>
        </div>
      </div>

      <StickyBar visible={stickyVisible} />

      {/* Top Level Categories */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex items-center bg-[#101e31] p-1 rounded-xl border border-[#1c2d46] shadow-inner select-none w-fit max-w-full overflow-x-auto no-scrollbar gap-1">
          {SETTINGS_GROUPS.map(group => {
            const isGroupActive = currentGroup.id === group.id;
            const GroupIcon = group.icon;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  if (currentGroup.id !== group.id) {
                    const nextTab = group.tabs[0].id;
                    setActiveTab(nextTab);
                    setSearchParams({ tab: nextTab });
                  }
                }}
                className={`relative px-4 sm:px-5 py-2 flex items-center justify-center gap-2 rounded-lg text-xs sm:text-sm font-bold tracking-tight whitespace-nowrap transition-colors duration-150 ${
                  isGroupActive ? 'text-slate-950 font-bold' : 'text-slate-200 hover:text-white'
                }`}
              >
                {isGroupActive && (
                  <motion.div
                    layoutId="settings-group-slider"
                    className="absolute inset-0 rounded-lg bg-gradient-to-b from-[#38a7f4] to-[#2291ea] shadow-sm"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <GroupIcon className={`relative z-10 w-4 h-4 shrink-0 transition-colors duration-150 ${
                  isGroupActive ? 'text-slate-950' : 'text-slate-400'
                }`} />
                <span className="relative z-10">{group.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-Navigation for Active Category */}
      <AnimatePresence mode="wait" initial={false}>
        {currentGroup.tabs.length > 1 && (
          <motion.div
            key={currentGroup.id}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.12 }}
            className="flex items-center gap-1 p-1 bg-[#0c1624] border border-[#1c2d46] rounded-xl shadow-inner w-fit max-w-full overflow-x-auto no-scrollbar select-none"
          >
            {currentGroup.tabs.map(tab => {
              const isTabActive = activeTab === tab.id;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSearchParams({ tab: tab.id });
                  }}
                  className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
                    isTabActive
                      ? 'text-cyan-300 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isTabActive && (
                    <motion.div
                      layoutId={`settings-subtab-slider-${currentGroup.id}`}
                      className="absolute inset-0 rounded-lg bg-cyan-500/15 border border-cyan-500/30 shadow-sm"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <TabIcon className={`relative z-10 w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-colors duration-150 ${
                    isTabActive ? 'text-cyan-400' : 'text-slate-500'
                  }`} />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="space-y-6 pt-1 pb-24 min-h-[60vh]">
        {status.message && (
          <div className={`w-full flex items-center space-x-2 p-4 rounded-xl ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-medium">{status.message}</span>
          </div>
        )}

        {activeTab === 'connections' && (
          <ConnectionsTab
            settings={settings}
            setSettings={setSettings}
            handleSave={handleSave}
            simklDeviceCode={simklDeviceCode}
            simklUserCode={simklUserCode}
            simklVerificationUrl={simklVerificationUrl}
            simklPolling={simklPolling}
            connectSimkl={connectSimkl}
            fetchSettings={fetchSettings}
            keyStatuses={keyStatuses}
          />
        )}
        {(activeTab === 'general' || activeTab === 'security') && <GeneralTab settings={settings} setSettings={setSettings} onNavigateTab={setActiveTab} />}
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
            paths={paths} newPath={newPath} newPathType={newPathType} setNewPath={setNewPath} setNewPathType={setNewPathType}
            handleAddPath={handleAddPath} fetchPaths={fetchPaths}
            handleScan={handleScan} handleStopScan={handleStopScan} isScanning={isScanning} scanProgress={scanProgress}
            scanResults={scanResults} isStaleResults={isStaleResults} setScanResults={setScanResults} setIsStaleResults={setIsStaleResults}
            settings={settings} setSettings={setSettings}
          />
        )}
      </div>

      {/* Bottom Fixed Bar */}
      {['general', 'security', 'connections', 'indexers', 'clients', 'naming', 'subtitles', 'library'].includes(activeTab) && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#101b2b]/95 backdrop-blur-md border-t border-slate-800/80 p-3">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-end">
            <button
              onClick={handleSave}
              className="px-6 py-2.5 text-sm font-bold text-slate-950 bg-gradient-to-b from-[#38a7f4] to-[#2291ea] hover:brightness-110 rounded-xl transition-all flex items-center justify-center gap-2 w-full sm:w-auto shadow-[0_0_15px_rgba(56,167,244,0.3)] active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" /> Save Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

