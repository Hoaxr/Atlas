import { forwardRef } from 'react';
import clsx from 'clsx';

export const PageHeader = forwardRef(function PageHeader(
  {
    title,
    description,
    icon: Icon,
    badge,
    actions,
    children,
    className,
  },
  ref
) {
  return (
    <div ref={ref} className={clsx('flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 sm:gap-3">
          {Icon && (
            <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-cyan-400 shrink-0">
              <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          )}
          <div className="min-w-0 flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 font-display truncate !mb-0">
              {title}
            </h1>
            {badge && <div className="shrink-0">{badge}</div>}
          </div>
        </div>
        {description && (
          <p className="text-xs sm:text-sm text-slate-400 mt-1 !mb-0 font-sans line-clamp-1 sm:line-clamp-none">
            {description}
          </p>
        )}
      </div>

      {(actions || children) && (
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap sm:flex-nowrap shrink-0">
          {actions}
          {children}
        </div>
      )}
    </div>
  );
});

export default PageHeader;
