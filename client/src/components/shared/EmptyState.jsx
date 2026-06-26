import { Film, Tv, DownloadCloud, Activity, AlertCircle, Search, BarChart3 } from 'lucide-react';
import clsx from 'clsx';

const iconMap = {
  movies: Film,
  shows: Tv,
  downloads: DownloadCloud,
  tasks: Activity,
  issues: AlertCircle,
  search: Search,
  stats: BarChart3,
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
        'flex flex-col items-center justify-center py-20 px-6 text-center',
        className
      )}
    >
      <div className="p-6 rounded-3xl bg-slate-800/40 border border-slate-700/30 mb-6">
        <Icon className="w-12 h-12 text-slate-500" />
      </div>
      <h3 className="text-xl font-bold text-slate-300 mb-2">{title}</h3>
      {description && (
        <p className="text-slate-500 max-w-sm mb-6">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
