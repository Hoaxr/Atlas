import { useState, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import { customAlert } from '../../utils/alerts';
import PasswordInput from '../../components/shared/PasswordInput';
import { SettingsSection, SettingsHeader } from '../../components/settings/layout';

export default function IndexersTab({ settings, setSettings, handleSave: _handleSave }) {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [initialTestDone, setInitialTestDone] = useState(false);

  const testConnection = async (silentParam = false) => {
    const silent = silentParam === true;
    if (!settings.prowlarrUrl || !settings.prowlarrApiKey) {
      if (!silent) customAlert('Prowlarr URL and API Key are required to test the connection.', 'error');
      return;
    }
    
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.post('/settings/prowlarr/test', {
        url: settings.prowlarrUrl,
        apiKey: settings.prowlarrApiKey
      });
      setTestResult({ ok: true, message: res.data.message });
      if (!silent) customAlert('Connection successful!', 'success');
    } catch (e) {
      setTestResult({ ok: false, message: e.response?.data?.message || 'Failed to connect to Prowlarr' });
      if (!silent) customAlert('Connection failed', 'error');
    }
    setIsTesting(false);
  };

  useEffect(() => {
    // Auto-test once settings have actually loaded (prowlarrUrl/API key populated from the server)
    if (settings.prowlarrUrl && settings.prowlarrApiKey && !initialTestDone) {
      setInitialTestDone(true);
      testConnection(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.prowlarrUrl, settings.prowlarrApiKey]);

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg sm:text-xl font-bold font-display text-slate-100 flex items-center gap-2.5 mb-1.5">
          <Search className="w-5 h-5 text-cyan-400 shrink-0" /> Indexers
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
          Configure Prowlarr to allow Atlas to search for media across your trackers.
        </p>
      </div>

      <SettingsSection>
        <SettingsHeader 
          title="Indexer Configuration" 
          icon={Search}
        />

        <div className="space-y-4 sm:space-y-5">
          <div className="p-4 sm:p-5 bg-[#101e31] rounded-xl border border-[#1c2d46] hover:border-[#274063] transition-colors space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold font-display text-slate-100">Prowlarr</h3>
                {!settings.prowlarrUrl || !settings.prowlarrApiKey ? (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700/60 whitespace-nowrap">
                    Not configured
                  </span>
                ) : testResult?.ok ? (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                    Connected
                  </span>
                ) : testResult?.ok === false ? (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap">
                    Error
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                    Configured
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => testConnection(false)} 
                disabled={isTesting || !settings.prowlarrUrl || !settings.prowlarrApiKey}
                className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-[#15243b] hover:bg-[#1a2d4a] border border-[#1c2d46] hover:border-cyan-500/30 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
              >
                {isTesting && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
                {isTesting ? 'Testing...' : 'Test Connection'}
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Atlas uses Prowlarr's aggregate search API to query all your configured Usenet and torrent indexers simultaneously.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">Prowlarr Base URL</label>
                <input 
                  type="text" 
                  placeholder="e.g. http://192.168.1.100:9696" 
                  className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600 font-mono" 
                  value={settings.prowlarrUrl || ''} 
                  onChange={e => setSettings({...settings, prowlarrUrl: e.target.value})} 
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">Prowlarr API Key</label>
                <PasswordInput 
                  placeholder="Your Prowlarr API Key" 
                  className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600 font-mono" 
                  value={settings.prowlarrApiKey || ''} 
                  onChange={e => setSettings({...settings, prowlarrApiKey: e.target.value})} 
                />
              </div>
            </div>

            {testResult?.ok === false && testResult.message && (
              <p className="text-xs text-rose-400 mt-1.5 break-words">
                {testResult.message}
              </p>
            )}
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

