import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Calendar as CalendarIcon, Tv, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { ListSkeleton } from '../components/shared/Skeleton';
import EmptyState from '../components/shared/EmptyState';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Calendar() {
  const navigate = useNavigate();
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  useEffect(() => {
    fetchUpcoming();
  }, []);

  const fetchUpcoming = async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await api.get('/library/calendar', {
        params: forceRefresh ? { _t: Date.now() } : {}
      });
      if (res.data.status === 'success') {
        setEpisodes(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch calendar', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Group episodes by date
  const groupedByDate = {};
  episodes.forEach(ep => {
    if (!ep.air_date) return;
    const date = ep.air_date.split('T')[0];
    if (!groupedByDate[date]) groupedByDate[date] = [];
    groupedByDate[date].push(ep);
  });

  // Filter by selected month
  const filteredDates = Object.entries(groupedByDate).filter(([date]) => {
    const d = new Date(date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).sort(([a], [b]) => a.localeCompare(b));

  // Build calendar grid
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
  const today = new Date().toISOString().split('T')[0];

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentMonth(now.getMonth());
    setCurrentYear(now.getFullYear());
  };

  if (loading) return (
    <div className="space-y-6">
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-100 dark:text-slate-100 text-slate-800 flex items-center gap-3">
            <CalendarIcon className="w-8 h-8 text-cyan-400" /> Calendar
          </h1>
          <p className="text-slate-400 mt-1">Upcoming episodes from your shows.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchUpcoming(true)}
            disabled={refreshing}
            className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Refresh calendar"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
            <ChevronLeft className="w-5 h-5 text-slate-400" />
          </button>
          <span className="text-lg font-bold text-slate-200 dark:text-slate-200 text-slate-700 min-w-[140px] text-center">
            {MONTHS[currentMonth]} {currentYear}
          </span>
          <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>
          <button
            onClick={goToToday}
            className="ml-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
          >
            Today
          </button>
        </div>
      </div>

      {filteredDates.length === 0 ? (
        <EmptyState
          icon="tv"
          title="No episodes this month"
          description="Add more shows to your library to see upcoming episodes."
        />
      ) : (
        <div className="space-y-4">
          {filteredDates.map(([date, eps]) => {
            const isToday = date === today;
            const d = new Date(date);
            return (
              <div key={date} className={`glass-panel rounded-2xl overflow-hidden ${isToday ? 'ring-2 ring-cyan-500/30' : ''}`}>
                <div className={`px-5 py-3 flex items-center gap-3 ${isToday ? 'bg-cyan-500/10' : 'bg-slate-800/30 dark:bg-slate-800/30 bg-slate-100'}`}>
                  <div className="text-center">
                    <div className="text-2xl font-black text-slate-200 dark:text-slate-200 text-slate-700">{d.getDate()}</div>
                    <div className="text-xs font-bold text-slate-400 uppercase">{MONTHS[d.getMonth()]}</div>
                  </div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">
                    {d.toLocaleDateString('en-US', { weekday: 'long' })}
                    {isToday && <span className="ml-2 px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold">Today</span>}
                  </div>
                  <div className="ml-auto text-xs font-bold text-slate-500">{eps.length} episode{eps.length > 1 ? 's' : ''}</div>
                </div>
                <div className="divide-y divide-slate-700/30 dark:divide-slate-700/30 divide-slate-200">
                  {eps.map((ep, i) => (
                    <div
                      key={i}
                      onClick={() => navigate(`/shows/${ep.show_id}`)}
                      className="px-5 py-3 flex items-center gap-3 hover:bg-slate-800/20 dark:hover:bg-slate-800/20 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <Tv className="w-4 h-4 text-purple-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-200 dark:text-slate-200 text-slate-700 truncate">{ep.show_title}</p>
                        <p className="text-xs text-slate-400">
                          S{String(ep.season_number).padStart(2, '0')}E{String(ep.episode_number).padStart(2, '0')}
                          {ep.title && ` — ${ep.title}`}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        isToday ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-slate-700/30 text-slate-400'
                      }`}>
                        {isToday ? 'Today' : `${Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24))}d`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
