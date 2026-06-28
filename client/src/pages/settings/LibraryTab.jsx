import api from '../../lib/api';
import { Plus, Trash2, RefreshCw, CheckCircle2, AlertCircle, FolderTree } from 'lucide-react';
import { customAlert } from '../../utils/alerts';
import DuplicateSection from './DuplicateSection';

export default function LibraryTab({
  paths, newPath, setNewPath, handleAddPath, fetchPaths,
  handleScan, isScanning, scanProgress, scanResults,
  isStaleResults, setScanResults, setIsStaleResults
}) {
  const data = scanResults || scanProgress;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold text-blue-400 flex items-center gap-2">
          <FolderTree className="w-7 h-7" /> Library & Root Folders
        </h2>
        <button 
          onClick={handleScan}
          disabled={isScanning}
          className="bg-blue-500 hover:bg-blue-400 text-white font-bold py-2 px-4 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          {isScanning ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <RefreshCw className="w-4 h-4" />}
          {isScanning ? 'Scanning...' : 'Scan Now'}
        </button>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 p-4 rounded-xl mb-6 flex gap-3 text-sm">
        <Plus className="w-5 h-5 shrink-0" />
        <p>Configure where Atlas moves your completed downloads. Atlas will automatically scan these folders to build your library.</p>
      </div>
      
      {(scanProgress || scanResults) && (
        <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-3 mb-6 shadow-xl relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-bold text-slate-200">
                {scanResults ? (isStaleResults ? 'Previous Scan Results' : 'Scan Results') : 'Scanning Library'}
              </h3>
              <p className="text-sm text-slate-400 truncate max-w-md">
                {scanResults ? (isStaleResults ? 'Data from last scan — run a new scan to refresh' : 'Scan completed') : (scanProgress?.currentPhase || scanProgress?.currentFile)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!scanResults && scanProgress && (
                <div className="text-right">
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
                      <p key={i} className="text-[10px] text-emerald-400/80 font-mono">🎬 {m.title}{m.year ? ` (${m.year})` : ''}</p>
                    ))}
                    {data.addedShows?.map((s, i) => (
                      <p key={i} className="text-[10px] text-emerald-400/80 font-mono">📺 {s.title}</p>
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
                      <div key={i}>
                        <p className="text-[10px] text-rose-300/80 font-mono">🎬 {m.title}{m.year ? ` (${m.year})` : ''}</p>
                        <p className="text-[9px] text-rose-400/50 font-mono ml-4 truncate" title={m.file}>{m.reason}</p>
                        {m.file && <p className="text-[8px] text-slate-500 font-mono ml-4 truncate" title={m.file}>{m.file}</p>}
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
                      <div key={i}>
                        <p className="text-[10px] text-rose-300/80 font-mono">📺 {s.title}</p>
                        <p className="text-[9px] text-rose-400/50 font-mono ml-4 truncate" title={s.file}>{s.reason}</p>
                        {s.file && <p className="text-[8px] text-slate-500 font-mono ml-4 truncate" title={s.file}>{s.file}</p>}
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
                <div key={i} className="mb-1 last:mb-0">
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

          {/* Empty paths */}
          {data?.emptyPaths?.length > 0 && (
            <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <p className="text-xs font-bold text-amber-400 flex items-center gap-1 mb-1">
                <AlertCircle className="w-3 h-3" /> {data.emptyPaths.length} path(s) returned no files
              </p>
              {data.emptyPaths.map((ep, i) => (
                <p key={i} className="text-[10px] text-amber-300/70 font-mono truncate">{ep.path} — {ep.error}</p>
              ))}
              <p className="text-[10px] text-amber-400/60 mt-1">The mount might be empty or disconnected.</p>
            </div>
          )}
        </div>
      )}
      
      <div className="space-y-4">
        <div className="flex gap-3">
          <input type="text" className="glass-input flex-1" placeholder="e.g. /mnt/nas/movies" value={newPath} onChange={(e) => setNewPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddPath()} />
          <button onClick={handleAddPath} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2"><Plus className="w-4 h-4"/> Add Path</button>
        </div>
        
        <div className="space-y-3 pt-4">
          {paths.length === 0 ? <p className="text-slate-500 italic">No root folders configured yet.</p> : paths.map((p) => (
            <div key={p.id} className="flex items-center justify-between bg-slate-950/50 p-4 rounded-xl border border-white/5">
              <span className="text-slate-200 font-mono text-sm">{p.path}</span>
              <button onClick={() => api.delete(`/library/paths/${p.id}`).then(fetchPaths)} className="text-red-400 hover:text-red-300 p-2"><Trash2 className="w-5 h-5" /></button>
            </div>
          ))}
        </div>
      </div>

      <DuplicateSection />
    </div>
  );
}
