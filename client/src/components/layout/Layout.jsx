import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Settings as SettingsIcon, Film, Activity, Tv as TvIcon, DownloadCloud, ArrowDown, ArrowUp, Heart, Menu, Calendar as CalendarIcon, BarChart3, Keyboard, Key, LogOut, Eye, X } from 'lucide-react';
import Logo from './Logo';
import clsx from 'clsx';
import api from '../../lib/api';
import useWebSocket from '../../lib/useWebSocket';
import { setCachedMovies, setCachedShows } from '../../lib/libraryCache';
import useKeyboardShortcuts from '../../lib/useKeyboardShortcuts';
import ShortcutsModal from '../shared/ShortcutsModal';

const navSections = [
  {
    title: 'Media Hub',
    items: [
      { name: 'Discover', path: '/discover', icon: Search },
      { name: 'Movies', path: '/movies', icon: Film },
      { name: 'TV Shows', path: '/shows', icon: TvIcon },
      { name: 'Calendar', path: '/calendar', icon: CalendarIcon },
    ]
  },
  {
    title: 'Operations',
    items: [
      { name: 'Downloads', path: '/downloads', icon: DownloadCloud },
      { name: 'Requests', path: '/requests', icon: Heart },
      { name: 'Statistics', path: '/stats', icon: BarChart3 },
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
  const location = useLocation();
  const isDetailPage = /^\/(movies|shows)\/\d+$/.test(location.pathname);
  const isLibraryPage = /^\/(movies|shows)$/.test(location.pathname);
  const isDiscoverPage = location.pathname === '/discover';
  const isCalendarPage = location.pathname === '/calendar';
  const isDownloadsPage = location.pathname === '/downloads';
  const isStatsPage = location.pathname === '/stats';
  const isRequestsPage = location.pathname === '/requests';
  const isTasksPage = location.pathname === '/tasks';
  const isWatcherPage = location.pathname === '/watcher';
  const isSettingsPage = location.pathname === '/settings';
  const [libStats, setLibStats] = useState({ movies: 0, shows: 0 });
  const [clientStats, setClientStats] = useState({ dl_info_speed: 0, up_info_speed: 0 });
  const [downloads, setDownloads] = useState([]);
  const [clientConnected, setClientConnected] = useState(null);
  const [systemIssues, setSystemIssues] = useState([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const [watcherCount, setWatcherCount] = useState(0);

  const handleLogout = () => {
    localStorage.removeItem('atlas_token');
    localStorage.removeItem('atlas_user');
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
  }, [onEvent]);

  // Global keyboard shortcuts
  useKeyboardShortcuts({
    'g m': () => navigate('/movies'),
    'g s': () => navigate('/shows'),
    'g d': () => navigate('/discover'),
    'g c': () => navigate('/calendar'),
    'g t': () => navigate('/tasks'),
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

  const formatSpeed = (bytes) => {
    if (!bytes || bytes === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
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


        <nav className="flex-1 px-3 py-2 space-y-4 overflow-y-auto hide-scrollbar">
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

        <div className="px-3 mt-auto pb-4">
          <div className="space-y-1">
            <div className="flex items-center px-4 mb-2">
              <h3 className="text-[10px] font-black text-slate-800 dark:text-white uppercase tracking-widest opacity-90">
                Overview
              </h3>
              <div className="flex-1 h-px bg-gradient-to-r from-slate-400/50 dark:from-white/30 to-transparent mt-0.5"></div>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-white/5 transition-colors cursor-default">
                <div className="flex items-center gap-3">
                  <Film className="w-4 h-4 text-cyan-500/70" />
                  <span className="text-sm font-medium">Movies</span>
                </div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-300 bg-slate-200/50 dark:bg-slate-800/80 px-2 py-0.5 rounded-md">
                  {libStats.movies.toLocaleString()}
                </span>
              </div>
              
              <div className="flex items-center justify-between px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-white/5 transition-colors cursor-default">
                <div className="flex items-center gap-3">
                  <TvIcon className="w-4 h-4 text-purple-500/70" />
                  <span className="text-sm font-medium">Shows</span>
                </div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-300 bg-slate-200/50 dark:bg-slate-800/80 px-2 py-0.5 rounded-md">
                  {libStats.shows.toLocaleString()}
                </span>
              </div>

              <NavLink 
                to="/status" 
                onClick={() => setSidebarOpen(false)}
                className="flex items-center justify-between px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-white/5 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Activity className={`w-4 h-4 ${systemIssues.length > 0 ? 'text-amber-500/70 group-hover:text-amber-500' : 'text-emerald-500/70 group-hover:text-emerald-500'} transition-colors`} />
                  <span className="text-sm font-medium">Status</span>
                </div>
                {systemIssues.length > 0 ? (
                  <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    {systemIssues.length} Issues
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                    Healthy
                  </span>
                )}
              </NavLink>
            </div>
          </div>
        </div>

        {/* Bottom action row: Logout + Donate side by side */}
        <div className="px-3 pb-4 pt-1 flex gap-2">
          {hasToken && (
            <button
              onClick={handleLogout}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-200/60 dark:bg-slate-800/50 border border-slate-300/40 dark:border-white/5 text-slate-500 dark:text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 dark:hover:border-rose-500/20 transition-all duration-200 text-sm font-medium"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          )}
          <a
            href="https://www.paypal.com/donate/?business=C5EDZZUFSMX4J&no_recurring=0&item_name=Thanks+for+the+coffee&currency_code=EUR"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/35 transition-all duration-200 text-sm font-medium group"
            title="Support Atlas"
          >
            <Heart className="w-4 h-4 group-hover:scale-110 transition-transform duration-200 fill-rose-400/30 group-hover:fill-rose-400/60" />
            <span>Donate</span>
          </a>
        </div>

      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative z-10">
        {/* Mobile header */}
        <div className={`lg:hidden flex items-center justify-between p-4 glass-panel ${isDetailPage || isLibraryPage || isDiscoverPage || isCalendarPage || isDownloadsPage || isStatsPage || isRequestsPage || isTasksPage || isWatcherPage || isSettingsPage ? 'hidden' : ''}`}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
          </button>
          <span className="text-xl font-black bg-gradient-to-r from-cyan-300 via-cyan-400 to-sky-400 bg-clip-text text-transparent">
            Atlas
          </span>
        </div>

        {/* Download speed indicator - mobile */}
        <div className={`lg:hidden px-4 py-2 flex items-center gap-4 text-xs text-slate-500 ${isDetailPage || isLibraryPage || isDiscoverPage || isCalendarPage || isDownloadsPage || isStatsPage || isRequestsPage || isTasksPage || isWatcherPage || isSettingsPage ? 'hidden' : ''}`}>
          {downloads.length > 0 && (
            <>
              <span className="flex items-center gap-1"><ArrowDown className="w-3 h-3 text-emerald-400" /> {formatSpeed(clientStats.dl_info_speed)}</span>
              <span className="flex items-center gap-1"><ArrowUp className="w-3 h-3 text-slate-400" /> {formatSpeed(clientStats.up_info_speed)}</span>
            </>
          )}
        </div>

        <div className="p-4 md:p-6 lg:p-8 w-full">
          <Outlet />
        </div>
      </main>


    </div>
  );
}
