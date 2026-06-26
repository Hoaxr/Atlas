import clsx from 'clsx';

export function CardSkeleton() {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden animate-pulse">
      <div className="aspect-[2/3] bg-slate-800/50" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-slate-800/80 rounded-lg w-3/4" />
        <div className="h-3 bg-slate-800/60 rounded-lg w-1/2" />
        <div className="flex gap-2">
          <div className="h-5 bg-slate-800/60 rounded-full w-16" />
          <div className="h-5 bg-slate-800/60 rounded-full w-12" />
        </div>
      </div>
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }) {
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

export function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex gap-6">
        <div className="w-64 aspect-[2/3] bg-slate-800/50 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-4">
          <div className="h-8 bg-slate-800/80 rounded-lg w-1/2" />
          <div className="h-4 bg-slate-800/60 rounded-lg w-1/3" />
          <div className="space-y-2">
            <div className="h-3 bg-slate-800/50 rounded-lg w-full" />
            <div className="h-3 bg-slate-800/50 rounded-lg w-5/6" />
            <div className="h-3 bg-slate-800/50 rounded-lg w-4/6" />
          </div>
        </div>
      </div>
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

export default { CardSkeleton, TableRowSkeleton, DetailSkeleton, StatsSkeleton, ListSkeleton };
