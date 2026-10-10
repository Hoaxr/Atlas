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
        
        <div className="space-y-4 sm:space-y-5">
          {[
            { id: 'opensubtitles', name: 'OpenSubtitles', desc: 'Primary subtitle source.', key: settings.osApiKey, setter: (v) => setSettings({ ...settings, osApiKey: v }), link: 'https://opensubtitles.com' },
            { id: 'subdl', name: 'SubDL', desc: 'Alternative. Free: 2,000 requests/day.', key: settings.subdlApiKey, setter: (v) => setSettings({ ...settings, subdlApiKey: v }), link: 'https://subdl.com/panel/login' },
            { id: 'subsource', name: 'SubSource', desc: 'Alternative. Free: 7,200 requests/day.', key: settings.subsourceApiKey, setter: (v) => setSettings({ ...settings, subsourceApiKey: v }), link: 'https://subsource.net/dashboard/profile' },
          ].map(provider => {
            const status = testResults[provider.id] || keyStatuses[provider.id];
            return (
              <div key={provider.id} className="p-4 sm:p-5 bg-[#101e31] rounded-xl border border-[#1c2d46] hover:border-[#274063] transition-colors space-y-3.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-bold font-display text-slate-100">{provider.name}</h3>
                    {!provider.key ? (
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700/60 whitespace-nowrap">
                        Not configured
                      </span>
                    ) : status?.status === 'connected' ? (
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                        Connected
                      </span>
                    ) : status?.status === 'warning' ? (
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap">
                        Quota
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap">
                        Error
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <a href={provider.link} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300 underline font-medium">
                      Get key &rarr;
                    </a>
                    <button
                      type="button"
                      onClick={() => handleTestService(provider.id, provider.key)}
                      disabled={testingService[provider.id] || !provider.key}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-[#15243b] hover:bg-[#1a2d4a] border border-[#1c2d46] hover:border-cyan-500/30 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                    >
                      {testingService[provider.id] && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
                      {testingService[provider.id] ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-400">{provider.desc}</p>

                <div>
                  <PasswordInput
                    placeholder={`${provider.name} API Key`}
                    className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600 font-mono"
                    value={provider.key}
                    onChange={(e) => provider.setter(e.target.value)}
                  />
                  {status?.status === 'error' && status?.message && (
                    <p className="text-xs text-rose-400 mt-1.5 break-words">
                      {status.message}
                    </p>
                  )}
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
            { id: 'gemini', name: 'Gemini AI', key: settings.geminiApiKey, setter: (v) => setSettings({ ...settings, geminiApiKey: v }), link: 'https://aistudio.google.com/apikey', desc: 'Google Gemini API for fast, high-quality subtitle translation.' },
            { id: 'deepseek', name: 'DeepSeek', key: settings.deepseekApiKey, setter: (v) => setSettings({ ...settings, deepseekApiKey: v }), link: 'https://platform.deepseek.com/api_keys', desc: 'DeepSeek API for cost-effective AI translation.' },
            { id: 'claude', name: 'Claude', key: settings.claudeApiKey, setter: (v) => setSettings({ ...settings, claudeApiKey: v }), link: 'https://console.anthropic.com/settings/keys', desc: 'Anthropic Claude API for advanced natural language subtitle translation.' },
          ].filter(p => settings.translationProvider === p.id).map(p => {
            const status = testResults[p.id] || keyStatuses[p.id];
            return (
              <div key={p.id} className="p-4 sm:p-5 bg-[#101e31] rounded-xl border border-[#1c2d46] hover:border-[#274063] transition-colors space-y-3.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-bold font-display text-slate-100">{p.name}</h3>
                    {!p.key ? (
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700/60 whitespace-nowrap">
                        Not configured
                      </span>
                    ) : status?.status === 'connected' ? (
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                        Connected
                      </span>
                    ) : status?.status === 'warning' ? (
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap">
                        Quota
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap">
                        Error
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300 underline font-medium">
                      Get key &rarr;
                    </a>
                    <button
                      type="button"
                      onClick={() => handleTestService(p.id, p.key)}
                      disabled={testingService[p.id] || !p.key}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-[#15243b] hover:bg-[#1a2d4a] border border-[#1c2d46] hover:border-cyan-500/30 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                    >
                      {testingService[p.id] && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
                      {testingService[p.id] ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-400">{p.desc}</p>

                <div>
                  <PasswordInput
                    placeholder={`${p.name} API Key`}
                    className="w-full bg-[#0c1624] border border-[#1c2d46] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors placeholder:text-slate-600 font-mono"
                    value={p.key}
                    onChange={(e) => p.setter(e.target.value)}
                  />
                  {status?.status === 'error' && status?.message && (
                    <p className="text-xs text-rose-400 mt-1.5 break-words">
                      {status.message}
                    </p>
                  )}
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
