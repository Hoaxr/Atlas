import { useState, useEffect } from 'react';
import { Search, Download, Loader2, X, Magnet, Users, HardDrive } from 'lucide-react';
import api from '../lib/api';
import { formatSize } from '../lib/format';
import ModalShell from './shared/ModalShell';
import InlineError from './shared/InlineError';
import { customAlert } from '../utils/alerts';

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

export default function ManualSearchModal({ mediaId, mediaType, season, title, onClose, onGrabbed }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [grabbing, setGrabbing] = useState(null); // id of result being grabbed

  const endpoint = mediaType === 'episode'
    ? `/library/episodes/${mediaId}/search`
    : mediaType === 'season'
    ? `/library/shows/${mediaId}/seasons/${season}/search`
    : mediaType === 'show'
    ? `/library/shows/${mediaId}/search`
    : `/library/movies/${mediaId}/search`;

  const grabEndpoint = mediaType === 'episode'
    ? `/library/episodes/${mediaId}/grab`
    : mediaType === 'season'
    ? `/library/shows/${mediaId}/seasons/${season}/download`
    : mediaType === 'show'
    ? `/library/shows/${mediaId}/download`
    : `/library/movies/${mediaId}/grab`;

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get(endpoint)
      .then(res => {
        if (res.data.status === 'success') {
          // Dead torrents (0 seeders) can never start downloading — hide them
          setResults((res.data.data || []).filter(r => (r.seeders ?? 0) > 0));
        }
        else setError('Search returned no results.');
      })
      .catch((err) => setError(err.response?.data?.message || 'Search failed. Make sure your indexers are configured.'))
      .finally(() => setLoading(false));
  }, [endpoint]);

  const handleGrab = async (result, idx) => {
    setGrabbing(idx);
    try {
      const payload = mediaType === 'show'
        ? { torrentUrl: result.link }
        : { link: result.link, title: result.title };
      await api.post(grabEndpoint, payload);
      onGrabbed?.();
      onClose();
    } catch (err) {
      customAlert(err.response?.data?.message || 'Grab failed', 'error');
      setGrabbing(null);
    }
  };

  return (
    <ModalShell open onClose={onClose} size="2xl" noHeader noPadding noFloatingClose>
      <div className="flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 shrink-0">
              <Search className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="manual-search-title" className="font-bold text-white text-base sm:text-lg">Manual Search</h2>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-colors shrink-0" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 custom-scrollbar">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              <p className="text-sm">Searching indexers…</p>
            </div>
          )}

          {!loading && error && (
            <InlineError message={error} />
          )}

          {!loading && !error && results.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No results found across your configured indexers.</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-500 mb-2.5">{results.length} result{results.length !== 1 ? 's' : ''} found — sorted by seeders</p>
              {results.map((r, idx) => {
                const quality = parseQuality(r.title);
                const isMagnet = (r.link || '').startsWith('magnet:');
                return (
                  <div
                    key={r.guid || r.link || `${r.title}-${idx}`}
                    className="p-3 sm:p-3.5 rounded-xl bg-slate-800/60 border border-white/5 hover:border-white/10 hover:bg-slate-800 transition-all space-y-2.5 group"
                  >
                    {/* Top Row: Quality + Title + Desktop Grab Button */}
                    <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                      {/* Quality badge */}
                      <span className={`shrink-0 text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded-md bg-slate-900/80 border border-white/5 text-center mt-0.5 ${qualityColor(quality)}`}>
                        {quality}
                      </span>

                      {/* Title */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-slate-200 leading-snug line-clamp-2 break-words" title={r.title}>
                          {r.title}
                        </p>
                      </div>

                      {/* Grab button (Desktop) */}
                      <button
                        onClick={() => handleGrab(r, idx)}
                        disabled={grabbing !== null}
                        className="hidden sm:flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs shadow-md shadow-cyan-500/10 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        {grabbing === idx ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        Grab
                      </button>
                    </div>

                    {/* Bottom Row: Metadata info line + Mobile Grab Button */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5 sm:border-0 sm:pt-0">
                      <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-[11px] text-slate-400 min-w-0">
                        <span className="flex items-center gap-1 text-slate-500">
                          {isMagnet ? <Magnet className="w-3 h-3" /> : <HardDrive className="w-3 h-3" />}
                          {isMagnet ? 'Magnet' : 'Torrent'}
                        </span>
                        {r.size > 0 && (
                          <span className="flex items-center gap-1 text-slate-300 font-medium">
                            {formatSize(r.size)}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                          <Users className="w-3 h-3" />
                          {r.seeders ?? '?'}
                        </span>
                        {r.indexer && (
                          <span className="text-slate-400 truncate max-w-[120px] bg-slate-900/60 px-1.5 py-0.5 rounded border border-white/5 text-[10px]">
                            {r.indexer}
                          </span>
                        )}
                      </div>

                      {/* Grab button (Mobile) */}
                      <button
                        onClick={() => handleGrab(r, idx)}
                        disabled={grabbing !== null}
                        className="sm:hidden shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs shadow-md shadow-cyan-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        {grabbing === idx ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        Grab
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
