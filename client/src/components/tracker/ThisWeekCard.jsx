
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

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const cleanDate = typeof dateStr === 'string' ? dateStr.split('T')[0] : '';
  const parts = cleanDate.split('-').map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    const [y, m, d] = parts;
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime())
    ? dateStr
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
    : formatDate(item.release_date);

  return (
    <div
      onClick={handleClick}
      className="w-48 sm:w-72 md:w-80 shrink-0 snap-start bg-slate-800/60 border border-slate-700/50 rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300 flex flex-col group cursor-pointer hover:border-cyan-500/40 shadow-xl"
    >
      {/* Poster */}
      <div className="relative h-28 sm:h-36 md:h-40 bg-slate-900 overflow-hidden rounded-t-xl sm:rounded-t-2xl">
        {(item.backdrop_path || item.poster_path) ? (
          <img
            src={tmdbImgUrl(item.backdrop_path || item.poster_path, 'w780')}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600">
            {isEpisode ? <Tv className="w-8 h-8 sm:w-10 sm:h-10" /> : <Film className="w-8 h-8 sm:w-10 sm:h-10" />}
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />

        {/* Day badge — top-left */}
        <div className={`absolute top-2 left-2 sm:top-3 sm:left-3 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-bold backdrop-blur-md border shadow-lg flex items-center gap-1 sm:gap-1.5 ${
          item.isToday
            ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400/50'
            : item.isTomorrow
            ? 'bg-cyan-500/30 text-cyan-200 border-cyan-400/50'
            : 'bg-slate-900/80 text-slate-200 border-slate-600/50'
        }`}>
          <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
          {item.isToday ? 'Today' : item.isTomorrow ? 'Tomorrow' : item.dayName}
        </div>

        {/* Runtime pill — bottom-left of poster */}
        {item.runtime && (
          <span className="absolute bottom-4 sm:bottom-6 left-2 sm:left-3 px-1.5 sm:px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-semibold bg-black/70 text-white backdrop-blur-sm z-10">
            {formatRuntime(item.runtime)}
          </span>
        )}

        {/* Type badge — top-right */}
        <span className="absolute top-2 right-2 sm:top-3 sm:right-3 text-[9px] sm:text-[10px] uppercase font-extrabold tracking-wide px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full backdrop-blur-md shadow-lg bg-slate-900/80 text-white border border-slate-700/60">
          {isEpisode ? 'TV' : 'Movie'}
        </span>
      </div>

      {/* Card body */}
      <div className="p-2.5 sm:p-4 flex-1 flex flex-col justify-between space-y-1.5 sm:space-y-3">
        <div>
          <h3 className="font-bold text-slate-100 text-xs sm:text-base md:text-lg truncate group-hover:text-cyan-400 transition-colors">
            {title}
          </h3>
          <p className="text-[10px] sm:text-xs text-slate-400 truncate mt-0.5">
            {subtitle}
          </p>
        </div>

      </div>
    </div>
  );
}
