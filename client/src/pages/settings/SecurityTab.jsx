import { useState, useEffect } from 'react';
import { Shield, Key, Loader2, Save, Eye, EyeOff, CheckSquare, Square } from 'lucide-react';
import api from '../../lib/api';
import { customAlert } from '../../utils/alerts';
import PasswordInput from '../../components/shared/PasswordInput';

export default function SecurityTab() {
  const [settings, setSettings] = useState({
    authEnabled: false,
    authBypassLocalhost: true,
    authUsername: '',
    authPassword: '' // Write-only
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      if (res.data.status === 'success') {
        const data = res.data.data;
        setSettings({
          authEnabled: data.authEnabled === 'true',
          authBypassLocalhost: data.authBypassLocalhost === 'true',
          authUsername: data.authUsername || '',
          authPassword: '' // Do not fetch the password
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
        authBypassLocalhost: settings.authBypassLocalhost.toString(),
        authUsername: settings.authUsername
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
              <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl bg-slate-900/50 border border-white/5 hover:border-emerald-500/30 transition-colors group">
                <div className="mt-0.5">
                  <input
                    type="checkbox"
                    name="authBypassLocalhost"
                    checked={settings.authBypassLocalhost}
                    onChange={handleChange}
                    className="sr-only"
                  />
                  {settings.authBypassLocalhost ? <CheckSquare className="w-5 h-5 text-emerald-400" /> : <Square className="w-5 h-5 text-slate-500" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">Bypass Authentication for Localhost</p>
                  <p className="text-xs text-slate-400 mt-1">Don't require login when accessing via 127.0.0.1 or localhost</p>
                </div>
              </label>

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
