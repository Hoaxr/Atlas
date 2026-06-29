import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatSize } from '../lib/format';
import {
  BarChart3, Film, Tv, HardDrive, Star, TrendingUp, Eye, Clock,
  CheckCircle2, Hash, Calendar, Zap, PlayCircle, BookmarkCheck, Activity
} from 'lucide-react';
import { StatsSkeleton } from '../components/shared/Skeleton';
import EmptyState from '../components/shared/EmptyState';

const formatDuration = (totalMinutes) => {
  if (!totalMinutes || totalMinutes === 0) return '0h';
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const years = Math.floor(days / 365);
  const remainingDays = days % 365;
  const parts = [];
  if (years > 0) parts.push(`${years}y`);
  if (remainingDays > 0) parts.push(`${remainingDays}d`);
  if (hours > 0) parts.push(`${hours}h`);
  return parts.join(' ') || '0h';
};

const STATUS_CONFIG = {
  downloaded: { color: '#10b981', label: 'Downloaded', bg: 'bg-emerald-500' },
  downloading: { color: '#06b6d4', label: 'Downloading', bg: 'bg-cyan-500' },
  monitored:   { color: '#f59e0b', label: 'Monitored',   bg: 'bg-amber-500' },
  unmonitored: { color: '#64748b', label: 'Unmonitored', bg: 'bg-slate-500' },
};

const GENRE_COLORS = [
  'from-cyan-500 to-blue-500',
  'from-purple-500 to-pink-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-indigo-500 to-purple-500',
  'from-lime-500 to-emerald-500',
  'from-sky-500 to-cyan-500',
  'from-violet-500 to-indigo-500',
  'from-fuchsia-500 to-purple-500',
];

const RATING_CONFIG = [
  { range: '8–10', color: '#10b981', label: 'Excellent' },
  { range: '6–8',  color: '#84cc16', label: 'Good' },
  { range: '4–6',  color: '#f59e0b', label: 'Average' },
  { range: '2–4',  color: '#f97316', label: 'Poor' },
  { range: '0–2',  color: '#ef4444', label: 'Terrible' },
];



export default function Statistics() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [traktStats, setTraktStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    try {
      const [moviesRes, showsRes, traktRes] = await Promise.all([
        api.get('/library/movies'),
        api.get('/library/shows'),
        api.get('/trakt/stats').catch(() => ({ data: {} }))
      ]);

      const movies = moviesRes.data.status === 'success' ? moviesRes.data.data : [];
      const shows  = showsRes.data.status  === 'success' ? showsRes.data.data  : [];

      const movieStatuses = {};
      const showStatuses  = {};
      const allGenres = {};
      const years = {};
      const ratings = [];
      let totalFileSize = 0;
      let totalEpisodes = 0;
      let downloadedMovies = 0;
      let downloadedShows = 0;

      movies.forEach(m => {
        movieStatuses[m.status] = (movieStatuses[m.status] || 0) + 1;
        if (m.status === 'downloaded') downloadedMovies++;
        const size = m.file_size || m.folder_size || 0;
        if (size) totalFileSize += size;
        if (m.year) years[m.year] = (years[m.year] || 0) + 1;
        ratings.push(m.rating || 0);
        if (m.genres) m.genres.split(',').forEach(g => {
          const t = g.trim(); if (t) allGenres[t] = (allGenres[t] || 0) + 1;
        });
      });

      shows.forEach(s => {
        showStatuses[s.status] = (showStatuses[s.status] || 0) + 1;
        if (s.status === 'downloaded') downloadedShows++;
        const size = s.file_size || s.folder_size || 0;
        if (size) totalFileSize += size;
        if (s.episode_count) totalEpisodes += s.episode_count;
        ratings.push(s.rating || 0);
        if (s.genres) s.genres.split(',').forEach(g => {
          const t = g.trim(); if (t) allGenres[t] = (allGenres[t] || 0) + 1;
        });
      });

      const recentItems = [
        ...movies.map(m => ({ ...m, mediaType: 'movie' })),
        ...shows.map(s  => ({ ...s,  mediaType: 'show'  })),
      ].sort((a, b) => new Date(b.added_at) - new Date(a.added_at)).slice(0, 6);

      const topGenres = Object.entries(allGenres).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const yearData  = Object.entries(years).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

      const ratingBuckets = { '0–2': 0, '2–4': 0, '4–6': 0, '6–8': 0, '8–10': 0 };
      ratings.forEach(r => {
        if      (r < 2)  ratingBuckets['0–2']++;
        else if (r < 4)  ratingBuckets['2–4']++;
        else if (r < 6)  ratingBuckets['4–6']++;
        else if (r < 8)  ratingBuckets['6–8']++;
        else             ratingBuckets['8–10']++;
      });

      const validRatings = ratings.filter(r => r > 0);
      const totalDownloaded = downloadedMovies + downloadedShows;
      const totalItems = movies.length + shows.length;

      setStats({
        totalMovies: movies.length,
        totalShows: shows.length,
        totalEpisodes,
        movieStatuses,
        showStatuses,
        topGenres,
        yearData,
        ratingBuckets,
        totalFileSize,
        downloadedMovies,
        downloadedShows,
        totalDownloaded,
        totalItems,
        downloadPct: totalItems > 0 ? Math.round((totalDownloaded / totalItems) * 100) : 0,
        averageRating: validRatings.length > 0
          ? (validRatings.reduce((s, r) => s + r, 0) / validRatings.length).toFixed(1)
          : 'N/A',
        recentItems,
        avgMovieSize: downloadedMovies > 0
          ? movies.filter(m => m.file_size || m.folder_size).reduce((s, m) => s + (m.file_size || m.folder_size || 0), 0) / downloadedMovies
          : 0,
      });

      if (traktRes.data?.status === 'success') setTraktStats(traktRes.data.data);
      else if (traktRes.data?.error) setTraktStats({ error: traktRes.data.error });
    } catch (err) {
      console.error('Failed to fetch stats', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="space-y-6">
      <PageHeader />
      <StatsSkeleton />
    </div>
  );

  if (!stats || (stats.totalMovies === 0 && stats.totalShows === 0)) return (
    <div className="space-y-6">
      <PageHeader />
      <EmptyState icon="stats" title="No data yet" description="Add movies and shows to your library to see statistics." />
    </div>
  );

  const maxGenre  = Math.max(...stats.topGenres.map(([, c]) => c), 1);
  const maxYear   = Math.max(...stats.yearData.map(([, c]) => c), 1);
  const maxRating = Math.max(...Object.values(stats.ratingBuckets), 1);

  const movieDonut = Object.entries(stats.movieStatuses).map(([status, value]) => ({
    value, color: STATUS_CONFIG[status]?.color || '#64748b', label: STATUS_CONFIG[status]?.label || status,
  }));
  const showDonut = Object.entries(stats.showStatuses).map(([status, value]) => ({
    value, color: STATUS_CONFIG[status]?.color || '#64748b', label: STATUS_CONFIG[status]?.label || status,
  }));

  return (
    <div className="space-y-8">
      <PageHeader />

      {/* ── Hero stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <HeroCard icon={Film}         label="Movies"    value={stats.totalMovies}                   gradient="from-cyan-600/20 to-cyan-500/5"   iconColor="text-cyan-400"   iconBg="bg-cyan-500/15" />
        <HeroCard icon={Tv}           label="TV Shows"  value={stats.totalShows}                    gradient="from-purple-600/20 to-purple-500/5" iconColor="text-purple-400" iconBg="bg-purple-500/15" />
        <HeroCard icon={Hash}         label="Episodes"  value={stats.totalEpisodes.toLocaleString()} gradient="from-indigo-600/20 to-indigo-500/5" iconColor="text-indigo-400" iconBg="bg-indigo-500/15" />
        <HeroCard icon={CheckCircle2} label="Downloaded" value={`${stats.downloadPct}%`}            gradient="from-emerald-600/20 to-emerald-500/5" iconColor="text-emerald-400" iconBg="bg-emerald-500/15" />
        <HeroCard icon={HardDrive}    label="Storage"   value={formatSize(stats.totalFileSize)}     gradient="from-amber-600/20 to-amber-500/5"  iconColor="text-amber-400"  iconBg="bg-amber-500/15" />
        <HeroCard icon={Star}         label="Avg Rating" value={stats.averageRating}                gradient="from-yellow-600/20 to-yellow-500/5" iconColor="text-yellow-400" iconBg="bg-yellow-500/15" />
      </div>

      {/* ── Trakt watch stats ── */}
      {traktStats && !traktStats.error && (
        <div className="glass-panel rounded-2xl p-6 bg-gradient-to-br from-rose-900/20 to-pink-900/10 border border-rose-500/20">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-1.5 rounded-lg bg-rose-500/20">
              <TrendingUp className="w-4 h-4 text-rose-400" />
            </div>
            <h2 className="text-base font-bold text-slate-200">Trakt Watch History</h2>
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-rose-400 bg-rose-500/15 px-2 py-0.5 rounded-full">Connected</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TraktCard icon={Film}  label="Movies Watched"   value={traktStats.movies?.watched?.toLocaleString() ?? '–'} />
            <TraktCard icon={Eye}   label="Shows Watched"    value={traktStats.shows?.watched?.toLocaleString()  ?? '–'} />
            <TraktCard icon={Tv}    label="Episodes Watched" value={traktStats.episodes?.watched?.toLocaleString() ?? '–'} />
            <TraktCard icon={Clock} label="Watch Time"       value={formatDuration(traktStats.totalMinutes)} />
          </div>
        </div>
      )}

      {traktStats?.error && (
        <div className="glass-panel rounded-2xl p-4 bg-amber-500/5 border border-amber-500/20 text-amber-400 text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4 shrink-0" /> {traktStats.error}
        </div>
      )}

      {/* ── Status ring charts + Genres ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Status distribution */}
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-base font-bold text-slate-200 mb-6 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" /> Library Status
          </h3>
          <div className="grid grid-cols-2 gap-8">
            <RingSection title="Movies" total={stats.totalMovies} donutData={movieDonut} statuses={stats.movieStatuses} />
            <RingSection title="Shows"  total={stats.totalShows}  donutData={showDonut}  statuses={stats.showStatuses}  />
          </div>
        </div>

        {/* Top Genres */}
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-base font-bold text-slate-200 mb-5 flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-400" /> Top Genres
          </h3>
          {stats.topGenres.length > 0 ? (
            <div className="space-y-2.5">
              {stats.topGenres.map(([genre, count], i) => (
                <div
                  key={genre}
                  className="flex items-center gap-3 cursor-pointer group"
                  onClick={() => navigate(`/movies?genre=${encodeURIComponent(genre)}`)}
                  title={`View ${genre} content`}
                >
                  <span className="text-xs font-semibold text-slate-500 w-4 text-right">{i + 1}</span>
                  <span className="text-sm font-medium text-slate-300 w-28 truncate group-hover:text-white transition-colors">{genre}</span>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${GENRE_COLORS[i % GENRE_COLORS.length]} rounded-full transition-all duration-700`}
                      style={{ width: `${(count / maxGenre) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-500 w-7 text-right group-hover:text-slate-300 transition-colors">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm italic py-4 text-center">No genre data available</p>
          )}
        </div>
      </div>

      {/* ── Ratings + Year chart ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Ratings — vertical bar chart */}
        <div className="glass-panel rounded-2xl p-6 lg:col-span-2">
          <h3 className="text-base font-bold text-slate-200 mb-6 flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-400" /> Rating Distribution
          </h3>
          <div className="flex items-end gap-3 h-40 mb-3">
            {RATING_CONFIG.map(({ range, color, label }) => {
              const count = stats.ratingBuckets[range] || 0;
              const pct = maxRating > 0 ? (count / maxRating) * 100 : 0;
              return (
                <div
                  key={range}
                  className="flex-1 flex flex-col items-center gap-1 h-full justify-end cursor-pointer group"
                  onClick={() => navigate(`/movies?rating=${range}`)}
                  title={`${label}: ${count} item(s)`}
                >
                  <span className="text-[10px] font-bold text-slate-500 group-hover:text-slate-300 transition-colors">{count || ''}</span>
                  <div
                    className="w-full rounded-t-md transition-all duration-700 group-hover:opacity-90"
                    style={{
                      height: pct > 0 ? `${Math.max(pct, 4)}%` : '2px',
                      backgroundColor: color,
                      opacity: pct > 0 ? 0.85 : 0.2,
                      boxShadow: pct > 0 ? `0 -2px 12px ${color}50` : 'none',
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            {RATING_CONFIG.map(({ range, color }) => (
              <div key={range} className="flex-1 text-center">
                <span className="text-[9px] font-semibold text-slate-500" style={{ color }}>{range}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Content by Year */}
        <div className="glass-panel rounded-2xl p-6 lg:col-span-3">
          <h3 className="text-base font-bold text-slate-200 mb-6 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" /> Content by Year
          </h3>
          {stats.yearData.length > 0 ? (
            <div className="overflow-x-auto pb-1">
              <div
                className="flex items-end gap-1 h-40"
                style={{ minWidth: `${Math.max(stats.yearData.length * 2.5, 20)}rem` }}
              >
                {stats.yearData.map(([year, count]) => {
                  const pct = (count / maxYear) * 100;
                  const decade = Math.floor(parseInt(year) / 10) * 10;
                  const isDecadeStart = parseInt(year) % 10 === 0;
                  return (
                    <div
                      key={year}
                      className="flex-1 flex flex-col items-center gap-1 h-full justify-end min-w-[1.75rem] cursor-pointer group"
                      onClick={() => navigate(`/movies?year=${year}`)}
                      title={`${count} item(s) from ${year}`}
                    >
                      <span className="text-[9px] font-bold text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">{count}</span>
                      <div
                        className="w-full rounded-t-sm group-hover:opacity-90 transition-all duration-500"
                        style={{
                          height: count > 0 ? `${Math.max(pct, 3)}%` : '2px',
                          background: `linear-gradient(to top, #0891b2, #22d3ee)`,
                          boxShadow: `0 -2px 8px #06b6d440`,
                        }}
                      />
                      {isDecadeStart && (
                        <span className="text-[8px] font-bold text-slate-400 mt-0.5">{year}</span>
                      )}
                      {!isDecadeStart && (
                        <span className="text-[8px] text-slate-600 mt-0.5 group-hover:text-slate-400 transition-colors">{String(year).slice(-2)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-sm italic py-8 text-center">No year data available</p>
          )}
        </div>
      </div>

      {/* ── Recently Added ── */}
      {stats.recentItems.length > 0 && (
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-base font-bold text-slate-200 mb-5 flex items-center gap-2">
            <PlayCircle className="w-4 h-4 text-emerald-400" /> Recently Added
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.recentItems.map(item => (
              <RecentCard key={`${item.mediaType}-${item.id}`} item={item} onClick={() =>
                navigate(item.mediaType === 'movie' ? `/movies/${item.id}` : `/shows/${item.id}`)
              } />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────

function PageHeader() {
  return (
    <div>
      <h1 className="text-3xl font-black text-slate-100 flex items-center gap-3">
        <BarChart3 className="w-8 h-8 text-purple-400" /> Statistics
      </h1>
      <p className="text-slate-400 mt-1">Library analytics and insights.</p>
    </div>
  );
}

function HeroCard({ icon: Icon, label, value, gradient, iconColor, iconBg }) {
  return (
    <div className={`glass-panel rounded-2xl p-5 bg-gradient-to-br ${gradient} hover:scale-[1.03] transition-all duration-200 cursor-default`}>
      <div className={`inline-flex p-2.5 rounded-xl ${iconBg} mb-3`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <p className="text-2xl font-black text-slate-100 leading-none mb-1">{value}</p>
      <p className="text-xs font-medium text-slate-400">{label}</p>
    </div>
  );
}

function RingSection({ title, total, donutData, statuses }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>
      <div className="relative">
        <DonutChart data={donutData} size={110} thickness={13} />
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-black text-slate-100">{total}</span>
          <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wide">total</span>
        </div>
      </div>
      <div className="space-y-1.5 w-full">
        {Object.entries(statuses).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
          const cfg = STATUS_CONFIG[status] || { color: '#64748b', label: status, bg: 'bg-slate-500' };
          return (
            <div key={status} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
              <span className="text-xs text-slate-400 flex-1 truncate">{cfg.label}</span>
              <span className="text-xs font-bold text-slate-300">{count}</span>
            </div>
          );
        })}
        {Object.keys(statuses).length === 0 && (
          <p className="text-slate-600 text-xs italic text-center">None yet</p>
        )}
      </div>
    </div>
  );
}

function TraktCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-rose-500/10 rounded-xl p-4 border border-rose-500/20">
      <Icon className="w-4 h-4 text-rose-400 mb-2" />
      <p className="text-xl font-black text-slate-100">{value}</p>
      <p className="text-xs text-rose-300/70 mt-0.5">{label}</p>
    </div>
  );
}

function RecentCard({ item, onClick }) {
  const isMovie = item.mediaType === 'movie';
  const borderColor = isMovie ? '#06b6d4' : '#a855f7';
  const StatusDot = ({ status }) => {
    const cfg = STATUS_CONFIG[status];
    if (!cfg) return null;
    return <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: cfg.color }} />;
  };

  return (
    <div
      className="flex items-start gap-3 p-4 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/50 cursor-pointer transition-all duration-200 hover:border-slate-600/60 group"
      style={{ borderLeft: `3px solid ${borderColor}` }}
      onClick={onClick}
    >
      <div
        className="p-2 rounded-lg shrink-0 mt-0.5"
        style={{ backgroundColor: `${borderColor}18` }}
      >
        {isMovie ? <Film className="w-3.5 h-3.5" style={{ color: borderColor }} /> : <Tv className="w-3.5 h-3.5" style={{ color: borderColor }} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <p className="text-sm font-semibold text-slate-200 truncate group-hover:text-white transition-colors leading-tight">{item.title}</p>
          <StatusDot status={item.status} />
        </div>
        <div className="flex items-center gap-2 mt-1">
          {item.year && <span className="text-xs text-slate-500">{item.year}</span>}
          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${borderColor}20`, color: borderColor }}>
            {isMovie ? 'Movie' : 'Show'}
          </span>
        </div>
        <p className="text-[10px] text-slate-600 mt-1">
          Added {new Date(item.added_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      </div>
    </div>
  );
}

function DonutChart({ data, size = 120, thickness = 14 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return (
    <div style={{ width: size, height: size }} className="flex items-center justify-center">
      <div className="rounded-full bg-slate-800 border-2 border-slate-700" style={{ width: size - thickness, height: size - thickness }} />
    </div>
  );

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const gap = 3;

  let offset = 0;
  const segments = data.map((d) => {
    const fraction = d.value / total;
    const dash = Math.max(fraction * circumference - gap, 0);
    const seg = { ...d, dash, offset, fraction };
    offset += fraction * circumference;
    return seg;
  });

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={thickness} />
      {segments.map((s, i) => (
        <circle
          key={i}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={s.color}
          strokeWidth={thickness}
          strokeDasharray={`${s.dash} ${circumference - s.dash}`}
          strokeDashoffset={-s.offset}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
