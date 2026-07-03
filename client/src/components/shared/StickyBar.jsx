import { Menu, Search, X } from 'lucide-react';

/**
 * Sticky top bar that appears when scrolling past the page header.
 * On mobile: always visible with hamburger menu.
 * On desktop: hidden until scroll, with optional search input.
 */
export default function StickyBar({ visible, searchQuery, onSearchChange, searchPlaceholder, showSearch = false, children }) {
  return (
    <div className={`sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 ${showSearch ? 'py-3' : 'py-2'} bg-slate-950/80 backdrop-blur-md border-b border-white/5 ${visible ? '' : 'sm:hidden'}`}>
      <div className={`flex items-center gap-2 ${showSearch ? 'relative max-w-2xl mx-auto' : ''}`}>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('atlas-toggle-sidebar'))}
          className="sm:hidden p-2 -ml-1 text-slate-400 hover:text-white transition-colors shrink-0"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        {children}
        {showSearch && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder || 'Search...'}
              className="w-full bg-slate-900 border border-white/10 text-slate-200 text-sm rounded-lg pl-9 pr-8 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 placeholder-slate-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
