import { useState, useEffect, useRef } from 'react';
import { Network, Server, BellRing, Save, CheckSquare, Square, Link, Loader2, Key } from 'lucide-react';
import api from '../../lib/api';
import { customAlert, customConfirm } from '../../utils/alerts';
import PasswordInput from '../../components/shared/PasswordInput';

export default function ConnectionsTab({
  settings: parentSettings, setSettings: setParentSettings, handleSave: parentHandleSave,
  traktDeviceCode, traktUserCode, traktVerificationUrl, traktPolling,
  connectTrakt, fetchSettings, keyStatuses
}) {
  const [localSettings, setLocalSettings] = useState({
    plexUrl: '',
    plexToken: '',
    jellyfinUrl: '',
    jellyfinApiKey: '',
    embyUrl: '',
    embyApiKey: '',
    discordWebhookUrl: '',
    telegramBotToken: '',
    telegramChatId: '',
    pushoverAppToken: '',
    pushoverUserKey: '',
    notifyOnGrab: false,
    notifyOnDownload: false,
    notifyOnPlaybackStart: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testStatuses, setTestStatuses] = useState({ plex: null, jellyfin: null, emby: null });
  const [testingMedia, setTestingMedia] = useState({ plex: false, jellyfin: false, emby: false });
    
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
    return () => { mountedRef.current = false; };
  }, []);

  const fetchConnectionsSettings = async () => {
    try {
      const res = await api.get('/settings');
      if (res.data.status === 'success') {
        const data = res.data.data;
        setLocalSettings({
          plexUrl: data.plexUrl || '',
          plexToken: data.plexToken || '',
          jellyfinUrl: data.jellyfinUrl || '',
          jellyfinApiKey: data.jellyfinApiKey || '',
          embyUrl: data.embyUrl || '',
          embyApiKey: data.embyApiKey || '',
          discordWebhookUrl: data.discordWebhookUrl || '',
          telegramBotToken: data.telegramBotToken || '',
          telegramChatId: data.telegramChatId || '',
          pushoverAppToken: data.pushoverAppToken || '',
          pushoverUserKey: data.pushoverUserKey || '',
          notifyOnGrab: data.notifyOnGrab === 'true',
          notifyOnDownload: data.notifyOnDownload === 'true',
          notifyOnPlaybackStart: data.notifyOnPlaybackStart === 'true'
        });
        
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
    } catch (err) {
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
        setPlexOAuth({ loading: false, pinId: null, code: null, authUrl: null, polling: false });

        if (plexUrl) {
          customAlert('Successfully authenticated with Plex!');
          // Auto-save the token and URL
          try {
            await api.post('/settings', {
              ...updatedSettings,
              notifyOnGrab: updatedSettings.notifyOnGrab.toString(),
              notifyOnDownload: updatedSettings.notifyOnDownload.toString(),
              notifyOnPlaybackStart: updatedSettings.notifyOnPlaybackStart.toString()
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
              notifyOnPlaybackStart: updatedSettings.notifyOnPlaybackStart.toString()
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

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setLocalSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save media server and notification settings
      await api.post('/settings', {
        ...localSettings,
        notifyOnGrab: localSettings.notifyOnGrab.toString(),
        notifyOnDownload: localSettings.notifyOnDownload.toString(),
        notifyOnPlaybackStart: localSettings.notifyOnPlaybackStart.toString()
      });
      // Also save parent API settings (TMDB key, Trakt keys, etc.)
      await api.post('/settings', {
        tmdbApiKey: typeof parentSettings?.tmdbApiKey === 'string' && parentSettings.tmdbApiKey.startsWith('***')
          ? undefined
          : parentSettings?.tmdbApiKey,
        traktClientId: parentSettings?.traktClientId,
        traktClientSecret: parentSettings?.traktClientSecret,
        traktWatchedSync: parentSettings?.traktWatchedSync,
      });
      customAlert('Connection settings saved');
    } catch (err) {
      console.error(err);
      customAlert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotification = async () => {
    const hasDiscord = !!localSettings.discordWebhookUrl;
    const hasTelegramToken = !!localSettings.telegramBotToken;
    const hasTelegramChat = !!localSettings.telegramChatId;
    const hasTelegram = hasTelegramToken && hasTelegramChat;
    const hasPushoverApp = !!localSettings.pushoverAppToken;
    const hasPushoverUser = !!localSettings.pushoverUserKey;
    const hasPushover = hasPushoverApp && hasPushoverUser;

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
    } catch (err) {
      customAlert('Test failed to send');
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">

      {/* ── API's & Integrations ── */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10">
        <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2 mb-6">
          <Key className="w-5 h-5 text-cyan-400" /> API's & Integrations
        </h2>

        <div className="space-y-6">
          {/* TMDB */}
          <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-cyan-400">TMDB</h3>
              {!parentSettings?.tmdbApiKey || parentSettings.tmdbApiKey === '' ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700/50 text-slate-400 border border-slate-600/50">Not configured</span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Connected</span>
              )}
            </div>
            <p className="text-xs text-slate-500">TMDB provides all metadata, posters, and search results.</p>
            <div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                <span>API Key</span>
                <a href="https://www.themoviedb.org/settings/api?language=en-US" target="_blank" rel="noopener noreferrer" className="text-[10px] text-cyan-400 hover:text-cyan-300 underline normal-case font-medium">Get key</a>
              </label>
              <PasswordInput placeholder="Enter your TMDB API Key" className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all" value={parentSettings?.tmdbApiKey || ''} onChange={(e) => setParentSettings({ ...parentSettings, tmdbApiKey: e.target.value })} />
            </div>
          </div>

          {/* Trakt */}
          <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-green-400">Trakt</h3>
                {!parentSettings?.traktAccessToken ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700/50 text-slate-400 border border-slate-600/50">Not configured</span>
                ) : keyStatuses?.trakt?.status === 'error' ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">Auth Expired</span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Connected</span>
                )}
              </div>
              {parentSettings?.traktAccessToken && (
                <button
                  onClick={async () => {
                    if (await customConfirm('Disconnect from Trakt? You can reconnect later.')) {
                      await api.post('/auth/trakt/disconnect');
                      customAlert('Disconnected from Trakt');
                      fetchSettings();
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition-all flex items-center gap-1.5"
                >
                  Disconnect
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">Trakt provides trending lists and can sync your watched status.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  <span>Client ID</span>
                  <a href="https://trakt.tv/oauth/applications" target="_blank" rel="noopener noreferrer" className="text-[10px] text-green-400 hover:text-green-300 underline normal-case font-medium">Get keys</a>
                </label>
                <PasswordInput placeholder="Enter your Trakt Client ID" className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 transition-all" value={parentSettings?.traktClientId || ''} onChange={(e) => setParentSettings({ ...parentSettings, traktClientId: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Client Secret</label>
                <PasswordInput placeholder="Enter your Trakt Client Secret" className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 transition-all" value={parentSettings?.traktClientSecret || ''} onChange={(e) => setParentSettings({ ...parentSettings, traktClientSecret: e.target.value })} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {!parentSettings?.traktAccessToken && !traktDeviceCode && (
                <button
                  onClick={connectTrakt}
                  disabled={!parentSettings?.traktClientId || !parentSettings?.traktClientSecret}
                  className="bg-green-500 hover:bg-green-400 text-slate-950 font-bold py-2 px-4 rounded-lg text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Connect with Trakt
                </button>
              )}
              <div
                className="flex items-center gap-2 cursor-pointer select-none transition-colors hover:bg-slate-700/30 rounded-lg px-3 py-2"
                onClick={() => setParentSettings(prev => ({ ...prev, traktWatchedSync: !prev.traktWatchedSync }))}
              >
                {parentSettings?.traktWatchedSync ? <CheckSquare className="w-4 h-4 text-green-400" /> : <Square className="w-4 h-4 text-slate-500" />}
                <div>
                  <span className="text-xs text-slate-300">Watched sync</span>
                  <p className="text-[10px] text-slate-500">Automatically sync watched status between Atlas and Trakt</p>
                </div>
              </div>
            </div>

            {traktDeviceCode && (
              <div className="bg-slate-900/80 border border-green-500/30 rounded-xl p-5 space-y-3">
                <p className="text-xs text-slate-300 font-medium">Trakt Authorization</p>
                <p className="text-[10px] text-slate-400">Go to the following URL and enter this PIN:</p>
                <a href={traktVerificationUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-green-400 hover:text-green-300 underline block">{traktVerificationUrl}</a>
                <div className="text-2xl font-black tracking-widest bg-slate-950 px-6 py-3 rounded-xl border border-green-500/30 text-green-300 select-all inline-block">{traktUserCode}</div>
                {traktPolling ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-emerald-500" />
                    Waiting for authorization...
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Waiting for authorization...</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Media Servers */}
      <div className="glass-panel p-6 rounded-2xl">
        <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2 mb-6">
          <Server className="w-5 h-5 text-cyan-400" /> Media Servers
        </h2>

        <div className="space-y-6">
          {/* Plex */}
          <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-amber-400">Plex</h3>
                {testStatuses.plex === 'connected' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">Connected</span>}
                {testStatuses.plex === 'error' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">Disconnected</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {plexOAuth.polling ? (
                  <button
                    onClick={handlePlexOAuthCancel}
                    className="px-3 py-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg transition-all flex items-center gap-1.5"
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Waiting for auth...
                  </button>
                ) : (
                  <button
                    onClick={handlePlexOAuthStart}
                    disabled={plexOAuth.loading}
                    className="px-3 py-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {plexOAuth.loading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Link className="w-3 h-3" />
                    )}
                    Sign in with Plex
                  </button>
                )}
                <button
                  onClick={() => handleTestMediaServerBtn('plex')}
                  disabled={testingMedia.plex}
                  className="px-3 py-1.5 text-xs font-bold text-slate-300 bg-slate-700/50 hover:bg-slate-700/70 border border-slate-600/50 rounded-lg transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {testingMedia.plex && <Loader2 className="w-3 h-3 animate-spin" />}
                  {testingMedia.plex ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500">Plex serves your media library and can be notified to scan for new imports.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Plex URL</label>
                <input
                  type="text"
                  name="plexUrl"
                  value={localSettings.plexUrl}
                  onChange={handleChange}
                  placeholder="http://192.168.1.100:32400"
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Plex Token</label>
                <PasswordInput
                  name="plexToken"
                  value={localSettings.plexToken}
                  onChange={handleChange}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
            </div>
            {plexOAuth.polling && (
              <div className="text-xs text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-2">
                Sign in to your Plex account in the opened window. Token will be filled automatically once authorized.
              </div>
            )}
          </div>

          {/* Jellyfin */}
          <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-purple-400">Jellyfin</h3>
                {testStatuses.jellyfin === 'connected' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">Connected</span>}
                {testStatuses.jellyfin === 'error' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">Disconnected</span>}
              </div>
              <button
                onClick={() => handleTestMediaServerBtn('jellyfin')}
                disabled={testingMedia.jellyfin}
                className="px-3 py-1.5 text-xs font-bold text-slate-300 bg-slate-700/50 hover:bg-slate-700/70 border border-slate-600/50 rounded-lg transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {testingMedia.jellyfin && <Loader2 className="w-3 h-3 animate-spin" />}
                {testingMedia.jellyfin ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
            <p className="text-xs text-slate-500">Jellyfin serves your media library and can be notified to scan for new imports.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Jellyfin URL</label>
                <input
                  type="text"
                  name="jellyfinUrl"
                  value={localSettings.jellyfinUrl}
                  onChange={handleChange}
                  placeholder="http://192.168.1.100:8096"
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">API Key</label>
                <PasswordInput
                  name="jellyfinApiKey"
                  value={localSettings.jellyfinApiKey}
                  onChange={handleChange}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>
            </div>
          </div>

          {/* Emby */}
          <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-emerald-400">Emby</h3>
                {testStatuses.emby === 'connected' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">Connected</span>}
                {testStatuses.emby === 'error' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">Disconnected</span>}
              </div>
              <button
                onClick={() => handleTestMediaServerBtn('emby')}
                disabled={testingMedia.emby}
                className="px-3 py-1.5 text-xs font-bold text-slate-300 bg-slate-700/50 hover:bg-slate-700/70 border border-slate-600/50 rounded-lg transition-all disabled:opacity-50 self-start flex items-center gap-1.5"
              >
                {testingMedia.emby && <Loader2 className="w-3 h-3 animate-spin" />}
                {testingMedia.emby ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
            <p className="text-xs text-slate-500">Emby serves your media library and can be notified to scan for new imports.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Emby URL</label>
                <input
                  type="text"
                  name="embyUrl"
                  value={localSettings.embyUrl}
                  onChange={handleChange}
                  placeholder="http://192.168.1.100:8096"
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">API Key</label>
                <PasswordInput
                  name="embyApiKey"
                  value={localSettings.embyApiKey}
                  onChange={handleChange}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="glass-panel p-6 rounded-2xl">
        <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2 mb-6">
          <BellRing className="w-5 h-5 text-amber-400" /> Notifications
        </h2>

        <div className="flex flex-col space-y-6">
          {/* Discord */}
          <div className="space-y-4 bg-slate-900/50 p-5 rounded-xl border border-slate-700/50">
            <div>
              <h3 className="text-sm font-semibold text-slate-300">Discord Webhook</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Discord receives grab, download, and playback notifications via webhook.</p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Webhook URL</label>
              <input
                type="text"
                name="discordWebhookUrl"
                value={localSettings.discordWebhookUrl}
                onChange={handleChange}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all"
              />
            </div>
          </div>

          {/* Telegram */}
          <div className="space-y-4 bg-slate-900/50 p-5 rounded-xl border border-slate-700/50">
            <div>
              <h3 className="text-sm font-semibold text-slate-300">Telegram Bot</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Telegram receives grab, download, and playback notifications via a bot.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Bot Token</label>
                <PasswordInput
                  name="telegramBotToken"
                  value={localSettings.telegramBotToken}
                  onChange={handleChange}
                  placeholder="123456:ABC-DEF..."
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Chat ID</label>
                <input
                  type="text"
                  name="telegramChatId"
                  value={localSettings.telegramChatId}
                  onChange={handleChange}
                  placeholder="-100123456789"
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Pushover */}
          <div className="space-y-4 bg-slate-900/50 p-5 rounded-xl border border-slate-700/50">
            <div>
              <h3 className="text-sm font-semibold text-slate-300">Pushover</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Receive notifications natively on your iOS or Android devices.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">App Token</label>
                <PasswordInput
                  name="pushoverAppToken"
                  value={localSettings.pushoverAppToken}
                  onChange={handleChange}
                  placeholder="a1b2c3d4e5..."
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">User Key</label>
                <PasswordInput
                  name="pushoverUserKey"
                  value={localSettings.pushoverUserKey}
                  onChange={handleChange}
                  placeholder="u1v2w3x4y5..."
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3 p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
          <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl bg-slate-900/50 border border-white/5 hover:border-amber-500/30 transition-colors group">
            <div className="mt-0.5">
              <input
                type="checkbox"
                name="notifyOnGrab"
                checked={localSettings.notifyOnGrab}
                onChange={handleChange}
                className="sr-only"
              />
              {localSettings.notifyOnGrab ? <CheckSquare className="w-5 h-5 text-amber-500" /> : <Square className="w-5 h-5 text-slate-500" />}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-200 group-hover:text-amber-400 transition-colors">Notify on Grab</p>
              <p className="text-xs text-slate-400 mt-1">Send notification when a release is sent to download client</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl bg-slate-900/50 border border-white/5 hover:border-amber-500/30 transition-colors group">
            <div className="mt-0.5">
              <input
                type="checkbox"
                name="notifyOnDownload"
                checked={localSettings.notifyOnDownload}
                onChange={handleChange}
                className="sr-only"
              />
              {localSettings.notifyOnDownload ? <CheckSquare className="w-5 h-5 text-amber-500" /> : <Square className="w-5 h-5 text-slate-500" />}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-200 group-hover:text-amber-400 transition-colors">Notify on Download Complete</p>
              <p className="text-xs text-slate-400 mt-1">Send notification when client finishes downloading and Atlas imports</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl bg-slate-900/50 border border-white/5 hover:border-amber-500/30 transition-colors group">
            <div className="mt-0.5">
              <input
                type="checkbox"
                name="notifyOnPlaybackStart"
                checked={localSettings.notifyOnPlaybackStart}
                onChange={handleChange}
                className="sr-only"
              />
              {localSettings.notifyOnPlaybackStart ? <CheckSquare className="w-5 h-5 text-amber-500" /> : <Square className="w-5 h-5 text-slate-500" />}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-200 group-hover:text-amber-400 transition-colors">Notify on Playback Start</p>
              <p className="text-xs text-slate-400 mt-1">Send notification when a user starts watching media on a connected server</p>
            </div>
          </label>
        </div>
        
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleTestNotification}
            className="px-4 py-2 text-sm font-bold text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-xl transition-all mr-3"
          >
            Test Notification
          </button>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
        >
          {saving ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          Save Changes
        </button>
      </div>
    </div>
  );
}
