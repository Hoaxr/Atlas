import toast from 'react-hot-toast';

const icons = {
  success: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
  ),
  error: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
  ),
  info: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
  ),
  warning: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  ),
};

const colorMap = {
  success: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', bar: 'bg-emerald-500' },
  error:   { bg: 'bg-red-500/10',   text: 'text-red-400',   border: 'border-red-500/30',   bar: 'bg-red-500' },
  info:    { bg: 'bg-cyan-500/10',  text: 'text-cyan-400',  border: 'border-cyan-500/30',  bar: 'bg-cyan-500' },
  warning: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', bar: 'bg-amber-500' },
};

export const customAlert = (message, type = 'success', duration = 4000) => {
  const colors = colorMap[type] || colorMap.info;

  const toastId = toast.custom((t) => (
    <div
      className={`${
        t.visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      } transform transition-all duration-300 pointer-events-auto`}
    >
      <div className={`flex items-start gap-3 bg-slate-800/95 backdrop-blur-md border ${colors.border} rounded-xl px-4 py-3 shadow-2xl shadow-black/40 min-w-[300px] max-w-[420px]`}>
        <div className={`p-1.5 rounded-lg ${colors.bg} ${colors.text} shrink-0`}>
          {icons[type] || icons.info}
        </div>
        <p className="flex-1 text-sm text-slate-200 leading-relaxed pt-0.5">{message}</p>
        <button
          onClick={() => toast.dismiss(t.id)}
          className="text-slate-500 hover:text-slate-300 transition-colors shrink-0 mt-0.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      {/* Progress bar */}
      <div className="mx-4 -mt-px">
        <div className="h-0.5 bg-slate-700/50 rounded-full overflow-hidden">
          <div
            className={`h-full ${colors.bar} rounded-full`}
            style={{
              animation: `toast-shrink ${duration}ms linear forwards`,
            }}
          />
        </div>
      </div>
    </div>
  ), {
    duration,
    position: 'bottom-right',
  });

  if (duration && duration !== Infinity) {
    setTimeout(() => {
      toast.dismiss(toastId);
    }, duration);
  }
};

export const customConfirm = (message, opts = {}) => {
  return new Promise((resolve) => {
    const hasThird = !!opts.thirdOptionText;
    toast.custom((t) => (
      <div className={`${t.visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-4 opacity-0 scale-95'} transform transition-all duration-300 pointer-events-auto mt-[20vh]`}>
        <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl shadow-black/50 w-[400px] overflow-hidden">
          {/* Header with close */}
          <div className="flex items-start justify-between px-5 pt-5 pb-2">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 ${opts.type === 'warning' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                {opts.type === 'warning' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                )}
              </div>
              <h3 className="text-lg font-bold text-white">{opts.title || 'Remove from Library'}</h3>
            </div>
            {hasThird && (
              <button
                onClick={() => { toast.dismiss(t.id); resolve(null); }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>

          {/* Message */}
          <div className="px-5 pb-4">
            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{message}</p>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-700/50" />

          {/* Buttons */}
          <div className="p-4 flex gap-3">
            <button
              onClick={() => { toast.dismiss(t.id); resolve(false); }}
              className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-slate-600 text-slate-200 hover:bg-slate-700 hover:border-slate-500 transition-colors"
            >
              {opts.cancelText || 'Cancel'}
            </button>
            <button
              onClick={() => { toast.dismiss(t.id); resolve(true); }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-xl text-white transition-colors shadow-lg ${opts.type === 'warning' ? 'bg-amber-500 hover:bg-amber-400 shadow-amber-500/20' : 'bg-red-500 hover:bg-red-400 shadow-red-500/20'}`}
            >
              {opts.confirmText || 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    ), { duration: Infinity, position: 'top-center' });
  });
};

