/**
 * LoadingState — Atlas standard loading indicator matching Movies and TV Shows.
 * @param {string} text — Text to display below spinner (default 'Loading data...')
 * @param {string} className — Container class overrides
 * @param {boolean} fullScreen — If true, render absolute inset overlay like Dashboard
 */
export default function LoadingState({
  text = 'Loading data...',
  className = 'py-20 min-h-[40vh]',
  fullScreen = false,
}) {
  if (fullScreen) {
    return (
      <div className="absolute inset-0 z-30 bg-slate-50 dark:bg-[#0a1320] text-slate-400">
        <div className="sticky top-[40vh] flex flex-col items-center justify-center gap-4 text-slate-400">
          <div className="w-8 h-8 border-2 border-cyan-500/50 border-t-cyan-400 rounded-full animate-spin" />
          {text && <p className="text-sm font-medium">{text}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-4 text-slate-400 ${className}`}>
      <div className="w-8 h-8 border-2 border-cyan-500/50 border-t-cyan-400 rounded-full animate-spin" />
      {text && <p className="text-sm font-medium">{text}</p>}
    </div>
  );
}
