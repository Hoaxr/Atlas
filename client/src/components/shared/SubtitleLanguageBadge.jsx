import { Search, Download, RefreshCw, Loader2 } from 'lucide-react';
import { LANG_LABEL, LANG_NAME } from '../../lib/format';

/**
 * Shared subtitle language badge with dropdown menu.
 * Used by MovieDetails and ShowDetails to avoid 100+ lines of duplication.
 */
export default function SubtitleLanguageBadge({
  code,
  exists,
  hasExistingSub,
  isOpen,
  downloading,
  onOpenMenu,
  onAutoSearch,
  onManualSearch,
  onAutoTranslate,
}) {
  return (
    <span key={code} className="relative">
      <span
        data-lang-badge
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onOpenMenu(code);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenMenu(code);
          }
        }}
        className={`text-xs uppercase font-bold px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
          exists
            ? 'bg-slate-800 text-slate-300 border border-white/5 hover:bg-slate-700 hover:text-white'
            : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 hover:text-amber-300 border border-amber-500/30 hover:border-amber-400/50'
        }`}
      >
        {LANG_LABEL[code] || code}
      </span>
      {isOpen && (
        <div data-lang-menu className="absolute left-0 top-full mt-1 bg-slate-800 border border-white/10 rounded-xl py-1 shadow-2xl z-50 min-w-[150px]">
          {!exists && (
            <button
              onClick={(e) => { e.stopPropagation(); onAutoSearch(code); }}
              disabled={downloading}
              className="block w-full text-left text-xs font-medium px-3 py-2 text-slate-300 hover:bg-slate-700/50 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              Auto Search
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onManualSearch(code); }}
            className="block w-full text-left text-xs font-medium px-3 py-2 text-slate-300 hover:bg-slate-700/50 transition-colors flex items-center gap-2"
          >
            <Download className="w-3 h-3" />
            Manual Search
          </button>
          {hasExistingSub && (
            <button
              onClick={(e) => { e.stopPropagation(); onAutoTranslate(code); }}
              className="block w-full text-left text-xs font-medium px-3 py-2 text-slate-300 hover:bg-slate-700/50 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-3 h-3" />
              Auto Translate
            </button>
          )}
        </div>
      )}
    </span>
  );
}
