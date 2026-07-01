import { Search, X, Download, Loader2 } from 'lucide-react';
import { customAlert } from '../utils/alerts';

const ProviderLabel = ({ provider }) => {
  switch (provider) {
    case 'OpenSubtitles': return <span className="text-cyan-400">OpenSubtitles</span>;
    case 'SubDL': return <span className="text-amber-400">SubDL</span>;
    case 'SubSource': return <span className="text-purple-400">SubSource</span>;
    default: return provider;
  }
};

export default function SubSearchModal({ open, onClose, label, filePath, sceneName, results, searching, searched, onSearch, onDownload, onRefresh }) {
  if (!open) return null;

  const handleDownload = async (item, downloadKey) => {
    try {
      await onDownload(item, downloadKey);
      onClose();
      onRefresh();
    } catch (err) {
      customAlert(err.response?.data?.message || 'Download failed', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-slate-900 border border-white/10 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <Search className="w-5 h-5 text-cyan-400" />
              Search Subtitles — {label}
            </h3>
            {filePath && (
              <>
                <p className="text-xs text-slate-500 mt-2 font-mono truncate max-w-[550px]" title={filePath}>{filePath}</p>
                {sceneName && <p className="text-[10px] text-slate-600 mt-1 font-mono truncate max-w-[550px]">{sceneName}</p>}
              </>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 min-h-0">
          {!searched ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <p className="text-sm">Click <strong>Search Providers</strong> to find "{label}" subtitles.</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <p className="text-sm">No subtitles found from any provider.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {results.map((provider, pi) => (
                <div key={pi}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{provider.provider}</span>
                    <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded-full">{provider.items.length} result{provider.items.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="hidden md:flex items-center gap-3 px-3 py-1.5 text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">
                    <span className="w-14 text-center">Score</span>
                    <span className="w-10 text-center">Lang</span>
                    <span className="w-20">Provider</span>
                    <span className="flex-1">Release / Uploader</span>
                    <span className="w-16 text-center hidden lg:block">Date</span>
                    <span className="w-10 text-center">Get</span>
                  </div>
                  <div className="space-y-1">
                    {provider.items.map((item, ii) => (
                      <div key={ii} className="w-full bg-slate-800/30 hover:bg-slate-700/50 rounded-lg border border-white/5 hover:border-cyan-500/30 transition-all group">
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <span className={`w-14 text-center text-xs font-bold shrink-0 ${
                            item.rating >= 100 ? 'text-emerald-400' : item.rating >= 80 ? 'text-emerald-400' :
                            item.rating >= 60 ? 'text-yellow-400' : item.rating > 0 ? 'text-slate-400' : 'text-slate-600'
                          }`}>{item.rating > 0 ? `${Math.round(item.rating)}%` : '—'}</span>
                          <span className="w-10 text-center text-[10px] uppercase font-bold shrink-0 relative">
                            <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">{item.language || label}</span>
                            {item.hearingImpaired && <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full" title="Hearing Impaired" />}
                          </span>
                          <a href={item.url || '#'} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="w-20 text-[10px] truncate shrink-0 font-medium hover:underline">
                            <ProviderLabel provider={provider.provider} />
                          </a>
                          <span className="flex-1 min-w-0">
                            <span className="text-xs text-slate-300 group-hover:text-white truncate block" title={item.release || item.name}>{item.release || item.name}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              {item.uploader && <span className="text-[10px] text-slate-500 truncate max-w-[120px]" title={item.uploader}>{item.uploader}</span>}
                              {item.fromTrusted && <span className="text-[10px] text-emerald-400/80 font-medium">✓ Trusted</span>}
                              {item.aiTranslated && <span className="text-[10px] text-amber-400/80">AI</span>}
                              {item.downloads > 0 && <span className="text-[10px] text-slate-500">{item.downloads} DL</span>}
                              {item.format && <span className="text-[10px] text-slate-600 uppercase">{item.format}</span>}
                            </div>
                          </span>
                          <span className="text-[10px] text-slate-500 text-right shrink-0 max-w-[80px] truncate hidden lg:block" title={item.uploadDate || ''}>{item.uploadDate || ''}</span>
                          <button onClick={() => handleDownload(item, label)} className="shrink-0 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors">
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-white/5 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button onClick={onSearch} disabled={searching} className="px-5 py-2 text-sm font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/30 transition-colors disabled:opacity-50 flex items-center gap-2">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search Providers
          </button>
        </div>
      </div>
    </div>
  );
}
