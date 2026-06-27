import { Save, Download, Languages, CheckCircle2 } from 'lucide-react';
import LanguageInput from './LanguageInput';

export default function SubtitlesTab({ settings, setSettings, keyStatuses, handleSave }) {
  return (
    <div className="max-w-5xl mx-auto space-y-10">

      {/* === Section 1: Subtitle Providers === */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Download className="w-6 h-6 text-pink-400" />
          <h2 className="text-xl font-bold text-pink-400">Subtitle Providers</h2>
        </div>
        <p className="text-sm text-slate-400 mb-6">Configure subtitle sources. Providers are tried in order — if one fails, the next is used. Select which languages to search for.</p>

        <div className="glass-panel p-4 rounded-xl border border-white/5 mb-5">
          <p className="text-xs text-slate-400 font-medium mb-2">Search Languages</p>
          <LanguageInput
            selected={settings.providerLangs || ['en']}
            onChange={(langs) => setSettings({ ...settings, providerLangs: langs.length ? langs : ['en'] })}
          />
        </div>
        
        <div className="space-y-5">
          {[
            { id: 'opensubtitles', name: 'OpenSubtitles', color: 'border-l-cyan-500', desc: 'Primary subtitle source.', key: settings.osApiKey, setter: (v) => setSettings({ ...settings, osApiKey: v }) },
            { id: 'subdl', name: 'SubDL', color: 'border-l-amber-500', desc: 'Alternative. Free: 2,000 requests/day.', key: settings.subdlApiKey, setter: (v) => setSettings({ ...settings, subdlApiKey: v }) },
            { id: 'subsource', name: 'SubSource', color: 'border-l-purple-500', desc: 'Alternative. Free: 7,200 requests/day.', key: settings.subsourceApiKey, setter: (v) => setSettings({ ...settings, subsourceApiKey: v }) },
          ].map(provider => (
            <div key={provider.id} className={`glass-panel p-5 rounded-2xl border-l-4 ${provider.color}`}>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-bold text-slate-200">{provider.name}</label>
                {keyStatuses[provider.id]?.status && (
                  <span className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    keyStatuses[provider.id]?.status === 'connected'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${keyStatuses[provider.id]?.status === 'connected' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    {keyStatuses[provider.id]?.status === 'connected' ? 'Connected' : 'Error'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-3">{provider.desc}</p>
              <input type="password" placeholder={`${provider.name} API Key`} className="glass-input w-full" value={provider.key} onChange={(e) => provider.setter(e.target.value)} />
              <p className="text-xs text-slate-500 mt-2">Get key from: <a href={`https://${provider.id === 'opensubtitles' ? 'opensubtitles.com' : provider.id === 'subdl' ? 'subdl.com/panel/login' : 'subsource.net/dashboard/profile'}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">{provider.id === 'opensubtitles' ? 'opensubtitles.com' : provider.id === 'subdl' ? 'subdl.com' : 'subsource.net'}</a></p>
            </div>
          ))}
        </div>
      </div>

      <hr className="border-white/5" />

      {/* === Section 2: Auto Translation === */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Languages className="w-6 h-6 text-pink-400" />
          <h2 className="text-xl font-bold text-pink-400">Auto Translation</h2>
        </div>
        <p className="text-sm text-slate-400 mb-6">Automatically translate downloaded English subtitles into your preferred languages.</p>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300">Translation Provider</label>
            <select className="glass-input w-full mt-2" value={settings.translationProvider} onChange={(e) => setSettings({ ...settings, translationProvider: e.target.value })}>
              <option value="gemini">Gemini AI</option>
              <option value="deepseek">DeepSeek</option>
              <option value="claude">Claude (Anthropic)</option>
              <option value="googleTranslate">Google Translate (free)</option>
            </select>
            <p className="text-xs text-slate-500 mt-2">
              {settings.translationProvider === 'gemini' && 'Gemini AI — high quality, requires a Gemini API key.'}
              {settings.translationProvider === 'deepseek' && 'DeepSeek — very affordable, requires a DeepSeek API key.'}
              {settings.translationProvider === 'claude' && 'Claude by Anthropic — high quality, requires an Anthropic API key.'}
              {settings.translationProvider === 'googleTranslate' && 'Google Translate (free) — no API key needed, uses the free web endpoint.'}
            </p>
          </div>

          {[
            { id: 'gemini', key: settings.geminiApiKey, setter: (v) => setSettings({ ...settings, geminiApiKey: v }) },
            { id: 'deepseek', key: settings.deepseekApiKey, setter: (v) => setSettings({ ...settings, deepseekApiKey: v }) },
            { id: 'claude', key: settings.claudeApiKey, setter: (v) => setSettings({ ...settings, claudeApiKey: v }) },
          ].filter(p => settings.translationProvider === p.id).map(p => (
            <div key={p.id}>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-300">{p.id.charAt(0).toUpperCase() + p.id.slice(1)} API Key</label>
                {keyStatuses[p.id]?.status && (
                  <span className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    keyStatuses[p.id]?.status === 'connected'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${keyStatuses[p.id]?.status === 'connected' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    {keyStatuses[p.id]?.status === 'connected' ? 'Connected' : 'Error'}
                  </span>
                )}
              </div>
              <input type="password" placeholder={`${p.id.charAt(0).toUpperCase() + p.id.slice(1)} API Key`} className="glass-input w-full mt-2" value={p.key} onChange={(e) => p.setter(e.target.value)} />
              <p className="text-xs text-slate-500 mt-2">Get key from: <a href={{
                gemini: 'https://aistudio.google.com/apikey',
                deepseek: 'https://platform.deepseek.com/api_keys',
                claude: 'https://console.anthropic.com/settings/keys'
              }[p.id]} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">{{
                gemini: 'aistudio.google.com',
                deepseek: 'platform.deepseek.com',
                claude: 'console.anthropic.com'
              }[p.id]}</a></p>
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-slate-300">Target Languages</label>
            <p className="text-xs text-slate-500 mt-1 mb-2">Select the languages you want subtitles translated into.</p>
            <div className="flex flex-wrap gap-2">
              {['Dutch', 'French', 'German', 'Spanish', 'Italian', 'Portuguese'].map(lang => {
                const isSelected = settings.targetLangs.includes(lang);
                return (
                  <button
                    key={lang}
                    onClick={() => {
                      const newLangs = isSelected
                        ? settings.targetLangs.filter(l => l !== lang)
                        : [...settings.targetLangs, lang];
                      setSettings({ ...settings, targetLangs: newLangs });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      isSelected
                        ? 'bg-pink-500/20 text-pink-300 border-pink-500/40'
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

          <div className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-xl border border-white/5">
            <input
              type="checkbox"
              id="autoTranslate"
              className="w-5 h-5 cursor-pointer accent-cyan-500"
              checked={settings.autoTranslate}
              onChange={(e) => setSettings({ ...settings, autoTranslate: e.target.checked })}
            />
            <label htmlFor="autoTranslate" className="text-sm text-slate-300 cursor-pointer select-none">
              <span className="font-medium">Auto-translate after subtitle download</span>
              <p className="text-xs text-slate-500 mt-0.5">When English subtitles are downloaded, automatically translate them into all selected target languages.</p>
            </label>
          </div>

          <div className="pt-2">
            <button onClick={handleSave} className="bg-pink-500 hover:bg-pink-400 text-white font-bold py-2.5 px-6 rounded-xl flex items-center gap-2">
              <Save className="w-4 h-4" /> Save Settings
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
