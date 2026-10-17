import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Search,
  Film,
  Tv,
  User as UserIcon,
  Loader2,
  X,
  ChevronRight,
  LayoutDashboard,
  Compass,
  Music,
  CalendarDays,
  DownloadCloud,
  Inbox,
  ListTodo,
  BarChart3,
  Settings as SettingsIcon,
  Sparkles,
  Plus,
} from 'lucide-react';
import api from '../../lib/api';
import { setCachedMovies, setCachedShows } from '../../lib/libraryCache';
import { posterUrl, tmdbImgUrl } from '../../lib/posterUrl';
import {
  getLibraryIndex,
  invalidateLibraryIndex,
  searchLibraryIndex,
  collectGenres,
} from '../../lib/libraryIndex';
import MediaDetailsModal from '../MediaDetailsModal';

const QUICK_LINKS = [
  { label: 'Dashboard', hint: 'Overview', route: '/', icon: LayoutDashboard, color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
  { label: 'Discover', hint: 'Browse TMDB', route: '/discover', icon: Compass, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20', chord: ['G', 'D'] },
  { label: 'Movies', hint: 'Your collection', route: '/movies', icon: Film, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', chord: ['G', 'M'] },
  { label: 'TV Shows', hint: 'Your collection', route: '/shows', icon: Tv, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20', chord: ['G', 'S'] },
  { label: 'Music', hint: 'Artists & albums', route: '/music', icon: Music, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', chord: ['G', 'U'] },
  { label: 'Calendar', hint: 'Upcoming releases', route: '/calendar', icon: CalendarDays, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', chord: ['G', 'C'] },
  { label: 'Downloads', hint: 'Active transfers', route: '/downloads', icon: DownloadCloud, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { label: 'Requests', hint: 'User requests', route: '/requests', icon: Inbox, color: 'text-amber-300 bg-amber-400/10 border-amber-400/20' },
  { label: 'Tasks', hint: 'Scheduled jobs', route: '/tasks', icon: ListTodo, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', chord: ['G', 'T'] },
  { label: 'Statistics', hint: 'Library insights', route: '/stats', icon: BarChart3, color: 'text-teal-400 bg-teal-500/10 border-teal-500/20', chord: ['G', 'X'] },
  { label: 'Settings', hint: 'Configuration', route: '/settings', icon: SettingsIcon, color: 'text-slate-300 bg-slate-500/10 border-slate-500/20' },
];

const SETTINGS_SEARCH_ITEMS = [
  { title: 'General Settings', keywords: 'general api security backup theme ui web ui', route: '/settings?tab=general' },
  { title: 'Connections', keywords: 'connections integrations webhooks simkl notifications', route: '/settings?tab=connections' },
  { title: 'Indexers', keywords: 'indexers trackers prowlarr torrents usenet providers', route: '/settings?tab=indexers' },
  { title: 'Download Clients', keywords: 'clients download qbittorrent transmission sabnzbd deluge torrents', route: '/settings?tab=clients' },
  { title: 'Subtitles & AI', keywords: 'subtitles ai translate languages opensubtitles gemini chatgpt deepseek claude', route: '/settings?tab=subtitles' },
  { title: 'Quality Profiles', keywords: 'quality profiles resolution 1080p 4k 720p upgrade', route: '/settings?tab=profiles' },
  { title: 'Release Profiles', keywords: 'release profiles must contain ignored words tags trash guides', route: '/settings?tab=release-profiles' },
  { title: 'Media Naming', keywords: 'naming folders format rename files season episode track album', route: '/settings?tab=naming' },
  { title: 'Library Management', keywords: 'library folders scan root refresh metadata paths', route: '/settings?tab=library' },
  { title: 'Users', keywords: 'users accounts permissions roles passwords access quota limits', route: '/settings?tab=users' },
];

const TMDB_DEBOUNCE_MS = 250;
const MAX_PER_SECTION = 6;

const SECTION_LABELS = {
  quick: 'Jump to',
  settings: 'Settings',
  library: 'In your library',
  tmdb: 'Movies & TV',
  people: 'People',
  genres: 'Genres',
};

function Thumb({ src, icon: Icon, round }) {
  return (
    <span
      className={clsx(
        'shrink-0 overflow-hidden bg-[#101e31] border border-white/10 flex items-center justify-center shadow-sm',
        round ? 'w-10 h-10 rounded-full' : 'w-9 h-12 rounded-lg',
      )}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <Icon className="w-4 h-4 text-slate-500" />
      )}
    </span>
  );
}

/**
 * Global search palette (⌘K / Ctrl+K).
 *
 * Searches the local library instantly (title + genre) and queries TMDB for
 * anything not owned, including people. Results are grouped and fully
 * keyboard navigable; selecting a TMDB-only item opens the add/details modal.
 */
export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [libraryItems, setLibraryItems] = useState([]);
  const [tmdbResults, setTmdbResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [addTarget, setAddTarget] = useState(null);

  const inputRef = useRef(null);
  const requestIdRef = useRef(0);
  const listRef = useRef(null);
  const rowRefs = useRef([]);

  // Warm the library index as soon as the palette is available so the first
  // keystroke is instant, and re-seed it whenever the palette opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getLibraryIndex().then((items) => {
      if (!cancelled) setLibraryItems(items || []);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTmdbResults([]);
      setActiveIndex(0);
      // Focus after the portal mounts
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    setLoading(false);
  }, [open]);

  // Debounced TMDB lookup — only for queries long enough to be meaningful.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setTmdbResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const requestId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/tmdb/search/multi?query=${encodeURIComponent(trimmed)}`);
        if (requestId !== requestIdRef.current) return;
        const items = res.data?.data;
        setTmdbResults(Array.isArray(items) ? items : []);
      } catch {
        if (requestId === requestIdRef.current) setTmdbResults([]);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, TMDB_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, open]);

  // Lock background scroll while the palette is open
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const libraryByTmdbId = useMemo(() => {
    const map = new Map();
    for (const item of libraryItems) {
      if (item.tmdbId) map.set(Number(item.tmdbId), item);
    }
    return map;
  }, [libraryItems]);

  const go = useCallback(
    (route) => {
      onClose();
      navigate(route);
    },
    [navigate, onClose],
  );

  const sections = useMemo(() => {
    const trimmed = query.trim();
    const built = [];

    if (!trimmed) {
      built.push({
        key: 'quick',
        items: QUICK_LINKS.map((link) => ({
          key: `quick-${link.route}`,
          title: link.label,
          subtitle: link.hint,
          icon: link.icon,
          color: link.color,
          chord: link.chord,
          run: () => go(link.route),
        })),
      });
      return built;
    }

    const lower = trimmed.toLowerCase();

    const settingsMatches = SETTINGS_SEARCH_ITEMS.filter(
      (s) => s.title.toLowerCase().includes(lower) || s.keywords.includes(lower)
    );
    if (settingsMatches.length > 0) {
      built.push({
        key: 'settings',
        items: settingsMatches.map((s) => ({
          key: `setting-${s.title}`,
          title: s.title,
          subtitle: 'Settings Configuration',
          icon: SettingsIcon,
          badge: 'Go',
          run: () => go(s.route),
        })),
      });
    }

    const libraryMatches = searchLibraryIndex(libraryItems, trimmed, MAX_PER_SECTION);
    if (libraryMatches.length) {
      built.push({
        key: 'library',
        items: libraryMatches.map((item) => ({
          key: `lib-${item.kind}-${item.id}`,
          title: item.title,
          subtitle: [item.kind === 'movie' ? 'Movie' : 'TV Show', item.meta].filter(Boolean).join(' · '),
          year: item.year,
          thumb: {
            src: item.tmdbId ? posterUrl(item.kind === 'movie' ? 'movies' : 'shows', item.tmdbId, item.posterPath) : null,
            icon: item.kind === 'movie' ? Film : Tv,
          },
          badge: 'In library',
          run: () => go(item.route),
        })),
      });
    }

    const media = tmdbResults.filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
    const people = tmdbResults.filter((r) => r.media_type === 'person');

    if (media.length) {
      built.push({
        key: 'tmdb',
        items: media.slice(0, MAX_PER_SECTION).map((item) => {
          const owned = libraryByTmdbId.get(Number(item.id));
          const title = item.title || item.name || 'Untitled';
          const date = item.release_date || item.first_air_date || '';
          return {
            key: `tmdb-${item.media_type}-${item.id}`,
            title,
            subtitle: owned
              ? 'In your library'
              : item.overview
                ? item.overview.slice(0, 90)
                : item.media_type === 'movie'
                  ? 'Movie'
                  : 'TV Show',
            year: date ? date.slice(0, 4) : null,
            thumb: {
              src: tmdbImgUrl(item.poster_path, 'w92'),
              icon: item.media_type === 'movie' ? Film : Tv,
            },
            badge: owned ? 'In library' : 'Add',
            run: () => {
              if (owned) {
                go(owned.route);
                return;
              }
              onClose();
              setAddTarget({ mediaId: item.id, mediaType: item.media_type, title });
            },
          };
        }),
      });
    }

    if (people.length) {
      built.push({
        key: 'people',
        items: people.slice(0, MAX_PER_SECTION).map((person) => ({
          key: `person-${person.id}`,
          title: person.name,
          subtitle: person.known_for_department || 'Person',
          thumb: { src: tmdbImgUrl(person.profile_path, 'w92'), icon: UserIcon, round: true },
          run: () => go(`/person/${person.id}`),
        })),
      });
    }

    const genreMatches = collectGenres(libraryItems)
      .filter((genre) => genre.name.toLowerCase().includes(lower))
      .slice(0, 4);

    if (genreMatches.length) {
      built.push({
        key: 'genres',
        items: genreMatches.map((genre) => ({
          key: `genre-${genre.kind}-${genre.name}`,
          title: genre.name,
          subtitle: `${genre.count} ${genre.kind === 'movie' ? 'movie' : 'show'}${genre.count === 1 ? '' : 's'}`,
          icon: Sparkles,
          badge: 'Browse',
          run: () => go(`/${genre.kind === 'movie' ? 'movies' : 'shows'}?genre=${encodeURIComponent(genre.name)}`),
        })),
      });
    }

    return built;
  }, [query, libraryItems, tmdbResults, libraryByTmdbId, go, onClose]);

  const rows = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    setActiveIndex((prev) => (prev >= rows.length ? 0 : prev));
  }, [rows.length]);

  useEffect(() => {
    rowRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (rows.length ? (prev + 1) % rows.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (rows.length ? (prev - 1 + rows.length) % rows.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      rows[activeIndex]?.run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleAdded = () => {
    // Library changed — drop every cached copy so the grid and index refetch.
    invalidateLibraryIndex();
    setCachedMovies(null);
    setCachedShows(null);
    setLibraryItems([]);
    getLibraryIndex().then((items) => setLibraryItems(items || []));
  };

  if (!open && !addTarget) return null;

  const hasQuery = query.trim().length > 0;

  return (
    <>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[5vh] sm:pt-[7vh] pb-4">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-md animate-fade-in-fast" onClick={onClose} />

            <div
              role="dialog"
              aria-modal="true"
              aria-label="Global search"
              className="relative w-full max-w-2xl bg-[#0b1320] border border-cyan-500/25 rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.9),0_0_40px_rgba(34,211,238,0.08)] overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[88vh] ring-1 ring-white/10"
            >
              {/* Input */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1c2d46] bg-[#070e1a] relative">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 shadow-sm shadow-cyan-950/40">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Find movies, shows, music, settings, or jump to..."
                  aria-label="Find movies, shows, music, and more..."
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-base sm:text-lg font-medium text-white placeholder-slate-500"
                />
                {loading && <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />}
                {hasQuery && (
                  <button
                    onClick={() => {
                      setQuery('');
                      inputRef.current?.focus();
                    }}
                    className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors shrink-0 rounded-full hover:bg-white/5 cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <kbd
                  onClick={onClose}
                  className="hidden sm:inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-md bg-gradient-to-b from-[#1f2d42] to-[#0f1724] border-t border-white/20 border-x border-b border-[#050912] text-[10px] font-bold text-slate-300 font-mono shadow-[0_2px_0_0_#050912] cursor-pointer hover:text-white transition-colors select-none"
                >
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div ref={listRef} className="flex-1 overflow-y-auto hide-scrollbar p-2 sm:p-2.5">
                {rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    {loading ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 text-cyan-500/50 animate-spin" />
                        <p className="text-sm font-medium text-slate-400">Searching...</p>
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mb-2 shadow-inner">
                          <Search className="w-5 h-5 text-slate-500" />
                        </div>
                        <p className="text-sm text-slate-400 font-medium">
                          No results for <span className="text-slate-200 font-bold">“{query.trim()}”</span>
                        </p>
                        <p className="text-xs text-slate-500">Try searching for a title, actor, or genre.</p>
                      </>
                    )}
                  </div>
                ) : (
                  sections.map((section) => (
                    <div key={section.key} className="mb-2.5 last:mb-0">
                      <div className="px-3 py-1 text-[10px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                        {SECTION_LABELS[section.key] || section.key}
                        <div className="h-px bg-gradient-to-r from-cyan-500/30 to-transparent flex-1" />
                      </div>
                      <div className="space-y-1">
                        {section.items.map((item) => {
                          const index = rows.indexOf(item);
                          const isActive = index === activeIndex;
                          const Icon = item.icon;
                          return (
                            <button
                              key={item.key}
                              ref={(el) => {
                                rowRefs.current[index] = el;
                              }}
                              type="button"
                              onMouseMove={() => setActiveIndex(index)}
                              onClick={item.run}
                              className={clsx(
                                'w-full flex items-center gap-3 rounded-xl text-left transition-all duration-200 cursor-pointer group',
                                item.thumb ? 'px-3 py-2' : 'px-3 py-2',
                                isActive 
                                  ? 'bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-transparent border border-cyan-500/40 shadow-lg shadow-cyan-950/40' 
                                  : 'hover:bg-white/5 border border-transparent',
                              )}
                            >
                              {item.thumb ? (
                                <Thumb src={item.thumb.src} icon={item.thumb.icon} round={item.thumb.round} />
                              ) : (
                                <span className={clsx(
                                  "w-8 h-8 shrink-0 rounded-xl border flex items-center justify-center shadow-sm transition-transform duration-200",
                                  item.color || "bg-[#101e31] border-white/10 text-slate-400",
                                  isActive && "scale-105"
                                )}>
                                  {Icon && <Icon className="w-4 h-4" />}
                                </span>
                              )}

                              <span className="min-w-0 flex-1">
                                {item.thumb ? (
                                  <>
                                    <span className={clsx("block truncate text-sm font-bold transition-colors", isActive ? "text-white" : "text-slate-200")}>
                                      {item.title}
                                      {item.year && <span className="ml-1.5 text-xs font-medium text-slate-500">{item.year}</span>}
                                    </span>
                                    <span className={clsx("block truncate text-xs mt-0.5", isActive ? "text-slate-300" : "text-slate-500")}>
                                      {item.subtitle}
                                    </span>
                                  </>
                                ) : (
                                  <div className="flex items-center justify-between gap-3">
                                    <span className={clsx("truncate text-sm font-semibold transition-colors", isActive ? "text-white font-bold" : "text-slate-200")}>
                                      {item.title}
                                    </span>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {item.subtitle && (
                                        <span className={clsx("text-xs transition-colors", isActive ? "text-slate-300" : "text-slate-500")}>
                                          {item.subtitle}
                                        </span>
                                      )}
                                      {item.chord && (
                                        <div className="flex items-center gap-1 shrink-0">
                                          {item.chord.map((k) => (
                                            <kbd
                                              key={k}
                                              className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded bg-[#101b2a] border border-white/10 text-[10px] font-mono font-bold text-slate-400 shadow-sm"
                                            >
                                              {k}
                                            </kbd>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </span>

                              {item.badge && (
                                <span
                                  className={clsx(
                                    'shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border shadow-sm transition-all duration-150',
                                    item.badge === 'In library'
                                      ? isActive
                                        ? 'bg-cyan-500/25 text-cyan-300 border-cyan-400/50 shadow-sm'
                                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 group-hover:bg-cyan-500/25 group-hover:text-cyan-300 group-hover:border-cyan-400/50'
                                      : item.badge === 'Add'
                                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20'
                                      : 'bg-slate-800/80 text-slate-400 border-white/5',
                                  )}
                                >
                                  {item.badge === 'Add' && <Plus className="w-3 h-3" />}
                                  {item.badge === 'In library' ? (
                                    <>
                                      <span className={isActive ? 'hidden' : 'inline group-hover:hidden'}>
                                        In library
                                      </span>
                                      <span className={isActive ? 'inline' : 'hidden group-hover:inline'}>
                                        View
                                      </span>
                                    </>
                                  ) : (
                                    item.badge
                                  )}
                                </span>
                              )}

                              {isActive && <ChevronRight className="w-4 h-4 text-cyan-400 shrink-0 ml-1" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4 px-5 py-3 border-t border-[#1c2d46] bg-[#070d17] text-[11px] font-medium text-slate-400 rounded-b-2xl">
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md bg-[#131f31] border-t border-white/20 border-x border-b border-[#050912] text-slate-200 font-mono text-[10px] font-bold shadow-sm">↑</kbd>
                    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md bg-[#131f31] border-t border-white/20 border-x border-b border-[#050912] text-slate-200 font-mono text-[10px] font-bold shadow-sm">↓</kbd>
                  </span>
                  Navigate
                </span>
                <span className="flex items-center gap-2">
                  <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md bg-[#131f31] border-t border-white/20 border-x border-b border-[#050912] text-slate-200 font-mono text-[10px] font-bold shadow-sm">↵</kbd>
                  Select
                </span>
                <span className="flex items-center gap-2 ml-auto text-slate-500">
                  <kbd className="inline-flex items-center justify-center min-w-[28px] h-5 px-1.5 rounded-md bg-[#131f31] border-t border-white/20 border-x border-b border-[#050912] text-slate-300 font-mono text-[10px] font-bold shadow-sm">esc</kbd>
                  Close
                </span>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <MediaDetailsModal
        isOpen={!!addTarget}
        onClose={() => setAddTarget(null)}
        mediaId={addTarget?.mediaId}
        mediaType={addTarget?.mediaType}
        mode="add"
        onAdded={handleAdded}
      />
    </>
  );
}
