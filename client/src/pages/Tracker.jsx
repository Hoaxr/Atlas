import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatedUpNextCard } from '../components/tracker/AnimatedUpNextCard';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { 
  Clock, Film, Tv, Play, ChevronRight, ChevronLeft, Trash2, Undo2, Eye, 
  Flame, Award, Calendar, BarChart2, Sparkles, Compass, CheckCircle2, TrendingUp, Zap, Moon, Sun, Star
} from 'lucide-react';
import { tmdbImgUrl } from '../lib/posterUrl';

const formatRuntime = (minutes) => {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

const HistoryItem = ({ item, handleMarkUnwatched, handleDeleteHistory }) => {
  const navigate = useNavigate();
  const isMovie = item.type === 'movie';
  const [localTitle, setLocalTitle] = useState(isMovie ? item.movie_title : item.show_title);
  const [localPoster, setLocalPoster] = useState(isMovie ? item.movie_poster : item.show_poster);

  useEffect(() => {
    setLocalTitle(isMovie ? item.movie_title : item.show_title);
    setLocalPoster(isMovie ? item.movie_poster : item.show_poster);
  }, [item.movie_title, item.show_title, item.movie_poster, item.show_poster, isMovie]);

  useEffect(() => {
    if (!localTitle && item.tmdb_id) {
      const fetchTmdb = async () => {
        try {
          const res = await api.get(`/tmdb/${isMovie ? 'movie' : 'show'}/${item.tmdb_id}`);
          if (res.data && res.data.data) {
            setLocalTitle(isMovie ? res.data.data.title : res.data.data.name);
            setLocalPoster(res.data.data.poster_path);
          }
        } catch (e) {
          console.error('Failed to fetch tmdb data', e);
        }
      };
      fetchTmdb();
    }
  }, [item.tmdb_id, isMovie, localTitle]);

  const handleTitleClick = (e) => {
    e.stopPropagation();
    if (isMovie && item.movie_id) {
      navigate(`/movies/${item.movie_id}`);
    } else if (!isMovie && item.show_id) {
      navigate(`/shows/${item.show_id}`);
    } else if (item.tmdb_id) {
      navigate(`/${isMovie ? 'movies' : 'shows'}/${item.tmdb_id}`);
    }
  };

  const title = localTitle || `${isMovie ? 'Movie' : 'Show'} (TMDB: ${item.tmdb_id})`;
  const poster = localPoster;
  
  return (
    <div className="p-4 flex items-center gap-4 bg-slate-900/40 border border-white/5 rounded-2xl hover:bg-slate-800/40 hover:border-purple-500/20 transition-all duration-300 group">
      <div 
        onClick={handleTitleClick}
        className="w-12 h-16 bg-slate-800/80 rounded-xl overflow-hidden flex-shrink-0 border border-white/5 cursor-pointer"
      >
        {poster ? (
          <img src={tmdbImgUrl(poster, 'w200')} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex justify-center items-center">
            {isMovie ? <Film className="w-5 h-5 text-slate-500" /> : <Tv className="w-5 h-5 text-slate-500" />}
          </div>
        )}
      </div>
      
      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${isMovie ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
            {isMovie ? 'Movie' : 'Episode'}
          </span>
          <span className="text-xs text-slate-400">
            {new Date(item.watched_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • {new Date(item.watched_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          </span>
        </div>
        <h4 
          onClick={handleTitleClick}
          className="text-slate-100 font-bold text-base truncate group-hover:text-purple-400 transition-colors cursor-pointer"
        >
          {title}
        </h4>
        {!isMovie && item.season_number != null && item.episode_number != null && (
          <p className="text-xs text-slate-400 truncate">
            S{String(item.season_number).padStart(2, '0')} E{String(item.episode_number).padStart(2, '0')} 
            {item.episode_title ? ` — ${item.episode_title}` : ''}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0">
        <button
          onClick={() => handleMarkUnwatched(item)}
          className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all"
          title="Mark unwatched"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleDeleteHistory(item.history_id)}
          className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
          title="Remove from history"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const Tracker = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [upNextMovies, setUpNextMovies] = useState([]);
  const [upNextEpisodes, setUpNextEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const scrollRef = useRef(null);

  const scrollContainer = (dir) => {
    if (scrollRef.current) {
      const amount = 480;
      scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
    }
  };

  const fetchData = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const [statsRes, historyRes, upNextRes] = await Promise.all([
        api.get('/tracker/stats', { params: { _t: Date.now() } }),
        api.get('/tracker/history', { params: { limit: 40, _t: Date.now() } }),
        api.get('/tracker/up-next', { params: { _t: Date.now() } })
      ]);

      setStats(statsRes.data.stats);
      setHistory(historyRes.data.history);
      setUpNextMovies(upNextRes.data.movies);
      setUpNextEpisodes(upNextRes.data.episodes);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch tracker data', err);
      if (isInitial) setError('Failed to load tracking data.');
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
  }, []);

  // Poll for stale flag set by show/movie detail pages when they toggle watched
  useEffect(() => {
    const interval = setInterval(() => {
      if (sessionStorage.getItem('tracker-stale')) {
        sessionStorage.removeItem('tracker-stale');
        fetchData();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkWatched = async (key, tmdbId, type, season, episode) => {
    try {
      await api.post('/tracker/mark-watched', { tmdbId, type, season, episode });
    } catch (err) {
      console.error('Failed to mark as watched', err);
      throw err;
    }
    await fetchData();
  };

  const handleDeleteHistory = async (historyId) => {
    try {
      await api.delete(`/tracker/history/${historyId}`);
      setHistory(prev => prev.filter(item => item.history_id !== historyId));
      await fetchData();
    } catch (err) {
      console.error('Failed to delete history entry', err);
    }
  };

  const handleMarkUnwatched = async (item) => {
    try {
      await api.post('/tracker/mark-unwatched', {
        tmdbId: item.tmdb_id,
        type: item.type,
        season: item.season_number,
        episode: item.episode_number
      });
      setHistory(prev => prev.filter(h => h.history_id !== item.history_id));
      await fetchData();
    } catch (err) {
      console.error('Failed to mark unwatched', err);
    }
  };

  // Group history chronologically
  const groupedHistory = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const groups = { Today: [], Yesterday: [], 'This Week': [], Earlier: [] };

    history.forEach(item => {
      if (!item.watched_at) return;
      const dStr = new Date(item.watched_at).toISOString().split('T')[0];
      if (dStr === todayStr) {
        groups.Today.push(item);
      } else if (dStr === yesterdayStr) {
        groups.Yesterday.push(item);
      } else {
        const diffDays = Math.round((new Date() - new Date(item.watched_at)) / (1000 * 60 * 60 * 24));
        if (diffDays <= 7) groups['This Week'].push(item);
        else groups.Earlier.push(item);
      }
    });

    return groups;
  }, [history]);

  if (loading && !stats) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[60vh] text-slate-400 gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
        <p className="font-medium animate-pulse text-slate-300">Loading Watch Tracker Analytics Dashboard...</p>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-400 p-8 text-center bg-red-500/10 rounded-2xl border border-red-500/20 max-w-xl mx-auto my-12">{error}</div>;
  }

  const currently = stats?.currently_watching;
  const upNextCombined = [...(upNextEpisodes || []), ...(upNextMovies || [])];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-10 px-4 sm:px-6 lg:px-8 pb-16 animate-in fade-in duration-500">
      
      {/* ── HERO HEADER ── */}
      <div className="relative rounded-3xl overflow-hidden border border-slate-700/50 bg-slate-900/80 backdrop-blur-xl shadow-2xl p-6 sm:p-10">
        {currently?.backdrop && (
          <div className="absolute inset-0 z-0 opacity-20 filter blur-2xl scale-110 pointer-events-none">
            <img src={tmdbImgUrl(currently.backdrop, 'w1280')} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
          <div className="space-y-3 max-w-2xl">
            <h1 className="text-4xl sm:text-5xl font-black text-slate-100 tracking-tight">
              Watch Tracker
            </h1>
            <p className="text-slate-300 text-lg sm:text-xl font-medium">
              You've watched <span className="text-cyan-400 font-bold">{stats?.total_days || '0'} days</span> ({stats?.total_hours || '0'} hours) of content.
            </p>
          </div>

          {/* Currently Watching Mini Panel */}
          {currently && (
            <div className="w-full lg:w-96 p-4 rounded-2xl bg-slate-800/80 border border-slate-700/60 backdrop-blur-md shadow-xl flex items-center gap-4 group">
              <div 
                onClick={() => {
                  const isMovie = currently.type === 'movie';
                  if (isMovie && currently.movie_id) navigate(`/movies/${currently.movie_id}`);
                  else if (!isMovie && currently.show_id) navigate(`/shows/${currently.show_id}`);
                  else if (currently.tmdb_id) navigate(`/${isMovie ? 'movies' : 'shows'}/${currently.tmdb_id}`);
                }}
                className="w-16 h-22 rounded-xl overflow-hidden bg-slate-900 shrink-0 border border-slate-700/50 cursor-pointer"
              >
                {currently.poster ? (
                  <img src={tmdbImgUrl(currently.poster, 'w200')} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600"><Tv className="w-6 h-6" /></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Latest Watch
                </span>
                <h3 
                  onClick={() => {
                    const isMovie = currently.type === 'movie';
                    if (isMovie && currently.movie_id) navigate(`/movies/${currently.movie_id}`);
                    else if (!isMovie && currently.show_id) navigate(`/shows/${currently.show_id}`);
                    else if (currently.tmdb_id) navigate(`/${isMovie ? 'movies' : 'shows'}/${currently.tmdb_id}`);
                  }}
                  className="text-slate-100 font-bold text-base truncate mt-1 group-hover:text-cyan-400 transition-colors cursor-pointer"
                >
                  {currently.title}
                </h3>
                {currently.season && (
                  <p className="text-xs text-slate-400">S{currently.season} E{currently.episode} {currently.episode_title ? `— ${currently.episode_title}` : ''}</p>
                )}
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-700/80 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full" style={{ width: `${currently.progress || 100}%` }}></div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono font-semibold">{currently.runtime}m</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 6-CARD STATS GRID ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        
        {/* Total Time */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/70 transition-all duration-300 hover:-translate-y-1 shadow-lg group">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 w-fit mb-3 group-hover:scale-110 transition-transform">
            <Clock className="w-5 h-5" />
          </div>
          <div className="text-2xl font-black text-slate-100">{stats?.total_days} <span className="text-xs font-normal text-slate-400">Days</span></div>
          <div className="text-xs font-medium text-slate-400 mt-0.5">Total Watch Time</div>
          <div className="text-[11px] text-cyan-400/80 mt-2 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-cyan-400" /> +{stats?.this_month_hours || 0}h this month
          </div>
        </div>

        {/* Movies */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/70 transition-all duration-300 hover:-translate-y-1 shadow-lg group">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 w-fit mb-3 group-hover:scale-110 transition-transform">
            <Film className="w-5 h-5" />
          </div>
          <div className="text-2xl font-black text-slate-100">{stats?.movies?.count?.toLocaleString()}</div>
          <div className="text-xs font-medium text-slate-400 mt-0.5">Movies Watched</div>
          <div className="text-[11px] text-cyan-400/80 mt-2 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-cyan-400" /> ↑ {stats?.movies?.this_month || 0} this month
          </div>
        </div>

        {/* Episodes */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/70 transition-all duration-300 hover:-translate-y-1 shadow-lg group">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 w-fit mb-3 group-hover:scale-110 transition-transform">
            <Tv className="w-5 h-5" />
          </div>
          <div className="text-2xl font-black text-slate-100">{stats?.episodes?.count?.toLocaleString()}</div>
          <div className="text-xs font-medium text-slate-400 mt-0.5">Episodes Watched</div>
          <div className="text-[11px] text-cyan-400/80 mt-2 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-cyan-400" /> ↑ {stats?.episodes?.this_month || 0} this month
          </div>
        </div>

        {/* Shows */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/70 transition-all duration-300 hover:-translate-y-1 shadow-lg group">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 w-fit mb-3 group-hover:scale-110 transition-transform">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="text-2xl font-black text-slate-100">{stats?.shows?.count?.toLocaleString()}</div>
          <div className="text-xs font-medium text-slate-400 mt-0.5">Shows Watched</div>
          <div className="text-[11px] text-slate-500 mt-2">
            {stats?.completed_shows || 0} completed
          </div>
        </div>

        {/* Current Streak */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/70 transition-all duration-300 hover:-translate-y-1 shadow-lg group">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 w-fit mb-3 group-hover:scale-110 transition-transform">
            <Flame className="w-5 h-5" />
          </div>
          <div className="text-2xl font-black text-slate-100">{stats?.streaks?.current || 0} <span className="text-xs font-normal text-slate-400">Days</span></div>
          <div className="text-xs font-medium text-slate-400 mt-0.5">Current Streak</div>
          <div className="text-[11px] text-slate-500 mt-2">
            Best: {stats?.streaks?.longest || 0} days
          </div>
        </div>

        {/* Finished Seasons */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/70 transition-all duration-300 hover:-translate-y-1 shadow-lg group">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 w-fit mb-3 group-hover:scale-110 transition-transform">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="text-2xl font-black text-slate-100">{stats?.finished_seasons || 0}</div>
          <div className="text-xs font-medium text-slate-400 mt-0.5">Seasons Finished</div>
          <div className="text-[11px] text-slate-500 mt-2">
            across {stats?.shows?.count || 0} shows
          </div>
        </div>

      </div>

      {/* ── CONTINUE WATCHING / UP NEXT CAROUSEL ── */}
      {upNextCombined.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                <Play className="w-6 h-6 text-cyan-400 fill-cyan-400" /> Continue Watching & Up Next
              </h2>
              <p className="text-sm text-slate-400">Pick up right where you left off across your library</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => scrollContainer('left')} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50 transition-all">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={() => scrollContainer('right')} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50 transition-all">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex gap-5 overflow-x-auto scrollbar-none pb-4 pt-1 snap-x">
            {upNextEpisodes.map(ep => (
              <AnimatedUpNextCard 
                key={`ep-${ep.episode_id}`}
                item={ep}
                type="episode"
                onMarkWatched={handleMarkWatched}
              />
            ))}

            {upNextMovies.map(m => (
              <AnimatedUpNextCard 
                key={`movie-${m.id}`}
                item={m}
                type="movie"
                onMarkWatched={handleMarkWatched}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── 365-DAY ACTIVITY HEATMAP & WEEKLY ACTIVITY ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Heatmap (2 Cols) */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-3xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-xl shadow-xl space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-cyan-400" /> 365-Day Viewing Heatmap
              </h3>
              <p className="text-xs text-slate-400">Daily viewing intensity over the past year</p>
            </div>
            <span className="text-xs font-mono text-slate-400 bg-slate-900/60 px-3 py-1 rounded-full border border-slate-700/50">
              {stats?.heatmap_data?.length || 0} active days
            </span>
          </div>

          {/* Heatmap Grid */}
          <div className="overflow-x-auto pb-2 scrollbar-none">
            <div className="flex gap-1.5 min-w-[700px] justify-between">
              {Array.from({ length: 52 }).map((_, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-1.5">
                  {Array.from({ length: 7 }).map((_, dayIdx) => {
                    const dayOffset = (51 - weekIdx) * 7 + (6 - dayIdx);
                    const d = new Date();
                    d.setDate(d.getDate() - dayOffset);
                    const dateStr = d.toISOString().split('T')[0];

                    const match = stats?.heatmap_data?.find(h => h.date === dateStr);
                    const hrs = match ? parseFloat(match.hours || 0) : 0;

                    let bgClass = 'bg-slate-800/60 border-slate-700/30';
                    if (hrs > 0 && hrs < 2) bgClass = 'bg-cyan-950/60 border-cyan-800/40';
                    else if (hrs >= 2 && hrs < 4) bgClass = 'bg-cyan-800/80 border-cyan-600/50';
                    else if (hrs >= 4 && hrs < 6) bgClass = 'bg-cyan-600 border-cyan-400/60';
                    else if (hrs >= 6) bgClass = 'bg-cyan-400 border-cyan-300 shadow-md shadow-cyan-400/20';

                    return (
                      <div 
                        key={dayIdx} 
                        className={`w-3.5 h-3.5 rounded-sm border ${bgClass} transition-all duration-200 hover:scale-125 cursor-pointer relative group`}
                      >
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-30 pointer-events-none">
                          <div className="bg-slate-900 text-white text-[11px] font-medium py-1.5 px-3 rounded-xl shadow-2xl border border-slate-700/50 whitespace-nowrap">
                            <div className="font-bold text-cyan-300">{dateStr}</div>
                            <div>{hrs > 0 ? `${hrs}h watched` : 'No activity'}</div>
                            {match && <div className="text-[10px] text-slate-400">{match.episodes} eps, {match.movies} movies</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 text-xs text-slate-400 pt-2">
            <span>Less</span>
            <div className="w-3 h-3 rounded-sm bg-slate-800 border border-slate-700/30"></div>
            <div className="w-3 h-3 rounded-sm bg-cyan-950/60"></div>
            <div className="w-3 h-3 rounded-sm bg-cyan-800/80"></div>
            <div className="w-3 h-3 rounded-sm bg-cyan-600"></div>
            <div className="w-3 h-3 rounded-sm bg-cyan-400"></div>
            <span>More</span>
          </div>
        </div>

        {/* Genre Breakdown (1 Col) */}
        <div className="glass-panel p-6 rounded-3xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-xl shadow-xl space-y-4">
          <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-cyan-400" /> Genre Breakdown
          </h3>
          <p className="text-xs text-slate-400">Your top watched genres</p>

          <div className="space-y-3 pt-2">
            {(stats?.genre_breakdown || []).map((g, idx) => (
              <div key={g.name} className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-slate-300">
                  <span>{g.name}</span>
                  <span className="font-mono text-cyan-400">{g.percentage}%</span>
                </div>
                <div className="w-full h-2 bg-slate-900/80 rounded-full overflow-hidden border border-slate-700/30">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${
                      idx === 0 ? 'bg-gradient-to-r from-cyan-500 to-teal-400' :
                      idx === 1 ? 'bg-gradient-to-r from-blue-500 to-cyan-400' :
                      idx === 2 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' :
                      'bg-slate-600'
                    }`} 
                    style={{ width: `${g.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── WATCHING HABITS (SPOTIFY WRAPPED CARDS) ── */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Zap className="w-6 h-6 text-cyan-400" /> Viewing Persona & Habits
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          
          <div className="glass-panel p-6 rounded-3xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-xl shadow-xl flex flex-col justify-between group hover:scale-[1.02] transition-transform">
            <div className="flex justify-between items-center">
              <Moon className="w-8 h-8 text-cyan-400" />
              <span className="text-[10px] uppercase font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20">Habit</span>
            </div>
            <div className="my-4">
              <div className="text-3xl font-black text-slate-100">{stats?.habits?.night_owl_pct || 75}%</div>
              <h4 className="text-lg font-bold text-slate-100 mt-1">Night Owl Binger</h4>
              <p className="text-xs text-slate-400 mt-1">of your total viewing happens after 8 PM</p>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-xl shadow-xl flex flex-col justify-between group hover:scale-[1.02] transition-transform">
            <div className="flex justify-between items-center">
              <Sun className="w-8 h-8 text-cyan-400" />
              <span className="text-[10px] uppercase font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20">Pattern</span>
            </div>
            <div className="my-4">
              <div className="text-3xl font-black text-slate-100">{stats?.habits?.weekend_pct || 60}%</div>
              <h4 className="text-lg font-bold text-slate-100 mt-1">Weekend Warrior</h4>
              <p className="text-xs text-slate-400 mt-1">of total screen time takes place on weekends</p>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-xl shadow-xl flex flex-col justify-between group hover:scale-[1.02] transition-transform">
            <div className="flex justify-between items-center">
              <Flame className="w-8 h-8 text-cyan-400" />
              <span className="text-[10px] uppercase font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20">Record Binge</span>
            </div>
            <div className="my-4">
              <div className="text-3xl font-black text-slate-100">{stats?.habits?.longest_binge?.episodes || 8} <span className="text-base font-normal text-slate-400">eps</span></div>
              <h4 className="text-lg font-bold text-slate-100 mt-1">Single Day Record</h4>
              <p className="text-xs text-slate-400 mt-1">{stats?.habits?.longest_binge?.hours || '6.7'} hours watched in 24 hours</p>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-xl shadow-xl flex flex-col justify-between group hover:scale-[1.02] transition-transform">
            <div className="flex justify-between items-center">
              <Star className="w-8 h-8 text-cyan-400" />
              <span className="text-[10px] uppercase font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20">Favorite</span>
            </div>
            <div className="my-4">
              <div className="text-3xl font-black text-slate-100 truncate">{stats?.habits?.top_genre || 'Drama'}</div>
              <h4 className="text-lg font-bold text-slate-100 mt-1">Top Genre</h4>
              <p className="text-xs text-slate-400 mt-1">Most watched category in your library</p>
            </div>
          </div>

        </div>
      </div>

      {/* ── GAMIFIED ACHIEVEMENTS ── */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-xl shadow-xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Award className="w-6 h-6 text-cyan-400" /> Achievements & Milestones
          </h2>
          <p className="text-xs text-slate-400">Unlock badges as your watch history grows</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {(stats?.achievements || []).map(ach => (
            <div 
              key={ach.id}
              className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between ${
                ach.unlocked 
                  ? 'bg-slate-800/60 border-cyan-500/40 shadow-lg shadow-cyan-500/10 hover:border-cyan-400' 
                  : 'bg-slate-900/40 border-slate-700/30 opacity-60'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <span className="text-3xl filter drop-shadow">{ach.icon}</span>
                {ach.unlocked ? (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">Unlocked</span>
                ) : (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400">Locked</span>
                )}
              </div>
              <div>
                <h4 className="font-bold text-slate-100 text-base">{ach.title}</h4>
                <p className="text-xs text-slate-400 mt-1 leading-snug">{ach.desc}</p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-700/30">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-mono">
                  <span>Progress</span>
                  <span>{ach.progress}%</span>
                </div>
                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${ach.unlocked ? 'bg-cyan-400' : 'bg-slate-600'}`} style={{ width: `${ach.progress}%` }}></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CHRONOLOGICAL RECENTLY WATCHED TIMELINE ── */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-xl shadow-xl space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <Clock className="w-6 h-6 text-emerald-400" /> Watch History Timeline
            </h2>
            <p className="text-xs text-slate-400">Chronological list of all your finished titles</p>
          </div>
          <span className="text-xs text-slate-400 font-mono">Showing latest {history.length} items</span>
        </div>

        <div className="space-y-6">
          {Object.entries(groupedHistory).map(([groupTitle, items]) => {
            if (!items || items.length === 0) return null;
            return (
              <div key={groupTitle} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20">
                    {groupTitle}
                  </span>
                  <div className="flex-1 h-px bg-slate-700/30"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map((item, idx) => (
                    <HistoryItem
                      key={item.history_id || idx}
                      item={item}
                      handleMarkUnwatched={handleMarkUnwatched}
                      handleDeleteHistory={handleDeleteHistory}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};

export default Tracker;
