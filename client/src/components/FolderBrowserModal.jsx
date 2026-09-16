import { useState, useEffect } from 'react';
import { Folder, FolderOpen, ChevronRight, Home, Loader2, Check, HardDrive, ArrowUp } from 'lucide-react';
import api from '../lib/api';
import ModalShell from './shared/ModalShell';
import InlineError from './shared/InlineError';

export default function FolderBrowserModal({
  open,
  onClose,
  onSelect,
  itemId = null,
  itemType = 'movies',
  initialPath = '',
  mode = itemId ? 'item' : 'filesystem',
  title = mode === 'filesystem' ? 'Browse Server Folders' : 'Import Folder',
  description = mode === 'filesystem' ? 'Select a folder on your server to use as a root folder.' : ''
}) {
  const isFilesystem = mode === 'filesystem';
  const [currentPath, setCurrentPath] = useState(initialPath || null);
  const [entries, setEntries] = useState([]);
  const [parentPath, setParentPath] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState(null);
  const [manualInput, setManualInput] = useState(initialPath || '');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  const fetchDirectory = async (dirPath) => {
    setLoading(true);
    setError(null);
    try {
      if (isFilesystem) {
        const res = await api.get('/library/filesystem/browse', {
          params: dirPath ? { path: dirPath } : {}
        });
        if (res.data.status === 'success') {
          const { currentPath: actualPath, parentPath: parent, directories: dirs } = res.data.data;
          setCurrentPath(actualPath);
          setManualInput(actualPath);
          setParentPath(parent);
          setEntries((dirs || []).map(d => ({ name: d.name || d, path: d.path || (actualPath.replace(/\/$/, '') + '/' + (d.name || d)) })));
          setSelectedPath(actualPath);
        }
      } else {
        const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
        const res = await api.get(`/library/${itemType}/${itemId}/browse${params}`);
        if (res.data.status === 'success') {
          setEntries(res.data.data || []);
          setParentPath(res.data.parent);
          setCurrentPath(dirPath);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to browse directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setCurrentPath(initialPath || null);
      setEntries([]);
      setParentPath(null);
      setSelectedPath(null);
      setManualInput(initialPath || '');
      setError(null);
      fetchDirectory(initialPath || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPath]);

  const navigateTo = (dirPath) => {
    setSelectedPath(dirPath);
    fetchDirectory(dirPath);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualInput.trim()) {
      navigateTo(manualInput.trim());
    }
  };

  const handleConfirm = async () => {
    const targetPath = selectedPath || currentPath;
    if (!targetPath) return;

    if (isFilesystem) {
      onSelect(targetPath);
      onClose();
      return;
    }

    setImporting(true);
    setError(null);
    try {
      const res = await api.post(`/library/${itemType}/${itemId}/set-path`, { folderPath: targetPath });
      if (res.data.status === 'success') {
        onSelect(targetPath, res.data.message);
        onClose();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to import folder');
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  const breadcrumbs = currentPath
    ? currentPath.split('/').filter(Boolean).map((part, i, arr) => ({
        name: part,
        path: '/' + arr.slice(0, i + 1).join('/'),
      }))
    : [];

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="lg"
      className="max-h-[85vh]"
    >
      <div className="space-y-3">
        {/* Manual path input (filesystem mode) */}
        {isFilesystem && (
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="/data/media"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={loading || !manualInput.trim()}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              Go
            </button>
          </form>
        )}

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-950/60 rounded-lg border border-slate-800 overflow-x-auto text-xs font-mono text-slate-300">
          <button
            onClick={() => navigateTo(isFilesystem ? '/' : null)}
            className="hover:text-cyan-400 p-0.5 rounded transition-colors flex items-center gap-1"
            title="Root"
          >
            {isFilesystem ? <HardDrive className="w-3.5 h-3.5 text-cyan-400" /> : <Home className="w-3.5 h-3.5 text-cyan-400" />}
            <span>/</span>
          </button>
          {breadcrumbs.map((crumb, idx) => (
            <span key={crumb.path} className="flex items-center gap-1 shrink-0">
              <ChevronRight className="w-3 h-3 text-slate-600" />
              <button
                onClick={() => navigateTo(crumb.path)}
                className={`hover:text-white transition-colors truncate max-w-[150px] ${
                  idx === breadcrumbs.length - 1 ? 'text-cyan-400 font-bold' : 'text-slate-400'
                }`}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* Directory Listing */}
        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/40 p-1 divide-y divide-slate-800/40">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
              <span className="text-xs">Loading directories...</span>
            </div>
          ) : error ? (
            <div className="p-3"><InlineError message={error} compact /></div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              {currentPath ? 'No subdirectories found in this folder.' : 'No directories available.'}
            </div>
          ) : (
            entries.map((entry) => {
              const isSelected = selectedPath === entry.path;
              return (
                <button
                  key={entry.path}
                  onClick={() => navigateTo(entry.path)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                    isSelected
                      ? 'bg-cyan-500/15 text-cyan-300 font-medium'
                      : 'hover:bg-slate-800/60 text-slate-300'
                  }`}
                >
                  {isSelected ? (
                    <FolderOpen className="w-4 h-4 text-cyan-400 shrink-0" />
                  ) : (
                    <Folder className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                  <span className="truncate text-xs font-mono">{entry.name}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 ml-auto shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => parentPath !== null ? navigateTo(parentPath) : (isFilesystem ? navigateTo('/') : fetchDirectory(null))}
            disabled={parentPath === null && breadcrumbs.length === 0}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-30"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            Up a folder
          </button>
          <button
            onClick={handleConfirm}
            disabled={(!selectedPath && !currentPath) || importing}
            className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium px-4 py-2 rounded-lg transition-colors text-xs"
          >
            {importing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                {isFilesystem ? 'Select Folder' : 'Import Folder'}
              </>
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
