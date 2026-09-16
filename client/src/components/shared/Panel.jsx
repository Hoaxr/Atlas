import { forwardRef } from 'react';
import clsx from 'clsx';

export const Panel = forwardRef(function Panel(
  {
    children,
    className,
    variant = 'default', // 'default', 'subtle', 'elevated'
    padding = 'md', // 'none', 'sm', 'md', 'lg'
    ...props
  },
  ref
) {
  const VARIANTS = {
    default: 'bg-slate-900/70 border border-slate-800/80 shadow-sm',
    subtle: 'bg-slate-900/40 border border-slate-800/50',
    elevated: 'bg-slate-900 border border-slate-700/70 shadow-lg shadow-black/40',
  };

  const PADDINGS = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-5 sm:p-6',
  };

  return (
    <div
      ref={ref}
      className={clsx(
        'rounded-xl transition-colors',
        VARIANTS[variant] || VARIANTS.default,
        PADDINGS[padding] || PADDINGS.md,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export default Panel;
