import clsx from 'clsx';

function TableRowSkeleton({ cols = 5 }) {
  return (
    <div className="flex items-center gap-4 p-4 glass-panel rounded-xl animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <div
          key={i}
          className={clsx(
            'h-4 bg-slate-800/60 rounded-lg',
            i === 0 ? 'flex-1' : 'w-20'
          )}
        />
      ))}
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="glass-panel p-6 rounded-2xl space-y-3">
          <div className="h-4 bg-slate-800/60 rounded-lg w-1/2" />
          <div className="h-8 bg-slate-800/80 rounded-lg w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 8 }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} />
      ))}
    </div>
  );
}

