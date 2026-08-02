import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Clock, Film, Tv, Play, ChevronRight, ChevronLeft, Trash2, Undo2, Eye } from 'lucide-react';
import { tmdbImgUrl } from '../lib/posterUrl';

const formatRuntime = (minutes) => {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

const formatTotalTime = (minutes) => {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

const HistoryItem = ({ item, index, handleMarkUnwatched, handleDeleteHistory }) => {
  const isMovie = item.type === 'movie';
  const [localTitle, setLocalTitle] = useState(isMovie ? item.movie_title : item.show_title);
  const [localPoster, setLocalPoster] = useState(isMovie ? item.movie_poster : item.show_poster);

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
          console.error('Failed to fetch tmdb data for history item', e);
        }
      };
      fetchTmdb();
    }
  }, [item.tmdb_id, isMovie, localTitle]);

  const title = localTitle || `${isMovie ? 'Movie' : 'Show'} (TMDB: ${item.tmdb_id})`;
  const poster = localPoster;
  
  return (
    <div key={item.history_id || index} className="p-4 flex items-center gap-4 hover:bg-slate-700/20 transition-colors group">
      {/* Tiny Poster */}
      <div className="w-12 h-16 bg-slate-800 rounded overflow-hidden flex-shrink-0">
        {poster ? (
          <img src={tmdbImgUrl(poster, 'w200')} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex justify-center items-center">
            {isMovie ? <Film className="w-5 h-5 text-slate-500" /> : <Tv className="w-5 h-5 text-slate-500" />}
          </div>
        )}
      </div>
      
      {/* Info */}
      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${isMovie ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {isMovie ? 'Movie' : 'Episode'}
          </span>
          <span className="text-sm text-slate-400">
            {new Date(item.watched_at).toLocaleDateString()} {new Date(item.watched_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          </span>
        </div>
        <h4 className="text-slate-100 font-medium text-lg mt-1 truncate">
          {title}
        </h4>
        {!isMovie && item.season_number != null && item.episode_number != null && (
          <p className="text-sm text-slate-400">
            S{String(item.season_number).padStart(2, '0')} E{String(item.episode_number).padStart(2, '0')} 
            {item.episode_title ? ` - ${item.episode_title}` : ''}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
        <button
          onClick={() => handleMarkUnwatched(item)}
          className="p-2 rounded-lg hover:bg-amber-500/10 text-slate-500 hover:text-amber-400 transition-all"
          title="Mark unwatched"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleDeleteHistory(item.history_id)}
          className="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-all"
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
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollWidth, clientWidth, scrollLeft } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 5);
      setCanScrollRight(scrollWidth - (scrollLeft + clientWidth) > 5);
    }
  };

  const scrollContainer = (dir) => {
    if (scrollRef.current) {
      const amount = 450;
      scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [upNextEpisodes, upNextMovies]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, historyRes, upNextRes] = await Promise.all([
        api.get('/tracker/stats'),
        api.get('/tracker/history?limit=30'),
        api.get('/tracker/up-next')
      ]);

      setStats(statsRes.data.stats);
      setHistory(historyRes.data.history);
      setUpNextMovies(upNextRes.data.movies);
      setUpNextEpisodes(upNextRes.data.episodes);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch tracker data', err);
      setError('Failed to load tracking data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleMarkWatched = async (tmdbId, type, season, episode) => {
    try {
      await api.post('/tracker/mark-watched', { tmdbId, type, season, episode });
      fetchData();
    } catch (err) {
      console.error('Failed to mark as watched', err);
    }
  };

  const handleDeleteHistory = async (historyId) => {
    try {
      await api.delete(`/tracker/history/${historyId}`);
      setHistory(prev => prev.filter(item => item.history_id !== historyId));
      const statsRes = await api.get('/tracker/stats');
      setStats(statsRes.data.stats);
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
      // Remove from local history and refresh
      setHistory(prev => prev.filter(h => h.history_id !== item.history_id));
      const statsRes = await api.get('/tracker/stats');
      setStats(statsRes.data.stats);
    } catch (err) {
      console.error('Failed to mark unwatched', err);
    }
  };

  if (loading && !stats) {
    return (
      <div className="flex justify-center items-center h-64 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mr-3"></div>
        Loading tracker data...
      </div>
    );
  }

  if (error) {
    return <div className="text-red-400 p-8 text-center">{error}</div>;
  }

  const hasUpNext = upNextEpisodes.length > 0 || upNextMovies.length > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
            <Clock className="w-8 h-8 text-primary-400" />
            Watch Tracker
          </h1>
          <p className="text-slate-400 mt-2 text-lg">Your all-time watch history and statistics.</p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-slate-800/60 backdrop-blur-md rounded-2xl p-6 border border-slate-700/50 shadow-xl transition-transform hover:scale-[1.02]">
            <div className="flex items-center gap-4 mb-4 text-primary-400">
              <div className="p-3 bg-primary-500/10 rounded-xl">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-medium text-slate-300">Total Time</h3>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-slate-100">{stats.total_days}</span>
              <span className="text-slate-400 text-lg">Days</span>
            </div>
            <div className="mt-2 text-sm text-slate-500">Approx {stats.total_hours} hours total</div>
          </div>

          <div className="bg-slate-800/60 backdrop-blur-md rounded-2xl p-6 border border-slate-700/50 shadow-xl transition-transform hover:scale-[1.02]">
            <div className="flex items-center gap-4 mb-4 text-purple-400">
              <div className="p-3 bg-purple-500/10 rounded-xl">
                <Film className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-medium text-slate-300">Movies Watched</h3>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-slate-100">{stats.movies.count.toLocaleString()}</span>
            </div>
          </div>

          <div className="bg-slate-800/60 backdrop-blur-md rounded-2xl p-6 border border-slate-700/50 shadow-xl transition-transform hover:scale-[1.02]">
            <div className="flex items-center gap-4 mb-4 text-emerald-400">
              <div className="p-3 bg-emerald-500/10 rounded-xl">
                <Tv className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-medium text-slate-300">Episodes Watched</h3>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-slate-100">{stats.episodes.count.toLocaleString()}</span>
            </div>
          </div>

          <div className="bg-slate-800/60 backdrop-blur-md rounded-2xl p-6 border border-slate-700/50 shadow-xl transition-transform hover:scale-[1.02]">
            <div className="flex items-center gap-4 mb-4 text-sky-400">
              <div className="p-3 bg-sky-500/10 rounded-xl">
                <Tv className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-medium text-slate-300">Shows Watched</h3>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-slate-100">{stats.shows?.count?.toLocaleString() || 0}</span>
            </div>
          </div>
        </div>
      )}

      {/* Continue Watching Section */}
      {hasUpNext && (
        <div className="space-y-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
              <Play className="w-5 h-5 text-primary-400" />
              Continue Watching
            </h2>
            
            {/* Scroll Navigation */}
            {(canScrollLeft || canScrollRight) && (
              <div className="flex items-center gap-2 pr-2">
                <button 
                  onClick={() => scrollContainer('left')}
                  disabled={!canScrollLeft}
                  className={`p-1.5 rounded-full bg-slate-800 border transition-all ${canScrollLeft ? 'border-slate-600 hover:bg-slate-700 text-white cursor-pointer' : 'border-slate-700 text-slate-600 opacity-50 cursor-not-allowed'}`}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => scrollContainer('right')}
                  disabled={!canScrollRight}
                  className={`p-1.5 rounded-full bg-slate-800 border transition-all ${canScrollRight ? 'border-slate-600 hover:bg-slate-700 text-white cursor-pointer' : 'border-slate-700 text-slate-600 opacity-50 cursor-not-allowed'}`}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          <div 
            ref={scrollRef}
            className="flex gap-6 overflow-x-auto pb-4 -mx-2 px-2 hide-scrollbar snap-x"
            onScroll={checkScroll}
          >
            {/* Episodes */}
            {upNextEpisodes.map(ep => {
              const runtime = formatRuntime(ep.runtime);
              const totalTime = formatTotalTime(ep.total_time_left);
              const progressText = `${ep.episodes_left} left${totalTime ? ` · ${totalTime}` : ''}`;

              let badge = null;
              if (ep.is_series_finale) badge = { text: 'Series Finale', color: 'bg-red-500/20 text-red-400 border-red-500/30' };
              else if (ep.is_finale) badge = { text: 'Finale', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
              else if (ep.is_premiere) badge = { text: 'Premiere', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };

              return (
                <div
                  key={`ep-${ep.episode_id}`}
                  onClick={() => navigate(`/shows/${ep.show_id}`)}
                  className="group relative flex-shrink-0 w-[420px] h-[240px] bg-slate-800 rounded-2xl overflow-hidden border border-slate-700/50 hover:border-slate-500/60 transition-all duration-300 hover:shadow-xl hover:shadow-black/30 snap-start cursor-pointer"
                >
                  {/* Background image */}
                  {ep.poster_path ? (
                    <img
                      src={tmdbImgUrl(ep.poster_path, 'w780')}
                      alt={ep.show_title}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-slate-700">
                      <Tv className="w-12 h-12 text-slate-500" />
                    </div>
                  )}

                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                  {/* Content */}
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-sm font-bold text-white leading-tight line-clamp-1 mb-1">
                      {ep.show_title}
                    </h3>
                    <div className="text-xs text-slate-300 mb-2">
                      S{ep.season_number} · E{ep.episode_number}
                      {ep.episode_title && (
                        <span className="line-clamp-1"> · {ep.episode_title}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      {badge && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.color}`}>
                          {badge.text}
                        </span>
                      )}
                    </div>

                    {ep.episodes_left > 0 && (() => {
                      const totalEps = ep.total_episodes || 1;
                      const epsWatched = totalEps - ep.episodes_left;
                      const showProgress = totalEps > 0 
                        ? Math.max(15, (epsWatched / totalEps) * 100) 
                        : 0;
                        
                      return (
                        <div className="relative w-full h-7 bg-slate-700/60 rounded-full overflow-hidden flex items-center justify-between px-3 mt-2 shadow-inner border border-white/5">
                          <div 
                            className="absolute top-0 left-0 bottom-0 bg-slate-900/90 rounded-full transition-all duration-500" 
                            style={{ width: `${showProgress}%` }} 
                          />
                          <span className="relative z-10 text-[11px] font-bold text-white tracking-wide">
                            {runtime || ''}
                          </span>
                          <span className="relative z-10 text-[10px] font-semibold text-slate-300">
                            {progressText}
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Watched toggle — top right */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkWatched(ep.tmdb_id, 'episode', ep.season_number, ep.episode_number);
                    }}
                    className="absolute top-3 right-3 px-3 py-1.5 text-[11px] font-bold tracking-wide rounded-full bg-black/60 hover:bg-emerald-500/30 border border-white/20 hover:border-emerald-400/50 text-white/80 hover:text-emerald-400 transition-all backdrop-blur-sm shadow-sm"
                    title="Mark as Watched"
                  >
                    Mark as Watched
                  </button>

                  {/* Playback Progress Bar at Absolute Bottom */}
                  {ep.watch_progress > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800/80 backdrop-blur">
                      <div
                        className="h-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                        style={{ width: `${ep.watch_progress}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Movies */}
            {upNextMovies.map(movie => {
              const runtime = formatRuntime(movie.runtime);

              return (
                <div
                  key={`movie-${movie.id}`}
                  onClick={() => navigate(`/movies/${movie.id}`)}
                  className="group relative flex-shrink-0 w-[420px] h-[240px] bg-slate-800 rounded-2xl overflow-hidden border border-slate-700/50 hover:border-slate-500/60 transition-all duration-300 hover:shadow-xl hover:shadow-black/30 snap-start cursor-pointer"
                >
                  {/* Background image */}
                  {movie.poster_path ? (
                    <img
                      src={tmdbImgUrl(movie.poster_path, 'w780')}
                      alt={movie.title}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-slate-700">
                      <Film className="w-12 h-12 text-slate-500" />
                    </div>
                  )}

                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                  {/* Content */}
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-sm font-bold text-white leading-tight line-clamp-1 mb-1">
                      {movie.title}
                    </h3>
                    <div className="text-xs text-slate-300 mb-2">Movie</div>

                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-purple-500/30 text-purple-300 border-purple-500/40">
                        Movie
                      </span>
                      {runtime && (
                        <span className="text-xs text-slate-400">{runtime}</span>
                      )}
                    </div>

                    <div>
                      <p className="text-[11px] text-slate-400">Not watched</p>
                    </div>
                  </div>

                  {/* Watched toggle — top right */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkWatched(movie.tmdb_id, 'movie');
                    }}
                    className="absolute top-3 right-3 px-3 py-1.5 text-[11px] font-bold tracking-wide rounded-full bg-black/60 hover:bg-emerald-500/30 border border-white/20 hover:border-emerald-400/50 text-white/80 hover:text-emerald-400 transition-all backdrop-blur-sm shadow-sm"
                    title="Mark as Watched"
                  >
                    Mark as Watched
                  </button>

                  {/* Playback Progress Bar at Absolute Bottom */}
                  {movie.watch_progress > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800/80 backdrop-blur">
                      <div
                        className="h-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                        style={{ width: `${movie.watch_progress}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state when nothing to watch */}
      {!hasUpNext && (
        <div className="text-center py-12">
          <Play className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-lg">All caught up!</p>
          <p className="text-slate-600 text-sm mt-1">Nothing to watch right now.</p>
        </div>
      )}

      {/* History Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-100 border-b border-slate-800 pb-2 flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary-400" />
          Recent Watch History
        </h2>
        
        {history.length === 0 ? (
          <div className="text-slate-500 italic py-4">No watch history available.</div>
        ) : (
          <div className="bg-slate-800/40 rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="divide-y divide-slate-700/50">
              {history.map((item, index) => (
                <HistoryItem 
                  key={item.history_id || index} 
                  item={item} 
                  index={index} 
                  handleMarkUnwatched={handleMarkUnwatched} 
                  handleDeleteHistory={handleDeleteHistory} 
                />
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default Tracker;
