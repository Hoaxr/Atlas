import { useState, useEffect, useRef } from 'react';
import { BellRing, Save, Link, Loader2, Key, Trash2, UserCheck, ExternalLink } from 'lucide-react';
import api from '../../lib/api';
import { customAlert, customConfirm } from '../../utils/alerts';
import PasswordInput from '../../components/shared/PasswordInput';
import Button from '../../components/shared/Button';
import { SettingsSection, SettingsHeader } from '../../components/settings/layout';
import ToggleRow from '../../components/shared/ToggleRow';

export default function ConnectionsTab({
  settings,
  setSettings,
  handleSave: _parentHandleSave,
  simklDeviceCode,
  setSimklDeviceCode,
  simklUserCode,
  simklVerificationUrl,
  simklPolling,
  setSimklPolling,
  connectSimkl,
  fetchSettings,
  keyStatuses: _keyStatuses
}) {
  const [localSettings, setLocalSettings] = useState({
    plexUrl: settings?.plexUrl || '',
    plexToken: settings?.plexToken || '',
    jellyfinUrl: settings?.jellyfinUrl || '',
    jellyfinApiKey: settings?.jellyfinApiKey || '',
    embyUrl: settings?.embyUrl || '',
    embyApiKey: settings?.embyApiKey || '',
    autoWatchUser: settings?.autoWatchUser || '',
    discordWebhookUrl: settings?.discordWebhookUrl || '',
    telegramBotToken: settings?.telegramBotToken || '',
    telegramChatId: settings?.telegramChatId || '',
    pushoverAppToken: settings?.pushoverAppToken || '',
    pushoverUserKey: settings?.pushoverUserKey || '',
    notifyOnGrab: settings?.notifyOnGrab || false,
    notifyOnDownload: settings?.notifyOnDownload || false,
    notifyOnPlaybackStart: settings?.notifyOnPlaybackStart || false,
    notifyOnRequest: settings?.notifyOnRequest || false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [simklPulling, setSimklPulling] = useState(false);
  const [testStatuses, setTestStatuses] = useState({ plex: null, jellyfin: null, emby: null });
  const [testingMedia, setTestingMedia] = useState({ plex: false, jellyfin: false, emby: false });
  const [detectedUsers, setDetectedUsers] = useState([]);
  const [purgingUntracked, setPurgingUntracked] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState(null);
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [discordStatus, setDiscordStatus] = useState(null);
  const [testingPushover, setTestingPushover] = useState(false);
  const [pushoverStatus, setPushoverStatus] = useState(null);
  const [testingTmdb, setTestingTmdb] = useState(false);
  const [tmdbStatus, setTmdbStatus] = useState(null);
    
  // Plex OAuth state
  const [plexOAuth, setPlexOAuth] = useState({
    loading: false,
    pinId: null,
    code: null,
    authUrl: null,
    polling: false
  });
  const POLL_INTERVAL = 2000; // 2 seconds
  const mountedRef = useRef(true);

  useEffect(() => {
    fetchConnectionsSettings();
    fetchDetectedUsers();
    return () => { mountedRef.current = false; };
    // fetch once on mount; fetchConnectionsSettings reads only static config
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDetectedUsers = async () => {
    try {
      const res = await api.get('/watcher/stats');
      if (res.data?.data?.topUsers) {
        const users = res.data.data.topUsers.map(u => u.user).filter(Boolean);
        if (mountedRef.current) setDetectedUsers(users);
      }
    } catch { /* ignore */ }
  };

  const handleAddTrackedUser = (username) => {
    const currentList = localSettings.autoWatchUser
      ? localSettings.autoWatchUser.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    if (!currentList.includes(username)) {
      const updated = [...currentList, username].join(', ');
      setLocalSettings(prev => ({ ...prev, autoWatchUser: updated }));
      if (setSettings) setSettings(prev => ({ ...prev, autoWatchUser: updated }));
    }
  };

  const handlePurgeUntracked = async () => {
    const ok = await customConfirm(
      'This will remove watch history and unmark watched status for any media played by users other than your configured tracked user(s). Continue?',
      {
        title: 'Purge Untracked History?',
        confirmText: 'Purge Now',
        type: 'warning'
      }
    );
    if (!ok) return;

    setPurgingUntracked(true);
    try {
      const res = await api.post('/tracker/clean-untracked');
      const count = res.data?.cleaned ?? 0;
      customAlert(`Purged ${count} untracked watch history entries.`, 'success');
      fetchDetectedUsers();
    } catch (err) {
      customAlert(err.response?.data?.error || err.message || 'Failed to purge untracked watch history', 'error');
    } finally {
      if (mountedRef.current) setPurgingUntracked(false);
    }
  };

  const fetchConnectionsSettings = async () => {
    try {
      const res = await api.get('/settings');
      if (res.data.status === 'success') {
        const data = res.data.data;
        const newVals = {
          plexUrl: data.plexUrl || '',
          plexToken: data.plexToken || '',
          jellyfinUrl: data.jellyfinUrl || '',
          jellyfinApiKey: data.jellyfinApiKey || '',
          embyUrl: data.embyUrl || '',
          embyApiKey: data.embyApiKey || '',
          autoWatchUser: data.autoWatchUser || '',
          discordWebhookUrl: data.discordWebhookUrl || '',
          telegramBotToken: data.telegramBotToken || '',
          telegramChatId: data.telegramChatId || '',
          pushoverAppToken: data.pushoverAppToken || '',
          pushoverUserKey: data.pushoverUserKey || '',
          notifyOnGrab: data.notifyOnGrab === 'true',
          notifyOnDownload: data.notifyOnDownload === 'true',
          notifyOnPlaybackStart: data.notifyOnPlaybackStart === 'true',
          notifyOnRequest: data.notifyOnRequest === 'true'
        };
        setLocalSettings(newVals);
        if (setSettings) {
          setSettings(prev => ({
            ...prev,
            ...newVals
          }));
        }
        
        // Auto test configured media servers
        if (data.plexUrl && data.plexToken) testMediaServer('plex', data.plexUrl, data.plexToken, true);
        if (data.jellyfinUrl && data.jellyfinApiKey) testMediaServer('jellyfin', data.jellyfinUrl, data.jellyfinApiKey, true);
        if (data.embyUrl && data.embyApiKey) testMediaServer('emby', data.embyUrl, data.embyApiKey, true);
      }
    } catch (err) {
      console.error(err);
      customAlert('Failed to load connection settings');
    } finally {
      setLoading(false);
    }
  };

  const testMediaServer = async (type, url, apiKey, silent = false) => {
    if (!url || !apiKey) {
      if (!silent) customAlert(`Please enter both URL and API Key/Token for ${type}`);
      return;
    }

    setTestingMedia(prev => ({ ...prev, [type]: true }));
    try {
      const res = await api.post('/settings/media-server/test', { type, url, apiKey });
      if (res.data.status === 'success') {
        if (!silent) customAlert(res.data.message);
        setTestStatuses(prev => ({ ...prev, [type]: 'connected' }));
      } else {
        throw new Error(res.data.message);
      }
    } catch (err) {
      if (!silent) customAlert(err.response?.data?.message || `Failed to connect to ${type}`);
      setTestStatuses(prev => ({ ...prev, [type]: 'error' }));
    } finally {
      setTestingMedia(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleTestMediaServerBtn = (type) => {
    let url, apiKey;
    if (type === 'plex') { url = localSettings.plexUrl; apiKey = localSettings.plexToken; }
    if (type === 'jellyfin') { url = localSettings.jellyfinUrl; apiKey = localSettings.jellyfinApiKey; }
    if (type === 'emby') { url = localSettings.embyUrl; apiKey = localSettings.embyApiKey; }
    testMediaServer(type, url, apiKey, false);
  };

  // Plex OAuth handlers
  const handlePlexOAuthStart = async () => {
    setPlexOAuth({ loading: true, pinId: null, code: null, authUrl: null, polling: false });
    try {
      const res = await api.post('/settings/plex/pin');
      if (res.data.status === 'success') {
        const { pinId, code, authUrl } = res.data.data;
        setPlexOAuth({ loading: false, pinId, code, authUrl, polling: true });
        // Open Plex auth in new window
        window.open(authUrl, '_blank', 'width=600,height=700');
        customAlert('Plex authentication window opened. Sign in to authorize Atlas.');
        // Start polling for auth result
        pollPlexPin(pinId);
      }
    } catch {
      setPlexOAuth({ loading: false, pinId: null, code: null, authUrl: null, polling: false });
      customAlert('Failed to initiate Plex authentication');
    }
  };

  const pollPlexPin = async (pinId) => {
    if (!mountedRef.current) return;
    try {
      const res = await api.get(`/settings/plex/pin/${pinId}`);
      if (!mountedRef.current) return;
      if (res.data.data?.expired) {
        setPlexOAuth({ loading: false, pinId: null, code: null, authUrl: null, polling: false });
        customAlert('Plex authentication expired. Please try again.');
        return;
      }

      if (res.data.data?.retryAfter) {
        setTimeout(() => pollPlexPin(pinId), res.data.data.retryAfter * 1000);
        return;
      }

      if (res.data.status === 'success' && res.data.data.authorized) {
        const { authToken, plexUrl } = res.data.data;
        const updatedSettings = {
          ...localSettings,
          plexToken: authToken,
          ...(plexUrl ? { plexUrl } : {})
        };
        setLocalSettings(updatedSettings);
        if (setSettings) {
          setSettings(prev => ({
            ...prev,
            ...updatedSettings
          }));
        }
        setPlexOAuth({ loading: false, pinId: null, code: null, authUrl: null, polling: false });

        if (plexUrl) {
          customAlert('Successfully authenticated with Plex!');
          // Auto-save the token and URL
          try {
            await api.post('/settings', {
              ...updatedSettings,
              notifyOnGrab: updatedSettings.notifyOnGrab.toString(),
              notifyOnDownload: updatedSettings.notifyOnDownload.toString(),
              notifyOnPlaybackStart: updatedSettings.notifyOnPlaybackStart.toString(),
              notifyOnRequest: updatedSettings.notifyOnRequest.toString()
            });
          } catch (saveErr) {
            console.error('Auto-save after OAuth failed:', saveErr);
          }
          // Test connection with new token
          testMediaServer('plex', plexUrl, authToken, false);
        } else {
          customAlert('Plex token obtained! Please enter your Plex server URL manually.');
          // Auto-save the token (URL will be empty until user enters it)
          try {
            await api.post('/settings', {
              ...updatedSettings,
              notifyOnGrab: updatedSettings.notifyOnGrab.toString(),
              notifyOnDownload: updatedSettings.notifyOnDownload.toString(),
              notifyOnPlaybackStart: updatedSettings.notifyOnPlaybackStart.toString(),
              notifyOnRequest: updatedSettings.notifyOnRequest.toString()
            });
          } catch (saveErr) {
            console.error('Auto-save after OAuth failed:', saveErr);
          }
        }
      } else {
        // Keep polling
        setTimeout(() => pollPlexPin(pinId), POLL_INTERVAL);
      }
    } catch (err) {
      // If pin expired or error, stop polling
      if (err.response?.status === 404 || err.response?.status === 410) {
        setPlexOAuth({ loading: false, pinId: null, code: null, authUrl: null, polling: false });
        customAlert('Plex authentication expired. Please try again.');
      } else {
        // Retry on network errors
        setTimeout(() => pollPlexPin(pinId), POLL_INTERVAL * 2);
      }
    }
  };

  const handlePlexOAuthCancel = () => {
    setPlexOAuth({ loading: false, pinId: null, code: null, authUrl: null, polling: false });
    customAlert('Plex authentication cancelled', 'info');
  };

  const handleSimklPull = async () => {
    if (simklPulling) return;
    setSimklPulling(true);
    try {
      const res = await api.post('/simkl/pull');
      if (res.data.status === 'success') {
        customAlert(res.data.message);
      } else {
        customAlert('Failed to pull from Simkl');
      }
    } catch (e) {
      customAlert('Failed to pull from Simkl: ' + (e.response?.data?.error || e.message));
    } finally {
      setSimklPulling(false);
    }
  };


  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;
    setLocalSettings(prev => ({
      ...prev,
      [name]: val
    }));
    if (setSettings) {
      setSettings(prev => ({
        ...prev,
        [name]: val
      }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save media server, tracked users, notifications, and API settings in one request
      await api.post('/settings', {
        ...localSettings,
        notifyOnGrab: localSettings.notifyOnGrab?.toString(),
        notifyOnDownload: localSettings.notifyOnDownload?.toString(),
        notifyOnPlaybackStart: localSettings.notifyOnPlaybackStart?.toString(),
        notifyOnRequest: localSettings.notifyOnRequest?.toString(),
        tmdbApiKey: typeof settings?.tmdbApiKey === 'string' && settings.tmdbApiKey.startsWith('***')
          ? undefined
          : settings?.tmdbApiKey,
        simklClientId: typeof settings?.simklClientId === 'string' && settings.simklClientId.startsWith('***')
          ? undefined
          : settings?.simklClientId,
        simklClientSecret: typeof settings?.simklClientSecret === 'string' && settings.simklClientSecret.startsWith('***')
          ? undefined
          : settings?.simklClientSecret,
        simklWatchedSync: settings?.simklWatchedSync,
      });
      if (fetchSettings) fetchSettings();
      customAlert('Connection settings saved', 'success');
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.errors?.join(', ') || err.response?.data?.message || 'Failed to save settings';
      customAlert(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotification = async () => {
    const hasDiscord = !!localSettings.discordWebhookUrl;
    const hasTelegramToken = !!localSettings.telegramBotToken;
    const hasTelegramChat = !!localSettings.telegramChatId;
    const hasPushoverApp = !!localSettings.pushoverAppToken;
    const hasPushoverUser = !!localSettings.pushoverUserKey;

    if (!hasDiscord && !hasTelegramToken && !hasTelegramChat && !hasPushoverApp && !hasPushoverUser) {
      customAlert('Please configure at least one notification service to test');
      return;
    }

    if ((hasTelegramToken && !hasTelegramChat) || (!hasTelegramToken && hasTelegramChat)) {
      customAlert('Telegram requires both a Bot Token and a Chat ID');
      return;
    }

    if ((hasPushoverApp && !hasPushoverUser) || (!hasPushoverApp && hasPushoverUser)) {
      customAlert('Pushover requires both an App Token and a User Key');
      return;
    }

    try {
      await api.post('/settings/test-notification', {
        discordWebhookUrl: localSettings.discordWebhookUrl,
        telegramBotToken: localSettings.telegramBotToken,
        telegramChatId: localSettings.telegramChatId,
        pushoverAppToken: localSettings.pushoverAppToken,
        pushoverUserKey: localSettings.pushoverUserKey
      });
      customAlert('Test notification triggered');
    } catch {
      customAlert('Test failed to send');
    }
  };

  const handleTestTelegram = async () => {
    if (!localSettings.telegramBotToken || !localSettings.telegramChatId) {
      customAlert('Both Telegram Bot Token and Chat ID are required', 'error');
      return;
    }
    setTestingTelegram(true);
    setTelegramStatus(null);
    try {
      const res = await api.post('/settings/telegram/test', {
        botToken: localSettings.telegramBotToken,
        chatId: localSettings.telegramChatId
      });
      if (res.data?.status === 'success') {
        customAlert(res.data.message || 'Test message sent to Telegram!', 'success');
        setTelegramStatus('connected');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to send Telegram test message';
      customAlert(msg, 'error');
      setTelegramStatus('error');
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleTestDiscord = async () => {
    if (!localSettings.discordWebhookUrl) {
      customAlert('Discord Webhook URL is required', 'error');
      return;
    }
    setTestingDiscord(true);
    setDiscordStatus(null);
    try {
      const res = await api.post('/settings/discord/test', {
        webhookUrl: localSettings.discordWebhookUrl
      });
      if (res.data?.status === 'success') {
        customAlert(res.data.message || 'Test notification sent to Discord!', 'success');
        setDiscordStatus('connected');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to send Discord test message';
      customAlert(msg, 'error');
      setDiscordStatus('error');
    } finally {
      setTestingDiscord(false);
    }
  };

  const handleTestPushover = async () => {
    if (!localSettings.pushoverAppToken || !localSettings.pushoverUserKey) {
      customAlert('Both Pushover App Token and User Key are required', 'error');
      return;
    }
    setTestingPushover(true);
    setPushoverStatus(null);
    try {
      const res = await api.post('/settings/pushover/test', {
        appToken: localSettings.pushoverAppToken,
        userKey: localSettings.pushoverUserKey
      });
      if (res.data?.status === 'success') {
        customAlert(res.data.message || 'Test message sent to Pushover!', 'success');
        setPushoverStatus('connected');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to send Pushover test message';
      customAlert(msg, 'error');
      setPushoverStatus('error');
    } finally {
      setTestingPushover(false);
    }
  };

  const handleTestTmdb = async () => {
    if (!settings?.tmdbApiKey) {
      customAlert('TMDB API Key is required', 'error');
      return;
    }
    setTestingTmdb(true);
    setTmdbStatus(null);
    try {
      const res = await api.post('/settings/service/test', {
        service: 'tmdb',
        apiKey: settings.tmdbApiKey
      });
      if (res.data?.status === 'success') {
        customAlert(res.data.message || 'Connected to TMDB successfully!', 'success');
        setTmdbStatus('connected');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to connect to TMDB';
      customAlert(msg, 'error');
      setTmdbStatus('error');
    } finally {
      setTestingTmdb(false);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-6 w-full animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold font-display text-slate-100 flex items-center gap-2.5 mb-1.5">
            <Link className="w-5 h-5 text-cyan-400 shrink-0" /> Connections
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Connect Atlas to your media servers, tracking lists, and metadata providers.
          </p>
        </div>
        <Button
          variant="primary"
          icon={Save}
          disabled={saving}
          onClick={handleSave}
          className="shrink-0 w-fit"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* ── API's & Integrations ── */}
      <SettingsSection>
        <SettingsHeader 
          title="APIs & Integrations" 
          icon={Key} 
        />

        <div className="space-y-4 sm:space-y-5">
          {/* TMDB */}
          <div className="p-4 sm:p-5 bg-[#101e31] rounded-xl border border-[#1c2d46] hover:border-[#274063] transition-colors space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold font-display text-cyan-400">TMDB</h3>
                {!settings?.tmdbApiKey || settings.tmdbApiKey === '' ? (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700/60 whitespace-nowrap">Not configured</span>
                ) : tmdbStatus === 'error' ? (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap">Error</span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">Connected</span>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <a
                  href="https://www.themoviedb.org/settings/api?language=en-US"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-cyan-400 bg-[#131f33] hover:bg-[#182842] border border-[#1c2d46] hover:border-cyan-500/30 rounded-xl transition-all cursor-pointer"
                >
                  <span>Get Key</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
                <button
                  type="button"
                  onClick={handleTestTmdb}
                  disabled={testingTmdb || !settings?.tmdbApiKey}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-[#15243b] hover:bg-[#1a2d4a] border border-[#1c2d46] hover:border-cyan-500/30 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                >
                  {testingTmdb && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
                  {testingTmdb ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400">TMDB provides all metadata, posters, and search results.</p>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                API Key
              </label>
              <PasswordInput
                placeholder="Enter your TMDB API Key"
                className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600 font-mono"
                value={settings?.tmdbApiKey || ''}
                onChange={(e) => setSettings({ ...settings, tmdbApiKey: e.target.value })}
              />
            </div>
          </div>

          {/* Simkl */}
          <div className="p-4 sm:p-5 bg-[#101e31] rounded-xl border border-[#1c2d46] hover:border-[#274063] transition-colors space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold font-display text-cyan-400">Simkl</h3>
                {!settings?.simklAccessToken ? (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700/60 whitespace-nowrap">Not configured</span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">Connected</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="https://simkl.com/settings/developer/new/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-cyan-400 bg-[#131f33] hover:bg-[#182842] border border-[#1c2d46] hover:border-cyan-500/30 rounded-xl transition-all cursor-pointer"
                >
                  <span>Create App</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
                {settings?.simklAccessToken && (
                  <button
                    onClick={async () => {
                      if (await customConfirm('Disconnect from Simkl? You can reconnect later.')) {
                        await api.post('/auth/simkl/disconnect');
                        customAlert('Disconnected from Simkl');
                        fetchSettings();
                      }
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition-all"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-400">Simkl syncs your watched status and movie/show completion history.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Simkl Client ID</span>
                  <a
                    href="https://simkl.com/settings/developer/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-cyan-300 transition-colors"
                  >
                    <span>Find Keys</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </label>
                <PasswordInput
                  placeholder="Paste your Simkl Client ID"
                  className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600 font-mono"
                  value={settings?.simklClientId || ''}
                  onChange={(e) => setSettings({ ...settings, simklClientId: e.target.value })}
                />
                {settings?.simklClientId?.trim().startsWith('simkl_cs_') && (
                  <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px]">
                    ⚠️ That looks like a Client Secret. Paste the Client ID here and the Secret on the right.
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Simkl Client Secret</span>
                  <span className="text-[11px] text-slate-400 font-normal">From Developer Settings</span>
                </label>
                <PasswordInput
                  placeholder="Enter Simkl Client Secret (simkl_cs_...)"
                  className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600 font-mono"
                  value={settings?.simklClientSecret || ''}
                  onChange={(e) => setSettings({ ...settings, simklClientSecret: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap pt-1">
              {!settings?.simklAccessToken && !simklDeviceCode && (
                <button
                  onClick={connectSimkl}
                  disabled={!settings?.simklClientId}
                  className="bg-gradient-to-b from-[#38a7f4] to-[#2291ea] text-slate-950 font-bold py-2 px-4 rounded-xl text-xs transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap active:scale-95 hover:brightness-105"
                >
                  Connect with Simkl
                </button>
              )}
              {settings?.simklAccessToken && (
                <button
                  onClick={handleSimklPull}
                  disabled={simklPulling}
                  className="bg-[#15243b] hover:bg-[#1a2d4a] text-cyan-400 border border-cyan-500/30 font-semibold py-2 px-4 rounded-xl text-xs transition-all flex items-center gap-2 whitespace-nowrap active:scale-95"
                >
                  {simklPulling ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" /> Pulling...</>
                  ) : 'Pull from Simkl'}
                </button>
              )}
              <div className="w-full sm:w-auto">
                <ToggleRow
                  checked={settings?.simklWatchedSync}
                  onChange={(e) => setSettings(prev => ({ ...prev, simklWatchedSync: e.target.checked }))}
                  title="Watched sync"
                  description="Automatically sync watched status between Atlas and Simkl"
                  className="bg-transparent border-transparent hover:border-[#1c2d46] !p-2"
                />
              </div>
            </div>

            {simklDeviceCode && (
              <div className="bg-[#0b1522] border border-cyan-500/30 rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-300 font-semibold">Simkl Authorization</p>
                  <button
                    type="button"
                    onClick={() => {
                      if (setSimklDeviceCode) setSimklDeviceCode(null);
                      if (setSimklPolling) setSimklPolling(false);
                    }}
                    className="text-xs text-slate-400 hover:text-rose-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-xs text-slate-400">Go to the following URL and approve the request:</p>
                <a href={simklVerificationUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-cyan-400 hover:text-cyan-300 underline block break-all">{simklVerificationUrl}</a>
                <div className="text-2xl font-black tracking-widest bg-[#101e31] px-5 py-2.5 rounded-xl border border-cyan-500/30 text-cyan-300 select-all inline-block font-mono">{simklUserCode}</div>
                {simklPolling ? (
                  <div className="flex items-center gap-2 text-xs text-cyan-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Waiting for authorization...
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Waiting for authorization...</p>
                )}
              </div>
            )}
          </div>

          {/* Plex */}
          <div className="p-4 sm:p-5 bg-[#101e31] rounded-xl border border-[#1c2d46] hover:border-[#274063] transition-colors space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold font-display text-amber-400">Plex</h3>
                {testStatuses.plex === 'connected' && <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">Connected</span>}
                {testStatuses.plex === 'error' && <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap">Disconnected</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {plexOAuth.polling ? (
                  <button
                    onClick={handlePlexOAuthCancel}
                    className="px-3 py-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl transition-all flex items-center gap-1.5"
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Waiting for auth...
                  </button>
                ) : (
                  <button
                    onClick={handlePlexOAuthStart}
                    disabled={plexOAuth.loading}
                    className="px-3 py-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {plexOAuth.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link className="w-3.5 h-3.5" />}
                    Sign in with Plex
                  </button>
                )}
                <button
                  onClick={() => handleTestMediaServerBtn('plex')}
                  disabled={testingMedia.plex}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-[#15243b] hover:bg-[#1a2d4a] border border-[#1c2d46] hover:border-cyan-500/30 rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {testingMedia.plex && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
                  {testingMedia.plex ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400">Plex serves your media library and can be notified to scan for new imports.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">Plex URL</label>
                <input
                  type="text"
                  name="plexUrl"
                  value={localSettings.plexUrl}
                  onChange={handleChange}
                  placeholder="http://192.168.1.100:32400"
                  className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-colors placeholder:text-slate-600"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">Plex Token</label>
                <PasswordInput
                  name="plexToken"
                  value={localSettings.plexToken}
                  onChange={handleChange}
                  className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-colors placeholder:text-slate-600 font-mono"
                />
              </div>
            </div>
            {plexOAuth.polling && (
              <div className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5">
                Sign in to your Plex account in the opened window. Token will be filled automatically once authorized.
              </div>
            )}
          </div>

          {/* Jellyfin */}
          <div className="p-4 sm:p-5 bg-[#101e31] rounded-xl border border-[#1c2d46] hover:border-[#274063] transition-colors space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold font-display text-purple-400">Jellyfin</h3>
                {testStatuses.jellyfin === 'connected' && <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">Connected</span>}
                {testStatuses.jellyfin === 'error' && <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap">Disconnected</span>}
              </div>
              <button
                onClick={() => handleTestMediaServerBtn('jellyfin')}
                disabled={testingMedia.jellyfin}
                className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-[#15243b] hover:bg-[#1a2d4a] border border-[#1c2d46] hover:border-cyan-500/30 rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {testingMedia.jellyfin && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
                {testingMedia.jellyfin ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
            <p className="text-xs text-slate-400">Jellyfin serves your media library and can be notified to scan for new imports.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">Jellyfin URL</label>
                <input
                  type="text"
                  name="jellyfinUrl"
                  value={localSettings.jellyfinUrl}
                  onChange={handleChange}
                  placeholder="http://192.168.1.100:8096"
                  className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-colors placeholder:text-slate-600"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">API Key</label>
                <PasswordInput
                  name="jellyfinApiKey"
                  value={localSettings.jellyfinApiKey}
                  onChange={handleChange}
                  className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-colors placeholder:text-slate-600 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Emby */}
          <div className="p-4 sm:p-5 bg-[#101e31] rounded-xl border border-[#1c2d46] hover:border-[#274063] transition-colors space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold font-display text-emerald-400">Emby</h3>
                {testStatuses.emby === 'connected' && <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">Connected</span>}
                {testStatuses.emby === 'error' && <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap">Disconnected</span>}
              </div>
              <button
                onClick={() => handleTestMediaServerBtn('emby')}
                disabled={testingMedia.emby}
                className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-[#15243b] hover:bg-[#1a2d4a] border border-[#1c2d46] hover:border-cyan-500/30 rounded-xl transition-all disabled:opacity-50 self-start flex items-center gap-1.5"
              >
                {testingMedia.emby && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
                {testingMedia.emby ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
            <p className="text-xs text-slate-400">Emby serves your media library and can be notified to scan for new imports.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">Emby URL</label>
                <input
                  type="text"
                  name="embyUrl"
                  value={localSettings.embyUrl}
                  onChange={handleChange}
                  placeholder="http://192.168.1.100:8096"
                  className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-colors placeholder:text-slate-600"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">API Key</label>
                <PasswordInput
                  name="embyApiKey"
                  value={localSettings.embyApiKey}
                  onChange={handleChange}
                  className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-colors placeholder:text-slate-600 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Tracked Media Server User(s) */}
          <div className="p-4 sm:p-5 bg-[#101e31] rounded-xl border border-[#1c2d46] hover:border-[#274063] transition-colors space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold font-display text-cyan-400">Tracked Media Server User(s)</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xl">
                  Only playback from these usernames on Plex/Jellyfin/Emby will update watch progress, auto-mark items as watched, and update your Tracker history. Leave blank to match your Atlas admin user, or enter * to track all users.
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={handlePurgeUntracked}
                loading={purgingUntracked}
                icon={Trash2}
                className="shrink-0 self-start text-xs py-1.5 px-3"
              >
                Purge Untracked History
              </Button>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                Usernames (comma-separated)
              </label>
              <input
                type="text"
                name="autoWatchUser"
                value={localSettings.autoWatchUser}
                onChange={handleChange}
                placeholder="e.g. silence, JohnDoe (or * for all users)"
                className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600"
              />
            </div>
            {detectedUsers.length > 0 && (
              <div className="pt-1">
                <span className="text-[11px] font-medium text-slate-400 block mb-1.5">
                  Detected users from media server activity (click to add):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {detectedUsers.map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => handleAddTrackedUser(u)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-cyan-500/20 hover:text-cyan-300 text-slate-300 border border-slate-700/60 hover:border-cyan-500/30 transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <UserCheck className="w-3 h-3 text-cyan-400" />
                      <span>{u}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection>
        <SettingsHeader 
          title="Notifications" 
          icon={BellRing} 
        />

        <div className="space-y-4 sm:space-y-5">
          {/* Discord */}
          <div className="p-4 sm:p-5 bg-[#101e31] rounded-xl border border-[#1c2d46] hover:border-[#274063] transition-colors space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold font-display text-slate-100">Discord Webhook</h3>
                {!localSettings.discordWebhookUrl ? (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700/60 whitespace-nowrap">Not configured</span>
                ) : discordStatus === 'connected' ? (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">Connected</span>
                ) : discordStatus === 'error' ? (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap">Error</span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">Configured</span>
                )}
              </div>
              <button
                type="button"
                onClick={handleTestDiscord}
                disabled={testingDiscord || !localSettings.discordWebhookUrl}
                className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-[#15243b] hover:bg-[#1a2d4a] border border-[#1c2d46] hover:border-cyan-500/30 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
              >
                {testingDiscord && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
                {testingDiscord ? 'Testing...' : 'Test Webhook'}
              </button>
            </div>
            <p className="text-xs text-slate-400">Discord receives grab, download, and playback notifications via webhook.</p>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">Webhook URL</label>
              <input
                type="text"
                name="discordWebhookUrl"
                value={localSettings.discordWebhookUrl}
                onChange={handleChange}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600 font-mono"
              />
            </div>
          </div>

          {/* Telegram */}
          <div className="p-4 sm:p-5 bg-[#101e31] rounded-xl border border-[#1c2d46] hover:border-[#274063] transition-colors space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold font-display text-slate-100">Telegram Bot</h3>
                {!localSettings.telegramBotToken || !localSettings.telegramChatId ? (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700/60 whitespace-nowrap">Not configured</span>
                ) : telegramStatus === 'connected' ? (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">Connected</span>
                ) : telegramStatus === 'error' ? (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap">Error</span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">Configured</span>
                )}
              </div>
              <button
                type="button"
                onClick={handleTestTelegram}
                disabled={testingTelegram || !localSettings.telegramBotToken || !localSettings.telegramChatId}
                className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-[#15243b] hover:bg-[#1a2d4a] border border-[#1c2d46] hover:border-cyan-500/30 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
              >
                {testingTelegram && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
                {testingTelegram ? 'Testing...' : 'Test Message'}
              </button>
            </div>
            <p className="text-xs text-slate-400">Telegram receives grab, download, and playback notifications via a bot.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">Bot Token</label>
                <PasswordInput
                  name="telegramBotToken"
                  value={localSettings.telegramBotToken}
                  onChange={handleChange}
                  placeholder="123456:ABC-DEF..."
                  className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">Chat ID</label>
                <PasswordInput
                  name="telegramChatId"
                  value={localSettings.telegramChatId}
                  onChange={handleChange}
                  placeholder="-100123456789"
                  className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600"
                />
              </div>
            </div>
          </div>

          {/* Pushover */}
          <div className="p-4 sm:p-5 bg-[#101e31] rounded-xl border border-[#1c2d46] hover:border-[#274063] transition-colors space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold font-display text-slate-100">Pushover</h3>
                {!localSettings.pushoverAppToken || !localSettings.pushoverUserKey ? (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700/60 whitespace-nowrap">Not configured</span>
                ) : pushoverStatus === 'connected' ? (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">Connected</span>
                ) : pushoverStatus === 'error' ? (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap">Error</span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">Configured</span>
                )}
              </div>
              <button
                type="button"
                onClick={handleTestPushover}
                disabled={testingPushover || !localSettings.pushoverAppToken || !localSettings.pushoverUserKey}
                className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-[#15243b] hover:bg-[#1a2d4a] border border-[#1c2d46] hover:border-cyan-500/30 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
              >
                {testingPushover && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
                {testingPushover ? 'Testing...' : 'Test Message'}
              </button>
            </div>
            <p className="text-xs text-slate-400">Receive notifications natively on your iOS or Android devices.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">App Token</label>
                <PasswordInput
                  name="pushoverAppToken"
                  value={localSettings.pushoverAppToken}
                  onChange={handleChange}
                  placeholder="a1b2c3d4e5..."
                  className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">User Key</label>
                <PasswordInput
                  name="pushoverUserKey"
                  value={localSettings.pushoverUserKey}
                  onChange={handleChange}
                  placeholder="u1v2w3x4y5..."
                  className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600 font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Events & Triggers */}
        <div className="space-y-3 pt-2">
          <h3 className="text-base font-bold font-display text-slate-100">Notification Triggers</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ToggleRow
              checked={localSettings.notifyOnGrab}
              onChange={(e) => handleChange({ target: { name: 'notifyOnGrab', type: 'checkbox', checked: e.target.checked } })}
              title="Notify on Grab"
              description="When release is sent to download client"
            />
            <ToggleRow
              checked={localSettings.notifyOnDownload}
              onChange={(e) => handleChange({ target: { name: 'notifyOnDownload', type: 'checkbox', checked: e.target.checked } })}
              title="Notify on Download Complete"
              description="When client finishes and Atlas imports"
            />
            <ToggleRow
              checked={localSettings.notifyOnPlaybackStart}
              onChange={(e) => handleChange({ target: { name: 'notifyOnPlaybackStart', type: 'checkbox', checked: e.target.checked } })}
              title="Notify on Playback Start"
              description="When media starts playing on a server"
            />
            <ToggleRow
              checked={localSettings.notifyOnRequest}
              onChange={(e) => handleChange({ target: { name: 'notifyOnRequest', type: 'checkbox', checked: e.target.checked } })}
              title="Notify on Request"
              description="When a user requests a movie or show"
            />
          </div>
        </div>
        
        <div className="pt-2 flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTestNotification}
          >
            Test Notification
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}
