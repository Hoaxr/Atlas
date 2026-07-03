import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Calendar as CalendarIcon, Tv, ChevronLeft, ChevronRight } from 'lucide-react';
import { ListSkeleton } from '../components/shared/Skeleton';
import EmptyState from '../components/shared/EmptyState';
import StickyBar from '../components/shared/StickyBar';
import { useStickyBar } from '../lib/useStickyBar';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
    fetchUpcoming();
  }, []);

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

  // Group episodes and movies by date
  const groupedByDate = {};
  episodes.forEach(item => {
    if (!item.date) return;
    const date = item.date.split('T')[0];
    if (!groupedByDate[date]) groupedByDate[date] = [];
    groupedByDate[date].push(item);
  });

  const today = new Date().toISOString().split('T')[0];

  // Navigation helpers
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

  // Compute displayed date range and label
  const { displayLabel, filteredDates, calendarGrid } = useMemo(() => {
    let label = '';
    let dates = [];
    let grid = null;

    if (viewMode === 'month') {
      const m = currentDate.getMonth();
      const y = currentDate.getFullYear();
      label = `${MONTHS[m]} ${y}`;

      dates = Object.entries(groupedByDate).filter(([date]) => {
        const d = new Date(date);
        return d.getMonth() === m && d.getFullYear() === y;
      }).sort(([a], [b]) => a.localeCompare(b));

      // Build month grid
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
        const dateStr = cellDate.toISOString().split('T')[0];
        const eps = groupedByDate[dateStr] || [];
        if (eps.length > 0) {
          dates.push([dateStr, eps]);
        }
      }
      dates.sort(([a], [b]) => a.localeCompare(b));
    } else {
      // Day view
      const dateStr = currentDate.toISOString().split('T')[0];
      const opts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
      label = currentDate.toLocaleDateString('en-US', opts);
      if (groupedByDate[dateStr]) {
        dates.push([dateStr, groupedByDate[dateStr]]);
      }
    }

    return { displayLabel: label, filteredDates: dates, calendarGrid: grid };
  }, [viewMode, currentDate, groupedByDate, today]);

  if (loading) return (
    <div>
      <div>
        <h1 className="text-3xl font-black text-slate-100 dark:text-slate-100 text-slate-800 flex items-center gap-3">
          <CalendarIcon className="w-8 h-8 text-cyan-400" /> Calendar
        </h1>
        <p className="text-slate-400 mt-1">Upcoming episodes from your shows.</p>
      </div>
      <ListSkeleton rows={6} />
    </div>
  );

  return (
    <div className="space-y-3">
      <div ref={headerRef} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 sm:gap-3 !mb-0">
              <CalendarIcon className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400" /> <span className="truncate">Calendar</span>
            </h1>
            <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block">Upcoming episodes from your shows.</p>
          </div>
          {/* View mode — visible on mobile only (moved to right on desktop) */}
          <div className="flex bg-slate-900 rounded-lg p-1 border border-white/10 shrink-0 sm:hidden">
            {['month', 'week', 'day'].map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2 py-1.5 text-[11px] font-bold rounded-md transition-colors capitalize ${
                  viewMode === mode ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* View mode — desktop only */}
          <div className="flex bg-slate-900 rounded-lg p-1 border border-white/10 shrink-0">
            {['month', 'week', 'day'].map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-md transition-colors capitalize ${
                  viewMode === mode ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <button onClick={prev} className="p-1.5 sm:p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700 transition-colors text-slate-400 hover:text-white">
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <span className="text-xs sm:text-sm font-bold text-slate-200 min-w-[100px] sm:min-w-[140px] text-center whitespace-nowrap">
            {displayLabel}
          </span>
          <button onClick={next} className="p-1.5 sm:p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700 transition-colors text-slate-400 hover:text-white">
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={goToToday}
            className="px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 transition-colors"
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

      {viewMode === 'month' && calendarGrid ? (<>
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 border-b border-white/5">
            {DAYS.map(d => (
              <div key={d} className="text-center py-3 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-900/30">
                {d}
              </div>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {calendarGrid.flat().map((cell, i) => (
              <div
                key={`row-${i}`}
                className={`min-h-[80px] sm:min-h-[100px] p-2 border-b border-r border-white/5 ${cell ? 'bg-slate-900/20 hover:bg-slate-800/30 transition-colors cursor-pointer group' : 'bg-slate-950/20'} ${cell?.isToday ? 'bg-cyan-500/5' : ''} ${(i % 7 === 6) ? 'border-r-0' : ''}`}
                style={cell && (i >= calendarGrid.flat().length - 7) ? { borderBottom: 'none' } : {}}
              >
                {cell && (
                  <>
                    <div className={`text-sm font-bold mb-1.5 ${cell.isToday ? 'text-cyan-400' : 'text-slate-500'}`}>
                      <span className={cell.isToday ? 'bg-cyan-500/15 text-cyan-400 px-2 py-0.5 rounded-full' : ''}>
                        {cell.day}
                      </span>
                    </div>
                    {(() => {
                      const movies = cell.episodes.filter(e => e.type === 'movie');
                      const tvEps = cell.episodes.filter(e => e.type !== 'movie');
                      const grouped = {};
                      tvEps.forEach(ep => {
                        if (!grouped[ep.show_id]) grouped[ep.show_id] = [];
                        grouped[ep.show_id].push(ep);
                      });
                      const showGroups = Object.values(grouped).slice(0, 2);
                      const remaining = Object.values(grouped).length - 2;
                      const totalItems = movies.length + showGroups.length;
                      if (totalItems === 0) return null;
                      return (
                        <div className="space-y-1">
                          {movies.map((m, j) => (
                            <div
                              key={`movie-${j}`}
                              onClick={(e) => { e.stopPropagation(); navigate(`/movies/${m.show_id}`); }}
                              className="flex items-center gap-1.5 group/item cursor-pointer"
                              title={m.title}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                              <span className="text-[11px] leading-tight truncate text-slate-300 group-hover/item:text-cyan-300 transition-colors">{m.title}</span>
                            </div>
                          ))}
                          {showGroups.map((eps, j) => {
                            const ep = eps[0];
                            return (
                              <div
                                key={j}
                                onClick={(e) => { e.stopPropagation(); navigate(`/shows/${ep.show_id}`); }}
                                className="flex items-center gap-1.5 group/item cursor-pointer"
                                title={eps.map(e => `${e.show_title} S${String(e.season_number).padStart(2,'0')}E${String(e.episode_number).padStart(2,'0')}${e.title ? ' — ' + e.title : ''}`).join('\n')}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                <span className="text-[11px] leading-tight truncate text-slate-300 group-hover/item:text-purple-300 transition-colors">{ep.show_title}</span>
                                {eps.length > 1 && <span className="text-[10px] text-slate-500 shrink-0">({eps.length})</span>}
                              </div>
                            );
                          })}
                          {remaining > 0 && (
                            <div className="text-[10px] text-slate-600 font-medium">+{remaining} more</div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center justify-center gap-5 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span>Movies</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span>TV Shows</span>
          </div>
        </div>
      </>) : (
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
                const d = new Date(date);
                return (
                  <div key={date} className={`glass-panel rounded-2xl overflow-hidden ${isToday ? 'ring-2 ring-cyan-500/30' : ''}`}>
                    <div className={`px-5 py-3 flex items-center gap-3 ${isToday ? 'bg-cyan-500/10' : 'bg-slate-800/30'}`}>
                      <div className="text-center">
                        <div className="text-2xl font-black text-slate-200">{d.getDate()}</div>
                        <div className="text-xs font-bold text-slate-400 uppercase">{MONTHS[d.getMonth()]}</div>
                      </div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider">
                        {d.toLocaleDateString('en-US', { weekday: 'long' })}
                        {isToday && <span className="ml-2 px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold">Today</span>}
                      </div>
                      <div className="ml-auto text-xs font-bold text-slate-500">
                        {eps.length} item{eps.length > 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="divide-y divide-slate-700/30">
                      {eps.map((item, i) => {
                        if (item.type === 'movie') {
                          return (
                            <div key={`movie-${i}`} onClick={() => navigate(`/movies/${item.show_id}`)}
                              className="px-5 py-3 flex items-start gap-3 hover:bg-slate-800/20 transition-colors cursor-pointer">
                              <span className="text-lg shrink-0 mt-0.5">🎬</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-200 truncate">{item.title}</p>
                                <p className="text-xs text-slate-400">Movie Release</p>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={`ep-${i}`} onClick={() => navigate(`/shows/${item.show_id}`)}
                            className="px-5 py-3 flex items-start gap-3 hover:bg-slate-800/20 transition-colors cursor-pointer">
                            <Tv className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-200 truncate">{item.show_title}</p>
                              <p className="text-xs text-slate-400">
                                S{String(item.season_number).padStart(2, '0')}E{String(item.episode_number).padStart(2, '0')}
                                {item.title && ` — ${item.title}`}
                              </p>
                            </div>
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
