import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal, Film, ListTodo, Tv as TvIcon, DownloadCloud, Inbox, Calendar as CalendarIcon, BarChart3, Eye, X, TrendingUp, Music } from 'lucide-react';
import AtlasLogo from '../common/AtlasLogo';
import TopBar from './TopBar';
import CommandPalette from './CommandPalette';
import clsx from 'clsx';
import api from '../../lib/api';
import useWebSocket, { closeWebSocket } from '../../lib/useWebSocket';
import { setCachedMovies, setCachedShows } from '../../lib/libraryCache';
import { invalidateLibraryIndex } from '../../lib/libraryIndex';
import useKeyboardShortcuts from '../../lib/useKeyboardShortcuts';
import ShortcutsModal from '../shared/ShortcutsModal';
import SubtitleJobBanner from '../subtitles/SubtitleJobBanner';
import MusicPlayerBar from '../music/MusicPlayerBar';
import { useAudioPlayer } from '../../context/AudioPlayerContext';

const navSections = [
  {
    title: 'Media Hub',
    items: [
      { name: 'Tracker', path: '/tracker', icon: TrendingUp },
      { name: 'Discover', path: '/discover', icon: Search },
      { name: 'Movies', path: '/movies', icon: Film },
      { name: 'Shows', path: '/shows', icon: TvIcon },
      { name: 'Music', path: '/music', icon: Music },
      { name: 'Calendar', path: '/calendar', icon: CalendarIcon },
      { name: 'Statistics', path: '/stats', icon: BarChart3 },
    ]
  },
  {
    title: 'Operations',
    items: [
      { name: 'Downloads', path: '/downloads', icon: DownloadCloud },
      { name: 'Requests', path: '/requests', icon: Inbox },
      { name: 'Tasks', path: '/tasks', icon: ListTodo },
      { name: 'Watchers', path: '/watcher', icon: Eye },
    ]
  },
  {
    title: 'Configuration',
    items: [
      { name: 'Settings', path: '/settings', icon: SlidersHorizontal },
    ]
  }
];

export default function Layout() {
  const { onEvent } = useWebSocket(); // Connect to real-time event stream
  const navigate = useNavigate();
  const [libStats, setLibStats] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('atlas_lib_stats') || 'null') || { movies: 0, shows: 0, artists: 0 };
    } catch {
      return { movies: 0, shows: 0, artists: 0 };
    }
  });
  const [downloads, setDownloads] = useState([]);
  const [downloadCount, setDownloadCount] = useState(() => {
    try {
      const saved = localStorage.getItem('atlas_download_count');
      return saved !== null ? Number(saved) : 0;
    } catch {
      return 0;
    }
  });
  const [, setClientStats] = useState({ dl_info_speed: 0, up_info_speed: 0 });
  const [, setClientConnected] = useState(null);
  const [systemIssues, setSystemIssues] = useState([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [user] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('atlas_user') || 'null');
    } catch {
      return null;
    }
  });
  const [watcherCount, setWatcherCount] = useState(0);
  const { currentTrack } = useAudioPlayer();

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore network errors on logout
    }
    localStorage.removeItem('atlas_token');
    localStorage.removeItem('atlas_user');
    setCachedMovies(null);
    setCachedShows(null);
    invalidateLibraryIndex();
    closeWebSocket();
    navigate('/login');
  };

  const hasToken = !!localStorage.getItem('atlas_token');

  // Prefetch library data into shared cache so Dashboard loads instantly
  const prefetchLibrary = async () => {
    try {
      const userStr = localStorage.getItem('atlas_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user && user.role === 'user') {
          navigate('/portal');
          return;
        }
      }

      const [moviesRes, showsRes] = await Promise.allSettled([
        api.get('/library/movies'),
        api.get('/library/shows')
      ]);
      if (moviesRes.status === 'fulfilled' && moviesRes.value.data.status === 'success') {
        setCachedMovies(moviesRes.value.data.data);
      }
      if (showsRes.status === 'fulfilled' && showsRes.value.data.status === 'success') {
        setCachedShows(showsRes.value.data.data);
      }
    } catch (err) {
      console.error('Failed to prefetch library', err);
    }
  };

  useEffect(() => {
    // Initial fetch for watchers
    api.get('/watcher/sessions')
      .then(res => {
        if (res.data.status === 'success') {
          setWatcherCount(res.data.data.length);
        }
      })
      .catch(() => {});

    const cleanupWebSocket = onEvent((data) => {
      if (data.type === 'WATCHERS_UPDATE') {
        setWatcherCount(data.count);
      }
      // Invalidate library cache when a scan completes (new/removed items)
      if (data.message && data.message.toLowerCase().includes('scan complete')) {
        setCachedMovies(null);
        setCachedShows(null);
        invalidateLibraryIndex();
      }
      // Layout push from server — replaces 3s polling
      if (data.type === 'LAYOUT_UPDATE' && data.data) {
        const nextStats = { movies: data.data.movies, shows: data.data.shows, artists: data.data.music ?? data.data.artists ?? 0 };
        setLibStats(nextStats);
        try { localStorage.setItem('atlas_lib_stats', JSON.stringify(nextStats)); } catch { /* ignore */ }
        setPendingRequests(data.data.pendingRequests || 0);
      }
      // Torrent push from server
      if (data.type === 'TORRENTS_UPDATE' && data.data) {
        const torrents = data.data.torrents || [];
        setDownloads(torrents);
        const count = torrents.length;
        setDownloadCount(count);
        try { localStorage.setItem('atlas_download_count', String(count)); } catch { /* ignore */ }
        setClientStats(data.data.clientStats || { dl_info_speed: 0, up_info_speed: 0 });
        setClientConnected(data.data.clientConnected);
      }
    });

    // Independent initial fetches so fast endpoints aren't blocked by slower ones
    const initialFetch = () => {
      api.get('/library/stats').then(res => {
        if (res.data?.status === 'success' && res.data?.data) {
          setLibStats(res.data.data);
          try { localStorage.setItem('atlas_lib_stats', JSON.stringify(res.data.data)); } catch { /* ignore */ }
        }
      }).catch(() => {});

      api.get('/clients/torrents').then(res => {
        if (res.data?.status === 'success' && Array.isArray(res.data?.data)) {
          const torrents = res.data.data;
          setDownloads(torrents);
          const count = torrents.length;
          setDownloadCount(count);
          try { localStorage.setItem('atlas_download_count', String(count)); } catch { /* ignore */ }
        }
      }).catch(() => {});

      api.get('/clients/stats').then(res => {
        if (res.data?.status === 'success' && res.data?.data) {
          setClientStats(res.data.data);
          setClientConnected(true);
        } else {
          setClientConnected(false);
        }
      }).catch(() => setClientConnected(false));

      api.get('/settings/issues').then(res => {
        if (res.data?.status === 'success') {
          setSystemIssues(res.data.data || []);
        }
      }).catch(() => {});

      api.get('/requests/pending-count').then(res => {
        if (res.data?.status === 'success') {
          setPendingRequests(res.data.data.count || 0);
        }
      }).catch(() => {});
    };
    initialFetch();
    prefetchLibrary();

    // Pause/resume WS on visibility change (no more polling to clear)
    const onVisibility = () => {
      if (!document.hidden) {
        initialFetch(); // Refresh on return
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (cleanupWebSocket) cleanupWebSocket();
    };
    // prefetchLibrary is stable-safe here: it reads localStorage and fetches once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEvent]);

  // Global keyboard shortcuts
  useKeyboardShortcuts({
    'g m': () => navigate('/movies'),
    'g s': () => navigate('/shows'),
    'g u': () => navigate('/music'),
    'g d': () => navigate('/discover'),
    'g c': () => navigate('/calendar'),
    'g t': () => navigate('/tasks'),
    'g k': () => navigate('/tracker'),
    'g x': () => navigate('/stats'),
    '/': () => setPaletteOpen(true),
    '?': () => setShortcutsOpen(true),
    'escape': () => {
      setShortcutsOpen(false);
      setPaletteOpen(false);
    },
  });

  // ⌘K / Ctrl+K — toggles the global search palette. Handled separately because
  // useKeyboardShortcuts deliberately ignores modifier combinations.
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Listen for sidebar toggle from child components (e.g., sticky search bar)
  useEffect(() => {
    const handler = () => setSidebarOpen(true);
    window.addEventListener('atlas-toggle-sidebar', handler);
    return () => window.removeEventListener('atlas-toggle-sidebar', handler);
  }, []);

  const navRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollState, setScrollState] = useState({ canScroll: false, thumbTop: 0, thumbHeight: 20 });

  const updateScrollState = () => {
    if (!navRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = navRef.current;
    if (scrollHeight > clientHeight + 5) {
      const heightPercent = Math.max(15, Math.min(80, (clientHeight / scrollHeight) * 100));
      const maxScroll = scrollHeight - clientHeight;
      const topPercent = maxScroll > 0 ? (scrollTop / maxScroll) * (100 - heightPercent) : 0;
      setScrollState({
        canScroll: true,
        thumbTop: topPercent,
        thumbHeight: heightPercent,
      });
      setIsScrolling(true);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => setIsScrolling(false), 800);
    } else {
      setScrollState(prev => prev.canScroll ? { ...prev, canScroll: false } : prev);
    }
  };

  useEffect(() => {
    updateScrollState();
    const timer = setTimeout(updateScrollState, 200);
    window.addEventListener('resize', updateScrollState);
    return () => {
      clearTimeout(timer);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [sidebarOpen]);

  return (
      <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-[#0a1320]" style={{ height: '100dvh', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'w-64 flex flex-col fixed lg:relative z-50 h-full transition-transform duration-200',
          'border-r border-slate-200 dark:border-slate-800/80',
          'bg-slate-50 dark:bg-[#090f1d]',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Sidebar Header */}
        <div className="h-16 px-5 flex items-center justify-between shrink-0">
          <AtlasLogo variant="lockup" className="h-[34px] w-auto" />
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            title="Close menu"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative flex-1 overflow-hidden flex flex-col min-h-0">
          <nav 
            ref={navRef}
            onScroll={updateScrollState}
            className="flex-1 px-3 py-3 space-y-4 overflow-y-auto hide-scrollbar"
          >
            {navSections.map((section) => (
              <div key={section.title} className="space-y-1">
                <div className="px-3 mb-1.5">
                  <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    {section.title}
                  </h3>
                </div>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.name}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        clsx(
                          'group relative flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-500 text-[14px]',
                          isActive
                            ? 'font-semibold'
                            : 'font-medium text-[#839eb5] hover:text-slate-100 hover:bg-slate-800/40'
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <div className="absolute inset-0 bg-[#0d274a] rounded-xl border border-[#1b3d68]/60 shadow-sm animate-fade-in-fast">
                              <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#32a2f6] shadow-[0_0_8px_rgba(50,162,246,0.6)] rounded-r-full" />
                            </div>
                          )}
                          <div className="relative z-10 flex items-center space-x-3">
                            <item.icon className={clsx(
                              "w-[18px] h-[18px] shrink-0 transition-colors",
                              isActive
                                ? "text-slate-100"
                                : "text-[#839eb5] group-hover:text-slate-200"
                            )} />
                            <span className={clsx(
                              "truncate transition-colors",
                              isActive
                                ? "text-[#33bbf5]"
                                : "text-[#839eb5] group-hover:text-slate-200"
                            )}>
                              {item.name}
                            </span>
                          </div>
                          <div className="relative z-10 flex items-center">
                            {item.path === '/movies' && libStats?.movies > 0 && (
                              <span className={clsx(
                                "inline-flex items-center justify-center px-2 py-0.5 min-w-[26px] rounded-md text-xs font-display font-semibold leading-tight border transition-all",
                                isActive
                                  ? "bg-sky-500/20 border-sky-400/40 text-sky-200 font-bold"
                                  : "bg-sky-500/10 border-sky-500/25 text-sky-400 group-hover:bg-sky-500/20 group-hover:border-sky-500/40 group-hover:text-sky-300"
                              )}>
                                {libStats.movies.toLocaleString()}
                              </span>
                            )}
                            {item.path === '/shows' && libStats?.shows > 0 && (
                              <span className={clsx(
                                "inline-flex items-center justify-center px-2 py-0.5 min-w-[26px] rounded-md text-xs font-display font-semibold leading-tight border transition-all",
                                isActive
                                  ? "bg-sky-500/20 border-sky-400/40 text-sky-200 font-bold"
                                  : "bg-sky-500/10 border-sky-500/25 text-sky-400 group-hover:bg-sky-500/20 group-hover:border-sky-500/40 group-hover:text-sky-300"
                              )}>
                                {libStats.shows.toLocaleString()}
                              </span>
                            )}
                            {item.path === '/music' && libStats?.artists > 0 && (
                              <span className={clsx(
                                "inline-flex items-center justify-center px-2 py-0.5 min-w-[26px] rounded-md text-xs font-display font-semibold leading-tight border transition-all",
                                isActive
                                  ? "bg-sky-500/20 border-sky-400/40 text-sky-200 font-bold"
                                  : "bg-sky-500/10 border-sky-500/25 text-sky-400 group-hover:bg-sky-500/20 group-hover:border-sky-500/40 group-hover:text-sky-300"
                              )}>
                                {libStats.artists.toLocaleString()}
                              </span>
                            )}
                            {item.name === 'Requests' && pendingRequests > 0 && (
                              <span className={clsx(
                                "inline-flex items-center justify-center px-2 py-0.5 min-w-[26px] rounded-md text-xs font-display font-bold leading-tight border transition-all",
                                isActive
                                  ? "bg-amber-500/25 border-amber-400/50 text-amber-200 font-bold"
                                  : "bg-amber-500/15 border-amber-500/30 text-amber-300 group-hover:bg-amber-500/25 group-hover:text-amber-200"
                              )}>
                                {pendingRequests}
                              </span>
                            )}
                            {item.name === 'Downloads' && downloadCount > 0 && (
                              <span className={clsx(
                                "inline-flex items-center justify-center px-2 py-0.5 min-w-[26px] rounded-md text-xs font-display font-bold leading-tight border transition-all",
                                isActive
                                  ? "bg-emerald-500/25 border-emerald-400/50 text-emerald-200 font-bold"
                                  : "bg-emerald-500/15 border-emerald-500/30 text-emerald-300 group-hover:bg-emerald-500/25 group-hover:text-emerald-200"
                              )}>
                                {downloadCount}
                              </span>
                            )}
                            {item.name === 'Watchers' && watcherCount > 0 && (
                              <span className={clsx(
                                "inline-flex items-center justify-center px-2 py-0.5 min-w-[26px] rounded-md text-xs font-display font-bold leading-tight border transition-all",
                                isActive
                                  ? "bg-cyan-500/25 border-cyan-400/50 text-cyan-200 font-bold"
                                  : "bg-cyan-500/15 border-cyan-500/30 text-cyan-300 group-hover:bg-cyan-500/25 group-hover:text-cyan-200"
                              )}>
                                {watcherCount}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Subtle Slate/Cyan custom scrollbar */}
          {scrollState.canScroll && (
            <div className="absolute right-1 top-2 bottom-2 w-1 bg-slate-800/20 dark:bg-white/5 rounded-full pointer-events-none z-30">
              <div 
                className={clsx(
                  "w-full rounded-full absolute transition-colors duration-300",
                  isScrolling 
                    ? "bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.5)]" 
                    : "bg-slate-400/50 dark:bg-slate-600/70"
                )}
                style={{
                  top: `${scrollState.thumbTop}%`,
                  height: `${scrollState.thumbHeight}%`
                }}
              />

              {/* Bottom animated chevron indicator when more content is below */}
              {scrollState.thumbTop + scrollState.thumbHeight < 96 && (
                <div className="absolute -bottom-3 -left-1 flex justify-center w-3 animate-bounce opacity-80">
                  <svg className="w-2.5 h-2.5 text-cyan-500/80 dark:text-cyan-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              )}
            </div>
          )}
        </div>

      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <TopBar
          user={user}
          activity={{
            issues: systemIssues.length,
            requests: pendingRequests,
            downloads: downloadCount,
            watchers: watcherCount,
          }}
          onOpenSearch={() => setPaletteOpen(true)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          onLogout={handleLogout}
        />

        <main className={clsx("flex-1 min-h-0 min-w-0 w-full overflow-y-auto overflow-x-hidden relative z-10", currentTrack && "pb-24")}>
          <div className="p-3 sm:p-4 md:p-6 lg:p-8 w-full max-w-full overflow-x-clip">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Floating Background Subtitle Job Progress Banner */}
      <SubtitleJobBanner />

      {/* Floating Audio Player for Music */}
      <MusicPlayerBar />
    </div>
  );
}
