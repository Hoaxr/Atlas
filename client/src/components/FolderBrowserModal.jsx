import { useState, useEffect } from 'react';
import { Folder, FolderOpen, ChevronRight, Home, Loader2, Check, X } from 'lucide-react';
import api from '../lib/api';
import ModalShell from './shared/ModalShell';
import InlineError from './shared/InlineError';

export default function FolderBrowserModal({ open, onClose, onSelect, itemId, itemType = 'movies' }) {
  const [currentPath, setCurrentPath] = useState(null);
  const [entries, setEntries] = useState([]);
  const [parentPath, setParentPath] = useState(null);
  const [loading, setLoading] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [selectedPath, setSelectedPath] = useState(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setCurrentPath(null);
      setEntries([]);
      setParentPath(null);
      setBreadcrumbs([]);
      setSelectedPath(null);
      setError(null);
      fetchDirectory(null);
    }
  }, [open]);

  const fetchDirectory = async (dirPath) => {
    setLoading(true);
    setError(null);
    try {
      const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
      const res = await api.get(`/library/${itemType}/${itemId}/browse${params}`);
      if (res.data.status === 'success') {
        setEntries(res.data.data);
        setParentPath(res.data.parent);
        setCurrentPath(dirPath);

        if (dirPath) {
          const parts = dirPath.split('/').filter(Boolean);
          const crumbs = parts.map((part, i) => ({
            name: part,
            path: '/' + parts.slice(0, i + 1).join('/'),
          }));
          setBreadcrumbs(crumbs);
        } else {
          setBreadcrumbs([]);
        }
      }
    } catch (err) {
      setError('Failed to browse directory');
    } finally {
      setLoading(false);
    }
  };

  const navigateTo = (dirPath) => {
    setSelectedPath(dirPath);
    fetchDirectory(dirPath);
  };

  const handleImport = async () => {
    const targetPath = selectedPath || currentPath;
    if (!targetPath) return;
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

  return (
    <ModalShell open={open} onClose={onClose} size="lg" noHeader noFloatingClose className="max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-5 h-5 text-amber-400" />
            <h2 id="folder-browser-title" className="text-lg font-bold text-slate-200">Import Folder</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Breadcrumbs */}
        {breadcrumbs.length > 0 && (
          <div className="flex items-center gap-1 px-5 py-2 bg-slate-800/50 border-b border-white/5 overflow-x-auto text-xs">
            <button
              onClick={() => navigateTo(null)}
              className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors shrink-0"
            >
              <Home className="w-3 h-3" />
            </button>
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.path} className="flex items-center gap-1 shrink-0">
                <ChevronRight className="w-3 h-3 text-slate-600" />
                <button
                  onClick={() => navigateTo(crumb.path)}
                  className={`hover:text-white transition-colors truncate max-w-[150px] ${
                    i === breadcrumbs.length - 1 ? 'text-cyan-400 font-medium' : 'text-slate-400'
                  }`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Directory listing */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading...
            </div>
          ) : error ? (
            <div className="px-5 py-4"><InlineError message={error} compact /></div>
          ) : entries.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm">
              {currentPath ? 'No subdirectories found.' : 'No library paths configured.'}
            </div>
          ) : (
            entries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => navigateTo(entry.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  selectedPath === entry.path
                    ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-300'
                    : 'hover:bg-slate-800/50 text-slate-300 border border-transparent'
                }`}
              >
                {selectedPath === entry.path ? (
                  <FolderOpen className="w-4 h-4 text-cyan-400 shrink-0" />
                ) : (
                  <Folder className="w-4 h-4 text-slate-500 shrink-0" />
                )}
                <span className="truncate text-sm">{entry.name}</span>
                {selectedPath === entry.path && (
                  <Check className="w-4 h-4 text-cyan-400 ml-auto shrink-0" />
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-white/10 bg-slate-800/30">
          <button
            onClick={() => parentPath !== null ? navigateTo(parentPath) : fetchDirectory(null)}
            disabled={parentPath === null && breadcrumbs.length === 0}
            className="text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-30"
          >
            ← Parent folder
          </button>
          <button
            onClick={handleImport}
            disabled={!selectedPath && !currentPath && entries.length === 0 || importing}
            className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-bold px-5 py-2 rounded-xl transition-colors text-sm"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <FolderOpen className="w-4 h-4" />
                Import This Folder
              </>
            )}
          </button>
        </div>
    </ModalShell>
  );
}
