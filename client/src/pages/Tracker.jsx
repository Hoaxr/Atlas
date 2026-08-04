import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatedUpNextCard } from '../components/tracker/AnimatedUpNextCard';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { 
  Clock, Film, Tv, Play, ChevronRight, ChevronLeft, Trash2, Undo2, Eye, 
  Flame, Award, Calendar, Sparkles, Compass, CheckCircle2, TrendingUp, Zap, Moon, Sun, Star
} from 'lucide-react';
import { tmdbImgUrl } from '../lib/posterUrl';

const formatRuntime = (minutes) => {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}`;
  return `${m}m`;
};

const TimelineHistoryCard = ({ item, handleMarkUnwatched, handleDeleteHistory }) => {
  const navigate = useNavigate();
  const isMovie = item.type === 'movie';
  const [localTitle, setLocalTitle] = useState(isMovie ? item.movie_title : item.show_title);
  const [localPoster, setLocalPoster] = useState(isMovie ? item.movie_poster : item.show_poster);
  const [showMenu, setShowMenu] = useState(false);

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
  const runtimeMin = item.history_runtime || item.movie_runtime || item.ep_runtime;
  const quality = item.movie_quality || item.ep_quality;
  const hdr = item.movie_hdr || item.ep_hdr;
  const codec = item.movie_codec || item.ep_codec;

  return (
    <div className="relative group flex items-center gap-3 sm:gap-4 my-2.5 w-full">
      {/* Glow effect behind card on hover */}
      <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-pink-500/20 opacity-0 group-hover:opacity-100 blur-lg transition-all duration-500 pointer-events-none" />

      {/* Timeline Node Point */}
      <div className="relative z-10 flex flex-col items-center shrink-0">
        <div className="w-3 h-3 rounded-full bg-slate-900 border-2 border-cyan-400 group-hover:border-cyan-300 group-hover:scale-125 transition-all duration-300 shadow-md shadow-cyan-500/40" />
      </div>

      {/* Timeline Card */}
      <div className="relative z-10 flex-1 p-3 sm:p-3.5 rounded-2xl bg-slate-900/70 border border-white/5 backdrop-blur-xl hover:bg-slate-800/70 hover:border-cyan-500/30 transition-all duration-300 shadow-lg group-hover:-translate-y-0.5 flex gap-3 sm:gap-4 items-center">
        {/* Poster */}
        <div 
          onClick={handleTitleClick}
          className="relative w-14 sm:w-16 h-20 sm:h-22 bg-slate-800 rounded-xl overflow-hidden shrink-0 cursor-pointer shadow-md group/poster border border-white/10"
        >
          {poster ? (
            <img 
              src={tmdbImgUrl(poster, 'w200')} 
              alt={title} 
              className="w-full h-full object-cover group-hover/poster:scale-110 transition-transform duration-500" 
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500">
              {isMovie ? <Film className="w-6 h-6" /> : <Tv className="w-6 h-6" />}
            </div>
          )}
        </div>

        {/* Card Body */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${isMovie ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'}`}>
              {isMovie ? 'Movie' : 'Episode'}
            </span>
            {quality && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {quality}
              </span>
            )}
            {hdr && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {hdr}
              </span>
            )}
          </div>

          <h3 
            onClick={handleTitleClick}
            className="text-slate-100 font-bold text-sm sm:text-base truncate cursor-pointer hover:text-cyan-400 transition-colors"
          >
            {title}
          </h3>

          {!isMovie && (item.season_number != null || item.episode_number != null) && (
            <p className="text-xs text-cyan-300/90 font-medium truncate">
              S{String(item.season_number || 1).padStart(2, '0')} E{String(item.episode_number || 1).padStart(2, '0')}
              {item.episode_title ? ` — ${item.episode_title}` : ''}
            </p>
          )}
        </div>

        {/* Right-side metadata & actions */}
        <div className="shrink-0 flex flex-col items-end gap-1.5 ml-2">
          <span className="flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
            <CheckCircle2 className="w-3 h-3" /> Watched
          </span>
          <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
            <Clock className="w-3 h-3 text-slate-500" />
            {new Date(item.watched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {runtimeMin && (
            <span className="text-slate-500 font-mono text-[11px]">{formatRuntime(runtimeMin)}</span>
          )}
          <div className="flex items-center gap-1 pt-1">
            <button
              onClick={() => handleMarkUnwatched(item)}
              className="p-1 rounded-md bg-slate-800 hover:bg-amber-500/20 text-slate-500 hover:text-amber-300 border border-white/10 transition-all"
              title="Mark unwatched"
            >
              <Undo2 className="w-3 h-3" />
            </button>
            <button
              onClick={() => handleDeleteHistory(item.history_id)}
              className="p-1 rounded-md bg-slate-800 hover:bg-red-500/20 text-slate-500 hover:text-red-300 border border-white/10 transition-all"
              title="Remove from history"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
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

  // Group history chronologically by day with summaries
  const groupedHistory = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const groups = {};

    history.forEach(item => {
      if (!item.watched_at) return;
      const dateObj = new Date(item.watched_at);
      const dStr = dateObj.toISOString().split('T')[0];

      let label = dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
      if (dStr === todayStr) label = 'Today';
      else if (dStr === yesterdayStr) label = 'Yesterday';

      if (!groups[label]) {
        groups[label] = {
          dateStr: dStr,
          items: [],
          totalMinutes: 0,
          moviesCount: 0,
          episodesCount: 0
        };
      }

      groups[label].items.push(item);
      const min = item.history_runtime || item.movie_runtime || item.ep_runtime || 45;
      groups[label].totalMinutes += min;
      if (item.type === 'movie') groups[label].moviesCount++;
      else groups[label].episodesCount++;
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
    <div className="w-full space-y-10 pb-16 animate-in fade-in duration-500">
      
      {/* ── HERO HEADER ── */}
      <div className="relative rounded-3xl overflow-hidden border border-slate-700/50 bg-slate-900/80 backdrop-blur-xl shadow-2xl p-6 sm:p-10">
        {currently?.backdrop && (
          <div className="absolute inset-0 z-0 opacity-20 filter blur-2xl scale-110 pointer-events-none">
            <img src={tmdbImgUrl(currently.backdrop, 'w1280')} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
          <div className="space-y-3 max-w-2xl">
            <h1 className="text-4xl sm:text-5xl font-black text-slate-100 tracking-tight flex items-center gap-3">
              <TrendingUp className="w-8 h-8 sm:w-9 sm:h-9 text-cyan-400" /> Watch Tracker
            </h1>
            <div className="space-y-1">
              <p className="text-slate-300 text-lg sm:text-xl font-medium">
                You've watched <span className="text-cyan-400 font-bold">{stats?.total_days || '0'} days</span> ({stats?.total_hours || '0'} hours) of content
              </p>
              <p className="text-slate-400 text-sm font-medium">
                {stats?.movies?.count ? `${stats.movies.count.toLocaleString()} movies` : ''}{stats?.episodes?.count ? ` · ${stats.episodes.count.toLocaleString()} episodes` : ''}{stats?.shows?.count ? ` · ${stats.shows.count.toLocaleString()} shows` : ''}{stats?.finished_seasons ? ` · ${stats.finished_seasons} seasons` : ''}
              </p>
            </div>
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

      {/* ── WATCH ACTIVITY FEED ── */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-700/50 bg-slate-800/40 backdrop-blur-xl shadow-xl">
        <div className="flex justify-between items-center pb-3 border-b border-white/5 mb-6">
          <div>
            <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Clock className="w-5 h-5 text-cyan-400" /> Watch Activity Feed
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Chronological activity stream of watched movies & episodes</p>
          </div>
          <span className="text-xs text-slate-400 font-mono bg-slate-900/60 px-3 py-1.5 rounded-full border border-slate-700/50">
            {history.length} events recorded
          </span>
        </div>

        {/* Vertical Timeline Container */}
        <div className="relative pt-2">
          <div className="absolute left-[5.5px] top-2 bottom-4 w-0.5 bg-gradient-to-b from-cyan-500 via-teal-500/50 to-slate-800 shadow-[0_0_12px_rgba(6,182,212,0.4)] pointer-events-none z-0" />

          <div className="space-y-8 relative z-10">
            {Object.entries(groupedHistory).map(([groupTitle, groupData]) => {
              if (!groupData?.items || groupData.items.length === 0) return null;
              const { items, totalMinutes, moviesCount, episodesCount } = groupData;

              return (
                <div key={groupTitle} className="space-y-4">
                  <div className="sticky top-4 z-30 flex items-center justify-start pl-8">
                    <div className="px-4 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/30 text-cyan-300 backdrop-blur-md shadow-xl flex items-center gap-2.5">
                      <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="font-bold text-xs sm:text-sm tracking-wide">{groupTitle}</span>
                      <span className="text-[11px] text-slate-400 font-mono pl-2 border-l border-slate-700">
                        {moviesCount > 0 && `${moviesCount} movie${moviesCount > 1 ? 's' : ''}`}
                        {moviesCount > 0 && episodesCount > 0 && ' · '}
                        {episodesCount > 0 && `${episodesCount} ep${episodesCount > 1 ? 's' : ''}`}
                        {totalMinutes > 0 && ` (${formatRuntime(totalMinutes)})`}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {items.map((item, idx) => (
                      <TimelineHistoryCard
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

    </div>
  );
};

export default Tracker;
