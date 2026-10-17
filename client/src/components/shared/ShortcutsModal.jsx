import { 
  Keyboard, Command, Search, Film, Tv, Music, Compass, 
  CalendarDays, ListTodo, BarChart3, HelpCircle, X, LogOut
} from 'lucide-react';
import ModalShell from './ModalShell';
import { MOD_KEY } from '../../lib/platform';

function KeyCap({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md bg-gradient-to-b from-[#1f2d42] to-[#0f1724] border-t border-white/20 border-x border-b border-[#050912] text-slate-200 font-mono text-[11px] font-bold shadow-[0_2px_0_0_#050912] select-none transition-transform active:translate-y-0.5">
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
    isCombo: true 
  },
  { 
    desc: 'Focus search bar', 
    icon: Search, 
    color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    keys: ['/'] 
  },
  { 
    desc: 'Show keyboard shortcuts', 
    icon: HelpCircle, 
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    keys: ['?'] 
  },
  { 
    desc: 'Close modal / clear focus', 
    icon: LogOut, 
    color: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
    keys: ['Esc'] 
  },
];

const NAVIGATION_SHORTCUTS = [
  { desc: 'Movies', icon: Film, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', key: 'M' },
  { desc: 'TV Shows', icon: Tv, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20', key: 'S' },
  { desc: 'Music', icon: Music, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', key: 'U' },
  { desc: 'Discover', icon: Compass, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20', key: 'D' },
  { desc: 'Calendar', icon: CalendarDays, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', key: 'C' },
  { desc: 'Tasks', icon: ListTodo, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', key: 'T' },
  { desc: 'Statistics', icon: BarChart3, color: 'text-teal-400 bg-teal-500/10 border-teal-500/20', key: 'X' },
];

export default function ShortcutsModal({ onClose }) {
  return (
    <ModalShell open onClose={onClose} size="lg" noHeader backdropClass="bg-black/70 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#1c2d46]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-950/40">
            <Keyboard className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white font-display tracking-tight">
              Keyboard Shortcuts
            </h2>
            <p className="text-xs text-slate-400">
              Navigate and command Atlas at the speed of thought
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

      {/* Shortcuts Grid: 2 Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Column 1: Global & System */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 px-1">
            <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-widest">
              General & Actions
            </span>
            <div className="h-px bg-gradient-to-r from-cyan-500/30 to-transparent flex-1" />
          </div>

          <div className="space-y-1.5 bg-[#080e18]/60 p-2.5 rounded-xl border border-[#1c2d46]/70">
            {GLOBAL_SHORTCUTS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.desc}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${item.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors truncate">
                      {item.desc}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {item.keys.map((k) => (
                      <KeyCap key={k}>{k}</KeyCap>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 2: Navigation (G chords) */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 px-1">
            <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-widest">
              Navigation Chords
            </span>
            <div className="h-px bg-gradient-to-r from-cyan-500/30 to-transparent flex-1" />
          </div>

          <div className="space-y-1.5 bg-[#080e18]/60 p-2.5 rounded-xl border border-[#1c2d46]/70">
            {NAVIGATION_SHORTCUTS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.desc}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${item.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors truncate">
                      Go to {item.desc}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <KeyCap>G</KeyCap>
                    <span className="text-[10px] text-slate-500 font-semibold px-0.5">then</span>
                    <KeyCap>{item.key}</KeyCap>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Notice */}
      <div className="mt-4 pt-3 border-t border-[#1c2d46]/60 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span>Tip: Chords are pressed in sequence (press <strong className="text-slate-400 font-mono">G</strong>, then press letter)</span>
        </span>
        <span className="flex items-center gap-1">
          <KeyCap>Esc</KeyCap>
          <span>to dismiss</span>
        </span>
      </div>
    </ModalShell>
  );
}
