import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Calendar as CalendarIcon, Tv, Film, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { ListSkeleton } from '../components/shared/Skeleton';
import EmptyState from '../components/shared/EmptyState';
import StickyBar from '../components/shared/StickyBar';
import { useStickyBar } from '../lib/useStickyBar';
import { tmdbImgUrl } from '../lib/posterUrl';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Converts a release UTC ISO timestamp or airtime string into the user's local YYYY-MM-DD date key.
 */
export function getLocalDateKey(dateStr, type = 'episode') {
  if (!dateStr) return null;
  try {
    let raw = dateStr;
    if (!raw.includes('T')) {
      if (type === 'episode') {
        // Assume standard US Eastern broadcast air time (21:00 EDT / UTC-4) for TV episodes
        raw = `${dateStr}T21:00:00-04:00`;
      } else {
        return dateStr;
      }
    }
    const d = new Date(raw);
    if (isNaN(d.getTime())) return dateStr.split('T')[0];
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch (_) {
    return dateStr.split('T')[0];
  }
}

export default function Calendar() {
  const navigate = useNavigate();
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const { headerRef, stickyVisible: stickyBarVisible } = useStickyBar();

  const [viewMode, setViewMode] = useState(() => localStorage.getItem('calendarViewMode') || 'month');
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    localStorage.setItem('calendarViewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    const fetchUpcoming = async () => {
      setLoading(true);
      try {
        const res = await api.get('/library/calendar');
        if (res.data.status === 'success') {
          setEpisodes(res.data.data);
        }
      } catch (err) {
        console.error('Failed to fetch calendar', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUpcoming();

    const REFRESH_INTERVAL = 5 * 60 * 1000;
    const interval = setInterval(fetchUpcoming, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const groupedByDate = useMemo(() => {
    const groups = {};
    episodes.forEach(item => {
      if (!item.date) return;
      const dateKey = getLocalDateKey(item.date, item.type);
      if (!dateKey) return;
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    });
    return groups;
  }, [episodes]);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const goToToday = () => setCurrentDate(new Date());

  const prev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
    else if (viewMode === 'week') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const next = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
    else if (viewMode === 'week') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const { displayLabel, filteredDates, calendarGrid } = useMemo(() => {
    let label = '';
    let dates = [];
    let grid = null;

    if (viewMode === 'month') {
      const m = currentDate.getMonth();
      const y = currentDate.getFullYear();
      label = `${MONTHS[m]} ${y}`;

      dates = Object.entries(groupedByDate).filter(([dateKey]) => {
        const [yStr, mStr] = dateKey.split('-');
        return Number(mStr) === m + 1 && Number(yStr) === y;
      }).sort(([a], [b]) => a.localeCompare(b));

      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const firstDay = new Date(y, m, 1).getDay();
      grid = [];
      let week = Array(7).fill(null);
      let day = 1;
      for (let i = 0; i < firstDay; i++) week[i] = null;
      for (let i = firstDay; i < 7 && day <= daysInMonth; i++) {
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const eps = groupedByDate[dateStr] || [];
        week[i] = { day, date: dateStr, episodes: eps, isToday: dateStr === today };
        day++;
      }
      grid.push(week);
      while (day <= daysInMonth) {
        week = Array(7).fill(null);
        for (let i = 0; i < 7 && day <= daysInMonth; i++) {
          const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const eps = groupedByDate[dateStr] || [];
          week[i] = { day, date: dateStr, episodes: eps, isToday: dateStr === today };
          day++;
        }
        grid.push(week);
      }
    } else if (viewMode === 'week') {
      const d = new Date(currentDate);
      const dayOfWeek = d.getDay();
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - dayOfWeek);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const opts = { month: 'short', day: 'numeric' };
      label = `${weekStart.toLocaleDateString('en-US', opts)} – ${weekEnd.toLocaleDateString('en-US', opts)}${weekEnd.getFullYear() !== weekStart.getFullYear() ? `, ${weekEnd.getFullYear()}` : ''}, ${weekEnd.getFullYear()}`;

      for (let i = 0; i < 7; i++) {
        const cellDate = new Date(weekStart);
        cellDate.setDate(weekStart.getDate() + i);
        const yStr = cellDate.getFullYear();
        const mStr = String(cellDate.getMonth() + 1).padStart(2, '0');
        const dStr = String(cellDate.getDate()).padStart(2, '0');
        const dateStr = `${yStr}-${mStr}-${dStr}`;
        const eps = groupedByDate[dateStr] || [];
        if (eps.length > 0) {
          dates.push([dateStr, eps]);
        }
      }
      dates.sort(([a], [b]) => a.localeCompare(b));
    } else {
      const yStr = currentDate.getFullYear();
      const mStr = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dStr = String(currentDate.getDate()).padStart(2, '0');
      const dateStr = `${yStr}-${mStr}-${dStr}`;
      const opts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
      label = currentDate.toLocaleDateString('en-US', opts);
      if (groupedByDate[dateStr]) {
        dates.push([dateStr, groupedByDate[dateStr]]);
      }
    }

    return { displayLabel: label, filteredDates: dates, calendarGrid: grid };
  }, [viewMode, currentDate, groupedByDate, today]);

  const isWeekend = (colIndex) => colIndex === 0 || colIndex === 6;

  if (loading) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-100 flex items-center gap-3">
          <CalendarIcon className="w-8 h-8 text-cyan-400" /> Calendar
        </h1>
        <p className="text-slate-400 mt-1">Upcoming releases from your library.</p>
      </div>
      <ListSkeleton rows={6} />
    </div>
  );

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-500">
      {/* ── HEADER ── */}
      <div ref={headerRef} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-black text-slate-100 flex items-center gap-2 sm:gap-3 !mb-0">
              <CalendarIcon className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400" /> <span className="truncate">Calendar</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5 sm:mt-1 hidden sm:block">Upcoming releases from your library</p>
          </div>
          {/* Mobile view mode toggle */}
          <div className="flex bg-slate-800/80 rounded-xl p-1 border border-white/10 shrink-0 sm:hidden backdrop-blur">
            {['month', 'week', 'day'].map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all capitalize ${
                  viewMode === mode ? 'bg-cyan-500/20 text-cyan-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop nav controls */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <div className="flex bg-slate-800/80 rounded-xl p-1 border border-white/10 shrink-0 backdrop-blur">
            {['month', 'week', 'day'].map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all capitalize ${
                  viewMode === mode ? 'bg-cyan-500/20 text-cyan-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <button onClick={prev} className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700 border border-white/5 transition-all text-slate-400 hover:text-white">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-slate-200 min-w-[160px] text-center whitespace-nowrap tracking-tight">
            {displayLabel}
          </span>
          <button onClick={next} className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700 border border-white/5 transition-all text-slate-400 hover:text-white">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-xs font-bold rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 transition-all"
          >
            Today
          </button>
        </div>
      </div>

      <StickyBar visible={stickyBarVisible}>
        <div className="flex items-center gap-1 ml-auto sm:hidden">
          <button onClick={prev} className="p-1 text-slate-400 hover:text-white transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-bold text-slate-300">{displayLabel}</span>
          <button onClick={next} className="p-1 text-slate-400 hover:text-white transition-colors">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </StickyBar>

      {/* ═══════════════════ MONTH VIEW ═══════════════════ */}
      {viewMode === 'month' && calendarGrid ? (<>
        <div className="rounded-3xl overflow-hidden border border-slate-700/50 bg-slate-900/40 backdrop-blur-xl shadow-2xl">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7">
            {DAYS.map((d, i) => (
              <div key={d} className={`text-center py-3.5 text-[11px] font-bold uppercase tracking-widest ${
                isWeekend(i) ? 'text-slate-600 bg-slate-900/40' : 'text-slate-500 bg-slate-900/20'
              }`}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {calendarGrid.flat().map((cell, i) => {
              const colIndex = i % 7;
              const isLastRow = i >= calendarGrid.flat().length - 7;
              const weekend = isWeekend(colIndex);
              const posterItem = cell?.episodes?.find(e => e.poster_path);
              const posterUrl = posterItem ? tmdbImgUrl(posterItem.poster_path, 'w500') : null;

              return (
                <div
                  key={`cell-${i}`}
                  className={`min-h-[110px] sm:min-h-[130px] p-2 sm:p-2.5 border-r border-b transition-all duration-300 flex flex-col relative overflow-hidden group
                    ${!isLastRow ? 'border-b-white/5' : 'border-b-transparent'}
                    ${colIndex < 6 ? 'border-r-white/5' : 'border-r-transparent'}
                    ${!cell ? `${weekend ? 'bg-slate-950/40' : 'bg-slate-950/20'}` : ''}
                    ${cell ? `${weekend ? 'bg-slate-900/40' : 'bg-slate-900/20'} hover:bg-slate-800/50 cursor-pointer` : ''}
                    ${cell?.isToday ? '!bg-cyan-500/5 ring-1 ring-inset ring-cyan-500/30' : ''}
                  `}
                  onClick={() => { if (cell) setCurrentDate(new Date(cell.date + 'T00:00:00')); }}
                >
                  {cell && (
                    <>
                      {/* Background poster with right side fade */}
                      {posterUrl && (
                        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                          <img
                            src={posterUrl}
                            alt=""
                            className="w-full h-full object-cover object-left opacity-35 group-hover:opacity-55 group-hover:scale-105 transition-all duration-500"
                            style={{
                              maskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 45%, rgba(0,0,0,0) 85%)',
                              WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 45%, rgba(0,0,0,0) 85%)'
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/60 via-slate-950/40 to-slate-950/85" />
                        </div>
                      )}

                      {/* Day number */}
                      <div className="flex items-center justify-between mb-1.5 relative z-10">
                        <span className={`text-xs font-bold ${
                          cell.isToday
                            ? 'bg-cyan-500 text-slate-950 w-6 h-6 rounded-full flex items-center justify-center shadow-lg shadow-cyan-500/30 font-black'
                            : weekend ? 'text-slate-400 drop-shadow' : 'text-slate-200 drop-shadow'
                        }`}>
                          {cell.day}
                        </span>
                        {cell.episodes.length > 0 && (
                          <span className="text-[10px] font-bold text-slate-200 bg-slate-950/80 backdrop-blur-md px-1.5 py-0.5 rounded-full border border-white/15 shadow-sm">
                            {cell.episodes.length}
                          </span>
                        )}
                      </div>

                      {/* Episode/movie content */}
                      {(() => {
                        const movies = cell.episodes.filter(e => e.type === 'movie');
                        const tvEps = cell.episodes.filter(e => e.type !== 'movie');
                        const grouped = {};
                        tvEps.forEach(ep => {
                          if (!grouped[ep.show_id]) grouped[ep.show_id] = [];
                          grouped[ep.show_id].push(ep);
                        });
                        const showEntries = Object.entries(grouped);
                        const maxVisible = 3;
                        const visibleShows = showEntries.slice(0, maxVisible);
                        const remainingShows = showEntries.length - maxVisible;
                        const remainingMovies = Math.max(0, movies.length - Math.max(0, maxVisible - visibleShows.length));

                        if (movies.length === 0 && showEntries.length === 0) return null;

                        return (
                          <div className="space-y-1 flex-1 overflow-hidden relative z-10">
                            {/* Show posters + movie posters mixed, up to maxVisible */}
                            {[...visibleShows.map(([showId, eps]) => ({ type: 'show', eps, showId })), ...movies.slice(0, maxVisible - visibleShows.length).map(m => ({ type: 'movie', item: m }))].map((entry, j) => {
                              if (entry.type === 'show') {
                                const ep = entry.eps[0];
                                return (
                                  <div
                                    key={`show-${j}`}
                                    onClick={(e) => { e.stopPropagation(); navigate(`/shows/${ep.show_id}`); }}
                                    className="flex items-center gap-1.5 group/item cursor-pointer rounded-lg hover:bg-white/15 py-1 px-1.5 transition-all backdrop-blur-xs hover:shadow-md"
                                    title={`${ep.show_title}${entry.eps.length > 1 ? ` (${entry.eps.length} eps)` : ''}`}
                                  >
                                    <Tv className="w-3.5 h-3.5 text-purple-400 shrink-0 filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[11px] leading-tight font-bold truncate text-slate-100 group-hover/item:text-purple-300 transition-colors filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                                        {ep.show_title}
                                      </p>
                                      <p className="text-[10px] text-slate-300 font-medium truncate filter drop-shadow">
                                        {entry.eps.length === 1
                                          ? `S${String(ep.season_number).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')}`
                                          : `${entry.eps.length} episodes`}
                                      </p>
                                    </div>
                                  </div>
                                );
                              }
                              // Movie
                              return (
                                <div
                                  key={`movie-${j}`}
                                  onClick={(e) => { e.stopPropagation(); navigate(`/movies/${entry.item.show_id}`); }}
                                  className="flex items-center gap-1.5 group/item cursor-pointer rounded-lg hover:bg-white/15 py-1 px-1.5 transition-all backdrop-blur-xs hover:shadow-md"
                                  title={entry.item.title}
                                >
                                  <Film className="w-3.5 h-3.5 text-emerald-400 shrink-0 filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
                                  <p className="text-[11px] leading-tight font-bold truncate text-slate-100 group-hover/item:text-emerald-300 transition-colors flex-1 min-w-0 filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                                    {entry.item.title}
                                  </p>
                                </div>
                              );
                            })}
                            {(remainingShows > 0 || remainingMovies > 0) && (
                              <p className="text-[10px] text-slate-300 font-bold pl-5 filter drop-shadow">
                                +{remainingShows + remainingMovies} more
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 text-xs text-slate-400 font-medium pt-2">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-emerald-400" />
            <span>Movies</span>
          </div>
          <div className="flex items-center gap-2">
            <Tv className="w-4 h-4 text-purple-400" />
            <span>TV Shows</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-cyan-500 flex items-center justify-center shadow-md shadow-cyan-500/30">
              <Sparkles className="w-2.5 h-2.5 text-slate-950" />
            </div>
            <span>Today</span>
          </div>
        </div>
      </>) : (
        /* ═══════════════════ WEEK / DAY VIEWS ═══════════════════ */
        <>
          {filteredDates.length === 0 ? (
            <EmptyState
              icon="tv"
              title={viewMode === 'day' ? 'Nothing this day' : 'Nothing this week'}
              description="Add movies and shows to your library to see upcoming releases."
            />
          ) : (
            <div className="space-y-5">
              {filteredDates.map(([date, eps]) => {
                const isToday = date === today;
                const d = new Date(date + 'T00:00:00');
                const movies = eps.filter(e => e.type === 'movie');
                const tvEps = eps.filter(e => e.type !== 'movie');

                return (
                  <div key={date} className={`rounded-3xl overflow-hidden border backdrop-blur-xl shadow-xl transition-all ${
                    isToday
                      ? 'border-cyan-500/40 bg-cyan-500/5 ring-1 ring-cyan-500/20'
                      : 'border-slate-700/50 bg-slate-900/40'
                  }`}>
                    {/* Date header */}
                    <div className={`px-5 py-3.5 flex items-center gap-4 ${
                      isToday ? 'bg-cyan-500/10 border-b border-cyan-500/20' : 'bg-slate-800/40 border-b border-white/5'
                    }`}>
                      <div className={`text-center min-w-[44px] ${
                        isToday ? 'bg-cyan-500 text-slate-950 rounded-xl px-2 py-1 shadow-lg shadow-cyan-500/30' : ''
                      }`}>
                        <div className={`text-2xl font-black ${isToday ? 'text-slate-950' : 'text-slate-100'}`}>{d.getDate()}</div>
                        <div className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? 'text-slate-900' : 'text-slate-400'}`}>
                          {MONTHS[d.getMonth()].substring(0, 3)}
                        </div>
                      </div>
                      <div>
                        <p className={`text-sm font-bold ${isToday ? 'text-cyan-300' : 'text-slate-200'}`}>
                          {d.toLocaleDateString('en-US', { weekday: 'long' })}
                        </p>
                        <p className="text-xs text-slate-400">
                          {movies.length > 0 && `${movies.length} movie${movies.length > 1 ? 's' : ''}`}
                          {movies.length > 0 && tvEps.length > 0 && ' · '}
                          {tvEps.length > 0 && `${tvEps.length} episode${tvEps.length > 1 ? 's' : ''}`}
                        </p>
                      </div>
                      {isToday && (
                        <span className="ml-auto px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1 shadow-sm">
                          <Sparkles className="w-3 h-3" /> Today
                        </span>
                      )}
                    </div>

                    {/* Items */}
                    <div className="divide-y divide-white/5">
                      {eps.map((item, i) => {
                        if (item.type === 'movie') {
                          return (
                            <div
                              key={`movie-${i}`}
                              onClick={() => navigate(`/movies/${item.show_id}`)}
                              className="px-5 py-3.5 flex items-center gap-3.5 hover:bg-slate-800/40 transition-all cursor-pointer group/item"
                            >
                              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                                <Film className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-100 truncate group-hover/item:text-emerald-300 transition-colors">{item.title}</p>
                                <p className="text-xs text-slate-400 mt-0.5">Movie Release</p>
                              </div>
                              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30 shrink-0">Movie</span>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={`ep-${i}`}
                            onClick={() => navigate(`/shows/${item.show_id}`)}
                            className="px-5 py-3.5 flex items-center gap-3.5 hover:bg-slate-800/40 transition-all cursor-pointer group/item"
                          >
                            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 shrink-0">
                              <Tv className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-100 truncate group-hover/item:text-purple-300 transition-colors">{item.show_title}</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                S{String(item.season_number).padStart(2, '0')}E{String(item.episode_number).padStart(2, '0')}
                                {item.title && ` — ${item.title}`}
                              </p>
                            </div>
                            <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-full border border-purple-500/30 shrink-0">TV</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

