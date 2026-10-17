import { 
  Keyboard, Command, Search, Film, Tv, Music, Compass, 
  CalendarDays, ListTodo, BarChart3, HelpCircle, X, LogOut, CheckCircle2, PlayCircle
} from 'lucide-react';
import ModalShell from './ModalShell';
import { MOD_KEY } from '../../lib/platform';

function KeyCap({ children, className = '' }) {
  return (
    <kbd className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-md bg-[#131f31] border border-white/10 text-slate-200 font-sans text-xs font-semibold shadow-sm select-none shrink-0 ${className}`}>
      {children}
    </kbd>
  );
}

const GLOBAL_SHORTCUTS = [
  { 
    desc: 'Open command menu', 
    icon: Command, 
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    keys: [MOD_KEY, 'K'], 
  },
  { 
    desc: 'Focus search bar', 
    icon: Search, 
    color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    keys: ['/'], 
  },
  { 
    desc: 'Show keyboard shortcuts', 
    icon: HelpCircle, 
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    keys: ['?'], 
  },
  { 
    desc: 'Close modal / dismiss', 
    icon: LogOut, 
    color: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
    keys: ['Esc'], 
  },
];

const NAVIGATION_SHORTCUTS = [
  { desc: 'Movies', icon: Film, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', key: 'M' },
  { desc: 'TV Shows', icon: Tv, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20', key: 'S' },
  { desc: 'Music', icon: Music, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', key: 'U' },
  { desc: 'Discover', icon: Compass, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20', key: 'D' },
  { desc: 'Calendar', icon: CalendarDays, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', key: 'C' },
  { desc: 'Tasks', icon: ListTodo, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', key: 'T' },
  { desc: 'Watch Tracker', icon: PlayCircle, color: 'text-teal-400 bg-teal-500/10 border-teal-500/20', key: 'K' },
  { desc: 'Statistics', icon: BarChart3, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', key: 'X' },
];

export default function ShortcutsModal({ onClose }) {
  return (
    <ModalShell 
      open 
      onClose={onClose} 
      size="2xl" 
      noHeader 
      noPadding
      noFloatingClose
      backdropClass="bg-black/75"
      className="bg-[#0b1320] border-[#1c2d46] text-slate-200 shadow-[0_25px_70px_rgba(0,0,0,0.9)] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#1c2d46]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400 shadow-sm">
            <Keyboard className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white font-display tracking-tight">
              Keyboard Shortcuts
            </h2>
            <p className="text-xs text-slate-400">
              Navigate and command Atlas from your keyboard
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body Grid: Navigation Chords (Left) & General Actions + Tip (Right) */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto">
        {/* Navigation Chords */}
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-white/5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Navigation Chords
            </span>
            <span className="text-[11px] text-slate-500 font-mono">Press G then key</span>
          </div>

          <div className="space-y-1">
            {NAVIGATION_SHORTCUTS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.desc}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${item.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">
                      {item.desc}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    <KeyCap>G</KeyCap>
                    <span className="text-[10px] text-slate-500 font-medium">then</span>
                    <KeyCap>{item.key}</KeyCap>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* General Actions & Tips */}
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="pb-1 border-b border-white/5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                General & Actions
              </span>
            </div>

            <div className="space-y-1">
              {GLOBAL_SHORTCUTS.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.desc}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${item.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">
                        {item.desc}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-3">
                      {item.keys.map((k, idx) => (
                        <KeyCap key={idx}>{k}</KeyCap>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Tip Box */}
          <div className="p-3.5 rounded-xl bg-cyan-500/[0.06] border border-cyan-500/20 text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center gap-2 text-cyan-400 font-semibold text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Pro Tip: Instant Search</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Press <KeyCap className="inline-flex mx-0.5 scale-90">/{' '}</KeyCap> from anywhere to immediately focus the top search bar, or <KeyCap className="inline-flex mx-0.5 scale-90">{MOD_KEY}</KeyCap><KeyCap className="inline-flex mx-0.5 scale-90">K</KeyCap> to open the Command Menu.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-[#1c2d46] bg-[#070e1b] flex items-center justify-between text-[11px] text-slate-400 rounded-b-xl">
        <span>Navigation chords are pressed in sequence (e.g. <strong className="text-slate-300 font-mono">G</strong> then <strong className="text-slate-300 font-mono">M</strong>)</span>
        <div className="flex items-center gap-1.5">
          <KeyCap>Esc</KeyCap>
          <span>to dismiss</span>
        </div>
      </div>
    </ModalShell>
  );
}
