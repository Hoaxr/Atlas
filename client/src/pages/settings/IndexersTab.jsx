import { useState, useEffect } from 'react';
import { Search, Loader2, PlayCircle, Save } from 'lucide-react';
import api from '../../lib/api';
import { customAlert } from '../../utils/alerts';

export default function IndexersTab({ settings, setSettings, handleSave }) {
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
    // Only auto-test on mount if the settings were already loaded from the database
    if (settings.prowlarrUrl && settings.prowlarrApiKey && !initialTestDone) {
      setInitialTestDone(true);
      testConnection(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLocalSave = async () => {
    await handleSave();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <h2 className="text-2xl font-bold text-purple-400 flex items-center gap-2">
        <Search className="w-7 h-7" /> Indexer Settings
      </h2>

      <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-6 shadow-xl relative overflow-hidden">
        <div>
          <h3 className="font-bold text-lg text-slate-200 mb-2">Prowlarr Configuration</h3>
          <p className="text-xs text-slate-500">Atlas uses Prowlarr's aggregate search API to query all your configured indexers simultaneously.</p>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Prowlarr Base URL</label>
            <input 
              type="text" 
              placeholder="e.g. http://192.168.1.100:9696" 
              className="glass-input w-full md:w-2/3" 
              value={settings.prowlarrUrl || ''} 
              onChange={e => setSettings({...settings, prowlarrUrl: e.target.value})} 
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Prowlarr API Key</label>
            <input 
              type="password" 
              placeholder="Your Prowlarr API Key" 
              className="glass-input w-full md:w-2/3" 
              value={settings.prowlarrApiKey || ''} 
              onChange={e => setSettings({...settings, prowlarrApiKey: e.target.value})} 
            />
          </div>

          <div className="pt-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <button 
              onClick={() => testConnection(false)} 
              disabled={isTesting}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50 font-medium border border-white/5 self-start"
            >
              {isTesting ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5 text-purple-400" />}
              Connect
            </button>
            
            {testResult && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-400">Status:</span>
                <span className={`text-sm font-bold flex items-center gap-1.5 ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                  <span className={`w-2 h-2 rounded-full ${testResult.ok ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                  {testResult.ok ? 'Connected' : 'Not Connected'}
                </span>
                {!testResult.ok && testResult.message && (
                  <span className="text-xs text-red-400/80 ml-2">({testResult.message})</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleLocalSave} className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all">
          <Save className="w-5 h-5" /> Save Changes
        </button>
      </div>
    </div>
  );
}
