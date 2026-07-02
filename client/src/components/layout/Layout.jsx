import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Search, Settings as SettingsIcon, Film, Activity, Tv as TvIcon, DownloadCloud, ArrowDown, ArrowUp, Heart, Menu, Calendar as CalendarIcon, BarChart3, Keyboard, Key, LogOut, Eye } from 'lucide-react';
import Logo from './Logo';
import clsx from 'clsx';
import api from '../../lib/api';
import useWebSocket from '../../lib/useWebSocket';
import { setCachedMovies, setCachedShows } from '../../lib/libraryCache';
import useKeyboardShortcuts from '../../lib/useKeyboardShortcuts';
import ShortcutsModal from '../shared/ShortcutsModal';
import ChangePasswordModal from '../ChangePasswordModal';

const navItems = [
  { name: 'Discover', path: '/discover', icon: Search },
  { name: 'Movies', path: '/movies', icon: Film },
  { name: 'TV Shows', path: '/shows', icon: TvIcon },
  { name: 'Calendar', path: '/calendar', icon: CalendarIcon },
  { name: 'Downloads', path: '/downloads', icon: DownloadCloud },
  { name: 'Statistics', path: '/stats', icon: BarChart3 },
  { name: 'Requests', path: '/requests', icon: Heart },
  { name: 'Tasks', path: '/tasks', icon: Activity },
  { name: 'Watchers', path: '/watcher', icon: Eye },
  { name: 'Settings', path: '/settings', icon: SettingsIcon },
];

export default function Layout() {
  const { onEvent } = useWebSocket(); // Connect to real-time event stream
  const navigate = useNavigate();
  const location = useLocation();
  const isDetailPage = /^\/(movies|shows)\/\d+$/.test(location.pathname);
  const [libStats, setLibStats] = useState({ movies: 0, shows: 0 });
  const [clientStats, setClientStats] = useState({ dl_info_speed: 0, up_info_speed: 0 });
  const [downloads, setDownloads] = useState([]);
  const [clientConnected, setClientConnected] = useState(null);
  const [systemIssues, setSystemIssues] = useState([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [watcherCount, setWatcherCount] = useState(0);

  const handleLogout = () => {
    localStorage.removeItem('atlas_token');
    localStorage.removeItem('atlas_user');
    navigate('/login');
  };

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
        api.get('/library/movies?sort=added_desc'),
        api.get('/library/shows?sort=added_desc')
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
    });

    const fetchData = async () => {
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
        console.error('Failed to fetch data', err);
      }
    };
    fetchData();
    prefetchLibrary();

    const startPolling = () => {
      const interval = setInterval(fetchData, 3000);
      return interval;
    };

    let interval = startPolling();

    const onVisibility = () => {
      if (document.hidden) {
        clearInterval(interval);
      } else {
        fetchData();
        interval = startPolling();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
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
          'w-64 border-r dark:border-white/10 border-slate-200/60 flex flex-col fixed lg:relative z-50 h-full transition-transform duration-300',
          'bg-white/85 dark:bg-slate-950/95 backdrop-blur-xl',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="p-6 pb-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Logo className="w-12 h-12" />
            <span className="text-3xl font-black tracking-wider drop-shadow-[0_0_12px_rgba(6,182,212,0.4)]">
              <span className="bg-gradient-to-r from-cyan-300 via-cyan-400 to-sky-400 bg-clip-text text-transparent">
                Atlas
              </span>
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/50 border border-slate-200/60 dark:border-white/5 hover:bg-rose-500/10 dark:hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400"
            title="Logout"
            aria-label="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>


        <nav className="flex-1 px-4 py-2 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500',
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5 border border-transparent'
                )
              }
            >
              <div className="flex items-center space-x-3">
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
              </div>
              <div className="flex items-center space-x-2">
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
            </NavLink>
          ))}
        </nav>

        <div className="p-4 mt-auto space-y-4 max-h-[50vh] overflow-y-auto hide-scrollbar pb-6">
          <div className="hidden lg:block bg-slate-100 border border-slate-200/60 dark:bg-slate-900/50 dark:border-white/5 p-5 rounded-2xl flex flex-col gap-4">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Library</h3>
            <div className="flex justify-between items-center text-sm py-1">
              <span className="text-slate-500 dark:text-slate-300 flex items-center gap-2"><Film className="w-4 h-4 text-cyan-500" /> Movies</span>
              <span className="font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-white px-2 py-0.5 rounded-md">{libStats.movies}</span>
            </div>
            <div className="flex justify-between items-center text-sm py-1">
              <span className="text-slate-500 dark:text-slate-300 flex items-center gap-2"><TvIcon className="w-4 h-4 text-purple-500" /> Shows</span>
              <span className="font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-white px-2 py-0.5 rounded-md">{libStats.shows}</span>
            </div>
          </div>
          
          <NavLink to="/status" onClick={() => setSidebarOpen(false)} className="bg-slate-100 border border-slate-200/60 dark:bg-slate-900/50 dark:border-white/5 p-4 rounded-2xl flex items-center space-x-3 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer group">
            <div className={`p-2.5 rounded-xl shrink-0 transition-colors ${systemIssues.length > 0 ? 'bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20'}`}>
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">System Status</p>
              <p className={`text-sm font-bold ${systemIssues.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {systemIssues.length > 0 ? `${systemIssues.length} Issue${systemIssues.length > 1 ? 's' : ''}` : 'Healthy'}
              </p>
            </div>
          </NavLink>
        </div>

        {/* Donate Button */}
        <a
          href="https://www.paypal.com/donate/?business=C5EDZZUFSMX4J&no_recurring=0&item_name=Thanks+for+the+coffee&currency_code=EUR"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden lg:flex mx-4 mb-2 px-4 py-3 rounded-2xl items-center justify-center gap-2 bg-gradient-to-r from-rose-500/20 to-pink-500/20 border border-rose-500/30 text-rose-300 hover:from-rose-500/30 hover:to-pink-500/30 hover:text-rose-200 hover:border-rose-500/50 transition-all duration-300 group"
        >
          <Heart className="w-4 h-4 group-hover:scale-110 transition-transform duration-300 fill-rose-400/30 group-hover:fill-rose-400/60" />
          <span className="text-sm font-semibold">Donate</span>
        </a>

      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative z-10">
        {/* Mobile header */}
        <div className={`lg:hidden flex items-center justify-between p-4 glass-panel ${isDetailPage ? 'hidden' : ''}`}>
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
        <div className={`lg:hidden px-4 py-2 flex items-center gap-4 text-xs text-slate-500 ${isDetailPage ? 'hidden' : ''}`}>
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

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </div>
  );
}
