import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Search, Settings as SettingsIcon, Film, Activity, Tv as TvIcon, DownloadCloud, ArrowDown, ArrowUp, Heart, Menu, Calendar as CalendarIcon, BarChart3, Keyboard } from 'lucide-react';
import Logo from './Logo';
import clsx from 'clsx';
import api from '../../lib/api';
import useWebSocket from '../../lib/useWebSocket';
import { setCachedMovies, setCachedShows } from '../../lib/libraryCache';
import useKeyboardShortcuts from '../../lib/useKeyboardShortcuts';
import ShortcutsModal from '../shared/ShortcutsModal';

const navItems = [
  { name: 'Discover', path: '/discover', icon: Search },
  { name: 'Movies', path: '/movies', icon: Film },
  { name: 'TV Shows', path: '/shows', icon: TvIcon },
  { name: 'Calendar', path: '/calendar', icon: CalendarIcon },
  { name: 'Downloads', path: '/downloads', icon: DownloadCloud },
  { name: 'Stats', path: '/stats', icon: BarChart3 },
  { name: 'Tasks', path: '/tasks', icon: Activity },
  { name: 'Settings', path: '/settings', icon: SettingsIcon },
];

export default function Layout() {
  useWebSocket(); // Connect to real-time event stream
  const navigate = useNavigate();
  const [libStats, setLibStats] = useState({ movies: 0, shows: 0 });
  const [clientStats, setClientStats] = useState({ dl_info_speed: 0, up_info_speed: 0 });
  const [downloads, setDownloads] = useState([]);
  const [clientConnected, setClientConnected] = useState(null);
  const [systemIssues, setSystemIssues] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Prefetch library data into shared cache so Dashboard loads instantly
  const prefetchLibrary = async () => {
    try {
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
    const fetchData = async () => {
      try {
        const [libRes, statsRes, torrentsRes, issuesRes] = await Promise.allSettled([
          api.get('/library/stats'),
          api.get('/clients/stats'),
          api.get('/clients/torrents'),
          api.get('/settings/issues')
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
    };
  }, []);

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
        <div className="p-6 flex items-center space-x-3">
          <Logo className="w-12 h-12" />
          <span className="text-3xl font-black tracking-wider drop-shadow-[0_0_12px_rgba(6,182,212,0.4)]">
            <span className="bg-gradient-to-r from-cyan-300 via-cyan-400 to-sky-400 bg-clip-text text-transparent">
              Atlas
            </span>
          </span>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2">
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
              {item.name === 'Downloads' && downloads.length > 0 && (
                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                  {downloads.length}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 mt-auto space-y-4 max-h-[50vh] overflow-y-auto hide-scrollbar pb-6">
          <div className="bg-slate-100 border border-slate-200/60 dark:bg-slate-900/50 dark:border-white/5 p-4 rounded-2xl flex flex-col gap-3">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Library</h3>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 dark:text-slate-300 flex items-center gap-2"><Film className="w-4 h-4 text-cyan-500" /> Movies</span>
              <span className="font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-white px-2 py-0.5 rounded-md">{libStats.movies}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
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
          className="mx-4 mb-4 px-4 py-3 rounded-2xl flex items-center justify-center gap-2 bg-gradient-to-r from-rose-500/20 to-pink-500/20 border border-rose-500/30 text-rose-300 hover:from-rose-500/30 hover:to-pink-500/30 hover:text-rose-200 hover:border-rose-500/50 transition-all duration-300 group"
        >
          <Heart className="w-4 h-4 group-hover:scale-110 transition-transform duration-300 fill-rose-400/30 group-hover:fill-rose-400/60" />
          <span className="text-sm font-semibold">Donate</span>
        </a>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative z-10">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between p-4 glass-panel border-b">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
          </button>
          <span className="text-xl font-black bg-gradient-to-r from-cyan-300 via-cyan-400 to-sky-400 bg-clip-text text-transparent">
            Atlas
          </span>
        </div>

        {/* Download speed indicator - mobile */}
        <div className="lg:hidden px-4 py-2 flex items-center gap-4 text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
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
