import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Download, RefreshCw, Loader2, Check, X } from 'lucide-react';
import { LANG_LABEL } from '../../lib/format';

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
  onDelete,
}) {
  const badgeRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  const updatePosition = useCallback(() => {
    if (!isOpen || !badgeRef.current) return;
    const rect = badgeRef.current.getBoundingClientRect();
    setMenuStyle({
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.bottom + 4}px`,
      zIndex: 9999,
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setMenuStyle(null);
      return;
    }
    // Calculate position on next frame to ensure DOM is ready
    const raf = requestAnimationFrame(() => updatePosition());
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  return (
    <span key={code} className="relative inline-flex">
      <span
        ref={badgeRef}
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
        className={`inline-flex items-center gap-1 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded transition-colors cursor-pointer leading-tight ${
          exists
            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25 hover:text-emerald-300'
            : 'bg-slate-800/70 text-slate-500 border border-white/5 hover:bg-slate-700/60 hover:text-slate-300 hover:border-white/10'
        }`}
      >
        {exists && <Check className="w-2.5 h-2.5" />}
        {LANG_LABEL[code] || code}
        {exists && onDelete && (
          <button
            data-lang-badge
            onClick={(e) => {
              e.stopPropagation();
              onDelete(code);
            }}
            className="-mr-0.5 ml-0.5 rounded-sm text-current hover:text-red-400 transition-colors"
            title="Delete subtitle"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}
      </span>
      {isOpen && menuStyle && createPortal(
        <div
          data-lang-menu
          style={menuStyle}
          className="bg-slate-800 border border-white/10 rounded-xl py-1 shadow-2xl min-w-[150px]"
        >
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
              <RefreshCw className="w-3 h-3 text-pink-400" />
              Auto Translate ({LANG_LABEL[code] || code})
            </button>
          )}
        </div>,
        document.body
      )}
    </span>
  );
}
