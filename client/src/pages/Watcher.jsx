import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import useWebSocket from '../lib/useWebSocket';
import {
  Play, Pause, Tv, Film, User, Trophy, Monitor, Zap, Wifi, Clock,
  Subtitles, HardDrive, Volume2, Video, TrendingUp, Hash, Eye,
  MonitorPlay, RotateCcw, History, Loader2
} from 'lucide-react';
import { customAlert, customConfirm } from '../utils/alerts';
import { formatRelativeTime } from '../lib/format';
import EmptyState from '../components/shared/EmptyState';
import LoadingState from '../components/shared/LoadingState';
import StickyBar from '../components/shared/StickyBar';
import { useStickyBar } from '../lib/useStickyBar';

export default function Watcher() {
  const { headerRef, stickyVisible } = useStickyBar();
  const { onEvent } = useWebSocket();
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    // Initial fetch for first paint, then WebSocket takes over
    fetchSessions();
    fetchStats();

    const cleanup = onEvent((data) => {
      if (data.type === 'WATCHERS_UPDATE') {
        if (data.sessions) setSessions(data.sessions);
        if (data.stats) setStats(data.stats);
        setLoading(false);
      }
    });

    return () => cleanup();
  }, [onEvent]);

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
    const confirmed = await customConfirm('Are you sure you want to reset all watcher statistics? This cannot be undone.', {
      title: 'Reset Statistics',
      confirmText: 'Reset',
      type: 'error',
    });
    if (!confirmed) return;
    setResetting(true);
    try {
      await api.delete('/watcher/stats');
      setStats(null);
      customAlert('Watcher statistics have been reset');
      // Re-fetch stats via HTTP (WebSocket will pick up subsequent updates)
      fetchStats();
    } catch {
      customAlert('Failed to reset statistics');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div ref={headerRef} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2.5 sm:gap-3 !mb-0">
              <Eye className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 shrink-0" /> <span className="truncate">Watchers</span>
            </h1>
            <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block !mb-0">
              Monitor active streams across your media servers.
            </p>
          </div>
        </div>
        <LoadingState className="min-h-[40vh] py-16" />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div ref={headerRef} className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2.5 sm:gap-3 !mb-0">
            <Eye className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 shrink-0" /> <span className="truncate">Watchers</span>
          </h1>
          <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block !mb-0">
            Monitor active streams across your media servers.
          </p>
        </div>
        {sessions.length > 0 && (
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-[#101e31] text-cyan-400 border border-[#1c2d46]">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              {sessions.length} {sessions.length === 1 ? 'Stream' : 'Streams'} Active
            </span>
          </div>
        )}
      </div>

      <StickyBar visible={stickyVisible}>
        <div className="flex items-center gap-2 ml-auto sm:hidden text-xs">
          <span className="text-cyan-400 font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            {sessions.length} {sessions.length === 1 ? 'stream' : 'streams'}
          </span>
        </div>
      </StickyBar>

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 sm:p-12 text-center backdrop-blur-sm">
          <EmptyState
            icon="shows"
            title="Nothing playing"
            description="No active sessions found across your connected media servers."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map(session => (
            <div key={session.id} className="bg-slate-900/70 backdrop-blur-sm border border-slate-800 rounded-xl relative overflow-hidden group flex flex-col hover:border-slate-700 transition-colors shadow-sm">
              <div className="p-4 sm:p-5 relative z-10 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2 text-slate-200 text-xs sm:text-sm font-semibold bg-[#101e31] px-3 py-1.5 rounded-xl border border-[#1c2d46]">
                    <User className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="truncate">{session.user}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-1 bg-[#101e31] text-slate-300 rounded-lg border border-[#1c2d46]">
                      {session.server}
                    </span>
                    {session.state === 'playing' ? (
                      <div className="bg-cyan-500/15 p-1.5 rounded-lg border border-cyan-500/30">
                        <Play className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400/20" />
                      </div>
                    ) : (
                      <div className="bg-slate-800/80 p-1.5 rounded-lg border border-slate-700/60">
                        <Pause className="w-3.5 h-3.5 text-slate-400 fill-slate-400/20" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-4 items-center mt-2">
                  <div className="w-16 h-24 sm:w-20 sm:h-28 bg-[#101e31] rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden shadow-lg border border-[#1c2d46] relative group-hover:scale-105 transition-transform duration-300">
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
                    {session.media_id ? (
                      <Link to={session.type === 'movie' ? `/movies/${session.media_id}` : `/shows/${session.media_id}`}>
                        <h3 className="font-bold text-base sm:text-lg text-slate-100 line-clamp-2 leading-tight hover:text-cyan-400 hover:underline transition-colors">
                          {session.title}
                        </h3>
                      </Link>
                    ) : (
                      <h3 className="font-bold text-base sm:text-lg text-slate-100 line-clamp-2 leading-tight group-hover:text-cyan-400 transition-colors">
                        {session.title}
                      </h3>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <p className="text-xs sm:text-sm text-slate-400 flex items-center gap-1.5 font-medium bg-[#101e31] px-2.5 py-1 rounded-lg border border-[#1c2d46]">
                        <span className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${session.state === 'playing' ? 'bg-cyan-400 text-cyan-400' : 'bg-slate-500 text-slate-500'}`}></span>
                        {session.player}
                      </p>
                      {/* Sub-line: product for Plex, device/platform for Jellyfin/Emby */}
                      {((session.product && session.product !== session.player) || session.platform) && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 bg-[#101e31] px-2 py-1 rounded-lg border border-[#1c2d46]">
                          <Monitor className="w-3 h-3 text-slate-500" />
                          {session.product !== session.player ? session.product : session.platform}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stream Details */}
                {(session.quality || session.videoLabel || session.audioLabel) && (
                  <div className="mt-4 space-y-1.5 p-3 bg-[#101e31]/60 rounded-xl border border-[#1c2d46]/70">
                    {session.quality && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 font-medium w-20 flex-shrink-0">Quality</span>
                        <span className="text-slate-200 font-semibold">{session.quality}</span>
                      </div>
                    )}
                    {session.videoDecision && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 font-medium w-20 flex-shrink-0">Stream</span>
                        <span className={`font-semibold ${session.videoDecision === 'Direct Play' ? 'text-cyan-400' : session.videoDecision === 'Direct Stream' ? 'text-sky-300' : 'text-slate-300'}`}>
                          {session.videoDecision}
                        </span>
                      </div>
                    )}
                    {session.container && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 font-medium w-20 flex-shrink-0">Container</span>
                        <span className="text-slate-200 font-semibold flex items-center gap-1">
                          <HardDrive className="w-3 h-3 text-slate-500" />
                          {session.videoDecision === 'Direct Play' ? 'Direct Play' : session.videoDecision === 'Direct Stream' ? 'Direct Stream' : 'Transcode'}
                          {session.container ? ` (${session.container})` : ''}
                        </span>
                      </div>
                    )}
                    {session.videoLabel && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 font-medium w-20 flex-shrink-0">Video</span>
                        <span className={`font-semibold flex items-center gap-1 ${session.videoDecision === 'Direct Play' ? 'text-cyan-400' : session.videoDecision === 'Direct Stream' ? 'text-sky-300' : 'text-slate-300'}`}>
                          <Video className="w-3 h-3" />
                          {session.videoDecision === 'Direct Play' ? 'Direct Play' : session.videoDecision === 'Direct Stream' ? 'Direct Stream' : 'Transcode'}
                          {session.videoLabel ? ` (${session.videoLabel})` : ''}
                        </span>
                      </div>
                    )}
                    {session.audioLabel && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 font-medium w-20 flex-shrink-0">Audio</span>
                        <span className={`font-semibold flex items-center gap-1 ${session.audioDecision === 'Direct Play' ? 'text-cyan-400' : 'text-slate-300'}`}>
                          <Volume2 className="w-3 h-3" />
                          {session.audioDecision === 'Direct Play' ? 'Direct Play' : 'Transcode'}
                          {session.audioLabel ? ` [${session.audioLabel}]` : ''}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400 font-medium w-20 flex-shrink-0">Subtitle</span>
                      {session.subtitleLabel ? (
                        <span className={`font-semibold flex items-center gap-1 ${session.subtitleDecision === 'Direct Play' ? 'text-cyan-400' : 'text-slate-300'}`}>
                          <Subtitles className="w-3 h-3" />
                          {session.subtitleDecision === 'Direct Play' ? 'Direct Play' : 'Transcode'}
                          {session.subtitleLabel ? ` [${session.subtitleLabel}]` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-semibold flex items-center gap-1">
                          <Subtitles className="w-3 h-3 opacity-50" />
                          None
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Location & Bandwidth & ETA */}
                {(session.location || session.bandwidth || session.eta) && (
                  <div className="mt-3 flex items-center gap-2.5 text-xs text-slate-400 flex-wrap">
                    {session.location && (
                      <span className="flex items-center gap-1 bg-[#101e31] px-2.5 py-1 rounded-lg border border-[#1c2d46]">
                        <Wifi className="w-3 h-3 text-slate-500" />
                        {session.location}
                      </span>
                    )}
                    {session.bandwidth && (
                      <span className="flex items-center gap-1 bg-[#101e31] px-2.5 py-1 rounded-lg border border-[#1c2d46]">
                        <Zap className="w-3 h-3 text-cyan-400" />
                        {session.bandwidth} Mbps
                      </span>
                    )}
                    {session.eta && (
                      <span className="flex items-center gap-1 bg-[#101e31] px-2.5 py-1 rounded-lg border border-[#1c2d46] ml-auto">
                        <Clock className="w-3 h-3 text-slate-500" />
                        ETA: {session.eta}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {session.timeTotal > 0 && (
                <div className="px-5 pb-5 relative z-10">
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-2">
                    <div 
                      className="h-full bg-cyan-400 transition-all duration-1000 ease-linear rounded-full"
                      style={{ width: `${session.progress || 0}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs font-semibold text-slate-400 tracking-wide font-mono">
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
        <div className="mt-8 sm:mt-10">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2.5">
              <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400 shrink-0" />
              <h2 className="text-lg sm:text-xl font-bold text-slate-100">Leaderboards</h2>
            </div>
            <button
              onClick={handleResetStats}
              disabled={resetting}
              className="h-9 px-3.5 text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/40 rounded-xl transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 shrink-0"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
              <span>Reset Stats</span>
            </button>
          </div>

          {/* Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 sm:p-4 shadow-sm transition-colors hover:border-slate-700 flex items-center gap-3.5">
              <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
                <Eye className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">Total Plays</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl sm:text-2xl font-bold text-slate-100">{stats.overview?.totalPlays || 0}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 sm:p-4 shadow-sm transition-colors hover:border-slate-700 flex items-center gap-3.5">
              <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">Unique Users</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl sm:text-2xl font-bold text-slate-100">{stats.overview?.uniqueUsers || 0}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 sm:p-4 shadow-sm transition-colors hover:border-slate-700 flex items-center gap-3.5">
              <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
                <Hash className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">Unique Titles</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl sm:text-2xl font-bold text-slate-100">{stats.overview?.uniqueTitles || 0}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Most Watched Movies */}
            <div className="bg-slate-900/70 backdrop-blur-sm border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm transition-colors hover:border-slate-700 flex flex-col">
              <div className="flex items-center gap-2 mb-3.5 border-b border-[#1c2d46]/80 pb-2.5">
                <Film className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-200">Most Watched Movies</h3>
              </div>
              <ul className="space-y-2 flex-1">
                {stats.topMovies?.length > 0 ? stats.topMovies.map((item, idx) => (
                  <li key={item.id || `topMovies-${item.title}-${idx}`} className="flex justify-between items-center bg-[#101e31]/60 p-2.5 rounded-xl border border-[#1c2d46]/60 group hover:bg-[#101e31] transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-500 w-5 flex-shrink-0 font-mono">{idx + 1}</span>
                      <span className="text-slate-300 font-medium truncate text-xs sm:text-sm">{item.title}</span>
                    </div>
                    <span className="bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/30 text-xs px-2 py-0.5 rounded-md flex-shrink-0 ml-2 font-mono">{item.plays}</span>
                  </li>
                )) : <li className="text-slate-500 text-xs italic text-center py-4 bg-[#101e31]/30 rounded-xl border border-dashed border-slate-800/80">No data yet.</li>}
              </ul>
            </div>

            {/* Most Watched Shows */}
            <div className="bg-slate-900/70 backdrop-blur-sm border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm transition-colors hover:border-slate-700 flex flex-col">
              <div className="flex items-center gap-2 mb-3.5 border-b border-[#1c2d46]/80 pb-2.5">
                <Tv className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-200">Most Watched Shows</h3>
              </div>
              <ul className="space-y-2 flex-1">
                {stats.topShows?.length > 0 ? stats.topShows.map((item, idx) => (
                  <li key={item.id || `topShows-${item.title}-${idx}`} className="flex justify-between items-center bg-[#101e31]/60 p-2.5 rounded-xl border border-[#1c2d46]/60 group hover:bg-[#101e31] transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-500 w-5 flex-shrink-0 font-mono">{idx + 1}</span>
                      <span className="text-slate-300 font-medium truncate text-xs sm:text-sm">{item.title}</span>
                    </div>
                    <span className="bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/30 text-xs px-2 py-0.5 rounded-md flex-shrink-0 ml-2 font-mono">{item.plays}</span>
                  </li>
                )) : <li className="text-slate-500 text-xs italic text-center py-4 bg-[#101e31]/30 rounded-xl border border-dashed border-slate-800/80">No data yet.</li>}
              </ul>
            </div>

            {/* Most Active Users */}
            <div className="bg-slate-900/70 backdrop-blur-sm border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm transition-colors hover:border-slate-700 flex flex-col">
              <div className="flex items-center gap-2 mb-3.5 border-b border-[#1c2d46]/80 pb-2.5">
                <User className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-200">Most Active Users</h3>
              </div>
              <ul className="space-y-2 flex-1">
                {stats.topUsers?.length > 0 ? stats.topUsers.map((item, idx) => (
                  <li key={item.id || `topUsers-${item.user}-${idx}`} className="flex justify-between items-center bg-[#101e31]/60 p-2.5 rounded-xl border border-[#1c2d46]/60 group hover:bg-[#101e31] transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-500 w-5 flex-shrink-0 font-mono">{idx + 1}</span>
                      <span className="text-slate-300 font-medium truncate text-xs sm:text-sm">{item.user}</span>
                    </div>
                    <span className="bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/30 text-xs px-2 py-0.5 rounded-md flex-shrink-0 ml-2 font-mono">{item.plays}</span>
                  </li>
                )) : <li className="text-slate-500 text-xs italic text-center py-4 bg-[#101e31]/30 rounded-xl border border-dashed border-slate-800/80">No data yet.</li>}
              </ul>
            </div>

            {/* Most Popular Movies (by unique users) */}
            <div className="bg-slate-900/70 backdrop-blur-sm border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm transition-colors hover:border-slate-700 flex flex-col">
              <div className="flex items-center gap-2 mb-3.5 border-b border-[#1c2d46]/80 pb-2.5">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-200">Most Popular Movies</h3>
              </div>
              <ul className="space-y-2 flex-1">
                {stats.popularMovies?.length > 0 ? stats.popularMovies.map((item, idx) => (
                  <li key={item.id || `popularMovies-${item.title}-${idx}`} className="flex justify-between items-center bg-[#101e31]/60 p-2.5 rounded-xl border border-[#1c2d46]/60 group hover:bg-[#101e31] transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-500 w-5 flex-shrink-0 font-mono">{idx + 1}</span>
                      <span className="text-slate-300 font-medium truncate text-xs sm:text-sm">{item.title}</span>
                    </div>
                    <span className="bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/30 text-xs px-2 py-0.5 rounded-md flex-shrink-0 ml-2 font-mono">{item.users} {item.users === 1 ? 'user' : 'users'}</span>
                  </li>
                )) : <li className="text-slate-500 text-xs italic text-center py-4 bg-[#101e31]/30 rounded-xl border border-dashed border-slate-800/80">No data yet.</li>}
              </ul>
            </div>

            {/* Most Popular Shows (by unique users) */}
            <div className="bg-slate-900/70 backdrop-blur-sm border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm transition-colors hover:border-slate-700 flex flex-col">
              <div className="flex items-center gap-2 mb-3.5 border-b border-[#1c2d46]/80 pb-2.5">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-200">Most Popular Shows</h3>
              </div>
              <ul className="space-y-2 flex-1">
                {stats.popularShows?.length > 0 ? stats.popularShows.map((item, idx) => (
                  <li key={item.id || `popularShows-${item.title}-${idx}`} className="flex justify-between items-center bg-[#101e31]/60 p-2.5 rounded-xl border border-[#1c2d46]/60 group hover:bg-[#101e31] transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-500 w-5 flex-shrink-0 font-mono">{idx + 1}</span>
                      <span className="text-slate-300 font-medium truncate text-xs sm:text-sm">{item.title}</span>
                    </div>
                    <span className="bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/30 text-xs px-2 py-0.5 rounded-md flex-shrink-0 ml-2 font-mono">{item.users} {item.users === 1 ? 'user' : 'users'}</span>
                  </li>
                )) : <li className="text-slate-500 text-xs italic text-center py-4 bg-[#101e31]/30 rounded-xl border border-dashed border-slate-800/80">No data yet.</li>}
              </ul>
            </div>

            {/* Recently Watched */}
            <div className="bg-slate-900/70 backdrop-blur-sm border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm transition-colors hover:border-slate-700 flex flex-col">
              <div className="flex items-center gap-2 mb-3.5 border-b border-[#1c2d46]/80 pb-2.5">
                <History className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-200">Recently Watched</h3>
              </div>
              <ul className="space-y-2 flex-1">
                {stats.recent?.length > 0 ? stats.recent.map((item, idx) => (
                  <li key={item.id || `recent-${item.title}-${item.user}-${idx}`} className="flex items-center gap-3 bg-[#101e31]/60 p-2.5 rounded-xl border border-[#1c2d46]/60 group hover:bg-[#101e31] transition-colors">
                    <div className="p-1.5 rounded-lg flex-shrink-0 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      {item.type === 'movie' ? <Film className="w-3.5 h-3.5" /> : <Tv className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm text-slate-200 font-medium truncate">{item.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{item.user} · {formatRelativeTime(item.created_at)}</p>
                    </div>
                  </li>
                )) : <li className="text-slate-500 text-xs italic text-center py-4 bg-[#101e31]/30 rounded-xl border border-dashed border-slate-800/80">No data yet.</li>}
              </ul>
            </div>

            {/* Most Active Platforms */}
            <div className="bg-slate-900/70 backdrop-blur-sm border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm transition-colors hover:border-slate-700 flex flex-col lg:col-span-1">
              <div className="flex items-center gap-2 mb-3.5 border-b border-[#1c2d46]/80 pb-2.5">
                <MonitorPlay className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-200">Most Active Platforms</h3>
              </div>
              <ul className="space-y-2 flex-1">
                {stats.topPlatforms?.length > 0 ? stats.topPlatforms.map((item, idx) => (
                  <li key={item.id || `topPlatforms-${item.player}-${idx}`} className="flex justify-between items-center bg-[#101e31]/60 p-2.5 rounded-xl border border-[#1c2d46]/60 group hover:bg-[#101e31] transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-500 w-5 flex-shrink-0 font-mono">{idx + 1}</span>
                      <span className="text-slate-300 font-medium truncate text-xs sm:text-sm">{item.player || 'Unknown'}</span>
                    </div>
                    <span className="bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/30 text-xs px-2 py-0.5 rounded-md flex-shrink-0 ml-2 font-mono">{item.plays}</span>
                  </li>
                )) : <li className="text-slate-500 text-xs italic text-center py-4 bg-[#101e31]/30 rounded-xl border border-dashed border-slate-800/80">No data yet.</li>}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
