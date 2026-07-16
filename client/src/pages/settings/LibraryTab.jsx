import { useState, useRef } from 'react';
import api from '../../lib/api';
import { Plus, Trash2, RefreshCw, CheckCircle2, AlertCircle, FolderTree, ChevronDown } from 'lucide-react';
import { customAlert } from '../../utils/alerts';
import { useOutsideClick } from '../../lib/useOutsideClick';
import DuplicateSection from './DuplicateSection';
import CustomSelect from '../../components/shared/CustomSelect';

const SCAN_MODES = [
  { value: 'full',      label: 'Full Scan',       desc: 'Everything — new files, metadata, subtitles' },
  { value: 'new',       label: 'New Files Only',   desc: 'Only detect and add new media files' },
  { value: 'refresh',   label: 'Refresh Metadata', desc: 'Re-scan resolutions, codecs, ratings & sizes' },
  { value: 'rematch',   label: 'Re-match Files',   desc: 'Re-match existing files to TMDB (fix bad matches)' },
  { value: 'subtitles', label: 'Subtitles Only',   desc: 'Only re-scan external subtitle files' },
];

export default function LibraryTab({
  paths, newPath, newPathType, setNewPath, setNewPathType, handleAddPath, fetchPaths,
  handleScan, handleStopScan, isScanning, scanProgress, scanResults,
  isStaleResults, setScanResults, setIsStaleResults, settings, setSettings, handleSave
}) {
  const data = scanResults || scanProgress;
  const [scanMode, setScanMode] = useState('full');
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeMenuRef = useOutsideClick(() => setModeMenuOpen(false), modeMenuOpen);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-2xl font-bold text-blue-400 flex items-center gap-2">
          <FolderTree className="w-7 h-7" /> Library & Root Folders
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative flex" ref={modeMenuRef}>
            <button 
              onClick={() => handleScan(scanMode)}
              disabled={isScanning}
              className="bg-blue-500 hover:bg-blue-400 text-white font-bold py-2 px-4 rounded-l-xl flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {isScanning ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <RefreshCw className="w-4 h-4" />}
              {isScanning ? 'Scanning...' : 'Scan Now'}
            </button>
            <button
              onClick={() => setModeMenuOpen(!modeMenuOpen)}
              disabled={isScanning}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-2 rounded-r-xl flex items-center transition-colors disabled:opacity-50 border-l border-blue-400/30"
              title="Scan mode"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${modeMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {modeMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/10 text-xs font-bold text-slate-400 uppercase tracking-wider">Scan Mode</div>
                {SCAN_MODES.map(m => (
                  <button
                    key={m.value}
                    onClick={() => { setScanMode(m.value); setModeMenuOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors flex flex-col ${scanMode === m.value ? 'bg-blue-500/10' : ''}`}
                  >
                    <span className={`text-sm font-medium ${scanMode === m.value ? 'text-blue-400' : 'text-slate-200'}`}>
                      {scanMode === m.value && '● '}{m.label}
                    </span>
                    <span className="text-xs text-slate-500 mt-0.5">{m.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {isScanning && (
            <button
              onClick={handleStopScan}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-bold py-2 px-4 rounded-xl flex items-center gap-2 transition-colors"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500 mb-6">Configure the folders where Atlas moves your completed downloads. Atlas will scan these folders to build your library.</p>
      
      {(scanProgress || scanResults) && (
        <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-3 mb-6 shadow-xl relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-bold text-slate-200">
                {scanResults ? (isStaleResults ? 'Previous Scan Results' : 'Scan Results') : `Scanning Library — ${SCAN_MODES.find(m => m.value === scanMode)?.label || 'Full Scan'}`}
              </h3>
              <p className="text-sm text-slate-400 truncate max-w-md">
                {scanResults ? (isStaleResults ? 'Data from last scan — run a new scan to refresh' : 'Scan completed') : (scanProgress?.currentPhase || scanProgress?.currentFile)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!scanResults && scanProgress && (
                <div className="text-right">
                  {scanProgress.totalStages > 0 && (
                    <p className="text-[10px] text-cyan-400 font-semibold mb-1">Stage {scanProgress.currentStage}/{scanProgress.totalStages}</p>
                  )}
                  <p className="text-xs text-blue-400 font-bold mb-1">
                    {scanProgress.totalFiles > 0 ? `${Math.round((scanProgress.processedFiles / scanProgress.totalFiles) * 100)}%` : 'Starting...'}
                  </p>
                  <p className="text-xs text-slate-500">{scanProgress.processedFiles} / {scanProgress.totalFiles} items</p>
                </div>
              )}
              {scanResults && (
                <button
                  onClick={() => { setScanResults(null); setIsStaleResults(false); sessionStorage.removeItem('lastScanResults'); }}
                  className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                  title="Dismiss"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          {!scanResults && scanProgress && (
            <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-white/5">
              <div 
                className="bg-blue-500 h-2.5 rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.8)]"
                style={{ width: scanProgress.totalFiles > 0 ? `${(scanProgress.processedFiles / scanProgress.totalFiles) * 100}%` : '0%' }}
              ></div>
            </div>
          )}

          {/* Items found */}
          {(data?.addedMoviesCount + data?.addedShowsCount > 0) && (
            <div>
              <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />{' '}
                {data.addedMoviesCount > 0 && `${data.addedMoviesCount} new movie${data.addedMoviesCount !== 1 ? 's' : ''}`}
                {data.addedMoviesCount > 0 && data.addedShowsCount > 0 && ' & '}
                {data.addedShowsCount > 0 && `${data.addedShowsCount} TV show${data.addedShowsCount !== 1 ? 's' : ''} (${data.addedEpisodesCount || 0} episode${data.addedEpisodesCount !== 1 ? 's' : ''})`}
                {' found'}
              </p>
              {(data.addedMovies?.length > 0 || data.addedShows?.length > 0) && (
                <details className="mt-1.5">
                  <summary className="text-[10px] text-emerald-400/60 cursor-pointer hover:text-emerald-400 transition-colors">
                    View items
                  </summary>
                  <div className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                    {data.addedMovies?.map((m, i) => (
                      <p key={`lib-${i}`} className="text-[10px] text-emerald-400/80 font-mono">🎬 {m.title}{m.year ? ` (${m.year})` : ''}</p>
                    ))}
                    {data.addedShows?.map((s, i) => (
                      <p key={`lib-${i}`} className="text-[10px] text-emerald-400/80 font-mono">📺 {s.title}</p>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Failed items */}
          {(data?.failedMovies?.length > 0 || data?.failedShows?.length > 0) && (
            <div className="mt-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl">
              <p className="text-xs font-bold text-rose-400 flex items-center gap-1 mb-1">
                <AlertCircle className="w-3 h-3" /> Could not import
              </p>
              {data.failedMovies?.length > 0 && (
                <details className="mt-1">
                  <summary className="text-[10px] text-rose-400/60 cursor-pointer hover:text-rose-400 transition-colors">
                    {data.failedMovies.length} movie(s) failed
                  </summary>
                  <div className="mt-1 space-y-1 max-h-24 overflow-y-auto">
                    {data.failedMovies.map((m, i) => (
                      <div key={`lib-${i}`}>
                        <p className="text-[10px] text-rose-300/80 font-mono">🎬 {m.title}{m.year ? ` (${m.year})` : ''}</p>
                        <p className="text-[9px] text-rose-400/50 font-mono ml-4">{m.reason}</p>
                        {m.path && <p className="text-[8px] text-slate-500 font-mono ml-4 truncate" title={m.path}>{m.path}</p>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {data.failedShows?.length > 0 && (
                <details className="mt-1">
                  <summary className="text-[10px] text-rose-400/60 cursor-pointer hover:text-rose-400 transition-colors">
                    {data.failedShows.length} show(s) failed
                  </summary>
                  <div className="mt-1 space-y-1 max-h-24 overflow-y-auto">
                    {data.failedShows.map((s, i) => (
                      <div key={`lib-${i}`}>
                        <p className="text-[10px] text-rose-300/80 font-mono">📺 {s.title}</p>
                        <p className="text-[9px] text-rose-400/50 font-mono ml-4">{s.reason}</p>
                        {s.path && <p className="text-[8px] text-slate-500 font-mono ml-4 truncate" title={s.path}>{s.path}</p>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Unreachable paths */}
          {data?.unreachablePaths?.length > 0 && (
            <div className="mt-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl">
              <p className="text-xs font-bold text-rose-400 flex items-center gap-1 mb-1">
                <AlertCircle className="w-3 h-3" /> {data.unreachablePaths.length} path(s) unreachable
              </p>
              {data.unreachablePaths.map((up, i) => (
                <div key={`lib-${i}`} className="mb-1 last:mb-0">
                  <p className="text-[10px] text-rose-300/70 font-mono truncate">{up.path}</p>
                  {up.error && <p className="text-[9px] text-rose-400/50 font-mono mt-0.5">{up.error}</p>}
                </div>
              ))}
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={async () => {
                    const pathsToCheck = data.unreachablePaths.map(p => p.path);
                    try {
                      const res = await api.post('/library/scan/retry-paths', { paths: pathsToCheck });
                      if (res.data.status === 'success') {
                        const stillUnreachable = res.data.data.filter(p => !p.reachable);
                        const nowReachable = res.data.data.filter(p => p.reachable);
                        if (nowReachable.length > 0) {
                          const updateTarget = scanResults || scanProgress;
                          const updatedPaths = updateTarget.unreachablePaths.filter(up =>
                            stillUnreachable.some(su => su.path === up.path)
                          );
                          const updatedData = { ...updateTarget, unreachablePaths: updatedPaths };
                          if (scanResults) setScanResults(updatedData);
                          customAlert(`${nowReachable.length} path(s) are now reachable!`, 'success');
                        }
                        if (stillUnreachable.length > 0) {
                          customAlert(`${stillUnreachable.length} path(s) still unreachable. Error: ${stillUnreachable[0].error}`, 'error');
                        }
                      }
                    } catch (err) {
                      customAlert('Failed to retry paths', 'error');
                    }
                  }}
                  className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 hover:text-rose-200 transition-colors border border-rose-500/30"
                >
                  Retry Unreachable Paths
                </button>
              </div>
              <p className="text-[10px] text-rose-400/60 mt-1">Check that your mounts are connected and accessible on the server.</p>
            </div>
          )}

          {/* Skipped files */}
          {data?.skippedFiles?.length > 0 && (
            <div className="mt-2 p-3 bg-slate-500/10 border border-slate-500/30 rounded-xl">
              <p className="text-xs font-bold text-slate-400 flex items-center gap-1 mb-1">
                <AlertCircle className="w-3 h-3" /> {data.skippedFiles.length} file(s) skipped
              </p>
              <details>
                <summary className="text-[10px] text-slate-400/60 cursor-pointer hover:text-slate-400 transition-colors">
                  View skipped files
                </summary>
                <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                  {data.skippedFiles.map((sf, i) => (
                    <div key={`lib-${i}`} className="text-[10px] text-slate-400/80">
                      <span className="font-mono">{sf.name}</span>
                      {sf.reason && <span className="text-slate-500 ml-2">— {sf.reason}</span>}
                      {sf.path && <p className="text-[8px] text-slate-500 font-mono ml-0 truncate" title={sf.path}>{sf.path}</p>}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* Empty paths */}
          {data?.emptyPaths?.length > 0 && (
            <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <p className="text-xs font-bold text-amber-400 flex items-center gap-1 mb-1">
                <AlertCircle className="w-3 h-3" /> {data.emptyPaths.length} path(s) returned no files
              </p>
              {data.emptyPaths.map((ep, i) => (
                <p key={`lib-${i}`} className="text-[10px] text-amber-300/70 font-mono truncate">{ep.path} — {ep.error}</p>
              ))}
              <p className="text-[10px] text-amber-400/60 mt-1">The mount might be empty or disconnected.</p>
            </div>
          )}
        </div>
      )}
      
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input type="text" className="glass-input flex-1" placeholder="e.g. /mnt/nas/movies" value={newPath} onChange={(e) => setNewPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddPath()} />
          <div className="flex gap-3">
          <CustomSelect
            value={newPathType}
            onChange={(e) => setNewPathType(e.target.value)}
            options={[
              { label: 'Movies', value: 'movies' },
              { label: 'TV Shows', value: 'tv' },
              { label: 'Downloads', value: 'downloads' },
            ]}
            className="w-36 shrink-0"
          />
          <button onClick={handleAddPath} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shrink-0"><Plus className="w-4 h-4"/> Add Path</button>
          </div>
        </div>
        
        <div className="space-y-3 pt-4">
          {paths.length === 0 ? <p className="text-slate-500 italic">No root folders configured yet.</p> : paths.map((p) => (
            <div key={p.id} className="bg-slate-950/50 p-4 rounded-xl border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  p.type === 'movies' ? 'bg-cyan-500/20 text-cyan-400' :
                  p.type === 'tv' ? 'bg-purple-500/20 text-purple-400' :
                  'bg-amber-500/20 text-amber-400'
                }`}>
                  {p.type === 'movies' ? 'Movies' : p.type === 'tv' ? 'TV' : 'Downloads'}
                </span>
                <button onClick={() => api.delete(`/library/paths/${p.id}`).then(fetchPaths)} className="text-red-400 hover:text-red-300 p-2"><Trash2 className="w-5 h-5" /></button>
              </div>
              <span className="text-slate-200 font-mono text-sm break-all">{p.path}</span>
            </div>
          ))}
        </div>
      </div>

      {settings && (
        <div className="space-y-6 pt-6 border-t border-white/5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-200">Media Management</h3>
            <button
              onClick={handleSave}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-xl transition-all shadow-lg hover:shadow-blue-500/25 active:scale-95"
            >
              Save Settings
            </button>
          </div>
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl bg-slate-900/50 border border-white/5 hover:border-blue-500/30 transition-colors group">
              <div className="mt-0.5">
                <input type="checkbox" className="sr-only" checked={settings?.autoDeleteWatchedEnabled || false} onChange={e => setSettings({...settings, autoDeleteWatchedEnabled: e.target.checked})} />
                <div className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${settings?.autoDeleteWatchedEnabled ? 'bg-blue-500' : 'bg-slate-700'}`}>
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings?.autoDeleteWatchedEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-200 group-hover:text-blue-400 transition-colors">Auto-Delete Watched Media</p>
                <p className="text-xs text-slate-400 mt-1">Automatically delete media files from disk after they have been watched.</p>
              </div>
            </label>

            {settings?.autoDeleteWatchedEnabled && (
              <div className="ml-8 p-4 rounded-xl bg-blue-900/10 border border-blue-500/20">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Delay (Days)</label>
                <input
                  type="number"
                  min="0"
                  value={settings.autoDeleteWatchedDays || ''}
                  onChange={(e) => setSettings({ ...settings, autoDeleteWatchedDays: e.target.value })}
                  placeholder="e.g. 7"
                  className="w-full sm:w-64 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
                <p className="text-[11px] text-slate-500 mt-2">Wait this many days after the media is watched before deleting it.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <DuplicateSection />
    </div>
  );
}
