import { CheckSquare, Square } from 'lucide-react';
import clsx from 'clsx';

/**
 * Checkbox row used across the settings tabs.
 * Renders a bordered "card" row with a square/checked icon, a title and an optional description.
 */
export default function ToggleRow({ checked, onChange, title, description, icon: Icon, className, disabled = false, action }) {
  if (action) {
    return (
      <div
        className={clsx(
          'flex items-center justify-between gap-2.5 p-3 sm:p-3.5 rounded-xl bg-[#101e31] border border-[#1c2d46] transition-colors',
          !disabled && 'hover:border-cyan-500/40',
          disabled && 'opacity-60',
          className
        )}
      >
        <label className={clsx('flex items-start gap-3 flex-1 min-w-0', !disabled && 'cursor-pointer group')}>
          <div className="mt-0.5 shrink-0">
            <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} disabled={disabled} />
            {checked ? <CheckSquare className="w-4 h-4 text-cyan-400" /> : <Square className="w-4 h-4 text-slate-500" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors flex items-center gap-1.5">
              {Icon && <Icon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />} {title}
            </p>
            {description && <p className="text-xs text-slate-400 mt-0.5 leading-snug">{description}</p>}
          </div>
        </label>
        <div className="shrink-0" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          {action}
        </div>
      </div>
    );
  }

  return (
    <label
      className={clsx(
        'flex items-start gap-3 p-3.5 rounded-xl bg-[#101e31] border border-[#1c2d46] transition-colors',
        !disabled && 'cursor-pointer hover:border-cyan-500/40 group',
        disabled && 'opacity-60',
        className
      )}
    >
      <div className="mt-0.5 shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} disabled={disabled} />
        {checked ? <CheckSquare className="w-4 h-4 text-cyan-400" /> : <Square className="w-4 h-4 text-slate-500" />}
      </div>
      <div className="min-w-0">
        <p className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors flex items-center gap-1.5">
          {Icon && <Icon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />} {title}
        </p>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}
