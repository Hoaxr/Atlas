import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Calendar as CalendarIcon, Tv, Film, ChevronLeft, ChevronRight } from 'lucide-react';
import LoadingState from '../components/shared/LoadingState';
import EmptyState from '../components/shared/EmptyState';
import StickyBar from '../components/shared/StickyBar';
import { useStickyBar } from '../lib/useStickyBar';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Converts a release date or timestamp into the YYYY-MM-DD calendar key.
 */
export function getLocalDateKey(dateStr) {
  if (!dateStr) return null;
  // If ISO string with T, extract the date portion directly to maintain broadcast release day
  return dateStr.split('T')[0];
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

  if (loading) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 sm:gap-3 !mb-0">
          <CalendarIcon className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 shrink-0" /> <span className="truncate">Calendar</span>
        </h1>
        <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block !mb-0">Upcoming releases from your library.</p>
      </div>
      <LoadingState className="min-h-[40vh] py-16" />
    </div>
  );

  return (
    <div className="space-y-5 pb-16 animate-in fade-in duration-500">
      {/* ── HEADER ── */}
      <div ref={headerRef} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 sm:gap-3 !mb-0">
              <CalendarIcon className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 shrink-0" /> <span className="truncate">Calendar</span>
            </h1>
            <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block !mb-0">Upcoming releases from your library.</p>
          </div>
          {/* Mobile view mode toggle */}
          <div className="flex bg-[#101e31] rounded-xl p-1 border border-[#1c2d46] shrink-0 sm:hidden">
            {['month', 'week', 'day'].map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all capitalize ${
                  viewMode === mode ? 'bg-gradient-to-b from-[#38a7f4] to-[#2291ea] text-slate-950 font-bold' : 'text-slate-300'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop nav controls */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          <div className="relative flex items-center bg-[#101e31] p-1 rounded-xl border border-[#1c2d46] shadow-inner select-none shrink-0">
            {['month', 'week', 'day'].map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`relative h-8 px-3.5 flex items-center justify-center rounded-lg text-xs font-semibold capitalize transition-colors duration-150 ${
                  viewMode === mode ? 'text-slate-950 font-bold' : 'text-slate-100 hover:text-white'
                }`}
              >
                {viewMode === mode && (
                  <motion.div
                    layoutId="calendar-view-slider"
                    className="absolute inset-0 rounded-lg bg-gradient-to-b from-[#38a7f4] to-[#2291ea] shadow-sm"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10">{mode}</span>
              </button>
            ))}
          </div>
          <button
            onClick={prev}
            className="h-10 w-10 flex items-center justify-center rounded-xl bg-[#101e31] hover:bg-[#16273f] border border-[#1c2d46] hover:border-slate-600 text-slate-100 hover:text-white transition-colors shadow-sm"
            title="Previous"
            aria-label="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm sm:text-base font-bold text-slate-100 min-w-[150px] text-center whitespace-nowrap">
            {displayLabel}
          </span>
          <button
            onClick={next}
            className="h-10 w-10 flex items-center justify-center rounded-xl bg-[#101e31] hover:bg-[#16273f] border border-[#1c2d46] hover:border-slate-600 text-slate-100 hover:text-white transition-colors shadow-sm"
            title="Next"
            aria-label="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={goToToday}
            className="h-10 px-4 text-xs font-bold rounded-xl bg-[#101e31] hover:bg-[#16273f] text-slate-100 hover:text-white border border-[#1c2d46] hover:border-slate-600 transition-colors shadow-sm"
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
        <div className="rounded-2xl overflow-hidden border border-[#1c2d46] bg-[#0c1424] shadow-2xl">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 border-b border-[#1c2d46] bg-[#101e31]">
            {DAYS.map((d) => (
              <div key={d} className="text-center py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {calendarGrid.flat().map((cell, i) => {
              const colIndex = i % 7;
              const isLastRow = i >= calendarGrid.flat().length - 7;

              return (
                <div
                  key={`cell-${i}`}
                  className={`min-h-[110px] sm:min-h-[125px] p-2 sm:p-2.5 border-r border-b transition-colors flex flex-col relative overflow-hidden group
                    ${!isLastRow ? 'border-b-[#1c2d46]/50' : 'border-b-transparent'}
                    ${colIndex < 6 ? 'border-r-[#1c2d46]/50' : 'border-r-transparent'}
                    ${!cell ? 'bg-[#080f1a]/50' : 'bg-[#0a1320] hover:bg-[#101e31]/40 cursor-pointer'}
                    ${cell?.isToday ? '!bg-[#0c1e34] ring-1 ring-inset ring-cyan-500/40' : ''}
                  `}
                  onClick={() => { if (cell) setCurrentDate(new Date(cell.date + 'T00:00:00')); }}
                >
                  {cell && (
                    <>
                      {/* Day number & count */}
                      <div className="flex items-center justify-between mb-2 relative z-10">
                        <span className={`text-xs font-semibold ${
                          cell.isToday
                            ? 'bg-gradient-to-b from-[#38a7f4] to-[#2291ea] text-slate-950 w-6 h-6 rounded-full flex items-center justify-center font-bold shadow-sm'
                            : 'text-slate-400 group-hover:text-slate-200'
                        }`}>
                          {cell.day}
                        </span>
                        {cell.episodes.length > 2 && (
                          <span className="text-[10px] font-semibold text-slate-400 bg-[#101e31] px-1.5 py-0.5 rounded-md border border-[#1c2d46]">
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
                          <div className="space-y-1.5 flex-1 min-w-0">
                            {[...visibleShows.map(([showId, eps]) => ({ type: 'show', eps, showId })), ...movies.slice(0, maxVisible - visibleShows.length).map(m => ({ type: 'movie', item: m }))].map((entry, j) => {
                              if (entry.type === 'show') {
                                const ep = entry.eps[0];
                                return (
                                  <div
                                    key={`show-${j}`}
                                    onClick={(e) => { e.stopPropagation(); navigate(`/shows/${ep.show_id}`); }}
                                    className="group/item flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#101e31] hover:bg-[#16273f] border border-[#1c2d46] hover:border-slate-500/60 transition-all cursor-pointer shadow-xs min-w-0"
                                    title={`${ep.show_title}${entry.eps.length > 1 ? ` (${entry.eps.length} eps)` : ''} — ${entry.eps.length === 1 ? `S${String(ep.season_number).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')}` : `${entry.eps.length} episodes`}`}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 group-hover/item:scale-125 transition-transform" />
                                    <span className="text-[11px] font-medium text-slate-200 group-hover/item:text-white truncate flex-1 min-w-0">
                                      {ep.show_title}
                                    </span>
                                  </div>
                                );
                              }
                              // Movie
                              return (
                                <div
                                  key={`movie-${j}`}
                                  onClick={(e) => { e.stopPropagation(); navigate(`/movies/${entry.item.show_id}`); }}
                                  className="group/item flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#101e31] hover:bg-[#16273f] border border-[#1c2d46] hover:border-slate-500/60 transition-all cursor-pointer shadow-xs min-w-0"
                                  title={entry.item.title}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0 group-hover/item:scale-125 transition-transform" />
                                  <span className="text-[11px] font-medium text-slate-200 group-hover/item:text-white truncate flex-1 min-w-0">
                                    {entry.item.title}
                                  </span>
                                </div>
                              );
                            })}
                            {(remainingShows > 0 || remainingMovies > 0) && (
                              <p className="text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 pl-1">
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
        <div className="flex items-center justify-center gap-6 text-xs text-slate-400 font-medium pt-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-xs" />
            <span className="text-slate-300">TV Shows</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-xs" />
            <span className="text-slate-300">Movies</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white shadow-xs" />
            <span className="text-slate-300">Today</span>
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
            <div className="space-y-4">
              {filteredDates.map(([date, eps]) => {
                const isToday = date === today;
                const d = new Date(date + 'T00:00:00');
                const movies = eps.filter(e => e.type === 'movie');
                const tvEps = eps.filter(e => e.type !== 'movie');

                return (
                  <div key={date} className={`rounded-xl overflow-hidden border backdrop-blur-sm shadow-md transition-all ${
                    isToday
                      ? 'border-cyan-500/40 bg-slate-900/80 ring-1 ring-cyan-500/30'
                      : 'border-[#1c2d46] bg-[#0c1626]/90'
                  }`}>
                    {/* Date header */}
                    <div className={`px-4 py-3 flex items-center gap-3.5 ${
                      isToday ? 'bg-cyan-500/15 border-b border-cyan-500/30' : 'bg-[#15243b] border-b border-[#1c2d46]'
                    }`}>
                      <div className={`text-center min-w-[40px] ${
                        isToday ? 'bg-cyan-500 text-slate-950 rounded-lg px-2 py-0.5' : ''
                      }`}>
                        <div className={`text-xl font-black ${isToday ? 'text-slate-950' : 'text-slate-100'}`}>{d.getDate()}</div>
                        <div className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? 'text-slate-900' : 'text-slate-400'}`}>
                          {MONTHS[d.getMonth()].substring(0, 3)}
                        </div>
                      </div>
                      <div>
                        <p className={`text-sm font-bold ${isToday ? 'text-cyan-300' : 'text-slate-100'}`}>
                          {d.toLocaleDateString('en-US', { weekday: 'long' })}
                        </p>
                        <p className="text-xs text-slate-400">
                          {movies.length > 0 && `${movies.length} movie${movies.length > 1 ? 's' : ''}`}
                          {movies.length > 0 && tvEps.length > 0 && ' · '}
                          {tvEps.length > 0 && `${tvEps.length} episode${tvEps.length > 1 ? 's' : ''}`}
                        </p>
                      </div>
                      {isToday && (
                        <span className="ml-auto px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm">
                          Today
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
                              className="px-5 py-3.5 flex items-center gap-3.5 hover:bg-[#101e31]/60 transition-all cursor-pointer group/item"
                            >
                              <div className="p-2.5 rounded-xl bg-[#101e31] border border-[#1c2d46] text-sky-400 group-hover/item:border-cyan-500/40 group-hover/item:text-cyan-300 transition-colors shrink-0">
                                <Film className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-100 truncate group-hover/item:text-cyan-300 transition-colors">{item.title}</p>
                                <p className="text-xs text-slate-400 mt-0.5">Movie Release</p>
                              </div>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-[#101e31] px-2.5 py-1 rounded-md border border-[#1c2d46] shrink-0">Movie</span>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={`ep-${i}`}
                            onClick={() => navigate(`/shows/${item.show_id}`)}
                            className="px-5 py-3.5 flex items-center gap-3.5 hover:bg-[#101e31]/60 transition-all cursor-pointer group/item"
                          >
                            <div className="p-2.5 rounded-xl bg-[#101e31] border border-[#1c2d46] text-cyan-400 group-hover/item:border-cyan-500/40 group-hover/item:text-cyan-300 transition-colors shrink-0">
                              <Tv className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-100 truncate group-hover/item:text-cyan-300 transition-colors">{item.show_title}</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {item.title || 'New Episode'}
                              </p>
                            </div>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-[#101e31] px-2.5 py-1 rounded-md border border-[#1c2d46] shrink-0">TV</span>
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

