import { RefreshCw, Search, Star, Loader2 } from 'lucide-react';
import Spinner from './shared/Spinner';
import ModalShell from './shared/ModalShell';
import Button from './shared/Button';

export default function RemapModal({ type, title, currentTmdbId, open, onClose, query, setQuery, searching, hasSearched, results, remapping, onSearch, onConfirm }) {
  if (!open) return null;
  const label = type === 'movie' ? 'Movie' : 'Show';

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      size="xl"
      icon={<RefreshCw className="w-5 h-5 text-cyan-400" />}
      title={`Remap ${label}`}
      className="max-h-[80vh]"
    >
      <p className="text-xs text-slate-400 mb-3.5">Search TMDB for the correct {label.toLowerCase()} to link <strong className="text-slate-200">{title}</strong> to.</p>
      <div className="flex gap-2 mb-4 shrink-0">
        <input 
          type="text" 
          value={query} 
          onChange={e => setQuery(e.target.value)} 
          onKeyDown={e => { if (e.key === 'Enter') onSearch(); }} 
          placeholder={`Search for the correct ${label.toLowerCase()}...`} 
          className="flex-1 bg-slate-950/60 border border-slate-800 rounded-lg px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors" 
        />
        <Button 
          variant="primary"
          onClick={onSearch} 
          disabled={!query.trim() || searching} 
          loading={searching}
          icon={Search}
        >
          Search
        </Button>
      </div>
      <div className="overflow-y-auto flex-1 min-h-0 space-y-2">
        {searching ? (
          <div className="flex flex-col items-center justify-center py-10 text-cyan-400">
            <Spinner color="border-cyan-400" className="mb-3" />
            <p className="text-xs font-semibold">Searching TMDB...</p>
          </div>
        ) : !results.length && hasSearched ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <p className="text-xs">No {label.toLowerCase()}s found.</p>
          </div>
        ) : results.map((result, i) => {
          const resultName = result.title || result.name;
          const resultDate = result.release_date || result.first_air_date || '';
          const resultYear = resultDate ? resultDate.split('-')[0] : '—';
          const isCurrent = result.id === currentTmdbId;
          return (
            <div key={`remap-${i}`} className={`p-3 rounded-lg flex gap-3 items-center border transition-colors ${isCurrent ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-slate-800 bg-slate-900/60 hover:bg-slate-800/60'}`}>
              <div className="w-12 h-[66px] rounded-md shrink-0 bg-slate-950 flex items-center justify-center overflow-hidden border border-slate-800">
                {result.poster_path ? (
                  <img src={`https://image.tmdb.org/t/p/w92${result.poster_path}`} alt={resultName} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] text-slate-600 font-medium text-center leading-tight px-1">No<br/>Image</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-200 truncate">{resultName} <span className="text-slate-400 font-normal">({resultYear})</span></p>
                {result.overview && <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{result.overview}</p>}
                <div className="flex items-center gap-2 mt-1">
                  {result.vote_average > 0 && (
                    <span className="flex items-center gap-0.5 text-[11px] text-amber-400 font-semibold">
                      <Star className="w-3 h-3 fill-amber-400" /> {result.vote_average.toFixed(1)}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-slate-500">TMDB: {result.id}</span>
                  {isCurrent && <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/20 px-1.5 py-0.5 rounded-md border border-cyan-500/30">Current</span>}
                </div>
              </div>
              {!isCurrent && (
                <Button 
                  variant="primary"
                  size="sm"
                  onClick={() => onConfirm(result)} 
                  disabled={remapping} 
                  loading={remapping}
                  icon={RefreshCw}
                >
                  Remap
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}
