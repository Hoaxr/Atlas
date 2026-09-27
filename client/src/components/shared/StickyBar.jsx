import { Search, X, Loader2 } from 'lucide-react';

/**
 * Sticky top bar that appears when scrolling past the page header.
 * On mobile: always visible with hamburger menu.
 * On desktop: hidden until scroll, with optional search input.
 */
export default function StickyBar({ visible, isVisible, searchQuery, onSearchChange, searchPlaceholder, showSearch = false, isTyping = false, inputRef, children }) {
  const show = visible ?? isVisible ?? false;
  const hasDesktopContent = Boolean(showSearch || children);

  // When not active or without content to show, render nothing (avoids duplicate mobile bar)
  if (!show || !hasDesktopContent) {
    return null;
  }

  return (
    <div
      className={`sticky top-0 z-40 !mt-0 -mx-3 sm:-mx-4 md:-mx-6 lg:-mx-8 px-3 sm:px-4 md:px-6 lg:px-8 ${showSearch ? 'py-3' : 'py-2'} bg-[#101b2b]/95 backdrop-blur-md border-b border-slate-800/80 shadow-md transition-all duration-200`}
      style={{ paddingTop: `calc(${showSearch ? '0.75rem' : '0.5rem'} + env(safe-area-inset-top))` }}
    >
      <div className={`flex items-center gap-2 ${showSearch ? 'relative max-w-2xl mx-auto' : ''}`}>
        {children}
        {showSearch && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder || 'Search...'}
              className="w-full bg-[#101e31] border border-[#1c2d46] text-slate-100 text-base rounded-lg pl-9 pr-8 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 placeholder-slate-400 transition-all shadow-sm"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {isTyping && (
                <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
              )}
              {searchQuery && !isTyping && (
                <button
                  onClick={() => onSearchChange('')}
                  className="p-2 -m-1.5 text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
