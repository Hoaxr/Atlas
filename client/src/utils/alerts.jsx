import toast from 'react-hot-toast';

export const customConfirm = (message) => {
  return new Promise((resolve) => {
    toast.custom((t) => (
      <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} bg-slate-800 text-white p-5 rounded-2xl shadow-2xl shadow-black/50 border border-white/10 flex flex-col gap-3 min-w-[320px] pointer-events-auto`}>
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          </div>
          <div className="flex-1 mt-1">
            <p className="font-semibold text-slate-200">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <button 
            className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-slate-700 text-slate-300 transition-colors"
            onClick={() => {
              toast.dismiss(t.id);
              resolve(false);
            }}
          >
            Cancel
          </button>
          <button 
            className="px-4 py-2 text-sm font-bold rounded-xl bg-purple-500 text-white hover:bg-purple-400 transition-colors shadow-lg shadow-purple-500/20"
            onClick={() => {
              toast.dismiss(t.id);
              resolve(true);
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    ), { duration: Infinity, position: 'top-center' });
  });
};

export const customAlert = (message, type = 'success') => {
  if (type === 'success') {
    toast.success(message, {
      style: {
        background: '#1e293b',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px',
        padding: '16px',
      },
      iconTheme: {
        primary: '#10b981',
        secondary: '#1e293b',
      },
    });
  } else if (type === 'info') {
    toast(message, {
      style: {
        background: '#1e293b',
        color: '#fff',
        border: '1px solid rgba(6, 182, 212, 0.3)',
        borderRadius: '16px',
        padding: '16px',
      },
      icon: 'ℹ️',
    });
  } else {
    toast.error(message, {
      style: {
        background: '#1e293b',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px',
        padding: '16px',
      },
      iconTheme: {
        primary: '#ef4444',
        secondary: '#1e293b',
      },
    });
  }
};
