import { useState, useEffect } from 'react';
import { Search, Download, Loader2, X, Magnet, Users, HardDrive, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { formatSize } from '../lib/format';

const qualityColor = (q) => {
  if (!q) return 'text-slate-400';
  const lower = q.toLowerCase();
  if (lower.includes('2160') || lower.includes('4k')) return 'text-purple-400';
  if (lower.includes('1080')) return 'text-cyan-400';
  if (lower.includes('720')) return 'text-emerald-400';
  return 'text-amber-400';
};

const parseQuality = (title) => {
  const t = (title || '').toLowerCase();
  if (t.includes('2160p') || t.includes('4k')) return '4K';
  if (t.includes('1080p')) return '1080p';
  if (t.includes('720p')) return '720p';
  if (t.includes('480p') || t.includes('dvdrip')) return 'SD';
  return '—';
};

export default function ManualSearchModal({ mediaId, mediaType, title, onClose, onGrabbed }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [grabbing, setGrabbing] = useState(null); // id of result being grabbed

  const endpoint = mediaType === 'episode'
    ? `/library/episodes/${mediaId}/search`
    : `/library/movies/${mediaId}/search`;

  const grabEndpoint = mediaType === 'episode'
    ? `/library/episodes/${mediaId}/grab`
    : `/library/movies/${mediaId}/grab`;

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get(endpoint)
      .then(res => {
        if (res.data.status === 'success') setResults(res.data.data);
        else setError('Search returned no results.');
      })
      .catch(() => setError('Search failed. Make sure your indexers are configured.'))
      .finally(() => setLoading(false));
  }, [endpoint]);

  const handleGrab = async (result, idx) => {
    setGrabbing(idx);
    try {
      await api.post(grabEndpoint, { link: result.link, title: result.title });
      onGrabbed?.();
      onClose();
    } catch {
      setGrabbing(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-white">Manual Search</h2>
              <p className="text-xs text-slate-400 mt-0.5 truncate max-w-sm">{title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              <p className="text-sm">Searching indexers…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No results found across your configured indexers.</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 mb-3">{results.length} result{results.length !== 1 ? 's' : ''} found — sorted by seeders</p>
              {results.map((r, idx) => {
                const quality = parseQuality(r.title);
                const isMagnet = (r.link || '').startsWith('magnet:');
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-white/5 hover:border-white/10 hover:bg-slate-800 transition-all group"
                  >
                    {/* Quality badge */}
                    <span className={`shrink-0 text-xs font-bold w-12 text-center ${qualityColor(quality)}`}>
                      {quality}
                    </span>

                    {/* Title */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">{r.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          {isMagnet ? <Magnet className="w-3 h-3" /> : <HardDrive className="w-3 h-3" />}
                          {isMagnet ? 'Magnet' : 'Torrent'}
                        </span>
                        {r.size > 0 && (
                          <span className="flex items-center gap-1">
                            <HardDrive className="w-3 h-3" />
                            {formatSize(r.size)}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-emerald-500">
                          <Users className="w-3 h-3" />
                          {r.seeders ?? '?'} seeders
                        </span>
                        {r.indexer && (
                          <span className="text-slate-600">{r.indexer}</span>
                        )}
                      </div>
                    </div>

                    {/* Grab button */}
                    <button
                      onClick={() => handleGrab(r, idx)}
                      disabled={grabbing !== null}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 hover:border-cyan-500/40 transition-all text-xs font-semibold disabled:opacity-50"
                    >
                      {grabbing === idx ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      Grab
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
