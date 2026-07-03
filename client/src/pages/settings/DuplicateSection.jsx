import { useState } from 'react';
import api from '../../lib/api';
import { Search, RefreshCw, CheckCircle2, Trash2 } from 'lucide-react';
import { customAlert, customConfirm } from '../../utils/alerts';

export default function DuplicateSection() {
  const [duplicates, setDuplicates] = useState(null);
  const [checking, setChecking] = useState(false);

  const checkDuplicates = async () => {
    setChecking(true);
    try {
      const res = await api.get('/library/duplicates');
      if (res.data.status === 'success') {
        setDuplicates(res.data.data);
      }
    } catch (err) {
      customAlert('Failed to check for duplicates', 'error');
    } finally {
      setChecking(false);
    }
  };

  const removeDuplicate = async (id, type) => {
    if (!(await customConfirm('Remove this duplicate? This cannot be undone.'))) return;
    try {
      await api.post('/library/duplicates/delete', { id, type });
      customAlert('Duplicate removed');
      checkDuplicates();
    } catch (err) {
      customAlert('Failed to remove duplicate', 'error');
    }
  };

  const totalDupes = duplicates
    ? duplicates.movies.length + duplicates.shows.length
    : 0;

  return (
    <div className="glass-panel rounded-2xl p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-200">Duplicate Detection</h3>
          <p className="text-sm text-slate-400">Find and remove duplicate movies and shows in your library.</p>
        </div>
        <button
          onClick={checkDuplicates}
          disabled={checking}
          className="px-4 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-bold text-sm transition-colors disabled:opacity-50 flex items-center gap-2 self-start"
        >
          {checking ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          {checking ? 'Checking...' : 'Check for Duplicates'}
        </button>
      </div>

      {duplicates && (
        totalDupes === 0 ? (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <p className="text-sm text-emerald-400 font-medium">No duplicates found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {duplicates.movies.map((group, i) => (
              <div key={`m-${i}`} className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                <p className="text-sm font-bold text-amber-400">
                  {group.count}x Movie Duplicate — TMDB ID: {group.tmdb_id}
                </p>
                {group.items.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-950/50">
                    <div>
                      <p className="text-sm text-slate-300">{item.title}</p>
                      <p className="text-xs text-slate-500">Status: {item.status} | Added: {new Date(item.added_at).toLocaleDateString()}</p>
                    </div>
                    <button
                      onClick={() => removeDuplicate(item.id, 'movie')}
                      className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Remove duplicate"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
            {duplicates.shows.map((group, i) => (
              <div key={`s-${i}`} className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                <p className="text-sm font-bold text-amber-400">
                  {group.count}x Show Duplicate — TMDB ID: {group.tmdb_id}
                </p>
                {group.items.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-950/50">
                    <div>
                      <p className="text-sm text-slate-300">{item.title}</p>
                      <p className="text-xs text-slate-500">Status: {item.status} | Added: {new Date(item.added_at).toLocaleDateString()}</p>
                    </div>
                    <button
                      onClick={() => removeDuplicate(item.id, 'show')}
                      className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Remove duplicate"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
