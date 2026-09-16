import clsx from 'clsx';

const STATUS_CONFIGS = {
  downloading: {
    label: 'Downloading',
    bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    dot: 'bg-cyan-400 animate-pulse',
  },
  downloaded: {
    label: 'Downloaded',
    bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
  completed: {
    label: 'Completed',
    bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
  connected: {
    label: 'Connected',
    bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
  available: {
    label: 'Available',
    bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
  missing: {
    label: 'Missing',
    bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    dot: 'bg-rose-400',
  },
  failed: {
    label: 'Failed',
    bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    dot: 'bg-rose-400',
  },
  error: {
    label: 'Error',
    bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    dot: 'bg-rose-400',
  },
  partial: {
    label: 'Partial',
    bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    dot: 'bg-amber-400',
  },
  warning: {
    label: 'Warning',
    bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    dot: 'bg-amber-400',
  },
  queued: {
    label: 'Queued',
    bg: 'bg-slate-800/80 text-slate-300 border-slate-700/60',
    dot: 'bg-slate-400',
  },
  paused: {
    label: 'Paused',
    bg: 'bg-slate-800/80 text-slate-400 border-slate-700/60',
    dot: 'bg-slate-500',
  },
  monitored: {
    label: 'Monitored',
    bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    dot: 'bg-cyan-400',
  },
  unmonitored: {
    label: 'Unmonitored',
    bg: 'bg-slate-800/60 text-slate-400 border-slate-700/40',
    dot: 'bg-slate-500',
  },
  unconfigured: {
    label: 'Unconfigured',
    bg: 'bg-slate-800/60 text-slate-400 border-slate-700/40',
    dot: 'bg-slate-500',
  },
};

export default function StatusBadge({
  status = 'unmonitored',
  label,
  showDot = true,
  size = 'sm',
  className,
}) {
  const normKey = String(status || '').toLowerCase().trim();
  const config = STATUS_CONFIGS[normKey] || STATUS_CONFIGS.unmonitored;
  const displayLabel = label || config.label;

  return (
    <span
      className={clsx(
        'inline-flex items-center font-semibold uppercase tracking-wider rounded-md border select-none',
        size === 'xs' ? 'text-[9px] px-1.5 py-0.5 gap-1' : 'text-[10px] px-2 py-0.5 gap-1.5',
        config.bg,
        className
      )}
    >
      {showDot && (
        <span
          className={clsx(
            'rounded-full shrink-0',
            size === 'xs' ? 'w-1 h-1' : 'w-1.5 h-1.5',
            config.dot
          )}
        />
      )}
      <span>{displayLabel}</span>
    </span>
  );
}
