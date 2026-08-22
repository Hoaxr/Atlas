
import { useNavigate } from 'react-router-dom';
import { Tv, Film, Calendar } from 'lucide-react';
import { tmdbImgUrl } from '../../lib/posterUrl';

const formatRuntime = (minutes) => {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

export function ThisWeekCard({ item, type }) {
  const navigate = useNavigate();
  const isEpisode = type === 'episode';

  const handleClick = () => {
    if (isEpisode && item.show_id) {
      navigate(`/shows/${item.show_id}`);
    } else if (!isEpisode && item.id) {
      navigate(`/movies/${item.id}`);
    } else if (item.tmdb_id) {
      navigate(`/${isEpisode ? 'shows' : 'movies'}/${item.tmdb_id}`);
    }
  };

  const title = isEpisode ? item.show_title : item.title;
  const subtitle = isEpisode
    ? `S${String(item.season_number).padStart(2, '0')} E${String(item.episode_number).padStart(2, '0')}${item.episode_title ? ` — ${item.episode_title}` : ''}`
    : item.release_date;

  return (
    <div
      onClick={handleClick}
      className="w-48 sm:w-72 md:w-80 shrink-0 snap-start bg-slate-800/60 border border-slate-700/50 rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300 flex flex-col group cursor-pointer hover:border-cyan-500/40 hover:-translate-y-1 shadow-xl"
    >
      {/* Poster + Day Badge */}
      <div className="relative aspect-[16/9] bg-slate-900 overflow-hidden">
        {item.poster_path ? (
          <img
            src={tmdbImgUrl(item.poster_path, 'w500')}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600">
            {isEpisode ? <Tv className="w-8 h-8 sm:w-10 sm:h-10" /> : <Film className="w-8 h-8 sm:w-10 sm:h-10" />}
          </div>
        )}

        {/* Day badge — top-left */}
        <div className={`absolute top-2 left-2 sm:top-3 sm:left-3 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold backdrop-blur-md border shadow-lg flex items-center gap-1 sm:gap-1.5 ${
          item.isToday
            ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400/50'
            : item.isTomorrow
            ? 'bg-cyan-500/30 text-cyan-200 border-cyan-400/50'
            : 'bg-slate-900/80 text-slate-200 border-slate-600/50'
        }`}>
          <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
          {item.isToday ? 'Today' : item.isTomorrow ? 'Tomorrow' : item.dayName}
        </div>

        {/* Type badge — top-right */}
        <div className="absolute top-2 right-2 sm:top-3 sm:right-3">
          <span className={`text-[9px] sm:text-[10px] uppercase font-bold px-1.5 sm:px-2 py-0.5 rounded-full backdrop-blur-md border ${
            isEpisode
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
              : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
          }`}>
            {isEpisode ? 'TV' : 'Movie'}
          </span>
        </div>

        {/* Gradient overlay at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-16 sm:h-20 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent pointer-events-none" />
      </div>

      {/* Card body */}
      <div className="p-2.5 sm:p-3.5 space-y-1 sm:space-y-1.5 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="text-slate-100 font-bold text-xs sm:text-sm truncate group-hover:text-cyan-400 transition-colors">
            {title}
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 truncate mt-0.5">
            {subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2 pt-0.5 sm:pt-1">
          {item.runtime && (
            <span className="text-[10px] sm:text-[11px] text-slate-500 font-mono">{formatRuntime(item.runtime)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
