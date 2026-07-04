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
  { range: '1', color: '#ef4444' },
  { range: '2', color: '#f97316' },
  { range: '3', color: '#f59e0b' },
  { range: '4', color: '#eab308' },
  { range: '5', color: '#84cc16' },
  { range: '6', color: '#22c55e' },
  { range: '7', color: '#10b981' },
  { range: '8', color: '#14b8a6' },
  { range: '9', color: '#06b6d4' },
  { range: '10', color: '#3b82f6' },
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
              <Tv className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-slate-200">{stats.totalShows}</span>
              <span className="text-[10px] text-slate-500 hidden sm:inline">shows</span>
            </div>
            <div className="w-px h-4 sm:h-6 bg-slate-700 shrink-0" />
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Hash className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-slate-200">{stats.totalEpisodes?.toLocaleString() ?? 0}</span>
              <span className="text-[10px] text-slate-500 hidden sm:inline">episodes</span>
            </div>
            <div className="w-px h-4 sm:h-6 bg-slate-700 shrink-0" />
            <div className="flex items-center gap-1.5 sm:gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-emerald-400">{stats.downloadPct}%</span>
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
                <div className="p-1.5 rounded-lg bg-purple-500/15">
                  <Tv className="w-4 h-4 text-purple-400" />
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
                <span className="text-xs font-bold text-emerald-400">
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
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700"
                  style={{ width: `${stats.moviesWithFiles > 0 ? (stats.moviesWithSubtitles / stats.moviesWithFiles) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20">
                <p className="text-lg font-black text-emerald-400">{stats.moviesWithSubtitles ?? 0}</p>
                <p className="text-[10px] text-emerald-300/70">With subtitles</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5">
                <p className="text-lg font-black text-slate-200">{stats.moviesWithFiles ?? 0}</p>
                <p className="text-[10px] text-slate-500">Total files</p>
              </div>
              <button
                onClick={openMissingSubs}
                className={`rounded-xl p-3 border text-left w-full transition-colors hover:brightness-125 ${((stats.moviesMissingSubtitles ?? 0) + (stats.episodesMissingSubtitles ?? 0)) > 0 ? 'bg-amber-500/10 border-amber-500/20 cursor-pointer' : 'bg-emerald-500/10 border-emerald-500/20 cursor-pointer'}`}
              >
                <p className={`text-lg font-black ${((stats.moviesMissingSubtitles ?? 0) + (stats.episodesMissingSubtitles ?? 0)) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{(stats.moviesMissingSubtitles ?? 0) + (stats.episodesMissingSubtitles ?? 0)}</p>
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
                            className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 rounded-full transition-all duration-500"
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
            <Zap className="w-4 h-4 text-purple-400" /> Top 10 Genres
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
            <Star className="w-4 h-4 text-yellow-400" /> Rating Distribution
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

      {/* ── Deletable Movies ── */}
      {deletableData && (
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-base font-bold text-slate-200 mb-2 flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-rose-400" /> Cleanup Candidates
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Movies scored by how safe they are to delete. Higher score = better candidate.<br />
            Factors: franchise status, watch status, age, file size. TMDB enrichment adds ratings & auto-excludes highly rated (6.5+).
          </p>
          <button
            onClick={() => fetchDeletable(true)}
            disabled={deletableLoading}
            className="text-xs font-bold px-4 py-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors disabled:opacity-50 flex items-center gap-2 mb-6"
          >
            {deletableLoading && <Loader2 className="w-3 h-3 animate-spin" />}
            {deletableLoading ? 'Checking...' : 'Check'}
          </button>

          {deletableLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
            </div>
          ) : (deletableData.highPriority?.length > 0 || deletableData.mediumPriority?.length > 0 || deletableData.lowPriority?.length > 0) ? (
            <div className="space-y-4">
              {/* High priority */}
              {deletableData.highPriority?.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <h4 className="text-sm font-bold text-rose-400">High Priority</h4>
                  <span className="text-[10px] text-slate-500">({deletableData.highPriority.length})</span>
                </div>
                <div className="space-y-1.5">
                  {deletableData.highPriority.map(m => (
                    <DeletableCard key={m.id} movie={m} onDetails={() => setDetailsModal({ open: true, mediaId: m.tmdb_id, mediaType: 'movie', libraryId: m.id })} onDeleted={() => handleItemDeleted(m.id)} />
                  ))}
                </div>
              </div>
              )}

              {/* Medium priority */}
              {deletableData.mediumPriority?.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <h4 className="text-sm font-bold text-amber-400">Medium Priority</h4>
                    <span className="text-[10px] text-slate-500">({deletableData.mediumPriority.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {deletableData.mediumPriority.map(m => (
                      <DeletableCard key={m.id} movie={m} onDetails={() => setDetailsModal({ open: true, mediaId: m.tmdb_id, mediaType: 'movie', libraryId: m.id })} onDeleted={() => handleItemDeleted(m.id)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Low priority */}
              {deletableData.lowPriority?.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-slate-500" />
                    <h4 className="text-sm font-bold text-slate-400">Low Priority</h4>
                    <span className="text-[10px] text-slate-500">({deletableData.lowPriority.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {deletableData.lowPriority.map(m => (
                      <DeletableCard key={m.id} movie={m} onDetails={() => setDetailsModal({ open: true, mediaId: m.tmdb_id, mediaType: 'movie', libraryId: m.id })} onDeleted={() => handleItemDeleted(m.id)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : deletableData.total > 0 ? (
            <div className="text-center py-8">
              <FolderOpen className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-slate-300 font-medium">Nothing worth deleting!</p>
              <p className="text-xs text-slate-500 mt-1">All movies are in collections or highly rated.</p>
              <p className="text-slate-300 font-medium">Nothing worth deleting!</p>
              <p className="text-xs text-slate-500 mt-1">All movies are in collections or highly rated.</p>
            </div>
          ) : (
            <div className="text-center py-8">
              <FolderOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500">No downloaded movies found.</p>
            </div>
          )}
        </div>
      )}

      <MediaDetailsModal
        isOpen={detailsModal.open}
        onClose={() => setDetailsModal({ open: false, mediaId: null, mediaType: 'movie', libraryId: null })}
        mediaId={detailsModal.mediaId}
        mediaType={detailsModal.mediaType}
        mode="info"
        onDelete={async (deleteFiles) => {
          await api.delete(`/library/movies/${detailsModal.libraryId}${deleteFiles ? '?deleteFiles=true' : ''}`);
          handleItemDeleted(detailsModal.libraryId);
        }}
      />

      {/* ── Missing Subtitles Modal ── */}
      {missingSubsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setMissingSubsModal(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative z-10 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                  <Languages className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Missing Subtitles</h2>
                  <p className="text-xs text-slate-400">{stats.moviesMissingSubtitles ?? 0} movies &bull; {stats.episodesMissingSubtitles ?? 0} episodes</p>
                </div>
              </div>
              <button
                onClick={() => setMissingSubsModal(false)}
                className="text-slate-400 hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
              {missingSubsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                </div>
              ) : missingSubsData ? (
                <>
                  {/* Movies */}
                  {missingSubsData.movies?.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Film className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-sm font-bold text-slate-200">Movies ({missingSubsData.movies.length})</h3>
                      </div>
                      <div className="space-y-1">
                        {missingSubsData.movies.map(m => (
                          <button
                            key={m.id}
                            onClick={() => { setMissingSubsModal(false); navigate(`/movies/${m.id}`); }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors text-left group"
                          >
                            <Film className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span className="text-sm text-slate-300 group-hover:text-white transition-colors truncate">{m.title}</span>
                            {m.year && <span className="text-xs text-slate-600 shrink-0">({m.year})</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Shows */}
                  {missingSubsData.shows?.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Tv className="w-4 h-4 text-purple-400" />
                        <h3 className="text-sm font-bold text-slate-200">TV Shows ({missingSubsData.shows.length})</h3>
                      </div>
                      <div className="space-y-1">
                        {missingSubsData.shows.map(s => (
                          <button
                            key={s.id}
                            onClick={() => { setMissingSubsModal(false); navigate(`/shows/${s.id}`); }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors text-left group"
                          >
                            <Tv className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                            <span className="text-sm text-slate-300 group-hover:text-white transition-colors truncate flex-1">{s.title}</span>
                            <span className="text-xs text-amber-400 shrink-0">{s.missing_episode_count} ep{s.missing_episode_count !== 1 ? 's' : ''}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(!missingSubsData.movies?.length && !missingSubsData.shows?.length) && (
                    <div className="text-center py-12">
                      <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                      <p className="text-slate-300 font-medium">Nothing missing!</p>
                      <p className="text-xs text-slate-500 mt-1">All your media files have subtitles.</p>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
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
          <BarChart3 className="w-6 h-6 sm:w-8 sm:h-8 text-purple-400 shrink-0" /> <span className="truncate">Statistics</span>
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
