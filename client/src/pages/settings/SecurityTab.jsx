import { useState, useEffect } from 'react';
import { Shield, Save, CheckSquare, Square, Globe, Webhook } from 'lucide-react';
import api from '../../lib/api';
import { customAlert } from '../../utils/alerts';
import PasswordInput from '../../components/shared/PasswordInput';

export default function SecurityTab() {
  const [settings, setSettings] = useState({
    authEnabled: false,
    authUsername: '',
    authPassword: '', // Write-only
    timezone: ''
  });
  const [webhookToken, setWebhookToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
    api.get('/webhooks/token')
      .then(res => { if (res.data.status === 'success') setWebhookToken(res.data.data.token); })
      .catch(() => {});
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      if (res.data.status === 'success') {
        const data = res.data.data;
        setSettings({
          authEnabled: data.authEnabled === 'true',
          authUsername: data.authUsername || '',
          authPassword: '', // Do not fetch the password
          timezone: data.timezone || ''
        });
      }
    } catch (err) {
      console.error(err);
      customAlert('Failed to load security settings');
    } finally {
      setLoading(false);
    }
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
      const payload = {
        authEnabled: settings.authEnabled.toString(),
        authUsername: settings.authUsername,
        timezone: settings.timezone
      };
      if (settings.authPassword) {
        payload.authPassword = settings.authPassword; // only send if filled out
      }
      await api.post('/settings', payload);
      customAlert('Security settings saved');
    } catch (err) {
      console.error(err);
      customAlert('Failed to save security settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
      {/* Authentication */}
      <div className="glass-panel p-6 rounded-2xl">
        <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2 mb-6">
          <Shield className="w-5 h-5 text-emerald-400" /> Authentication
        </h2>
        
        <p className="text-sm text-slate-400 mb-6">
          Secure your Atlas instance with a username and password. This is highly recommended if your instance is exposed to the internet.
        </p>

        <div className="space-y-6">
          <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl bg-slate-900/50 border border-white/5 hover:border-emerald-500/30 transition-colors group">
            <div className="mt-0.5">
              <input
                type="checkbox"
                name="authEnabled"
                checked={settings.authEnabled}
                onChange={handleChange}
                className="sr-only"
              />
              {settings.authEnabled ? <CheckSquare className="w-5 h-5 text-emerald-400" /> : <Square className="w-5 h-5 text-slate-500" />}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">Enable Authentication</p>
              <p className="text-xs text-slate-400 mt-1">Require login to access the dashboard and API</p>
            </div>
          </label>

          {settings.authEnabled && (
            <div className="pl-8 space-y-6 border-l-2 border-slate-700/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Username</label>
                  <input
                    type="text"
                    name="authUsername"
                    value={settings.authUsername}
                    onChange={handleChange}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    placeholder="admin"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Password</label>
                  <PasswordInput
                    name="authPassword"
                    value={settings.authPassword}
                    onChange={handleChange}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    placeholder={settings.authUsername ? "Leave blank to keep current" : "Required"}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Location */}
      <div className="glass-panel p-6 rounded-2xl">
        <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2 mb-6">
          <Globe className="w-5 h-5 text-cyan-400" /> Location
        </h2>

        <p className="text-sm text-slate-400 mb-6">
          Select your timezone so release dates from TMDB (which follow US timing) are converted to your local calendar day.
          For example, an episode airing Thursday evening in the US shows up on Friday in the Netherlands.
        </p>

        <div className="max-w-md">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Your Timezone</label>
          <select
            name="timezone"
            value={settings.timezone}
            onChange={handleChange}
            className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <option value="">No adjustment (show US air dates as-is)</option>
            <optgroup label="Europe">
              {['Europe/Amsterdam', 'Europe/London', 'Europe/Berlin', 'Europe/Brussels', 'Europe/Paris', 'Europe/Madrid', 'Europe/Rome', 'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen', 'Europe/Helsinki', 'Europe/Warsaw', 'Europe/Vienna', 'Europe/Zurich', 'Europe/Lisbon', 'Europe/Dublin', 'Europe/Athens', 'Europe/Istanbul'].map(tz => (
                <option key={tz} value={tz}>{tz.replace('Europe/', '').replace(/_/g, ' ')}</option>
              ))}
            </optgroup>
            <optgroup label="Americas">
              {['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Vancouver', 'America/Mexico_City', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires'].map(tz => (
                <option key={tz} value={tz}>{tz.replace('America/', '').replace(/_/g, ' ')}</option>
              ))}
            </optgroup>
            <optgroup label="Asia & Oceania">
              {['Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Kolkata', 'Asia/Dubai', 'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland'].map(tz => (
                <option key={tz} value={tz}>{tz.split('/').slice(1).join('/').replace(/_/g, ' ')}</option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      {/* Download Client Webhook */}
      {webhookToken && (
        <div className="glass-panel p-6 rounded-2xl">
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2 mb-6">
            <Webhook className="w-5 h-5 text-purple-400" /> Download Client Webhook
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            Trigger instant post-processing when a download completes. Point your download client's
            "run on completion" command at:
          </p>
          <code className="block bg-slate-900/60 border border-white/5 rounded-xl px-4 py-3 text-xs text-cyan-300 break-all">
            POST http://&lt;your-atlas-host&gt;:3000/api/webhooks/download-client?token={webhookToken}
          </code>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 font-bold text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-xl transition-all flex items-center justify-center gap-2 w-full sm:w-auto mx-auto sm:mx-0 shadow-[0_0_15px_rgba(6,182,212,0.15)] disabled:opacity-50 disabled:opacity-50"
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
