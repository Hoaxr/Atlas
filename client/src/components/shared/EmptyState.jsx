import { Film, Tv, DownloadCloud, Activity, AlertCircle, Search, BarChart3, Music2, Disc, Mic2, FileAudio } from 'lucide-react';
import clsx from 'clsx';

const iconMap = {
  movies: Film,
  shows: Tv,
  downloads: DownloadCloud,
  tasks: Activity,
  issues: AlertCircle,
  search: Search,
  stats: BarChart3,
  music: Music2,
  album: Disc,
  artist: Mic2,
  tracks: FileAudio,
};

export default function EmptyState({
  icon = 'search',
  title = 'Nothing here yet',
  description = '',
  action,
  className,
}) {
  const Icon = iconMap[icon] || Search;

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center py-12 sm:py-16 px-4 text-center',
        className
      )}
    >
      <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 mb-3.5 text-slate-400">
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="text-base sm:text-lg font-semibold text-slate-200 mb-1 font-display">{title}</h3>
      {description && (
        <p className="text-xs sm:text-sm text-slate-400 max-w-sm mb-4 font-sans">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
