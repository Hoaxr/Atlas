import { useState, useRef } from 'react';
import { Trash2, ChevronDown } from 'lucide-react';
import { useOutsideClick } from '../../lib/useOutsideClick';

export default function BulkActions({ selectedIds, bulkLoading, qualityProfiles, onClear, onAction }) {
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const deleteMenuRef = useOutsideClick(() => setDeleteMenuOpen(false), deleteMenuOpen);

  if (selectedIds.size === 0) return null;

  return (
    <div className="glass-panel rounded-2xl p-4 mb-4 border border-cyan-500/30 bg-cyan-500/5 flex items-center gap-4 flex-wrap">
      <span className="text-sm font-bold text-cyan-400">
        {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
      </span>
      <button
        onClick={onClear}
        className="text-xs text-slate-400 hover:text-white transition-colors"
      >
        Clear
      </button>
      <div className="h-6 w-px bg-slate-700" />
      <div ref={deleteMenuRef} className="relative">
        <button
          onClick={() => setDeleteMenuOpen(!deleteMenuOpen)}
          disabled={bulkLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-bold transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
        {deleteMenuOpen && (
          <div className="absolute left-0 top-full mt-2 w-56 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
            <button
              onClick={async () => {
                setDeleteMenuOpen(false);
                await onAction('delete', { deleteFiles: true });
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <div>
                <p className="font-semibold">Delete + Files</p>
                <p className="text-xs text-slate-500">Remove from library and delete files from disk</p>
              </div>
            </button>
            <div className="border-t border-white/5" />
            <button
              onClick={async () => {
                setDeleteMenuOpen(false);
                await onAction('delete', { deleteFiles: false });
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 transition-colors text-left"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <div>
                <p className="font-semibold">Remove from Library</p>
                <p className="text-xs text-slate-500">Remove from Atlas and keep files on disk</p>
              </div>
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Status:</span>
        {['monitored', 'unmonitored', 'downloaded'].map(s => (
          <button
            key={s}
            onClick={() => onAction('status', s)}
            disabled={bulkLoading}
            className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors capitalize disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
      {qualityProfiles.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Quality:</span>
          <select
            onChange={(e) => {
              onAction('quality', e.target.value ? parseInt(e.target.value) : null);
            }}
            disabled={bulkLoading}
            defaultValue=""
            className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-white/5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <option value="" disabled>Set profile...</option>
            <option value="">Any (clear)</option>
            {qualityProfiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}
      {bulkLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-500" />}
    </div>
  );
}
