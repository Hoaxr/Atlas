import { forwardRef } from 'react';
import clsx from 'clsx';
import Spinner from './Spinner';

const VARIANTS = {
  primary: 'bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 font-semibold shadow-sm focus-visible:ring-cyan-500/50',
  secondary: 'bg-slate-800/80 hover:bg-slate-700/80 active:bg-slate-800 text-slate-200 border border-slate-700/80 focus-visible:ring-slate-500/50',
  ghost: 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 active:bg-slate-800/80 focus-visible:ring-slate-500/50',
  danger: 'bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 text-rose-400 border border-rose-500/30 focus-visible:ring-rose-500/50',
  subtle: 'bg-slate-900/60 hover:bg-slate-800 text-slate-300 border border-slate-800/80 focus-visible:ring-slate-500/50',
};

const SIZES = {
  xs: 'h-7 px-2 text-xs gap-1 rounded-md',
  sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-10 px-4 text-sm gap-2.5 rounded-lg',
  'icon-xs': 'h-7 w-7 p-0 justify-center rounded-md',
  'icon-sm': 'h-8 w-8 p-0 justify-center rounded-lg',
  'icon-md': 'h-9 w-9 p-0 justify-center rounded-lg',
};

export const Button = forwardRef(function Button(
  {
    children,
    className,
    variant = 'secondary',
    size = 'md',
    loading = false,
    disabled = false,
    type = 'button',
    icon: Icon,
    iconRight: IconRight,
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={clsx(
        'inline-flex items-center justify-center font-medium transition-colors select-none outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950 shrink-0',
        VARIANTS[variant] || VARIANTS.secondary,
        SIZES[size] || SIZES.md,
        isDisabled && 'opacity-50 pointer-events-none cursor-not-allowed',
        className
      )}
      {...props}
    >
      {loading ? (
        <Spinner size="sm" className="mr-1.5" />
      ) : Icon ? (
        <Icon className={clsx('shrink-0', size === 'sm' || size === 'xs' || size === 'icon-xs' ? 'w-3.5 h-3.5' : 'w-4 h-4')} />
      ) : null}
      {children}
      {IconRight && !loading && (
        <IconRight className={clsx('shrink-0', size === 'sm' || size === 'xs' ? 'w-3.5 h-3.5' : 'w-4 h-4')} />
      )}
    </button>
  );
});

export default Button;
