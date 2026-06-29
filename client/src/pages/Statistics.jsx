import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatSize } from '../lib/format';
import { BarChart3, Film, Tv, HardDrive, Star, TrendingUp, Eye, Clock, CheckCircle2, Download, Hash, Calendar } from 'lucide-react';
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

const formatDurationDetailed = (totalMinutes) => {
  if (!totalMinutes || totalMinutes === 0) return { years: 0, days: 0, hours: 0 };
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const years = Math.floor(days / 365);
  const remainingDays = days % 365;
  return { years, days: remainingDays, hours };
};

const STATUS_COLORS = {
  downloaded: 'bg-emerald-500',
  downloading: 'bg-cyan-500',
  monitored: 'bg-amber-500',
  unmonitored: 'bg-slate-500',
};

const STATUS_LABELS = {
  downloaded: 'Downloaded',
  downloading: 'Downloading',
  monitored: 'Monitored',
  unmonitored: 'Unmonitored',
};

export default function Statistics() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [traktStats, setTraktStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [moviesRes, showsRes, statsRes, traktRes] = await Promise.all([
        api.get('/library/movies'),
        api.get('/library/shows'),
        api.get('/library/stats'),
        api.get('/trakt/stats').catch(() => ({ data: {} }))
      ]);

      const movies = moviesRes.data.status === 'success' ? moviesRes.data.data : [];
      const shows = showsRes.data.status === 'success' ? showsRes.data.data : [];

      const movieStatuses = {};
      const showStatuses = {};
      const allGenres = {};
      const years = {};
      const qualityProfiles = {};
      const ratings = [];
      let totalFileSize = 0;
      let moviesWithFiles = 0;
      let watchedMovies = 0;
      let watchedShows = 0;
      let totalEpisodes = 0;

      movies.forEach(m => {
        movieStatuses[m.status] = (movieStatuses[m.status] || 0) + 1;
        if (m.watched) watchedMovies++;
        const size = m.file_size || m.folder_size || 0;
        if (size) { totalFileSize += size; moviesWithFiles++; }
        if (m.year) years[m.year] = (years[m.year] || 0) + 1;
        ratings.push(m.rating || 0);
        if (m.quality_profile_name) {
          qualityProfiles[m.quality_profile_name] = (qualityProfiles[m.quality_profile_name] || 0) + 1;
        }
        if (m.genres) {
          m.genres.split(',').forEach(g => {
            const trimmed = g.trim();
            if (trimmed) allGenres[trimmed] = (allGenres[trimmed] || 0) + 1;
          });
        }
      });

      shows.forEach(s => {
        showStatuses[s.status] = (showStatuses[s.status] || 0) + 1;
        if (s.watched) watchedShows++;
        const size = s.file_size || s.folder_size || 0;
        if (size) { totalFileSize += size; }
        if (s.episode_count) totalEpisodes += s.episode_count;
        ratings.push(s.rating || 0);
        if (s.quality_profile_name) {
          qualityProfiles[s.quality_profile_name] = (qualityProfiles[s.quality_profile_name] || 0) + 1;
        }
        if (s.genres) {
          s.genres.split(',').forEach(g => {
            const trimmed = g.trim();
            if (trimmed) allGenres[trimmed] = (allGenres[trimmed] || 0) + 1;
          });
        }
      });

      // Recent items
      const allItems = [
        ...movies.map(m => ({ ...m, mediaType: 'movie' })),
        ...shows.map(s => ({ ...s, mediaType: 'show' })),
      ].sort((a, b) => new Date(b.added_at) - new Date(a.added_at)).slice(0, 5);

      const topGenres = Object.entries(allGenres)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const yearData = Object.entries(years)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

      const qualityData = Object.entries(qualityProfiles)
        .sort((a, b) => b[1] - a[1]);

      const ratingBuckets = { '0–2': 0, '2–4': 0, '4–6': 0, '6–8': 0, '8–10': 0 };
      ratings.forEach(r => {
        if (r < 2) ratingBuckets['0–2']++;
        else if (r < 4) ratingBuckets['2–4']++;
        else if (r < 6) ratingBuckets['4–6']++;
        else if (r < 8) ratingBuckets['6–8']++;
        else ratingBuckets['8–10']++;
      });

      const totalItems = movies.length + shows.length;
      const downloadedItems = (movieStatuses.downloaded || 0) + (showStatuses.downloaded || 0);
      const validRatings = ratings.filter(r => r > 0);

      setStats({
        totalMovies: movies.length,
        totalShows: shows.length,
        totalEpisodes,
        movieStatuses,
        showStatuses,
        topGenres,
        yearData,
        qualityData,
        ratingBuckets,
        totalFileSize,
        moviesWithFiles,
        watchedMovies,
        watchedShows,
        downloadedItems,
        totalItems,
        downloadPct: totalItems > 0 ? Math.round((downloadedItems / totalItems) * 100) : 0,
        averageRating: validRatings.length > 0
          ? (validRatings.reduce((sum, r) => sum + r, 0) / validRatings.length).toFixed(1)
          : 'N/A',
        recentItems: allItems,
      });

      if (traktRes.data?.status === 'success') {
        setTraktStats(traktRes.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch stats', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-100 flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-purple-400" /> Statistics
        </h1>
        <p className="text-slate-400 mt-1">Library analytics and insights.</p>
      </div>
      <StatsSkeleton />
    </div>
  );

  if (!stats || (stats.totalMovies === 0 && stats.totalShows === 0)) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-slate-100 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-purple-400" /> Statistics
          </h1>
        </div>
        <EmptyState
          icon="stats"
          title="No data yet"
          description="Add movies and shows to your library to see statistics."
        />
      </div>
    );
  }

  const maxGenreCount = Math.max(...stats.topGenres.map(([, c]) => c), 1);
  const maxYearCount = Math.max(...stats.yearData.map(([, c]) => c), 1);
  const maxRatingCount = Math.max(...Object.values(stats.ratingBuckets), 1);
  const maxQualityCount = Math.max(...stats.qualityData.map(([, c]) => c), 1);
  const hasRatings = Object.values(stats.ratingBuckets).some(c => c > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-100 flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-purple-400" /> Statistics
        </h1>
        <p className="text-slate-400 mt-1">Library analytics and insights.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Film} label="Movies" value={stats.totalMovies} color="text-cyan-400" bg="bg-cyan-500/10" />
        <StatCard icon={Tv} label="Shows" value={stats.totalShows} color="text-purple-400" bg="bg-purple-500/10" />
        <StatCard icon={Hash} label="Episodes" value={stats.totalEpisodes.toLocaleString()} color="text-indigo-400" bg="bg-indigo-500/10" />
        <StatCard icon={CheckCircle2} label="Downloaded" value={`${stats.downloadPct}%`} color="text-emerald-400" bg="bg-emerald-500/10" />
        <StatCard icon={HardDrive} label="Storage" value={formatSize(stats.totalFileSize)} color="text-amber-400" bg="bg-amber-500/10" />
        <StatCard icon={Star} label="Avg Rating" value={stats.averageRating} color="text-yellow-400" bg="bg-yellow-500/10" />
      </div>

      {/* Trakt Watch Stats */}
      {traktStats && !traktStats.error && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-pink-400" />
            <h2 className="text-lg font-bold text-slate-200">Trakt Watch History</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Film} label="Movies Watched" value={traktStats.movies.watched.toLocaleString()} color="text-pink-400" bg="bg-pink-500/10" />
            <StatCard icon={Eye} label="Shows Watched" value={traktStats.shows.watched.toLocaleString()} color="text-pink-400" bg="bg-pink-500/10" />
            <StatCard icon={Tv} label="Episodes Watched" value={traktStats.episodes.watched.toLocaleString()} color="text-pink-400" bg="bg-pink-500/10" />
            <StatCard icon={Clock} label="Watch Time" value={formatDuration(traktStats.totalMinutes)} color="text-pink-400" bg="bg-pink-500/10" />
          </div>
        </div>
      )}

      {traktStats?.error && (
        <div className="glass-panel rounded-2xl p-4 bg-amber-500/5 border border-amber-500/20 text-amber-400 text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4 shrink-0" /> {traktStats.error}
        </div>
      )}

      {/* Status + Genres + Ratings row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Distribution */}
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-lg font-bold text-slate-200 mb-4">Library Status</h3>
          <div className="space-y-6">
            {[
              { label: 'Movies', data: stats.movieStatuses, total: stats.totalMovies },
              { label: 'Shows', data: stats.showStatuses, total: stats.totalShows },
            ].map(({ label, data, total }) => (
              <div key={label}>
                <p className="text-sm font-bold text-slate-400 mb-3">{label}</p>
                <div className="space-y-2">
                  {Object.entries(data)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => (
                    <div key={status} className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-400 w-24 capitalize">{STATUS_LABELS[status] || status}</span>
                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${STATUS_COLORS[status] || 'bg-slate-500'} rounded-full`}
                          style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-500 w-8 text-right">{count}</span>
                    </div>
                  ))}
                  {Object.keys(data).length === 0 && (
                    <p className="text-slate-500 text-xs italic">No {label.toLowerCase()} added yet.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Genres */}
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-lg font-bold text-slate-200 mb-4">Top Genres</h3>
          <div className="space-y-2">
            {stats.topGenres.map(([genre, count]) => (
              <div 
                key={genre} 
                className="flex items-center gap-3 cursor-pointer hover:bg-slate-800/50 p-1.5 -mx-1.5 rounded-lg transition-colors group"
                onClick={() => navigate(`/movies?genre=${encodeURIComponent(genre)}`)}
                title={`View movies in ${genre}`}
              >
                <span className="text-sm font-medium text-slate-400 w-32 truncate group-hover:text-slate-300">{genre}</span>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full"
                    style={{ width: `${(count / maxGenreCount) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-500 w-6 text-right group-hover:text-slate-300">{count}</span>
              </div>
            ))}
            {stats.topGenres.length === 0 && (
              <p className="text-slate-500 text-sm italic py-4 text-center">No genre data available</p>
            )}
          </div>
        </div>

        {/* Ratings Distribution */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col">
          <h3 className="text-lg font-bold text-slate-200 mb-4">Ratings</h3>
          {hasRatings ? (
            <div className="space-y-2">
              {Object.entries(stats.ratingBuckets).reverse().map(([range, count]) => (
                <div
                  key={range}
                  className="flex items-center gap-3 cursor-pointer hover:bg-slate-800/50 p-1.5 -mx-1.5 rounded-lg transition-colors group"
                  onClick={() => navigate(`/movies?rating=${range}`)}
                  title={`View movies rated ${range}`}
                >
                  <span className="text-sm font-medium text-slate-400 w-10 group-hover:text-slate-300">{range}</span>
                  <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-500 rounded-full group-hover:bg-yellow-400 transition-colors"
                      style={{ width: `${(count / maxRatingCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-500 w-8 text-right group-hover:text-slate-300">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-slate-500 text-xs italic text-center">No ratings data yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Quality Profiles */}
      {stats.qualityData.length > 0 && (
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-lg font-bold text-slate-200 mb-4">Quality Profiles</h3>
          <div className="space-y-2">
            {stats.qualityData.map(([name, count]) => (
              <div key={name} className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-400 w-28 truncate">{name}</span>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full"
                    style={{ width: `${(count / maxQualityCount) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-500 w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Year Distribution */}
      <div className="glass-panel rounded-2xl p-6 flex flex-col">
        <h3 className="text-lg font-bold text-slate-200 mb-4">Content by Year</h3>
        {stats.yearData.length > 0 ? (
          <div className="overflow-x-auto pb-2">
            <div className="flex items-end gap-1 h-48" style={{ minWidth: `${Math.max(stats.yearData.length * 3, 20)}rem` }}>
            {stats.yearData.map(([year, count]) => (
              <div
                key={year}
                className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end min-w-[2rem] cursor-pointer group"
                onClick={() => navigate(`/movies?year=${year}`)}
                title={`${count} item(s) from ${year}`}
              >
                <span className="text-[10px] font-bold text-cyan-400 group-hover:text-cyan-300">{count}</span>
                <div
                  className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 rounded-t-sm group-hover:from-cyan-500 group-hover:to-cyan-300 transition-all"
                  style={{ height: count > 0 ? `${Math.max((count / maxYearCount) * 100, 3)}%` : '0%' }}
                />
                <span className="text-[10px] text-slate-500 font-medium mt-1 -rotate-45 origin-top-left whitespace-nowrap">{year}</span>
              </div>
            ))}
          </div>
          </div>
        ) : (
          <p className="text-slate-500 text-sm italic py-4 text-center">No year data available</p>
        )}
      </div>

      {/* Recently Added */}
      {stats.recentItems.length > 0 && (
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-cyan-400" /> Recently Added
          </h3>
          <div className="space-y-1">
            {stats.recentItems.map(item => (
              <div
                key={`${item.mediaType}-${item.id}`}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/30 transition-colors cursor-pointer"
                onClick={() => navigate(item.mediaType === 'movie' ? `/movies/${item.id}` : `/shows/${item.id}`)}
              >
                {item.mediaType === 'movie' ? (
                  <Film className="w-4 h-4 text-cyan-400 shrink-0" />
                ) : (
                  <Tv className="w-4 h-4 text-purple-400 shrink-0" />
                )}
                <span className="text-sm text-slate-300 flex-1 truncate">
                  {item.title}
                  {item.year && <span className="text-slate-500 ml-1">({item.year})</span>}
                </span>
                <span className="text-[10px] text-slate-600 uppercase font-medium">{item.mediaType}</span>
                <span className="text-[10px] text-slate-600">{new Date(item.added_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, bg }) {
  return (
    <div className="glass-panel rounded-2xl p-4 flex items-center gap-3 hover:scale-[1.02] transition-transform">
      <div className={`p-2.5 rounded-xl ${bg}`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-slate-400 truncate">{label}</p>
        <p className="text-lg font-bold text-slate-100 truncate">{value}</p>
      </div>
    </div>
  );
}
