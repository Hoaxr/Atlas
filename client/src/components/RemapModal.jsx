import { RefreshCw, Search, Star, Loader2 } from 'lucide-react';
import Spinner from './shared/Spinner';
import { mediaTheme } from '../lib/format';
import ModalShell from './shared/ModalShell';

export default function RemapModal({ type, title, currentTmdbId, open, onClose, query, setQuery, searching, hasSearched, results, remapping, onSearch, onConfirm }) {
  if (!open) return null;
  const theme = mediaTheme[type] || mediaTheme.movie;
  const label = type === 'movie' ? 'Movie' : 'Show';
  const btnBg = type === 'movie' ? 'bg-cyan-500 hover:bg-cyan-400' : 'bg-purple-500 hover:bg-purple-400';
  const btnText = type === 'movie' ? 'text-slate-950' : 'text-white';

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      size="xl"
      icon={<RefreshCw className="w-5 h-5 text-amber-400" />}
      title={`Remap ${label}`}
      noBackdropBlur
      className="max-h-[80vh]"
    >
      <p className="text-sm text-slate-400 mb-4">Search TMDB for the correct {label.toLowerCase()} to link <strong className="text-slate-200">{title}</strong> to.</p>
      <div className="flex gap-2 mb-4 shrink-0">
        <input type="text" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSearch(); }} placeholder={`Search for the correct ${label.toLowerCase()}...`} className={`flex-1 bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none ${theme.focusRing} text-sm`} />
        <button onClick={onSearch} disabled={!query.trim() || searching} className={`${btnBg} ${btnText} font-bold px-5 py-2 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 text-sm`}>{searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Search</button>
      </div>
      <div className="overflow-y-auto flex-1 min-h-0 space-y-2">
        {searching ? (
          <div className={`flex flex-col items-center justify-center py-10 ${theme.accentClass}`}><Spinner color={theme.spinnerBorder} className="mb-4" /><p className="font-bold">Searching TMDB...</p></div>
        ) : !results.length && hasSearched ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400"><p>No {label.toLowerCase()}s found.</p></div>
        ) : results.map((result, i) => {
          const resultName = result.title || result.name;
          const resultDate = result.release_date || result.first_air_date || '';
          const resultYear = resultDate ? resultDate.split('-')[0] : '—';
          const isCurrent = result.id === currentTmdbId;
          return (
            <div key={`remap-${i}`} className={`bg-slate-800 p-3 rounded-xl flex gap-3 items-center border transition-colors ${isCurrent ? `${theme.accentBorder} ${theme.accentBg}` : 'border-white/5 hover:bg-slate-750'}`}>
              <div className="w-12 h-[66px] rounded-lg shrink-0 bg-slate-700 flex items-center justify-center overflow-hidden">
                {result.poster_path ? <img src={`https://image.tmdb.org/t/p/w92${result.poster_path}`} alt={resultName} loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <span className="text-[10px] text-slate-500 font-medium text-center leading-tight px-1">No<br/>Image</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-200 truncate">{resultName} <span className="text-slate-400 font-light">({resultYear})</span></p>
                {result.overview && <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{result.overview}</p>}
                <div className="flex items-center gap-2 mt-1">
                  {result.vote_average > 0 && <span className="flex items-center gap-0.5 text-xs text-yellow-400"><Star className="w-3 h-3 fill-yellow-400" /> {result.vote_average.toFixed(1)}</span>}
                  <span className="text-[10px] font-mono text-slate-600">TMDB: {result.id}</span>
                  {isCurrent && <span className={`text-[10px] font-bold ${theme.accentClass} ${theme.accentBg} px-1.5 py-0.5 rounded`}>Current</span>}
                </div>
              </div>
              {!isCurrent && <button onClick={() => onConfirm(result)} disabled={remapping} className={`${btnBg} ${btnText} font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 shrink-0`}>{remapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Remap</button>}
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}
