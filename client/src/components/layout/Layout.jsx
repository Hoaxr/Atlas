import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Search, Settings as SettingsIcon, Film, Activity, Tv as TvIcon, DownloadCloud, ArrowDown, ArrowUp } from 'lucide-react';
import clsx from 'clsx';
import axios from 'axios';

const navItems = [
  { name: 'Discover', path: '/discover', icon: Search },
  { name: 'Movies', path: '/movies', icon: Film },
  { name: 'TV Shows', path: '/shows', icon: TvIcon },
  { name: 'Downloads', path: '/downloads', icon: DownloadCloud },
  { name: 'Tasks', path: '/tasks', icon: Activity },
  { name: 'Settings', path: '/settings', icon: SettingsIcon },
];

export default function Layout() {
  const [libStats, setLibStats] = useState({ movies: 0, shows: 0 });
  const [clientStats, setClientStats] = useState({ dl_info_speed: 0, up_info_speed: 0 });
  const [downloads, setDownloads] = useState([]);
  const [clientConnected, setClientConnected] = useState(null);
  const [systemIssues, setSystemIssues] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [libRes, statsRes, torrentsRes, issuesRes] = await Promise.allSettled([
          axios.get('http://localhost:3000/api/library/stats'),
          axios.get('http://localhost:3000/api/clients/stats'),
          axios.get('http://localhost:3000/api/clients/torrents'),
          axios.get('http://localhost:3000/api/settings/issues')
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
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  const formatSpeed = (bytes) => {
    if (!bytes || bytes === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      {/* Sidebar */}
      <aside className="w-64 glass border-r border-white/10 flex flex-col">
        <div className="p-6 flex items-center space-x-3">
          <Film className="w-8 h-8 text-cyan-400" />
          <span className="text-2xl font-black tracking-tight text-white">
            Media<span className="text-cyan-400">Manager</span>
          </span>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                clsx(
                  'flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500',
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
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

        <div className="p-4 mt-auto space-y-4 max-h-[50vh] overflow-y-auto no-scrollbar pb-6">
          <div className="bg-slate-900/50 border border-white/5 p-4 rounded-2xl flex flex-col gap-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Library</h3>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-300 flex items-center gap-2"><Film className="w-4 h-4 text-cyan-400" /> Movies</span>
              <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded-md">{libStats.movies}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-300 flex items-center gap-2"><TvIcon className="w-4 h-4 text-purple-400" /> Shows</span>
              <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded-md">{libStats.shows}</span>
            </div>
          </div>
          
          <NavLink to="/issues" className="bg-slate-900/50 border border-white/5 p-4 rounded-2xl flex items-center space-x-3 hover:bg-slate-800 transition-colors cursor-pointer group">
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

          <div className="bg-slate-900/50 border border-white/5 p-4 rounded-2xl flex items-center space-x-3">
            <div className={`p-2.5 rounded-xl shrink-0 ${clientConnected === null ? 'bg-slate-500/10 text-slate-400' : clientConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
              <DownloadCloud className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Download Client</p>
              <p className={`text-sm font-bold ${clientConnected === null ? 'text-slate-400' : clientConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                {clientConnected === null ? 'Loading...' : clientConnected ? 'Connected' : 'Disconnected'}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative z-10">
        <div className="p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
