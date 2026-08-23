import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Settings as SettingsIcon, Film, Activity, Tv as TvIcon, DownloadCloud, Heart, Calendar as CalendarIcon, BarChart3, LogOut, Eye, X, TrendingUp } from 'lucide-react';
import Logo from './Logo';
import clsx from 'clsx';
import api from '../../lib/api';
import useWebSocket, { closeWebSocket } from '../../lib/useWebSocket';
import { setCachedMovies, setCachedShows } from '../../lib/libraryCache';
import useKeyboardShortcuts from '../../lib/useKeyboardShortcuts';
import ShortcutsModal from '../shared/ShortcutsModal';

const navSections = [
  {
    title: 'Media Hub',
    items: [
      { name: 'Tracker', path: '/tracker', icon: TrendingUp },
      { name: 'Discover', path: '/discover', icon: Search },
      { name: 'Movies', path: '/movies', icon: Film },
      { name: 'Shows', path: '/shows', icon: TvIcon },
      { name: 'Calendar', path: '/calendar', icon: CalendarIcon },
      { name: 'Statistics', path: '/stats', icon: BarChart3 },
    ]
  },
  {
    title: 'Operations',
    items: [
      { name: 'Downloads', path: '/downloads', icon: DownloadCloud },
      { name: 'Requests', path: '/requests', icon: Heart },
      { name: 'Tasks', path: '/tasks', icon: Activity },
      { name: 'Watchers', path: '/watcher', icon: Eye },
    ]
  },
  {
    title: 'Configuration',
    items: [
      { name: 'Settings', path: '/settings', icon: SettingsIcon },
    ]
  }
];

export default function Layout() {
  const { onEvent } = useWebSocket(); // Connect to real-time event stream
  const navigate = useNavigate();
  const [libStats, setLibStats] = useState({ movies: 0, shows: 0 });
  const [downloads, setDownloads] = useState([]);
  const [, setClientStats] = useState({ dl_info_speed: 0, up_info_speed: 0 });
  const [, setClientConnected] = useState(null);
  const [systemIssues, setSystemIssues] = useState([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const [watcherCount, setWatcherCount] = useState(0);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore network errors on logout
    }
    localStorage.removeItem('atlas_token');
    localStorage.removeItem('atlas_user');
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
      }
      // Layout push from server — replaces 3s polling
      if (data.type === 'LAYOUT_UPDATE' && data.data) {
        setLibStats({ movies: data.data.movies, shows: data.data.shows });
        setPendingRequests(data.data.pendingRequests || 0);
      }
      // Torrent push from server
      if (data.type === 'TORRENTS_UPDATE' && data.data) {
        setDownloads(data.data.torrents || []);
        setClientStats(data.data.clientStats || { dl_info_speed: 0, up_info_speed: 0 });
        setClientConnected(data.data.clientConnected);
      }
    });

    // One-time initial fetch for data not covered by WebSocket push
    const initialFetch = async () => {
      try {
        const [libRes, statsRes, torrentsRes, issuesRes, requestsRes] = await Promise.allSettled([
          api.get('/library/stats'),
          api.get('/clients/stats'),
          api.get('/clients/torrents'),
          api.get('/settings/issues'),
          api.get('/requests/pending-count')
        ]);
        
        if (libRes.status === 'fulfilled' && libRes.value.data.status === 'success') {
          setLibStats(libRes.value.data.data);
        }
        if (statsRes.status === 'fulfilled' && statsRes.value.data.status === 'success' && statsRes.value.data.data) {
          setClientStats(statsRes.value.data.data);
          setClientConnected(true);
        } else {
          setClientConnected(false);
        }
        if (torrentsRes.status === 'fulfilled' && torrentsRes.value.data.status === 'success' && torrentsRes.value.data.data) {
          setDownloads(torrentsRes.value.data.data);
        }
        if (issuesRes.status === 'fulfilled' && issuesRes.value.data.status === 'success') {
          setSystemIssues(issuesRes.value.data.data || []);
        }
        if (requestsRes.status === 'fulfilled' && requestsRes.value.data.status === 'success') {
          setPendingRequests(requestsRes.value.data.data.count || 0);
        }
      } catch (err) {
        console.error('Failed to fetch initial data', err);
      }
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
    'g d': () => navigate('/discover'),
    'g c': () => navigate('/calendar'),
    'g t': () => navigate('/tasks'),
    'g k': () => navigate('/tracker'),
    'g x': () => navigate('/stats'),
    '/': () => { document.querySelector('[data-search-input]')?.focus(); },
    '?': () => setShortcutsOpen(true),
    'escape': () => setShortcutsOpen(false),
  });

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
      <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950" style={{ height: '100dvh', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
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
          'w-64 flex flex-col fixed lg:relative z-50 h-full transition-transform duration-300',
          'border-r border-slate-200/60 dark:border-indigo-500/10',
          'bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur-xl',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="p-6 pb-6 flex items-center justify-between relative overflow-hidden">

          {/* Animated Wave divider under the logo header */}
          <div className="absolute bottom-0 left-0 right-0 w-full h-4 overflow-hidden pointer-events-none opacity-50 dark:opacity-30">
            <svg className="w-full h-full text-cyan-550/15 dark:text-cyan-400/10" viewBox="0 0 1200 120" preserveAspectRatio="none">
              <path d="M0,60 C150,100 350,100 500,80 C650,60 900,40 1200,80 L1200,120 L0,120 Z" fill="currentColor">
                <animate 
                  attributeName="d" 
                  dur="8s" 
                  repeatCount="indefinite" 
                  values="
                    M0,60 C150,100 350,100 500,80 C650,60 900,40 1200,80 L1200,120 L0,120 Z;
                    M0,60 C180,80 320,110 500,90 C680,70 880,50 1200,70 L1200,120 L0,120 Z;
                    M0,60 C150,100 350,100 500,80 C650,60 900,40 1200,80 L1200,120 L0,120 Z
                  "
                />
              </path>
              <path d="M0,75 C200,110 400,90 600,100 C800,110 1000,80 1200,95 L1200,120 L0,120 Z" fill="currentColor" opacity="0.5">
                <animate 
                  attributeName="d" 
                  dur="12s" 
                  repeatCount="indefinite" 
                  values="
                    M0,75 C200,110 400,90 600,100 C800,110 1000,80 1200,95 L1200,120 L0,120 Z;
                    M0,75 C150,90 350,100 600,90 C850,80 1050,100 1200,85 L1200,120 L0,120 Z;
                    M0,75 C200,110 400,90 600,100 C800,110 1000,80 1200,95 L1200,120 L0,120 Z
                  "
                />
              </path>
            </svg>
          </div>

          <div className="flex items-center space-x-3 select-none relative group/logo p-1 px-2">
            {/* Large background Logo watermark behind the text */}
            <div className="absolute -left-7 -top-7 w-28 h-28 scale-150 pointer-events-none group-hover/logo:scale-[1.6] transition-transform duration-500 will-change-transform transform-gpu">
              <Logo className="w-full h-full" isWatermark={true} />
            </div>

            <div className="relative z-10 pl-12">
              <span className="text-3xl font-display font-black uppercase tracking-widest drop-shadow-atlas-glow">
                <span className="bg-gradient-to-r from-cyan-300 via-cyan-400 to-sky-400 bg-clip-text text-transparent">
                  Atlas
                </span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 relative z-10">
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200/60 dark:border-white/5 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              title="Close menu"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>


        <div className="relative flex-1 overflow-hidden flex flex-col min-h-0">
          <nav 
            ref={navRef}
            onScroll={updateScrollState}
            className="flex-1 px-3 py-2 space-y-4 overflow-y-auto hide-scrollbar"
          >
            {navSections.map((section) => (
              <div key={section.title} className="space-y-1">
                <div className="flex items-center px-4 mb-2">
                  <h3 className="text-[10px] font-black text-slate-800 dark:text-white uppercase tracking-widest opacity-90">
                    {section.title}
                  </h3>
                  <div className="flex-1 h-px bg-gradient-to-r from-slate-400/50 dark:from-white/30 to-transparent mt-0.5"></div>
                </div>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.name}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        clsx(
                          'group relative flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500',
                          isActive
                            ? 'text-cyan-600 dark:text-cyan-400 font-semibold'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5'
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <>
                              {/* Sliding left accent bar */}
                              <motion.div
                                layoutId="active-nav-line"
                                className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-gradient-to-b from-cyan-400 to-sky-500 rounded-r-full"
                                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                              />
                              {/* Subtle background glow with drifting particles */}
                              <motion.div
                                layoutId="active-nav-bg"
                                className="absolute inset-0 bg-gradient-to-r from-cyan-500/8 via-cyan-500/2 to-transparent rounded-xl overflow-hidden active-nav-glow-container"
                                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                              >
                                <span className="absolute top-2 w-1.5 h-1.5 bg-cyan-400/60 rounded-full blur-[0.4px] animate-particle-1" />
                                <span className="absolute top-5.5 w-1 h-1 bg-sky-400/50 rounded-full blur-[0.4px] animate-particle-2" />
                                <span className="absolute top-3.5 w-1.5 h-1.5 bg-blue-450/40 rounded-full blur-[0.4px] animate-particle-3" />
                                <span className="absolute top-7 w-1 h-1 bg-cyan-400/30 rounded-full blur-[0.4px] animate-particle-4" />
                              </motion.div>
                            </>
                          )}
                          <div className="relative z-10 flex items-center space-x-3 group-hover:translate-x-0.5 transition-transform duration-205">
                            <item.icon className={clsx("w-5 h-5 transition-transform duration-300", isActive ? "scale-105" : "group-hover:scale-110")} />
                            <span className="text-sm font-medium">{item.name}</span>
                          </div>
                          <div className="relative z-10 flex items-center space-x-2">
                            {item.path === '/movies' && libStats?.movies > 0 && (
                              <span className={clsx(
                                "text-[11px] font-semibold px-2 py-0.5 rounded-lg border transition-colors",
                                isActive
                                  ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                                  : "bg-slate-200/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-300/40 dark:border-slate-700/50"
                              )}>
                                {libStats.movies.toLocaleString()}
                              </span>
                            )}
                            {item.path === '/shows' && libStats?.shows > 0 && (
                              <span className={clsx(
                                "text-[11px] font-semibold px-2 py-0.5 rounded-lg border transition-colors",
                                isActive
                                  ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                                  : "bg-slate-200/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-300/40 dark:border-slate-700/50"
                              )}>
                                {libStats.shows.toLocaleString()}
                              </span>
                            )}
                            {item.name === 'Requests' && pendingRequests > 0 && (
                              <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                                {pendingRequests}
                              </span>
                            )}
                            {item.name === 'Downloads' && downloads.length > 0 && (
                              <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                                {downloads.length}
                              </span>
                            )}
                            {item.name === 'Watchers' && watcherCount > 0 && (
                              <span className="bg-cyan-500/20 text-cyan-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-cyan-500/30">
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

        {/* Bottom action row: Logout + Status + Donate side by side */}
        <div className="px-3 pb-4 pt-3 flex gap-1.5 mt-auto border-t border-slate-200/80 dark:border-slate-800/80" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
          {hasToken && (
            <button
              onClick={handleLogout}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-200/60 dark:bg-slate-800/50 border border-slate-300/40 dark:border-white/5 text-slate-500 dark:text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 dark:hover:border-rose-500/20 transition-all duration-200 text-xs font-medium"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          )}

          <NavLink
            to="/status"
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => clsx(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border transition-all duration-200 text-xs font-medium relative group",
              isActive
                ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                : systemIssues.length > 0
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                  : "bg-slate-200/60 dark:bg-slate-800/50 border-slate-300/40 dark:border-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-300/60 dark:hover:bg-slate-700/50 hover:text-slate-700 dark:hover:text-slate-200"
            )}
            title={systemIssues.length > 0 ? `${systemIssues.length} System Issues` : "System Healthy"}
          >
            <div className="relative flex items-center">
              <Activity className={clsx("w-3.5 h-3.5", systemIssues.length > 0 ? "text-amber-400" : "text-emerald-400")} />
              <span className={clsx(
                "absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full",
                systemIssues.length > 0 ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
              )} />
            </div>
            <span>Status</span>
          </NavLink>

          <a
            href="https://www.paypal.com/donate/?business=C5EDZZUFSMX4J&no_recurring=0&item_name=Thanks+for+the+coffee&currency_code=EUR"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/35 transition-all duration-200 text-xs font-medium group"
            title="Support Atlas"
          >
            <Heart className="w-3.5 h-3.5 group-hover:scale-110 transition-transform duration-200 fill-rose-400/30 group-hover:fill-rose-400/60" />
            <span>Donate</span>
          </a>
        </div>

      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 w-full overflow-y-auto overflow-x-hidden relative z-10">
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 w-full max-w-full overflow-x-hidden">
          <Outlet />
        </div>
      </main>


    </div>
  );
}
