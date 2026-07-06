import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Download, RefreshCw, Loader2, Check, X } from 'lucide-react';
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
        className={`inline-flex items-center gap-1 text-xs uppercase font-bold px-2 py-1 rounded-md transition-colors cursor-pointer ${
          exists
            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 hover:text-emerald-300'
            : 'bg-rose-500/15 text-rose-400 border border-rose-500/20 hover:bg-rose-500/25 hover:text-rose-300'
        }`}
      >
        {exists ? (
          <Check className="w-3 h-3" />
        ) : (
          <X className="w-3 h-3" />
        )}
        {LANG_LABEL[code] || code}
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
              <RefreshCw className="w-3 h-3" />
              Auto Translate
            </button>
          )}
        </div>,
        document.body
      )}
    </span>
  );
}
