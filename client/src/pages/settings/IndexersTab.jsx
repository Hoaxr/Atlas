import { useState, useEffect } from 'react';
import { Search, Loader2, PlayCircle, Save } from 'lucide-react';
import api from '../../lib/api';
import { customAlert } from '../../utils/alerts';
import PasswordInput from '../../components/shared/PasswordInput';
import Button from '../../components/shared/Button';
import { SettingsSection, SettingsHeader, SettingsGroup, SettingsLabel, SettingsHelper } from '../../components/settings/layout';

export default function IndexersTab({ settings, setSettings }) {
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

  const handleLocalSave = async () => {
    await handleSave();
  };

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
          title="Prowlarr Indexer Configuration" 
          icon={Search}
          description="Atlas uses Prowlarr's aggregate search API to query all your configured Usenet and torrent indexers simultaneously."
        />

        <SettingsGroup>
          <div>
            <SettingsLabel title="Prowlarr Base URL" />
            <input 
              type="text" 
              placeholder="e.g. http://192.168.1.100:9696" 
              className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600" 
              value={settings.prowlarrUrl || ''} 
              onChange={e => setSettings({...settings, prowlarrUrl: e.target.value})} 
            />
          </div>

          <div>
            <SettingsLabel title="Prowlarr API Key" />
            <PasswordInput 
              placeholder="Your Prowlarr API Key" 
              className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600" 
              value={settings.prowlarrApiKey || ''} 
              onChange={e => setSettings({...settings, prowlarrApiKey: e.target.value})} 
            />
          </div>
        </SettingsGroup>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-4 mt-6">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => testConnection(false)} 
              disabled={isTesting}
              loading={isTesting}
              icon={PlayCircle}
            >
              Test Connection
            </Button>
            
            {testResult && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Status:</span>
                <span className={`text-xs font-semibold flex items-center gap-1.5 ${testResult.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${testResult.ok ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                  {testResult.ok ? 'Connected' : 'Connection Failed'}
                </span>
                {!testResult.ok && testResult.message && (
                  <span className="text-[11px] text-rose-400/80">({testResult.message})</span>
                )}
              </div>
            )}
          </div>
      </SettingsSection>

    </div>
  );
}
