import { useState, useEffect } from 'react';
import { Folder, ChevronRight, Home, Loader2, Check, ArrowUp, HardDrive } from 'lucide-react';
import api from '../../lib/api';
import ModalShell from './ModalShell';

export default function ServerFolderBrowserModal({ open, onClose, onSelect, initialPath = '' }) {
  const [currentPath, setCurrentPath] = useState(initialPath || '');
  const [parentPath, setParentPath] = useState(null);
  const [directories, setDirectories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [manualInput, setManualInput] = useState('');

  const loadDirectory = async (dirPath) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/library/filesystem/browse', {
        params: dirPath ? { path: dirPath } : {}
      });
      if (res.data.status === 'success') {
        const { currentPath: actualPath, parentPath: parent, directories: dirs } = res.data.data;
        setCurrentPath(actualPath);
        setManualInput(actualPath);
        setParentPath(parent);
        setDirectories(dirs || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to read directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadDirectory(initialPath || null);
    }
  }, [open, initialPath]);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualInput.trim()) {
      loadDirectory(manualInput.trim());
    }
  };

  const handleConfirm = () => {
    if (currentPath) {
      onSelect(currentPath);
      onClose();
    }
  };

  const breadcrumbs = currentPath
    ? currentPath.split('/').filter(Boolean)
    : [];

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Browse Server Folders"
      description="Select a folder on your server to use as a music root folder."
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        {/* Manual Path Input Form */}
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="/mnt/oblivion/muziek"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !manualInput.trim()}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
          >
            Go
          </button>
        </form>

        {/* Breadcrumbs Navigation */}
        <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-900/50 rounded-xl border border-white/5 overflow-x-auto text-xs font-mono text-slate-300">
          <button
            onClick={() => loadDirectory('/')}
            className="hover:text-cyan-400 p-0.5 rounded transition-colors flex items-center gap-1"
            title="Root"
          >
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            <span>/</span>
          </button>
          {breadcrumbs.map((crumb, idx) => {
            const pathUpTo = '/' + breadcrumbs.slice(0, idx + 1).join('/');
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <div key={pathUpTo} className="flex items-center gap-1.5 shrink-0">
                <ChevronRight className="w-3 h-3 text-slate-600" />
                <button
                  onClick={() => loadDirectory(pathUpTo)}
                  className={`hover:text-cyan-400 transition-colors ${
                    isLast ? 'text-cyan-400 font-bold' : 'text-slate-400'
                  }`}
                >
                  {crumb}
                </button>
              </div>
            );
          })}
        </div>

        {/* Directory Listing */}
        <div className="border border-white/5 rounded-xl bg-slate-950/60 h-64 overflow-y-auto divide-y divide-white/5">
          {parentPath && (
            <button
              onClick={() => loadDirectory(parentPath)}
              className="w-full text-left px-3.5 py-2.5 hover:bg-white/5 text-xs text-slate-400 hover:text-slate-200 flex items-center gap-2.5 transition-colors font-mono"
            >
              <ArrowUp className="w-3.5 h-3.5 text-slate-500" />
              <span>.. (Parent directory)</span>
            </button>
          )}

          {loading ? (
            <div className="h-40 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Loading folders...</span>
            </div>
          ) : error ? (
            <div className="p-4 text-center text-xs text-rose-400">{error}</div>
          ) : directories.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No subdirectories found in this folder.
            </div>
          ) : (
            directories.map((dir) => (
              <button
                key={dir.path}
                onClick={() => loadDirectory(dir.path)}
                className="w-full text-left px-3.5 py-2 hover:bg-cyan-500/10 hover:border-cyan-500/20 text-xs text-slate-200 flex items-center justify-between group transition-colors"
              >
                <div className="flex items-center gap-2.5 truncate font-mono">
                  <Folder className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform shrink-0" />
                  <span className="truncate">{dir.name}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 transition-colors shrink-0" />
              </button>
            ))
          )}
        </div>

        {/* Current Selection & Actions */}
        <div className="pt-2 flex items-center justify-between border-t border-white/5">
          <div className="truncate pr-3">
            <span className="text-[11px] text-slate-500 block">Selected folder:</span>
            <span className="text-xs font-mono text-cyan-300 truncate block">
              {currentPath || 'None'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!currentPath}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              Use This Folder
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
