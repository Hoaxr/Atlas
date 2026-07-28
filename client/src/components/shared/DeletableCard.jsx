import { useState } from 'react';
import { Trash2, Film, AlertTriangle, ShieldAlert, ShieldCheck, CheckCircle2, ChevronDown, ChevronUp, AlertCircle, EyeOff } from 'lucide-react';
import ModalShell from './ModalShell';
import { formatSize } from '../../lib/format';
import api from '../../lib/api';

export default function DeletableCard({ movie, onDeleted, priority }) {
  const [deleting, setDeleting] = useState(false);
  const [ignoring, setIgnoring] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDelete = async () => {
    setConfirmOpen(false);
    setDeleting(true);
    try {
      await api.delete(`/library/movies/${movie.id}?deleteFiles=true`);
      onDeleted(movie.id);
    } catch (err) {
      console.error('Failed to delete movie', err);
      alert('Delete failed');
      setDeleting(false);
    }
  };

  const handleIgnore = async () => {
    setIgnoring(true);
    try {
      await api.post(`/library/cleanup-candidates/${movie.id}/ignore`);
      onDeleted(movie.id); // reuse onDeleted to remove from UI list
    } catch (err) {
      console.error('Failed to ignore movie', err);
      alert('Ignore failed');
      setIgnoring(false);
    }
  };

  const getPriorityColors = () => {
    return 'border-white/5 bg-slate-800/30 hover:border-cyan-500/30';
  };

  const PriorityIcon = () => {
    if (priority === 'high') return <ShieldAlert className="w-5 h-5 text-rose-500" />;
    if (priority === 'medium') return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    return <ShieldCheck className="w-5 h-5 text-cyan-500" />;
  };

  return (
    <>
      <div className={`rounded-xl border transition-all duration-300 ${getPriorityColors()} p-4`}>
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        
        {/* Left Icon */}
        <div className="hidden sm:flex p-3 rounded-full bg-slate-900/50 border border-slate-700 shadow-inner shrink-0">
          <PriorityIcon />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-slate-100 truncate text-lg">
              {movie.title} <span className="text-slate-400 font-normal">({movie.year})</span>
            </h3>
            {movie.watched ? <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" title="Watched" /> : null}
          </div>
          
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <div className="flex items-center gap-1.5">
              <Film className="w-4 h-4 text-slate-500" />
              {formatSize(movie.file_size)}
            </div>
            <div className="flex items-center gap-1.5 font-medium">
              Score: <span className={priority === 'high' ? 'text-rose-400' : priority === 'medium' ? 'text-amber-400' : 'text-cyan-400'}>{movie.score}</span>
            </div>
            {movie.tmdb_rating !== null && (
              <div className="flex items-center gap-1.5">
                Rating: <span className="text-slate-300">{movie.tmdb_rating}/10</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
          <button 
            onClick={() => setExpanded(!expanded)}
            className="flex-1 sm:flex-none p-2 flex justify-center items-center rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-700 text-slate-300 transition-colors"
            title="View Reasons"
          >
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
          <button
            onClick={handleIgnore}
            disabled={deleting || ignoring}
            className="flex-1 sm:flex-none px-4 py-2 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            title="Ignore"
          >
            {ignoring ? '...' : (
              <>
                <EyeOff className="w-4 h-4" />
                <span className="hidden sm:inline">Ignore</span>
              </>
            )}
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={deleting || ignoring}
            className="flex-1 sm:flex-none px-4 py-2 flex items-center justify-center gap-2 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-400 border border-rose-500/20 rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? 'Deleting...' : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expanded Reasons */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Why is this deletable?</h4>
          <ul className="space-y-2">
            {movie.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="text-cyan-400 mt-0.5">•</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>

      <ModalShell
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm Deletion"
        icon={<AlertCircle className="w-5 h-5 text-rose-500" />}
        size="md"
        footer={
          <>
            <button
              onClick={() => setConfirmOpen(false)}
              className="px-4 py-2 rounded-lg font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 rounded-lg font-medium bg-rose-500 hover:bg-rose-600 text-white transition-colors"
            >
              Yes, Delete
            </button>
          </>
        }
      >
        <p className="text-slate-300">
          Are you sure you want to delete <span className="font-bold text-white">{movie.title}</span>? This will permanently remove it from your library and delete the files from your disk.
        </p>
      </ModalShell>
    </>
  );
}
