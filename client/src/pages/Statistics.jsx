import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatSize } from '../lib/format';
import {
  BarChart3, Film, Tv, HardDrive, Star, TrendingUp, Eye, Clock,
  CheckCircle2, Hash, Zap, PlayCircle, Activity, Languages, X, Loader2, Trash2, FolderOpen
} from 'lucide-react';
import { StatsSkeleton } from '../components/shared/Skeleton';
import EmptyState from '../components/shared/EmptyState';
import StickyBar from '../components/shared/StickyBar';
import MediaDetailsModal from '../components/MediaDetailsModal';
import ModalShell from '../components/shared/ModalShell';
import Spinner from '../components/shared/Spinner';
import { useStickyBar } from '../lib/useStickyBar';

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
  downloaded: { color: '#06b6d4', label: 'Downloaded', bg: 'bg-cyan-500' },
  downloading: { color: '#0ea5e9', label: 'Downloading', bg: 'bg-sky-500' },
  monitored:   { color: '#3b82f6', label: 'Monitored',   bg: 'bg-blue-500' },
  unmonitored: { color: '#64748b', label: 'Unmonitored', bg: 'bg-slate-500' },
};

const GENRE_COLORS = [
  'from-cyan-600 to-cyan-400',
  'from-cyan-600 to-cyan-400',
  'from-cyan-600 to-cyan-400',
  'from-cyan-600 to-cyan-400',
  'from-cyan-600 to-cyan-400',
  'from-cyan-600 to-cyan-400',
  'from-cyan-600 to-cyan-400',
  'from-cyan-600 to-cyan-400',
  'from-cyan-600 to-cyan-400',
  'from-cyan-600 to-cyan-400',
];

const RATING_CONFIG = [
  { range: '1', color: '#164e63' },
  { range: '2', color: '#164e63' },
  { range: '3', color: '#155e75' },
  { range: '4', color: '#155e75' },
  { range: '5', color: '#0e7490' },
  { range: '6', color: '#0e7490' },
  { range: '7', color: '#0891b2' },
  { range: '8', color: '#0891b2' },
  { range: '9', color: '#06b6d4' },
  { range: '10', color: '#22d3ee' },
];
export default function Statistics() {
  const navigate = useNavigate();
  const { headerRef, stickyVisible } = useStickyBar();
  const [stats, setStats] = useState(null);
  const [traktStats, setTraktStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missingSubsModal, setMissingSubsModal] = useState(false);
  const [missingSubsData, setMissingSubsData] = useState(null);
  const [missingSubsLoading, setMissingSubsLoading] = useState(false);
  const [deletableData, setDeletableData] = useState(null);
  const [deletableLoading, setDeletableLoading] = useState(false);
  const [detailsModal, setDetailsModal] = useState({ open: false, mediaId: null, mediaType: 'movie', libraryId: null });

  const openMissingSubs = async () => {
    setMissingSubsModal(true);
    if (!missingSubsData) {
      setMissingSubsLoading(true);
      try {
        const res = await api.get('/library/missing-subs');
        if (res.data.status === 'success') setMissingSubsData(res.data.data);
      } catch (e) {
        console.error('Failed to fetch missing subs', e);
      } finally {
        setMissingSubsLoading(false);
      }
    }
  };

  const fetchDeletable = async (withTmdb = false) => {
    setDeletableLoading(true);
    try {
      const url = withTmdb ? '/library/deletable?tmdb=true' : '/library/deletable';
      const res = await api.get(url);
      if (res.data.status === 'success') setDeletableData(res.data.data);
    } catch (e) {
      console.error('Failed to fetch deletable movies', e);
    } finally {
      setDeletableLoading(false);
    }
  };

  const handleItemDeleted = (id) => {
    setDeletableData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        highPriority: prev.highPriority?.filter(m => m.id !== id),
        mediumPriority: prev.mediumPriority?.filter(m => m.id !== id),
        lowPriority: prev.lowPriority?.filter(m => m.id !== id),
        all: prev.all?.filter(m => m.id !== id)
      };
    });
  };

  useEffect(() => {
    fetchStats();
    // Load fast results first, then auto-enrich with TMDB
    fetchDeletable().then(() => fetchDeletable(true));
  }, []);

  const fetchStats = async () => {
    try {
      const [libRes, traktRes] = await Promise.all([
        api.get('/library/stats'),
        api.get('/trakt/stats').catch(() => ({ data: {} }))
      ]);

      if (libRes.data.status === 'success') {
        setStats(libRes.data.data);
      }

      if (traktRes.data?.status === 'success') setTraktStats(traktRes.data.data);
      else if (traktRes.data?.error) setTraktStats({ error: traktRes.data.error });
    } catch (err) {
      console.error('Failed to fetch stats', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="space-y-3">
      <PageHeader headerRef={headerRef} stickyVisible={stickyVisible} />
      <StatsSkeleton />
    </div>
  );

  if (!stats || (stats.totalMovies === 0 && stats.totalShows === 0)) return (
    <div className="space-y-3">
      <PageHeader headerRef={headerRef} stickyVisible={stickyVisible} />
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
    <div className="space-y-3">
      <PageHeader headerRef={headerRef} stickyVisible={stickyVisible} />

      {/* ── Hero stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <HeroCard icon={Film}         label="Movies"    value={stats.totalMovies}                   gradient="from-cyan-600/20 to-cyan-500/5"   iconColor="text-cyan-400"   iconBg="bg-cyan-500/15" />
        <HeroCard icon={Tv}           label="TV Shows"  value={stats.totalShows}                    gradient="from-cyan-600/20 to-cyan-500/5" iconColor="text-cyan-400" iconBg="bg-cyan-500/15" />
        <HeroCard icon={Hash}         label="Episodes"  value={stats.totalEpisodes.toLocaleString()} gradient="from-cyan-600/20 to-cyan-500/5" iconColor="text-cyan-400" iconBg="bg-cyan-500/15" />
        <HeroCard icon={CheckCircle2} label="Downloaded" value={`${stats.downloadPct}%`}            gradient="from-cyan-600/20 to-cyan-500/5" iconColor="text-cyan-400" iconBg="bg-cyan-500/15" />
        <HeroCard icon={HardDrive}    label="Storage"   value={formatSize(stats.totalFileSize)}     gradient="from-cyan-600/20 to-cyan-500/5"  iconColor="text-cyan-400"  iconBg="bg-cyan-500/15" />
        <HeroCard icon={Star}         label="Avg Rating" value={stats.averageRating}                gradient="from-cyan-600/20 to-cyan-500/5" iconColor="text-cyan-400" iconBg="bg-cyan-500/15" />
      </div>

      {/* ── Trakt watch stats ── */}
      {traktStats && !traktStats.error && (
        <div className="glass-panel rounded-2xl p-6 bg-gradient-to-br from-cyan-900/20 to-blue-900/10 border border-cyan-500/20">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-1.5 rounded-lg bg-cyan-500/20">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
            </div>
            <h2 className="text-base font-bold text-slate-200">Trakt Watch History</h2>
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
        <div className="glass-panel rounded-2xl p-4 bg-cyan-500/5 border border-cyan-500/20 text-cyan-400 text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4 shrink-0" /> {traktStats.error}
        </div>
      )}

      {/* ── Status donuts + Genres ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Status distribution */}
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-base font-bold text-slate-200 mb-5 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" /> Library Status
          </h3>

          {/* Summary bar */}
          <div className="flex items-center gap-x-2 sm:gap-4 mb-6 p-2.5 sm:p-3 bg-slate-800/40 rounded-xl border border-white/5 overflow-x-auto hide-scrollbar">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Film className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-slate-200">{stats.totalMovies}</span>
              <span className="text-[10px] text-slate-500 hidden sm:inline">movies</span>
            </div>
            <div className="w-px h-4 sm:h-6 bg-slate-700 shrink-0" />
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Tv className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-slate-200">{stats.totalShows}</span>
              <span className="text-[10px] text-slate-500 hidden sm:inline">shows</span>
            </div>
            <div className="w-px h-4 sm:h-6 bg-slate-700 shrink-0" />
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Hash className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-slate-200">{stats.totalEpisodes?.toLocaleString() ?? 0}</span>
              <span className="text-[10px] text-slate-500 hidden sm:inline">episodes</span>
            </div>
            <div className="w-px h-4 sm:h-6 bg-slate-700 shrink-0" />
            <div className="flex items-center gap-1.5 sm:gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-cyan-400">{stats.downloadPct}%</span>
              <span className="text-[10px] text-slate-500 hidden sm:inline">downloaded</span>
            </div>
          </div>

          {/* Donuts + Legends */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Movies */}
            <div className="bg-slate-800/20 rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-1.5 rounded-lg bg-cyan-500/15">
                  <Film className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-200">Movies</p>
                </div>
              </div>
              <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6">
                <div className="relative shrink-0">
                  <DonutChart data={movieDonut} size={130} thickness={14} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-black text-slate-100">{stats.totalMovies}</span>
                    <span className="text-[8px] text-slate-500 uppercase tracking-wide">total</span>
                  </div>
                </div>
                <div className="flex-1 space-y-2 min-w-0 w-full">
                  {Object.entries(stats.movieStatuses).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
                    const cfg = STATUS_CONFIG[status] || { color: '#64748b', label: status };
                    const pct = stats.totalMovies > 0 ? ((count / stats.totalMovies) * 100).toFixed(0) : 0;
                    return (
                      <div key={status} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                        <span className="text-xs text-slate-400 flex-1 truncate">{cfg.label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-300">{count}</span>
                          <span className="text-[10px] text-slate-600 tabular-nums w-8 text-right">{pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Shows */}
            <div className="bg-slate-800/20 rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-1.5 rounded-lg bg-cyan-500/15">
                  <Tv className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-200">TV Shows</p>
                </div>
              </div>
              <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6">
                <div className="relative shrink-0">
                  <DonutChart data={showDonut} size={130} thickness={14} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-black text-slate-100">{stats.totalShows}</span>
                    <span className="text-[8px] text-slate-500 uppercase tracking-wide">total</span>
                  </div>
                </div>
                <div className="flex-1 space-y-2 min-w-0 w-full">
                  {Object.entries(stats.showStatuses).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
                    const cfg = STATUS_CONFIG[status] || { color: '#64748b', label: status };
                    const pct = stats.totalShows > 0 ? ((count / stats.totalShows) * 100).toFixed(0) : 0;
                    return (
                      <div key={status} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                        <span className="text-xs text-slate-400 flex-1 truncate">{cfg.label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-300">{count}</span>
                          <span className="text-[10px] text-slate-600 tabular-nums w-8 text-right">{pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Subtitle overview */}
          <div className="border-t border-white/5 mt-4 pt-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg bg-cyan-500/15">
                <Languages className="w-4 h-4 text-cyan-400" />
              </div>
              <h4 className="text-sm font-bold text-slate-200">Subtitles</h4>
              <span className="ml-auto text-[10px] font-bold text-slate-500">
                {stats.moviesWithFiles ?? 0} files
              </span>
            </div>

            {/* Coverage bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-400">Coverage</span>
                <span className="text-xs font-bold text-cyan-400">
                  {stats.moviesWithSubtitles ?? 0}/{stats.moviesWithFiles ?? 0}
                  {stats.moviesWithFiles > 0 && (
                    <span className="text-slate-500 font-normal ml-1">
                      ({((stats.moviesWithSubtitles / stats.moviesWithFiles) * 100).toFixed(0)}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all duration-700"
                  style={{ width: `${stats.moviesWithFiles > 0 ? (stats.moviesWithSubtitles / stats.moviesWithFiles) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-cyan-500/10 rounded-xl p-3 border border-cyan-500/20">
                <p className="text-lg font-black text-cyan-400">{stats.moviesWithSubtitles ?? 0}</p>
                <p className="text-[10px] text-cyan-300/70">With subtitles</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5">
                <p className="text-lg font-black text-slate-200">{stats.moviesWithFiles ?? 0}</p>
                <p className="text-[10px] text-slate-500">Total files</p>
              </div>
              <button
                onClick={openMissingSubs}
                className="rounded-xl p-3 border text-left w-full transition-colors hover:brightness-125 bg-cyan-500/10 border-cyan-500/20 cursor-pointer"
              >
                <p className="text-lg font-black text-cyan-400">{(stats.moviesMissingSubtitles ?? 0) + (stats.episodesMissingSubtitles ?? 0)}</p>
                <p className="text-[10px] text-slate-500">Missing subs</p>
              </button>
            </div>

            {/* Language breakdown */}
            {stats.topSubLanguages?.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Top Languages</p>
                <div className="space-y-1.5">
                  {(() => {
                    const maxLangCount = Math.max(...stats.topSubLanguages.map(l => l.count), 1);
                    return stats.topSubLanguages.map(({ lang, count }) => (
                      <div key={lang} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-300 w-8 uppercase">{lang}</span>
                        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all duration-500"
                            style={{ width: `${(count / maxLangCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-400 tabular-nums w-8 text-right">{count}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top Genres */}
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-base font-bold text-slate-200 mb-5 flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" /> Top 10 Genres
          </h3>
          {stats.topGenres.length > 0 ? (
            <div className="space-y-2.5">
              {stats.topGenres.slice(0, 10).map(([genre, count], i) => (
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

          {/* Ratings divider */}
          <hr className="border-white/5 my-6" />

          {/* Ratings — vertical bar chart */}
          <h3 className="text-base font-bold text-slate-200 mb-6 flex items-center gap-2">
            <Star className="w-4 h-4 text-cyan-400" /> Rating Distribution
          </h3>
          <div className="flex items-end gap-3 h-40 mb-3">
            {RATING_CONFIG.map(({ range, color }) => {
              const count = stats.ratingBuckets[range] || 0;
              const pct = maxRating > 0 ? (count / maxRating) * 100 : 0;
              return (
                <div
                  key={range}
                  className="flex-1 flex flex-col items-center gap-1 h-full justify-end cursor-pointer group"
                  onClick={() => navigate(`/movies?rating=${range}`)}
                  title={`Rating ${range}: ${count} item(s)`}
                >
                  <span className="text-[10px] font-bold text-slate-500 group-hover:text-slate-300 transition-colors">{count || ''}</span>
                  <div
                    className="w-full rounded-t-md transition-all duration-700 group-hover:opacity-90"
                    style={{
                      height: pct > 0 ? `${Math.max(pct, 8)}%` : '4%',
                      backgroundColor: color,
                      opacity: pct > 0 ? 0.8 : 0.15,
                      minHeight: pct > 0 ? '8px' : '6px',
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
      </div>

      {/* ── Recently Added ── */}
      {stats.recentItems.length > 0 && (
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-base font-bold text-slate-200 mb-5 flex items-center gap-2">
            <PlayCircle className="w-4 h-4 text-cyan-400" /> Recently Added
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

      {/* ── Advanced Actions ── */}
      <div className="glass-panel rounded-2xl p-6">
        <h3 className="text-base font-bold text-slate-200 mb-5 flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-cyan-400" /> Library Management
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => navigate('/stats/health')}
            className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/30 border border-white/5 hover:bg-slate-800/60 hover:border-cyan-500/30 transition-all group text-left"
          >
            <div className="p-3 rounded-lg bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-200">Media Health Dashboard</h4>
              <p className="text-xs text-slate-400 mt-1">Check missing episodes, files, and upgradeable content.</p>
            </div>
          </button>
          
          <button
            onClick={() => navigate('/stats/cleanup')}
            className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/30 border border-white/5 hover:bg-slate-800/60 hover:border-cyan-500/30 transition-all group text-left"
          >
            <div className="p-3 rounded-lg bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-200">Cleanup Candidates</h4>
              <p className="text-xs text-slate-400 mt-1">Find safe-to-delete movies to free up drive space.</p>
            </div>
          </button>
        </div>
        </div>
      </div>

      <ModalShell open={missingSubsModal} onClose={() => setMissingSubsModal(false)} title="Missing Subtitles" width="max-w-2xl">
        {missingSubsLoading ? (
          <div className="py-12 flex justify-center"><Spinner /></div>
        ) : !missingSubsData ? (
          <div className="py-12 text-center text-slate-500">Failed to load data.</div>
        ) : (
          <div className="space-y-6 text-sm">
            {missingSubsData.movies?.length > 0 && (
              <div>
                <h3 className="font-bold text-slate-300 mb-3 text-lg flex items-center gap-2">
                  <Film className="w-5 h-5 text-cyan-400" />
                  Movies without Subtitles
                </h3>
                <div className="bg-slate-900/50 rounded-xl border border-white/5 overflow-hidden divide-y divide-slate-800/50">
                  {missingSubsData.movies.map(m => (
                    <div key={`m-${m.id}`} className="p-3 hover:bg-slate-800/30 transition-colors flex items-center justify-between group">
                      <span className="font-medium text-slate-300 group-hover:text-cyan-400 transition-colors cursor-pointer" onClick={() => { setMissingSubsModal(false); navigate(`/movies/${m.id}`); }}>{m.title} {m.year ? `(${m.year})` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {missingSubsData.shows?.length > 0 && (
              <div>
                <h3 className="font-bold text-slate-300 mb-3 text-lg flex items-center gap-2">
                  <Tv className="w-5 h-5 text-cyan-400" />
                  Shows with Missing Subtitles
                </h3>
                <div className="bg-slate-900/50 rounded-xl border border-white/5 overflow-hidden divide-y divide-slate-800/50">
                  {missingSubsData.shows.map(s => (
                    <div key={`s-${s.id}`} className="p-3 hover:bg-slate-800/30 transition-colors flex items-center justify-between group">
                      <span className="font-medium text-slate-300 group-hover:text-cyan-400 transition-colors cursor-pointer" onClick={() => { setMissingSubsModal(false); navigate(`/shows/${s.id}`); }}>{s.title}</span>
                      <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded border border-white/5 shrink-0">
                        {s.missing_episode_count} {s.missing_episode_count === 1 ? 'ep' : 'eps'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {missingSubsData.movies?.length === 0 && missingSubsData.shows?.length === 0 && (
              <div className="py-8 text-center text-slate-500">
                All downloaded files have subtitles!
              </div>
            )}
          </div>
        )}
      </ModalShell>
    </div>
  );
}

// ─────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────

function PageHeader({ headerRef, stickyVisible }) {
  return (
    <>
      <div ref={headerRef}>
        <h1 className="text-xl sm:text-3xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 sm:gap-3 !mb-0">
          <BarChart3 className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 shrink-0" /> <span className="truncate">Statistics</span>
        </h1>
        <p className="text-xs sm:text-base text-slate-400 mt-0.5 sm:mt-1 hidden sm:block">Library analytics and insights.</p>
      </div>
      <StickyBar visible={stickyVisible} />
    </>
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

function TraktCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-cyan-500/10 rounded-xl p-4 border border-cyan-500/20">
      <Icon className="w-4 h-4 text-cyan-400 mb-2" />
      <p className="text-xl font-black text-slate-100">{value}</p>
      <p className="text-xs text-cyan-300/70 mt-0.5">{label}</p>
    </div>
  );
}

function RecentCard({ item, onClick }) {
  const isMovie = item.mediaType === 'movie';
  const borderColor = isMovie ? '#06b6d4' : '#0ea5e9';
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

function DeletableCard({ movie, onDetails, onDeleted }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const scoreColor = movie.score >= 35 ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
    : movie.score >= 15 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : 'text-slate-400 bg-slate-500/10 border-slate-500/20';

  const handleDelete = async (deleteFiles) => {
    setDeleting(true);
    try {
      await api.delete(`/library/movies/${movie.id}${deleteFiles ? '?deleteFiles=true' : ''}`);
      onDeleted?.();
    } catch (e) {
      console.error('Failed to delete movie', e);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (deleting) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-white/5 opacity-50">
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
        <span className="text-xs text-slate-400">Deleting...</span>
      </div>
    );
  }

  return (
    <div
      onClick={onDetails}
      className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 border border-white/5 hover:bg-slate-800/50 hover:border-slate-600/30 transition-all cursor-pointer group"
    >
      {/* Score badge */}
      <div className={`shrink-0 flex flex-col items-center justify-center w-10 h-10 rounded-lg border ${scoreColor}`}>
        <span className="text-sm font-black leading-none">{movie.score}</span>
        <span className="text-[8px] uppercase tracking-wider opacity-70">pts</span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-200 truncate group-hover:text-white transition-colors">
          {movie.title} {movie.year && <span className="text-slate-500 font-normal">({movie.year})</span>}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {movie.tmdb_rating !== null && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              movie.tmdb_rating < 5 ? 'bg-rose-500/15 text-rose-400' :
              movie.tmdb_rating < 7 ? 'bg-amber-500/15 text-amber-400' :
              'bg-emerald-500/15 text-emerald-400'
            }`}>
              ★ {movie.tmdb_rating}
            </span>
          )}
          {!movie.watched && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">Unwatched</span>
          )}
          <span className="text-[10px] text-slate-500">{formatSize(movie.file_size)}</span>
        </div>
        {movie.reasons?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {movie.reasons.map((r, i) => (
              <span key={i} className="text-[9px] text-slate-600 bg-slate-800/50 px-1.5 py-0.5 rounded">{r}</span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
        <div className="relative">
          <button
            onClick={() => setDeleteOpen(!deleteOpen)}
            className="p-2 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {deleteOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 py-1">
              <button
                onClick={() => handleDelete(false)}
                className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                Delete from library
              </button>
              <button
                onClick={() => handleDelete(true)}
                className="w-full text-left px-3 py-2 text-xs text-rose-400 hover:bg-slate-700 hover:text-rose-300 transition-colors"
              >
                Delete with files
              </button>
            </div>
          )}
        </div>
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
          key={`row-${i}`}
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
