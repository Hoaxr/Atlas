import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { 
  Search, Menu, SlidersHorizontal, Activity, Keyboard, Bell, AlertTriangle, 
  Heart, DownloadCloud, Eye, CheckCircle2, Inbox, CircleUser, ArrowUpCircle,
  X, Loader2, Film, Tv, Plus, ChevronRight, User as UserIcon
} from 'lucide-react';
import api from '../../lib/api';
import { posterUrl, tmdbImgUrl } from '../../lib/posterUrl';
import { getLibraryIndex, searchLibraryIndex } from '../../lib/libraryIndex';
import MediaDetailsModal from '../MediaDetailsModal';

function RunningManIcon({ className }) {
  return (
    <img
      src="/running-man.png"
      alt=""
      aria-hidden="true"
      className={className}
      style={{ filter: 'brightness(0) invert(1)' }}
    />
  );
}
import { MOD_KEY } from '../../lib/platform';

/**
 * Application top bar — global search entry point, action icons and account menu.
 * Mirrors the Atlas design: a wide "search" affordance with its shortcut hint
 * on the left, then notifications / theme / settings / account on the right.
 *
 * @param {object} props
 * @param {{ username?: string, role?: string } | null} props.user
 * @param {{ issues?: number, requests?: number, downloads?: number, watchers?: number }} [props.activity]
 *   Live counters surfaced by the notifications bell (owned by Layout).
 */
export default function TopBar({ user, activity, updateUrl, alerts = [], onOpenSearch, onOpenShortcuts, onLogout }) {
  const navigate = useNavigate();
  const [activityOpen, setActivityOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const activityRef = useRef(null);
  const activityMenuRef = useRef(null);
  const activityButtonRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  // Close the notifications menu on any click outside both the bell button and
  // the (portaled) menu panel.
  useEffect(() => {
    if (!activityOpen) return;
    const listener = (e) => {
      const inButton = activityRef.current?.contains(e.target);
      const inMenu = activityMenuRef.current?.contains(e.target);
      if (!inButton && !inMenu) setActivityOpen(false);
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [activityOpen]);

  // Position the notifications dropdown with a fixed anchor so it can escape the
  // header's z-40 stacking context and render above the mobile sidebar (z-50).
  const updateMenuPosition = useCallback(() => {
    if (!activityButtonRef.current) return;
    const rect = activityButtonRef.current.getBoundingClientRect();
    const width = Math.min(360, Math.max(0, window.innerWidth - 16));
    const left = Math.max(8, Math.min(
      rect.left + (rect.width - width) / 2,
      window.innerWidth - width - 8
    ));
    setMenuStyle({
      position: 'fixed',
      top: `${rect.bottom + 10}px`,
      left: `${left}px`,
      width: `${width}px`,
      zIndex: 60,
    });
  }, []);

  useEffect(() => {
    if (!activityOpen) {
      setMenuStyle(null);
      return;
    }
    const raf = requestAnimationFrame(updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('resize', updateMenuPosition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [activityOpen, updateMenuPosition]);

  // Only surface the signals that actually need the user's attention.
  const notifications = [
    { key: 'requests', count: activity?.requests || 0, label: 'pending request', route: '/requests', icon: Inbox, tone: 'text-amber-500 dark:text-amber-400' },
    { key: 'issues', count: activity?.issues || 0, label: 'system issue', route: '/status', icon: AlertTriangle, tone: 'text-rose-500 dark:text-rose-400' },
    { key: 'downloads', count: activity?.downloads || 0, label: 'active download', route: '/downloads', icon: DownloadCloud, tone: 'text-emerald-500 dark:text-emerald-400' },
    { key: 'watchers', count: activity?.watchers || 0, label: 'active stream', route: '/watcher', icon: Eye, tone: 'text-cyan-500 dark:text-cyan-400' },
  ].filter((entry) => entry.count > 0);

  const notificationCount = notifications.reduce((total, entry) => total + entry.count, 0) + alerts.length + (updateUrl ? 1 : 0);
  const prevCountRef = useRef(notificationCount);

  useEffect(() => {
    if (notificationCount > prevCountRef.current) {
      setHasUnread(true);
    }
    prevCountRef.current = notificationCount;
  }, [notificationCount]);

  // Live TopBar Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [libraryItems, setLibraryItems] = useState([]);
  const [tmdbResults, setTmdbResults] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [addTarget, setAddTarget] = useState(null);

  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);
  const requestIdRef = useRef(0);

  // Focus search input when '/' is pressed anywhere
  useEffect(() => {
    const handler = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
      setIsSearchOpen(true);
    };
    window.addEventListener('atlas-focus-search', handler);
    return () => window.removeEventListener('atlas-focus-search', handler);
  }, []);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch library index on search open
  useEffect(() => {
    if (!isSearchOpen) return;
    let cancelled = false;
    getLibraryIndex().then((items) => {
      if (!cancelled) setLibraryItems(items || []);
    });
    return () => {
      cancelled = true;
    };
  }, [isSearchOpen]);

  // Debounced TMDB multi search
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setTmdbResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const reqId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/tmdb/search/multi?query=${encodeURIComponent(trimmed)}`);
        if (reqId !== requestIdRef.current) return;
        const items = res.data?.data;
        setTmdbResults(Array.isArray(items) ? items : []);
      } catch {
        if (reqId === requestIdRef.current) setTmdbResults([]);
      } finally {
        if (reqId === requestIdRef.current) setSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const libraryMatches = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return [];
    return searchLibraryIndex(libraryItems, trimmed, 4);
  }, [libraryItems, searchQuery]);

  const libraryByTmdbId = useMemo(() => {
    const map = new Map();
    for (const item of libraryItems) {
      if (item.tmdbId) map.set(Number(item.tmdbId), item);
    }
    return map;
  }, [libraryItems]);

  const tmdbMatches = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) return [];
    return tmdbResults
      .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
      .slice(0, 4);
  }, [tmdbResults, searchQuery]);

  const peopleMatches = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) return [];
    return tmdbResults
      .filter((r) => r.media_type === 'person')
      .slice(0, 2);
  }, [tmdbResults, searchQuery]);

  const flatRows = useMemo(() => {
    const rows = [];
    libraryMatches.forEach((item) => {
      rows.push({
        type: 'library',
        id: `lib-${item.kind}-${item.id}`,
        title: item.title,
        year: item.year,
        subtitle: [item.kind === 'movie' ? 'Movie' : 'TV Show', item.meta].filter(Boolean).join(' · '),
        poster: item.tmdbId ? posterUrl(item.kind === 'movie' ? 'movies' : 'shows', item.tmdbId, item.posterPath) : null,
        icon: item.kind === 'movie' ? Film : Tv,
        badge: 'In library',
        run: () => {
          navigate(item.route);
          setIsSearchOpen(false);
          setSearchQuery('');
          searchInputRef.current?.blur();
        },
      });
    });

    tmdbMatches.forEach((item) => {
      const owned = libraryByTmdbId.get(Number(item.id));
      const title = item.title || item.name || 'Untitled';
      const year = (item.release_date || item.first_air_date || '').slice(0, 4);
      rows.push({
        type: 'tmdb',
        id: `tmdb-${item.media_type}-${item.id}`,
        title,
        year,
        subtitle: item.media_type === 'movie' ? 'Movie' : 'TV Series',
        poster: tmdbImgUrl(item.poster_path, 'w92'),
        icon: item.media_type === 'movie' ? Film : Tv,
        badge: owned ? 'In library' : 'Add',
        run: () => {
          if (owned) {
            navigate(owned.route);
          } else {
            setAddTarget({ mediaId: item.id, mediaType: item.media_type, title });
          }
          setIsSearchOpen(false);
          setSearchQuery('');
          searchInputRef.current?.blur();
        },
      });
    });

    peopleMatches.forEach((person) => {
      rows.push({
        type: 'person',
        id: `person-${person.id}`,
        title: person.name,
        subtitle: person.known_for_department || 'Person',
        poster: tmdbImgUrl(person.profile_path, 'w92'),
        icon: UserIcon,
        isPerson: true,
        run: () => {
          navigate(`/person/${person.id}`);
          setIsSearchOpen(false);
          setSearchQuery('');
          searchInputRef.current?.blur();
        },
      });
    });

    return rows;
  }, [libraryMatches, tmdbMatches, peopleMatches, libraryByTmdbId, navigate]);

  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1 < flatRows.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 >= 0 ? prev - 1 : flatRows.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatRows.length > 0) {
        const itemToRun = activeIndex >= 0 && activeIndex < flatRows.length ? flatRows[activeIndex] : flatRows[0];
        itemToRun?.run();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsSearchOpen(false);
      setSearchQuery('');
      searchInputRef.current?.blur();
    }
  };

  const displayName = user?.displayName || user?.name || user?.username || 'Bart Dekker';
  const role = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase()
    : 'Admin';

  return (
    <>
      <header className="h-16 shrink-0 flex items-center justify-between gap-2.5 sm:gap-4 px-3 sm:px-6 lg:px-8 bg-slate-100/90 dark:bg-[#101b2b] border-b border-slate-200 dark:border-slate-800/80 backdrop-blur-md relative z-40 max-w-full">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('atlas-toggle-sidebar'))}
          className="lg:hidden p-2 -ml-1 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800/70 transition-colors shrink-0"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Global search input & live dropdown */}
        <div ref={searchContainerRef} className="flex-1 min-w-0 max-w-xl md:max-w-2xl relative">
          <div className="flex items-center bg-white dark:bg-[#101e31] border border-slate-200 dark:border-[#1c2d46] focus-within:border-cyan-500/70 focus-within:ring-2 focus-within:ring-cyan-500/20 rounded-xl px-2.5 sm:px-4 py-1.5 sm:py-2 transition-all shadow-sm group">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-300 group-focus-within:text-cyan-400 transition-colors shrink-0 mr-2 sm:mr-3" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
                setActiveIndex(0);
              }}
              onFocus={() => {
                setIsSearchOpen(true);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search movies, shows, music... (press / to type)"
              aria-label="Search movies, shows, music"
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-400 font-normal"
            />

            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {searchLoading && (
                <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin mr-1" />
              )}

              {!searchQuery && (
                <kbd
                  onClick={() => searchInputRef.current?.focus()}
                  title="Press / to focus search"
                  className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#18283e] border border-slate-200 dark:border-slate-700/60 text-[10px] font-semibold text-slate-400 dark:text-slate-400 font-mono shadow-sm cursor-pointer hover:border-cyan-500/40 hover:text-cyan-400 transition-colors"
                >
                  /
                </kbd>
              )}

              <button
                type="button"
                onClick={onOpenSearch}
                title={`Open Command Menu (${MOD_KEY} K)`}
                className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#18283e] hover:bg-cyan-500/10 hover:border-cyan-500/40 border border-slate-200 dark:border-slate-700/60 text-[11px] font-medium text-slate-500 dark:text-slate-300 hover:text-cyan-400 font-mono shadow-sm transition-colors cursor-pointer"
              >
                <span>{MOD_KEY}</span>
                <span>K</span>
              </button>

              <button
                type="button"
                onClick={onOpenShortcuts}
                title="Keyboard shortcuts (?)"
                aria-label="Keyboard shortcuts"
                className="p-1 sm:p-1.5 -mr-1 sm:-mr-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors shrink-0"
              >
                <Keyboard className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Live Search Results Dropdown */}
          {isSearchOpen && searchQuery.trim() && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#091220]/95 backdrop-blur-xl border border-[#1c2d46] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden z-50 animate-fade-in divide-y divide-white/5 max-h-[75vh] flex flex-col">
              <div className="overflow-y-auto p-2 space-y-1">
                {flatRows.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    {searchLoading ? (
                      <div className="flex items-center justify-center gap-2 text-cyan-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Searching library & TMDB...</span>
                      </div>
                    ) : (
                      <span>No results found for "{searchQuery.trim()}"</span>
                    )}
                  </div>
                ) : (
                  flatRows.map((item, idx) => {
                    const isSelected = idx === activeIndex;
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.id}
                        onClick={item.run}
                        onMouseMove={() => setActiveIndex(idx)}
                        className={clsx(
                          'flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all',
                          isSelected
                            ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/10 border border-cyan-500/30 text-white shadow-md'
                            : 'hover:bg-white/5 border border-transparent text-slate-300'
                        )}
                      >
                        <div className={clsx(
                          'shrink-0 overflow-hidden bg-[#101e31] border border-white/10 flex items-center justify-center shadow-sm',
                          item.isPerson ? 'w-9 h-9 rounded-full' : 'w-8 h-11 rounded-lg'
                        )}>
                          {item.poster ? (
                            <img src={item.poster} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Icon className="w-4 h-4 text-slate-500" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={clsx('text-xs sm:text-sm font-bold truncate', isSelected ? 'text-white' : 'text-slate-200')}>
                              {item.title}
                            </span>
                            {item.year && (
                              <span className="text-[11px] text-slate-500 shrink-0">
                                ({item.year})
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            {item.subtitle}
                          </div>
                        </div>

                        {item.badge && (
                          <span className={clsx(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 flex items-center gap-1',
                            item.badge === 'In library'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                              : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25'
                          )}>
                            {item.badge === 'Add' && <Plus className="w-2.5 h-2.5" />}
                            {item.badge}
                          </span>
                        )}

                        {isSelected && (
                          <ChevronRight className="w-4 h-4 text-cyan-400 shrink-0" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Dropdown footer with navigation & command menu action */}
              <div className="px-3.5 py-2 bg-[#060c16] flex items-center justify-between text-[11px] text-slate-400 border-t border-[#1c2d46]">
                <span className="flex items-center gap-2">
                  <span><kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-[10px]">↑</kbd> <kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-[10px]">↓</kbd> navigate</span>
                  <span><kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-[10px]">↵</kbd> select</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen(false);
                    onOpenSearch();
                  }}
                  className="text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>Command Menu</span>
                  <kbd className="px-1 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-mono text-cyan-300">{MOD_KEY} K</kbd>
                </button>
              </div>
            </div>
          )}
        </div>

      {/* Action icons: donate, notifications, status, settings, account */}
      <div className="ml-auto flex items-center gap-1 sm:gap-3 md:gap-4 shrink-0">
        <a
          href="https://www.paypal.com/donate/?business=C5EDZZUFSMX4J&no_recurring=0&item_name=Thanks+for+the+coffee&currency_code=EUR"
          target="_blank"
          rel="noopener noreferrer"
          title="Donate"
          aria-label="Donate"
          className="hidden md:flex p-2 rounded-xl text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors items-center justify-center group"
        >
          <Heart className="w-5 h-5 text-rose-500 fill-rose-500 group-hover:scale-110 transition-transform duration-200" />
        </a>

        <div ref={activityRef} className="relative">
          <button
            ref={activityButtonRef}
            type="button"
            onClick={() => {
              setActivityOpen((o) => !o);
              setHasUnread(false);
            }}
            aria-haspopup="menu"
            aria-expanded={activityOpen}
            aria-label={notificationCount > 0 ? `Notifications: ${notificationCount} new` : 'Notifications'}
            title="Notifications"
            className={clsx(
              'relative p-2 rounded-xl text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800/60 transition-colors',
              activityOpen && 'bg-slate-200/70 dark:bg-slate-800/60 text-slate-800 dark:text-white'
            )}
          >
            <Bell className="w-5 h-5" />
            {notificationCount > 0 && hasUnread && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>

          {activityOpen && menuStyle && createPortal(
            <div
              ref={activityMenuRef}
              role="menu"
              style={menuStyle}
              className="bg-white dark:bg-[#111d30] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl shadow-black/15 dark:shadow-black/50 overflow-hidden"
            >
              <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800/90 bg-slate-50/70 dark:bg-slate-900/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/15 flex items-center justify-center">
                    <Bell className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Notifications</p>
                      {notificationCount > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/20 leading-none">{notificationCount}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {notifications.length === 0 && alerts.length === 0 && !updateUrl ? (
                <div className="flex flex-col items-center gap-2 px-6 py-9 text-center">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400" /></div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">You&apos;re all caught up</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">We&apos;ll let you know when something needs attention.</p>
                </div>
              ) : (
                <div className="p-2.5 space-y-1 max-h-[min(60vh,420px)] overflow-y-auto">
                  {updateUrl && (
                    <a
                      href={updateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      role="menuitem"
                      onClick={() => setActivityOpen(false)}
                      className="group flex items-center gap-3 px-3 py-3 rounded-xl border border-transparent hover:border-emerald-500/20 hover:bg-emerald-500/5 transition-colors"
                      aria-label="Update available: view newer commits on GitHub"
                      title="A newer Atlas build is available"
                    >
                      <ArrowUpCircle className="w-4 h-4 shrink-0 text-emerald-500 dark:text-emerald-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-slate-700 dark:text-slate-200">Atlas update available</span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">View newer commits on GitHub</span>
                      </span>
                    </a>
                  )}
                  {notifications.map((entry) => (
                    <div
                      key={entry.key}
                      className="group flex items-center justify-between rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-slate-700/70 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setActivityOpen(false);
                          navigate(entry.route);
                        }}
                        className="flex-1 min-w-0 flex items-center gap-3 px-3 py-3 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 text-left transition-colors"
                      >
                        <entry.icon className={clsx('w-4 h-4 shrink-0', entry.tone)} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-slate-700 dark:text-slate-200">{entry.count} {entry.label}{entry.count === 1 ? '' : 's'}</span>
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{entry.key === 'issues' ? 'Review your system status' : entry.key === 'requests' ? 'Requests are waiting for review' : entry.key === 'downloads' ? 'Currently in your download queue' : 'Someone is watching right now'}</span>
                        </span>
                      </button>
                    </div>
                  ))}

                  {/* Warn / Error alerts from the activity log */}
                  {alerts.length > 0 && (
                    <>
                      {notifications.length > 0 && (
                        <div className="mx-3 my-1 border-t border-slate-200 dark:border-slate-700/60" />
                      )}
                      {alerts.map((alert) => (
                        <div
                          key={alert.id}
                          className={clsx(
                            'group flex items-start justify-between rounded-lg transition-colors',
                            alert.level === 'error'
                              ? 'hover:bg-rose-500/5'
                              : 'hover:bg-amber-500/5'
                          )}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => { setActivityOpen(false); navigate('/status'); }}
                            className="flex-1 min-w-0 flex items-start gap-2.5 px-3 py-2 text-left transition-colors"
                          >
                            <AlertTriangle className={clsx(
                              'w-4 h-4 shrink-0 mt-0.5',
                              alert.level === 'error' ? 'text-rose-400' : 'text-amber-400'
                            )} />
                            <span className="min-w-0">
                              <span className={clsx(
                                'block text-xs font-semibold uppercase tracking-wide mb-0.5',
                                alert.level === 'error' ? 'text-rose-400' : 'text-amber-400'
                              )}>
                                {alert.level === 'error' ? 'Error' : 'Warning'}
                              </span>
                              <span className="block text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                                {alert.message}
                              </span>
                            </span>
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>,
            document.body
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate('/status')}
          title="Status"
          aria-label="Status"
          className="flex p-2 rounded-xl text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800/60 transition-colors shrink-0"
        >
          <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/settings')}
          title="Settings"
          aria-label="Settings"
          className="hidden sm:flex p-2 rounded-xl text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800/60 transition-colors"
        >
          <SlidersHorizontal className="w-5 h-5" />
        </button>

        {/* Divider */}
        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700/60 mx-1 hidden sm:block" />

        {/* Account — text only, no avatar */}
        <div className="hidden sm:flex items-center gap-2 cursor-default select-none shrink-0">
          <CircleUser className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0" />
          <div className="flex flex-col items-start justify-center leading-tight min-w-0">
            <span className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
              {displayName}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 truncate max-w-[120px]">
              {role}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700/60 mx-1 hidden sm:block" />

        {/* Logout */}
        <button
          type="button"
          onClick={onLogout}
          title="Logout"
          aria-label="Logout"
          className="flex p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 dark:hover:bg-rose-500/10 transition-colors shrink-0"
        >
          <RunningManIcon className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>
    </header>

    <MediaDetailsModal
      isOpen={!!addTarget}
      onClose={() => setAddTarget(null)}
      mediaId={addTarget?.mediaId}
      mediaType={addTarget?.mediaType}
      mode="add"
    />
  </>
  );
}
