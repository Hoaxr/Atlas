import api from '../../lib/api';
import { Save, AlertCircle, CheckSquare, Square, Key } from 'lucide-react';
import { customAlert, customConfirm } from '../../utils/alerts';

export default function ApisTab({
  settings, setSettings, handleSave,
  traktDeviceCode, traktUserCode, traktVerificationUrl, traktPolling,
  connectTrakt, fetchSettings
}) {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
          <Key className="w-7 h-7" /> API's & Integrations
        </h2>
      </div>
      <div className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 p-4 rounded-xl mb-6 flex gap-3 text-sm">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p>TMDB provides all metadata, posters, and search results. Trakt provides trending lists and can sync your watched status.</p>
      </div>
      
      <div className="space-y-6">
        {/* ---- TMDB Section ---- */}
        <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-4">
          <h3 className="font-bold text-lg text-slate-200 flex items-center gap-2">TMDB</h3>
          
          {!settings.tmdbApiKey || settings.tmdbApiKey === '' ? (
            <div className="bg-slate-900/50 border border-white/5 rounded-xl p-5 flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-slate-600"></div>
              <div>
                <p className="font-bold text-slate-400">TMDB API key required</p>
                <p className="text-xs text-slate-500 mt-0.5">Required for metadata, posters and search</p>
              </div>
            </div>
          ) : /^\*+$/.test(settings.tmdbApiKey) ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
              <div>
                <p className="font-bold text-emerald-400">Connected to TMDB</p>
                <p className="text-xs text-slate-500 mt-0.5">API key is configured and working</p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <div>
                  <p className="font-bold text-amber-400">TMDB API key not saved yet</p>
                  <p className="text-xs text-slate-500 mt-0.5">Save to activate</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="flex justify-between items-center text-sm font-medium text-slate-300">
              <span>API Key</span>
              <a href="https://www.themoviedb.org/settings/api?language=en-US" target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300 underline">Get an API key here</a>
            </label>
            <input type="password" placeholder="Enter your TMDB API Key" className="glass-input w-full mt-2" value={settings.tmdbApiKey} onChange={(e) => setSettings({ ...settings, tmdbApiKey: e.target.value })} />
          </div>
        </div>

        {/* ---- Trakt Section ---- */}
        <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-4">
          <h3 className="font-bold text-lg text-slate-200 flex items-center gap-2">Trakt</h3>

          {settings.traktAccessToken ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                <div>
                  <p className="font-bold text-emerald-400">Connected to Trakt</p>
                  <p className="text-xs text-slate-500 mt-0.5">Watched sync will run every 6 hours</p>
                </div>
              </div>
              <button
                onClick={async () => {
                  if (await customConfirm('Disconnect from Trakt? You can reconnect later.')) {
                    await api.post('/auth/trakt/disconnect');
                    customAlert('Disconnected from Trakt');
                    fetchSettings();
                  }
                }}
                className="text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 px-3 py-1.5 rounded-lg transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="bg-slate-900/50 border border-white/5 rounded-xl p-5 flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-slate-600"></div>
              <div>
                <p className="font-bold text-slate-400">Not connected to Trakt</p>
                <p className="text-xs text-slate-500 mt-0.5">Watched sync requires Trakt authentication</p>
              </div>
            </div>
          )}

          <div>
            <label className="flex justify-between items-center text-sm font-medium text-slate-300">
              <span>Client ID</span>
              <a href="https://trakt.tv/oauth/applications" target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300 underline">Get an API key here</a>
            </label>
            <input type="text" placeholder="Enter your Trakt Client ID" className="glass-input w-full mt-2" value={settings.traktClientId} onChange={(e) => setSettings({ ...settings, traktClientId: e.target.value })} />
          </div>
          <div>
            <label className="flex justify-between items-center text-sm font-medium text-slate-300">
              <span>Client Secret</span>
            </label>
            <input type="password" placeholder="Enter your Trakt Client Secret" className="glass-input w-full mt-2" value={settings.traktClientSecret} onChange={(e) => setSettings({ ...settings, traktClientSecret: e.target.value })} />
          </div>

          {!settings.traktAccessToken && !traktDeviceCode && (
            <button
              onClick={connectTrakt}
              disabled={!settings.traktClientId || !settings.traktClientSecret}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Connect with Trakt
            </button>
          )}

          {traktDeviceCode ? (
            <div className="bg-slate-900/80 border border-cyan-500/30 rounded-xl p-6 space-y-4">
              <p className="text-sm text-slate-300 font-medium">Trakt Authorization</p>
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-sm text-slate-400">Go to the following URL and enter this PIN:</p>
                <a href={traktVerificationUrl} target="_blank" rel="noopener noreferrer" className="text-lg font-bold text-cyan-400 hover:text-cyan-300 underline">{traktVerificationUrl}</a>
                <div className="text-4xl font-black tracking-widest bg-slate-950 px-8 py-4 rounded-2xl border border-cyan-500/30 text-cyan-300 select-all">{traktUserCode}</div>
                {traktPolling ? (
                  <div className="flex items-center gap-2 text-sm text-emerald-400">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-500"></div>
                    Waiting for you to authorize...
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Waiting for authorization...</p>
                )}
              </div>
            </div>
          ) : null}

          <div 
            className="flex items-center gap-3 p-4 bg-slate-900/50 border border-white/5 rounded-xl cursor-pointer select-none transition-colors hover:bg-slate-800/50"
            onClick={() => setSettings(prev => ({ ...prev, traktWatchedSync: !prev.traktWatchedSync }))}
          >
            <div className="text-cyan-500">
              {settings.traktWatchedSync ? <CheckSquare className="w-6 h-6" /> : <Square className="w-6 h-6 text-slate-500" />}
            </div>
            <div>
              <span className="font-medium text-slate-200">Enable Trakt Watched Sync</span>
              <p className="text-xs text-slate-500 mt-0.5">When enabled, movies and shows can be marked as watched. This will sync watched status with your Trakt account.</p>
            </div>
          </div>

          <div className="pt-4">
            <button onClick={handleSave} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 px-6 rounded-xl flex items-center gap-2">
              <Save className="w-4 h-4" /> Save APIs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
