import { useState } from 'react';
import { Languages, CheckCircle2, Loader2 } from 'lucide-react';
import CustomSelect from '../../components/shared/CustomSelect';
import LanguageInput from './LanguageInput';
import PasswordInput from '../../components/shared/PasswordInput';
import { SettingsSection, SettingsHeader, SettingsGroup, SettingsLabel, SettingsHelper } from '../../components/settings/layout';
import ToggleRow from '../../components/shared/ToggleRow';
import api from '../../lib/api';
import { customAlert } from '../../utils/alerts';

export default function SubtitlesTab({ settings, setSettings, keyStatuses }) {
  const [testingService, setTestingService] = useState({});
  const [testResults, setTestResults] = useState({});

  const handleTestService = async (serviceId, key) => {
    setTestingService(prev => ({ ...prev, [serviceId]: true }));
    try {
      const res = await api.post('/settings/service/test', { service: serviceId, apiKey: key });
      if (res.data.status === 'success' || res.data.status === 'warning') {
        customAlert(res.data.message || `${serviceId} connected successfully`, 'success');
        setTestResults(prev => ({ ...prev, [serviceId]: { status: res.data.status === 'warning' ? 'warning' : 'connected', message: res.data.message } }));
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Connection test failed';
      customAlert(msg, 'error');
      setTestResults(prev => ({ ...prev, [serviceId]: { status: 'error', message: msg } }));
    } finally {
      setTestingService(prev => ({ ...prev, [serviceId]: false }));
    }
  };

  return (
    <div className="w-full space-y-8 animate-fade-in">
      <div>
        <h2 className="text-lg sm:text-xl font-bold font-display text-slate-100 flex items-center gap-2.5 mb-1.5">
          <Languages className="w-5 h-5 text-cyan-400 shrink-0" /> Subtitles & AI
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
          Configure subtitle providers, desired languages, and AI translation settings.
        </p>
      </div>

      {/* === Section 1: Subtitle Providers === */}
      <SettingsSection>
        <SettingsHeader
          title="Subtitle Providers"
          icon={Languages}
        />
        <div className="glass-panel p-5 rounded-2xl border border-white/10 mb-5">
          <SettingsLabel title="Search Languages" />
          <SettingsHelper text="Select which languages to search for when downloading subtitles." />
          <div className="mt-3">
            <LanguageInput
              selected={settings.providerLangs || ['en']}
              onChange={(langs) => setSettings({ ...settings, providerLangs: langs.length ? langs : ['en'] })}
            />
          </div>
        </div>
        
        <div className="space-y-5">
          {[
            { id: 'opensubtitles', name: 'OpenSubtitles', color: 'border-l-cyan-500', desc: 'Primary subtitle source.', key: settings.osApiKey, setter: (v) => setSettings({ ...settings, osApiKey: v }) },
            { id: 'subdl', name: 'SubDL', color: 'border-l-amber-500', desc: 'Alternative. Free: 2,000 requests/day.', key: settings.subdlApiKey, setter: (v) => setSettings({ ...settings, subdlApiKey: v }) },
            { id: 'subsource', name: 'SubSource', color: 'border-l-purple-500', desc: 'Alternative. Free: 7,200 requests/day.', key: settings.subsourceApiKey, setter: (v) => setSettings({ ...settings, subsourceApiKey: v }) },
          ].map(provider => {
            const status = testResults[provider.id] || keyStatuses[provider.id];
            return (
              <div key={provider.id} className={`glass-panel p-5 rounded-2xl border-l-4 ${provider.color}`}>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-base font-bold font-display text-slate-100">{provider.name}</label>
                  {status?.status && (
                    <span
                      title={status.message || ''}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        status.status === 'connected'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : status.status === 'warning'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${status.status === 'connected' ? 'bg-emerald-400' : status.status === 'warning' ? 'bg-amber-400' : 'bg-red-400'}`} />
                      {status.status === 'connected' ? 'Connected' : status.status === 'warning' ? 'Quota' : 'Error'}
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-400 mb-3">{provider.desc}</p>
                <PasswordInput
                  placeholder={`${provider.name} API Key`}
                  className="glass-input w-full font-mono"
                  value={provider.key}
                  onChange={(e) => provider.setter(e.target.value)}
                />
                {status?.status === 'error' && status?.message && (
                  <p className="text-xs text-red-400 mt-1.5 break-words">
                    {status.message}
                  </p>
                )}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
                  <p className="text-xs sm:text-sm text-slate-400">
                    Get key from: <a href={`https://${provider.id === 'opensubtitles' ? 'opensubtitles.com' : provider.id === 'subdl' ? 'subdl.com/panel/login' : 'subsource.net/dashboard/profile'}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">{provider.id === 'opensubtitles' ? 'opensubtitles.com' : provider.id === 'subdl' ? 'subdl.com' : 'subsource.net'}</a>
                  </p>
                  <button
                    type="button"
                    onClick={() => handleTestService(provider.id, provider.key)}
                    disabled={testingService[provider.id] || !provider.key}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 hover:border-cyan-500/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {testingService[provider.id] && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
                    {testingService[provider.id] ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      {/* === Section 2: Auto Translation === */}
      <SettingsSection>
        <SettingsHeader
          title="Auto Translation"
          icon={Languages}
          description="Automatically translate downloaded English subtitles into your preferred languages."
        />

        <div className="space-y-6">
          <SettingsGroup>
            <div>
              <SettingsLabel title="Translation Provider" />
              <CustomSelect 
                value={settings.translationProvider || 'gemini'} 
                onChange={(e) => setSettings({ ...settings, translationProvider: e.target.value })}
                options={[
                  { label: 'Gemini AI', value: 'gemini' },
                  { label: 'DeepSeek', value: 'deepseek' },
                  { label: 'Claude (Anthropic)', value: 'claude' }
                ]}
              />
              <SettingsHelper text={
                settings.translationProvider === 'gemini' ? 'Gemini AI — high quality, requires a Gemini API key.' :
                settings.translationProvider === 'deepseek' ? 'DeepSeek — very affordable, requires a DeepSeek API key.' :
                'Claude by Anthropic — high quality, requires an Anthropic API key.'
              } />
            </div>

          {[
            { id: 'gemini', key: settings.geminiApiKey, setter: (v) => setSettings({ ...settings, geminiApiKey: v }) },
            { id: 'deepseek', key: settings.deepseekApiKey, setter: (v) => setSettings({ ...settings, deepseekApiKey: v }) },
            { id: 'claude', key: settings.claudeApiKey, setter: (v) => setSettings({ ...settings, claudeApiKey: v }) },
          ].filter(p => settings.translationProvider === p.id).map(p => {
            const status = testResults[p.id] || keyStatuses[p.id];
            return (
              <div key={p.id}>
                <div className="flex items-center justify-between">
                  <label className="block text-xs sm:text-sm font-medium text-slate-300">{p.id.charAt(0).toUpperCase() + p.id.slice(1)} API Key</label>
                  {status?.status && (
                    <span
                      title={status.message || ''}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        status.status === 'connected'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : status.status === 'warning'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${status.status === 'connected' ? 'bg-emerald-400' : status.status === 'warning' ? 'bg-amber-400' : 'bg-red-400'}`} />
                      {status.status === 'connected' ? 'Connected' : status.status === 'warning' ? 'Quota' : 'Error'}
                    </span>
                  )}
                </div>
                <PasswordInput
                  placeholder={`${p.id.charAt(0).toUpperCase() + p.id.slice(1)} API Key`}
                  className="glass-input w-full mt-2 font-mono"
                  value={p.key}
                  onChange={(e) => p.setter(e.target.value)}
                />
                {status?.status === 'error' && status?.message && (
                  <p className="text-xs text-red-400 mt-1.5 break-words">
                    {status.message}
                  </p>
                )}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
                  <p className="text-xs sm:text-sm text-slate-400">
                    Get key from: <a href={{
                      gemini: 'https://aistudio.google.com/apikey',
                      deepseek: 'https://platform.deepseek.com/api_keys',
                      claude: 'https://console.anthropic.com/settings/keys'
                    }[p.id]} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">{{
                      gemini: 'aistudio.google.com',
                      deepseek: 'platform.deepseek.com',
                      claude: 'console.anthropic.com'
                    }[p.id]}</a>
                  </p>
                  <button
                    type="button"
                    onClick={() => handleTestService(p.id, p.key)}
                    disabled={testingService[p.id] || !p.key}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 hover:border-cyan-500/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {testingService[p.id] && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
                    {testingService[p.id] ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
              </div>
            );
          })}

            <div>
              <SettingsLabel title="Target Languages" />
              <SettingsHelper text="Select the languages you want subtitles translated into." />
              <div className="flex flex-wrap gap-2 mt-3">
                {['Dutch', 'French', 'German', 'Spanish', 'Italian', 'Portuguese'].map(lang => {
                  const isSelected = settings.targetLangs?.includes(lang);
                  return (
                    <button
                      key={lang}
                      onClick={() => {
                        const newLangs = isSelected
                          ? settings.targetLangs.filter(l => l !== lang)
                          : [...(settings.targetLangs || []), lang];
                        setSettings({ ...settings, targetLangs: newLangs });
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        isSelected
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-slate-800/50 text-slate-400 border-white/5 hover:border-slate-500/30'
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                      {lang}
                    </button>
                  );
                })}
              </div>
            </div>
          </SettingsGroup>

          <ToggleRow
            checked={settings.autoTranslate}
            onChange={() => setSettings({ ...settings, autoTranslate: !settings.autoTranslate })}
            title="Auto-translate after subtitle download"
            description="When English subtitles are downloaded, automatically translate them into all selected target languages."
          />

          {settings.autoTranslate && (
            <ToggleRow
              checked={settings.preferNativeBeforeTranslate}
              onChange={() => setSettings({ ...settings, preferNativeBeforeTranslate: !settings.preferNativeBeforeTranslate })}
              title="Prefer native subtitles before auto-translate"
              description="First search for native subtitles in your target languages. Only auto-translate from English if no native subtitles are found. When native subtitles become available later, they will replace translated ones."
            />
          )}

        </div>
      </SettingsSection>

    </div>
  );
}
