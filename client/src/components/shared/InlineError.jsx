import { AlertCircle, RotateCcw } from 'lucide-react';

/**
 * Shared inline error display component.
 *
 * @param {object} props
 * @param {string} props.message - Error message to display
 * @param {() => void} [props.onRetry] - Optional retry callback
 * @param {boolean} [props.compact] - Smaller variant for tight spaces
 */
export default function InlineError({ message, onRetry, compact }) {
  if (!message) return null;

  const baseClass = compact
    ? 'flex items-center gap-2 text-xs text-rose-400'
    : 'flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400';

  return (
    <div className={baseClass}>
      <AlertCircle className={`shrink-0 ${compact ? 'w-3.5 h-3.5' : 'w-5 h-5'}`} />
      <p className={compact ? '' : 'text-sm flex-1'}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}
