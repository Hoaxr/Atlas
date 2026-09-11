import { useState, useEffect } from 'react';
import { Folder, FolderTree, Plus, Trash2, HardDrive, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import ModalShell from '../shared/ModalShell';
import ServerFolderBrowserModal from '../shared/ServerFolderBrowserModal';

export default function MusicPathsModal({ open, onClose, onUpdated }) {
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [adding, setAdding] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);

  const fetchPaths = async () => {
    setLoading(true);
    try {
      const res = await api.get('/library/paths');
      if (res.data.status === 'success') {
        const allPaths = res.data.data || [];
        setPaths(allPaths.filter((p) => p.type === 'music'));
      }
    } catch (err) {
      console.error('Failed to load library paths:', err);
      toast.error('Failed to load music folders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setNewPath('');
      fetchPaths();
    }
  }, [open]);

  const handleAdd = async (e) => {
    if (e) e.preventDefault();
    const trimmed = newPath.trim();
    if (!trimmed) return;

    setAdding(true);
    try {
      const res = await api.post('/library/paths', {
        path: trimmed,
        type: 'music',
      });
      if (res.data.status === 'success') {
        toast.success(`Music mount "${trimmed}" added!`);
        setNewPath('');
        await fetchPaths();
        if (onUpdated) onUpdated();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add music mount');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id, pathName) => {
    try {
      const res = await api.delete(`/library/paths/${id}`);
      if (res.data.status === 'success') {
        toast.success(`Removed "${pathName}"`);
        await fetchPaths();
        if (onUpdated) onUpdated();
      }
    } catch (err) {
      toast.error('Failed to remove folder');
    }
  };

  const handleSelectFromBrowser = (selected) => {
    setNewPath(selected);
  };

  return (
    <>
      <ModalShell
        open={open}
        onClose={onClose}
        title="Music Root Folders & Mounts"
        description="Configure the mount points where your music files are stored and organized."
        maxWidth="max-w-xl"
      >
        <div className="space-y-5">
          {/* Add Path Bar */}
          <form onSubmit={handleAdd} className="space-y-2">
            <label className="block text-xs font-semibold text-cyan-400 uppercase tracking-wider">
              Add Music Mount / Folder
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="e.g. /mnt/oblivion/muziek"
                className="flex-1 px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={() => setBrowserOpen(true)}
                className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-white/5"
                title="Browse server folders"
              >
                <Folder className="w-3.5 h-3.5 text-cyan-400" />
                Browse
              </button>
              <button
                type="submit"
                disabled={adding || !newPath.trim()}
                className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50"
              >
                {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add Mount
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Enter your local or network mount path (e.g. <span className="font-mono text-slate-400">/mnt/oblivion/muziek</span>).
            </p>
          </form>

          {/* Existing Configured Paths */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Active Music Mounts</span>
              <span className="text-[11px] font-normal text-slate-500">{paths.length} configured</span>
            </div>

            {loading ? (
              <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Loading folders...</span>
              </div>
            ) : paths.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-900/40 border border-dashed border-slate-700/60 text-center space-y-1.5">
                <AlertCircle className="w-6 h-6 text-amber-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-300">No music mounts configured yet</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Add <span className="font-mono text-cyan-400">/mnt/oblivion/muziek</span> above so Atlas knows where to store artist folders and import completed audio tracks.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {paths.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/70 border border-white/5 hover:border-cyan-500/20 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
                        <HardDrive className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-mono text-slate-200 block truncate" title={p.path}>
                          {p.path}
                        </span>
                        <span className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3 h-3" /> Music Root
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id, p.path)}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                      title="Remove folder"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </ModalShell>

      {/* Server Directory Browser */}
      <ServerFolderBrowserModal
        open={browserOpen}
        onClose={() => setBrowserOpen(false)}
        initialPath={newPath || '/mnt'}
        onSelect={handleSelectFromBrowser}
      />
    </>
  );
}
