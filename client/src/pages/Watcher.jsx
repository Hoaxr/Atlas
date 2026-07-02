import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Play, Pause, Tv, Film, User, Activity, Trophy, Monitor, Zap, Wifi, Clock, Subtitles, HardDrive, Volume2, Video, TrendingUp, Hash, Eye, MonitorPlay, RotateCcw, History, BarChart3 } from 'lucide-react';
import { customAlert } from '../utils/alerts';
import { formatRelativeTime } from '../lib/format';
import Spinner from '../components/shared/Spinner';

export default function Watcher() {
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetchSessions();
    fetchStats();
    const interval = setInterval(() => {
      fetchSessions();
      fetchStats();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const res = await api.get('/watcher/stats');
      if (res.data.status === 'success') {
        setStats(res.data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await api.get('/watcher/sessions');
      if (res.data.status === 'success') {
        setSessions(res.data.data);
      }
    } catch (err) {
      console.error(err);
      customAlert('Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  };

  if (loading && sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner color="border-cyan-400" />
      </div>
    );
  }

  const formatTime = (ms) => {
    if (!ms || ms < 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };


  const handleResetStats = async () => {
    if (!confirm('Are you sure you want to reset all watcher statistics? This cannot be undone.')) return;
    setResetting(true);
    try {
      await api.delete('/watcher/stats');
      setStats(null);
      customAlert('Watcher statistics have been reset');
      // Refetch empty stats
      fetchStats();
    } catch (err) {
      customAlert('Failed to reset statistics');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 sm:gap-3">
        <Activity className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 shrink-0" />
        <div>
          <h1 className="text-xl sm:text-3xl font-black tracking-wider text-slate-100">Watchers</h1>
          <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block">Monitor active streams across your media servers.</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-20 bg-slate-900/50 rounded-2xl border border-white/5">
          <Tv className="w-16 h-16 text-slate-700 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-300">Nothing playing</h2>
          <p className="text-slate-500 mt-2">No active sessions found across your media servers.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessions.map(session => (
            <div key={session.id} className="bg-slate-900/40 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl relative overflow-hidden group flex flex-col">
              {/* Background Glow based on poster (optional, but we can just use a subtle gradient) */}
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 pointer-events-none" />

              <div className="p-5 relative z-10 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2 text-slate-300 text-sm font-semibold bg-slate-800/80 px-3 py-1.5 rounded-full border border-white/5">
                    <User className="w-4 h-4 text-cyan-400" />
                    {session.user}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-1 bg-slate-800/80 text-slate-300 rounded-lg border border-white/5">
                      {session.server}
                    </span>
                    {session.state === 'playing' ? (
                      <div className="bg-emerald-500/20 p-1.5 rounded-full border border-emerald-500/30">
                        <Play className="w-4 h-4 text-emerald-400 fill-emerald-400/20" />
                      </div>
                    ) : (
                      <div className="bg-amber-500/20 p-1.5 rounded-full border border-amber-500/30">
                        <Pause className="w-4 h-4 text-amber-400 fill-amber-400/20" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-4 items-center mt-2">
                  <div className="w-16 h-24 bg-slate-800/80 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden shadow-lg border border-white/5 relative group-hover:scale-105 transition-transform duration-300">
                    {session.poster ? (
                      <img 
                        src={session.poster} 
                        alt={session.title} 
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextElementSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    
                    <div className={session.poster ? 'hidden' : 'flex w-full h-full items-center justify-center'}>
                      {session.type === 'movie' ? (
                        <Film className="w-8 h-8 text-slate-500" />
                      ) : (
                        <Tv className="w-8 h-8 text-slate-500" />
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg text-slate-100 line-clamp-2 leading-tight group-hover:text-cyan-400 transition-colors">
                      {session.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <p className="text-sm text-slate-400 flex items-center gap-1.5 font-medium bg-slate-800/50 px-2.5 py-1 rounded-md border border-white/5">
                        <span className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${session.state === 'playing' ? 'bg-emerald-500 text-emerald-500' : 'bg-amber-500 text-amber-500'}`}></span>
                        {session.player}
                      </p>
                      {/* Sub-line: product for Plex, device/platform for Jellyfin/Emby */}
                      {((session.product && session.product !== session.player) || session.platform) && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 bg-slate-800/30 px-2 py-1 rounded-md border border-white/5">
                          <Monitor className="w-3 h-3" />
                          {session.product !== session.player ? session.product : session.platform}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stream Details */}
                {(session.quality || session.videoLabel || session.audioLabel) && (
                  <div className="mt-4 space-y-1.5 p-3 bg-slate-800/30 rounded-xl border border-white/5">
                    {session.quality && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 font-medium w-20 flex-shrink-0">Quality</span>
                        <span className="text-slate-300 font-semibold">{session.quality}</span>
                      </div>
                    )}
                    {session.videoDecision && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 font-medium w-20 flex-shrink-0">Stream</span>
                        <span className={`font-semibold ${session.videoDecision === 'Direct Play' ? 'text-emerald-400' : session.videoDecision === 'Direct Stream' ? 'text-amber-400' : 'text-orange-400'}`}>
                          {session.videoDecision}
                        </span>
                      </div>
                    )}
                    {session.container && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 font-medium w-20 flex-shrink-0">Container</span>
                        <span className="text-slate-300 font-semibold flex items-center gap-1">
                          <HardDrive className="w-3 h-3 text-slate-500" />
                          {session.videoDecision === 'Direct Play' ? 'Direct Play' : session.videoDecision === 'Direct Stream' ? 'Direct Stream' : 'Transcode'}
                          {session.container ? ` (${session.container})` : ''}
                        </span>
                      </div>
                    )}
                    {session.videoLabel && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 font-medium w-20 flex-shrink-0">Video</span>
                        <span className={`font-semibold flex items-center gap-1 ${session.videoDecision === 'Direct Play' ? 'text-emerald-400' : session.videoDecision === 'Direct Stream' ? 'text-amber-400' : 'text-orange-400'}`}>
                          <Video className="w-3 h-3" />
                          {session.videoDecision === 'Direct Play' ? 'Direct Play' : session.videoDecision === 'Direct Stream' ? 'Direct Stream' : 'Transcode'}
                          {session.videoLabel ? ` (${session.videoLabel})` : ''}
                        </span>
                      </div>
                    )}
                    {session.audioLabel && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 font-medium w-20 flex-shrink-0">Audio</span>
                        <span className={`font-semibold flex items-center gap-1 ${session.audioDecision === 'Direct Play' ? 'text-emerald-400' : 'text-orange-400'}`}>
                          <Volume2 className="w-3 h-3" />
                          {session.audioDecision === 'Direct Play' ? 'Direct Play' : 'Transcode'}
                          {session.audioLabel ? ` [${session.audioLabel}]` : ''}
                        </span>
                      </div>
                    )}
                    {session.subtitleLabel && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 font-medium w-20 flex-shrink-0">Subtitle</span>
                        <span className={`font-semibold flex items-center gap-1 ${session.subtitleDecision === 'Direct Play' ? 'text-emerald-400' : 'text-orange-400'}`}>
                          <Subtitles className="w-3 h-3" />
                          {session.subtitleDecision === 'Direct Play' ? 'Direct Play' : 'Transcode'}
                          {session.subtitleLabel ? ` [${session.subtitleLabel}]` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Location & Bandwidth & ETA */}
                {(session.location || session.bandwidth || session.eta) && (
                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                    {session.location && (
                      <span className="flex items-center gap-1 bg-slate-800/50 px-2 py-1 rounded-md border border-white/5">
                        <Wifi className="w-3 h-3" />
                        {session.location}
                      </span>
                    )}
                    {session.bandwidth && (
                      <span className="flex items-center gap-1 bg-slate-800/50 px-2 py-1 rounded-md border border-white/5">
                        <Zap className="w-3 h-3" />
                        {session.bandwidth} Mbps
                      </span>
                    )}
                    {session.eta && (
                      <span className="flex items-center gap-1 bg-slate-800/50 px-2 py-1 rounded-md border border-white/5 ml-auto">
                        <Clock className="w-3 h-3" />
                        ETA: {session.eta}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {session.timeTotal > 0 && (
                <div className="px-5 pb-5 relative z-10">
                  <div className="w-full h-1.5 bg-slate-800/80 rounded-full overflow-hidden mb-2 border border-white/5">
                    <div 
                      className="h-full bg-cyan-400 transition-all duration-1000 ease-linear shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                      style={{ width: `${session.progress || 0}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs font-semibold text-slate-400 tracking-wide">
                    <span>{formatTime(session.timeOffset)}</span>
                    <span>{formatTime(session.timeTotal)}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Stats Section */}
      {stats && (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Trophy className="w-6 h-6 text-amber-400" />
              <h2 className="text-2xl font-bold text-slate-200">Leaderboards</h2>
            </div>
            <button
              onClick={handleResetStats}
              disabled={resetting}
              className="px-4 py-2 text-xs font-bold text-slate-400 bg-slate-800/50 hover:bg-red-500/10 hover:text-red-400 border border-slate-700/50 hover:border-red-500/30 rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
              Reset Stats
            </button>
          </div>

          {/* Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-center gap-4">
              <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
                <Eye className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-100">{stats.overview?.totalPlays || 0}</p>
                <p className="text-xs text-slate-400 font-medium">Total Plays</p>
              </div>
            </div>
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-center gap-4">
              <div className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/20">
                <User className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-100">{stats.overview?.uniqueUsers || 0}</p>
                <p className="text-xs text-slate-400 font-medium">Unique Users</p>
              </div>
            </div>
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-center gap-4">
              <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <Hash className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-100">{stats.overview?.uniqueTitles || 0}</p>
                <p className="text-xs text-slate-400 font-medium">Unique Titles</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Most Watched Movies */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
                <Film className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-slate-200">Most Watched Movies</h3>
              </div>
              <ul className="space-y-2">
                {stats.topMovies?.length > 0 ? stats.topMovies.map((item, idx) => (
                  <li key={item.id || `topMovies-${item.title}-${idx}`} className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-lg border border-white/5 group hover:bg-slate-800/60 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-500 w-5 flex-shrink-0">{idx + 1}</span>
                      <span className="text-slate-300 font-medium truncate">{item.title}</span>
                    </div>
                    <span className="bg-cyan-500/20 text-cyan-400 text-xs font-bold px-2 py-0.5 rounded-md flex-shrink-0 ml-2">{item.plays}</span>
                  </li>
                )) : <li className="text-slate-500 text-sm italic text-center py-4 bg-slate-800/20 rounded-lg">No data yet.</li>}
              </ul>
            </div>

            {/* Most Watched Shows */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
                <Tv className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-bold text-slate-200">Most Watched Shows</h3>
              </div>
              <ul className="space-y-2">
                {stats.topShows?.length > 0 ? stats.topShows.map((item, idx) => (
                  <li key={item.id || `topShows-${item.title}-${idx}`} className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-lg border border-white/5 group hover:bg-slate-800/60 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-500 w-5 flex-shrink-0">{idx + 1}</span>
                      <span className="text-slate-300 font-medium truncate">{item.title}</span>
                    </div>
                    <span className="bg-purple-500/20 text-purple-400 text-xs font-bold px-2 py-0.5 rounded-md flex-shrink-0 ml-2">{item.plays}</span>
                  </li>
                )) : <li className="text-slate-500 text-sm italic text-center py-4 bg-slate-800/20 rounded-lg">No data yet.</li>}
              </ul>
            </div>

            {/* Most Active Users */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
                <User className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-slate-200">Most Active Users</h3>
              </div>
              <ul className="space-y-2">
                {stats.topUsers?.length > 0 ? stats.topUsers.map((item, idx) => (
                  <li key={item.id || `topUsers-${item.user}-${idx}`} className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-lg border border-white/5 group hover:bg-slate-800/60 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-500 w-5 flex-shrink-0">{idx + 1}</span>
                      <span className="text-slate-300 font-medium truncate">{item.user}</span>
                    </div>
                    <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-0.5 rounded-md flex-shrink-0 ml-2">{item.plays}</span>
                  </li>
                )) : <li className="text-slate-500 text-sm italic text-center py-4 bg-slate-800/20 rounded-lg">No data yet.</li>}
              </ul>
            </div>

            {/* Most Popular Movies (by unique users) */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
                <TrendingUp className="w-5 h-5 text-sky-400" />
                <h3 className="text-lg font-bold text-slate-200">Most Popular Movies</h3>
              </div>
              <ul className="space-y-2">
                {stats.popularMovies?.length > 0 ? stats.popularMovies.map((item, idx) => (
                  <li key={item.id || `popularMovies-${item.title}-${idx}`} className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-lg border border-white/5 group hover:bg-slate-800/60 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-500 w-5 flex-shrink-0">{idx + 1}</span>
                      <span className="text-slate-300 font-medium truncate">{item.title}</span>
                    </div>
                    <span className="bg-sky-500/20 text-sky-400 text-xs font-bold px-2 py-0.5 rounded-md flex-shrink-0 ml-2">{item.users} {item.users === 1 ? 'user' : 'users'}</span>
                  </li>
                )) : <li className="text-slate-500 text-sm italic text-center py-4 bg-slate-800/20 rounded-lg">No data yet.</li>}
              </ul>
            </div>

            {/* Most Popular Shows (by unique users) */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
                <TrendingUp className="w-5 h-5 text-rose-400" />
                <h3 className="text-lg font-bold text-slate-200">Most Popular Shows</h3>
              </div>
              <ul className="space-y-2">
                {stats.popularShows?.length > 0 ? stats.popularShows.map((item, idx) => (
                  <li key={item.id || `popularShows-${item.title}-${idx}`} className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-lg border border-white/5 group hover:bg-slate-800/60 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-500 w-5 flex-shrink-0">{idx + 1}</span>
                      <span className="text-slate-300 font-medium truncate">{item.title}</span>
                    </div>
                    <span className="bg-rose-500/20 text-rose-400 text-xs font-bold px-2 py-0.5 rounded-md flex-shrink-0 ml-2">{item.users} {item.users === 1 ? 'user' : 'users'}</span>
                  </li>
                )) : <li className="text-slate-500 text-sm italic text-center py-4 bg-slate-800/20 rounded-lg">No data yet.</li>}
              </ul>
            </div>

            {/* Recently Watched */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
                <History className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold text-slate-200">Recently Watched</h3>
              </div>
              <ul className="space-y-2">
                {stats.recent?.length > 0 ? stats.recent.map((item, idx) => (
                  <li key={item.id || `recent-${item.title}-${item.user}-${idx}`} className="flex items-center gap-3 bg-slate-800/40 p-2.5 rounded-lg border border-white/5 group hover:bg-slate-800/60 transition-colors">
                    <div className={`p-1.5 rounded-lg flex-shrink-0 ${item.type === 'movie' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-purple-500/10 text-purple-400'}`}>
                      {item.type === 'movie' ? <Film className="w-3.5 h-3.5" /> : <Tv className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-300 font-medium truncate">{item.title}</p>
                      <p className="text-[10px] text-slate-500">{item.user} · {formatRelativeTime(item.created_at)}</p>
                    </div>
                  </li>
                )) : <li className="text-slate-500 text-sm italic text-center py-4 bg-slate-800/20 rounded-lg">No data yet.</li>}
              </ul>
            </div>

            {/* Most Active Platforms */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl lg:col-span-1">
              <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
                <MonitorPlay className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-bold text-slate-200">Most Active Platforms</h3>
              </div>
              <ul className="space-y-2">
                {stats.topPlatforms?.length > 0 ? stats.topPlatforms.map((item, idx) => (
                  <li key={item.id || `topPlatforms-${item.player}-${idx}`} className="flex justify-between items-center bg-slate-800/40 p-2.5 rounded-lg border border-white/5 group hover:bg-slate-800/60 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-500 w-5 flex-shrink-0">{idx + 1}</span>
                      <span className="text-slate-300 font-medium truncate">{item.player || 'Unknown'}</span>
                    </div>
                    <span className="bg-indigo-500/20 text-indigo-400 text-xs font-bold px-2 py-0.5 rounded-md flex-shrink-0 ml-2">{item.plays}</span>
                  </li>
                )) : <li className="text-slate-500 text-sm italic text-center py-4 bg-slate-800/20 rounded-lg">No data yet.</li>}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
