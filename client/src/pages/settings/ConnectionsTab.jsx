import { useState, useEffect } from 'react';
import { Network, Server, BellRing, Save, CheckSquare, Square } from 'lucide-react';
import api from '../../lib/api';
import { toast } from 'react-hot-toast';

export default function ConnectionsTab() {
  const [settings, setSettings] = useState({
    plexUrl: '',
    plexToken: '',
    jellyfinUrl: '',
    jellyfinApiKey: '',
    embyUrl: '',
    embyApiKey: '',
    discordWebhookUrl: '',
    telegramBotToken: '',
    telegramChatId: '',
    notifyOnGrab: false,
    notifyOnDownload: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testStatuses, setTestStatuses] = useState({ plex: null, jellyfin: null, emby: null });
  const [testingMedia, setTestingMedia] = useState({ plex: false, jellyfin: false, emby: false });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      if (res.data.status === 'success') {
        const data = res.data.data;
        setSettings({
          plexUrl: data.plexUrl || '',
          plexToken: data.plexToken || '',
          jellyfinUrl: data.jellyfinUrl || '',
          jellyfinApiKey: data.jellyfinApiKey || '',
          embyUrl: data.embyUrl || '',
          embyApiKey: data.embyApiKey || '',
          discordWebhookUrl: data.discordWebhookUrl || '',
          telegramBotToken: data.telegramBotToken || '',
          telegramChatId: data.telegramChatId || '',
          notifyOnGrab: data.notifyOnGrab === 'true',
          notifyOnDownload: data.notifyOnDownload === 'true'
        });
        
        // Auto test configured media servers
        if (data.plexUrl && data.plexToken) testMediaServer('plex', data.plexUrl, data.plexToken, true);
        if (data.jellyfinUrl && data.jellyfinApiKey) testMediaServer('jellyfin', data.jellyfinUrl, data.jellyfinApiKey, true);
        if (data.embyUrl && data.embyApiKey) testMediaServer('emby', data.embyUrl, data.embyApiKey, true);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load connection settings');
    } finally {
      setLoading(false);
    }
  };

  const testMediaServer = async (type, url, apiKey, silent = false) => {
    if (!url || !apiKey) {
      if (!silent) toast.error(`Please enter both URL and API Key/Token for ${type}`);
      return;
    }

    setTestingMedia(prev => ({ ...prev, [type]: true }));
    try {
      const res = await api.post('/settings/media-server/test', { type, url, apiKey });
      if (res.data.status === 'success') {
        if (!silent) toast.success(res.data.message);
        setTestStatuses(prev => ({ ...prev, [type]: 'connected' }));
      } else {
        throw new Error(res.data.message);
      }
    } catch (err) {
      if (!silent) toast.error(err.response?.data?.message || `Failed to connect to ${type}`);
      setTestStatuses(prev => ({ ...prev, [type]: 'error' }));
    } finally {
      setTestingMedia(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleTestMediaServerBtn = (type) => {
    let url, apiKey;
    if (type === 'plex') { url = settings.plexUrl; apiKey = settings.plexToken; }
    if (type === 'jellyfin') { url = settings.jellyfinUrl; apiKey = settings.jellyfinApiKey; }
    if (type === 'emby') { url = settings.embyUrl; apiKey = settings.embyApiKey; }
    testMediaServer(type, url, apiKey, false);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/settings', {
        ...settings,
        notifyOnGrab: settings.notifyOnGrab.toString(),
        notifyOnDownload: settings.notifyOnDownload.toString()
      });
      toast.success('Connection settings saved');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotification = async () => {
    const hasDiscord = !!settings.discordWebhookUrl;
    const hasTelegramToken = !!settings.telegramBotToken;
    const hasTelegramChat = !!settings.telegramChatId;
    const hasTelegram = hasTelegramToken && hasTelegramChat;

    if (!hasDiscord && !hasTelegramToken && !hasTelegramChat) {
      toast.error('Please configure at least one notification service to test');
      return;
    }

    if ((hasTelegramToken && !hasTelegramChat) || (!hasTelegramToken && hasTelegramChat)) {
      toast.error('Telegram requires both a Bot Token and a Chat ID');
      return;
    }

    try {
      await api.post('/settings/test-notification', {
        discordWebhookUrl: settings.discordWebhookUrl,
        telegramBotToken: settings.telegramBotToken,
        telegramChatId: settings.telegramChatId
      });
      toast.success('Test notification triggered');
    } catch (err) {
      toast.error('Test failed to send');
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Notifications */}
      <div className="glass-panel p-6 rounded-2xl">
        <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2 mb-6">
          <BellRing className="w-5 h-5 text-amber-400" /> Notifications
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Discord */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300">Discord Webhook</h3>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Webhook URL</label>
              <input
                type="text"
                name="discordWebhookUrl"
                value={settings.discordWebhookUrl}
                onChange={handleChange}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all"
              />
            </div>
          </div>

          {/* Telegram */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300">Telegram Bot</h3>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Bot Token</label>
              <input
                type="text"
                name="telegramBotToken"
                value={settings.telegramBotToken}
                onChange={handleChange}
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Chat ID</label>
              <input
                type="text"
                name="telegramChatId"
                value={settings.telegramChatId}
                onChange={handleChange}
                placeholder="-100123456789"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3 p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
          <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl bg-slate-900/50 border border-white/5 hover:border-amber-500/30 transition-colors group">
            <div className="mt-0.5">
              <input
                type="checkbox"
                name="notifyOnGrab"
                checked={settings.notifyOnGrab}
                onChange={handleChange}
                className="sr-only"
              />
              {settings.notifyOnGrab ? <CheckSquare className="w-5 h-5 text-amber-500" /> : <Square className="w-5 h-5 text-slate-500" />}
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
                checked={settings.notifyOnDownload}
                onChange={handleChange}
                className="sr-only"
              />
              {settings.notifyOnDownload ? <CheckSquare className="w-5 h-5 text-amber-500" /> : <Square className="w-5 h-5 text-slate-500" />}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-200 group-hover:text-amber-400 transition-colors">Notify on Download Complete</p>
              <p className="text-xs text-slate-400 mt-1">Send notification when client finishes downloading and Atlas imports</p>
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

      {/* Media Servers */}
      <div className="glass-panel p-6 rounded-2xl">
        <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2 mb-6">
          <Server className="w-5 h-5 text-cyan-400" /> Media Servers
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          Atlas can tell your media server to update its library automatically after a file is imported.
        </p>

        <div className="space-y-6">
          {/* Plex */}
          <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-amber-400">Plex</h3>
                {testStatuses.plex === 'connected' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">Connected</span>}
                {testStatuses.plex === 'error' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">Disconnected</span>}
              </div>
              <button
                onClick={() => handleTestMediaServerBtn('plex')}
                disabled={testingMedia.plex}
                className="px-3 py-1.5 text-xs font-bold text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all disabled:opacity-50"
              >
                {testingMedia.plex ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Plex URL</label>
                <input
                  type="text"
                  name="plexUrl"
                  value={settings.plexUrl}
                  onChange={handleChange}
                  placeholder="http://192.168.1.100:32400"
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Plex Token</label>
                <input
                  type="password"
                  name="plexToken"
                  value={settings.plexToken}
                  onChange={handleChange}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
            </div>
          </div>

          {/* Jellyfin */}
          <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-purple-400">Jellyfin</h3>
                {testStatuses.jellyfin === 'connected' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">Connected</span>}
                {testStatuses.jellyfin === 'error' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">Disconnected</span>}
              </div>
              <button
                onClick={() => handleTestMediaServerBtn('jellyfin')}
                disabled={testingMedia.jellyfin}
                className="px-3 py-1.5 text-xs font-bold text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all disabled:opacity-50"
              >
                {testingMedia.jellyfin ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Jellyfin URL</label>
                <input
                  type="text"
                  name="jellyfinUrl"
                  value={settings.jellyfinUrl}
                  onChange={handleChange}
                  placeholder="http://192.168.1.100:8096"
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">API Key</label>
                <input
                  type="password"
                  name="jellyfinApiKey"
                  value={settings.jellyfinApiKey}
                  onChange={handleChange}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>
            </div>
          </div>

          {/* Emby */}
          <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-emerald-400">Emby</h3>
                {testStatuses.emby === 'connected' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">Connected</span>}
                {testStatuses.emby === 'error' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">Disconnected</span>}
              </div>
              <button
                onClick={() => handleTestMediaServerBtn('emby')}
                disabled={testingMedia.emby}
                className="px-3 py-1.5 text-xs font-bold text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all disabled:opacity-50"
              >
                {testingMedia.emby ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Emby URL</label>
                <input
                  type="text"
                  name="embyUrl"
                  value={settings.embyUrl}
                  onChange={handleChange}
                  placeholder="http://192.168.1.100:8096"
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">API Key</label>
                <input
                  type="password"
                  name="embyApiKey"
                  value={settings.embyApiKey}
                  onChange={handleChange}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold rounded-xl shadow-lg shadow-cyan-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
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
