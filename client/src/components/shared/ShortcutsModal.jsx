import { Keyboard, X } from 'lucide-react';
import ModalShell from './ModalShell';
import { MOD_KEY } from '../../lib/platform';

function KeyCap({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-md bg-[#131f31] border border-[#22354e] text-slate-200 font-sans text-xs font-semibold shadow-sm select-none shrink-0">
      {children}
    </kbd>
  );
}

const SHORTCUTS = [
  { keys: [MOD_KEY, 'K'], desc: 'Open command menu' },
  { keys: ['G', 'M'], desc: 'Go to Movies' },
  { keys: ['G', 'S'], desc: 'Go to TV Shows' },
  { keys: ['G', 'U'], desc: 'Go to Music' },
  { keys: ['G', 'D'], desc: 'Go to Discover' },
  { keys: ['G', 'C'], desc: 'Go to Calendar' },
  { keys: ['G', 'T'], desc: 'Go to Tasks' },
  { keys: ['G', 'K'], desc: 'Go to Tracker' },
  { keys: ['G', 'X'], desc: 'Go to Statistics' },
  { keys: ['/'],      desc: 'Focus search bar' },
  { keys: ['?'],      desc: 'Show keyboard shortcuts' },
  { keys: ['Esc'],    desc: 'Close modal / clear focus' },
];

export default function ShortcutsModal({ onClose }) {
  return (
    <ModalShell 
      open 
      onClose={onClose} 
      size="md" 
      noHeader 
      noFloatingClose
      backdropClass="bg-black/75"
      className="bg-[#0b1320] border-[#1c2d46] text-slate-200 shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 mb-3 border-b border-[#1c2d46]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400 shadow-sm shrink-0">
            <Keyboard className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white leading-tight">Keyboard Shortcuts</h2>
            <p className="text-[11px] text-slate-400">Quick keys & navigation chords</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer -mr-1"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Flat List */}
      <ul className="space-y-1">
        {SHORTCUTS.map(({ keys, desc }) => (
          <li 
            key={desc} 
            className="flex items-center justify-between py-1.5 px-2.5 -mx-2 rounded-lg text-xs sm:text-sm text-slate-300 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <span className="font-medium">{desc}</span>
            <span className="flex items-center gap-1 shrink-0 ml-3">
              {keys.map((k) => (
                <KeyCap key={k}>{k}</KeyCap>
              ))}
            </span>
          </li>
        ))}
      </ul>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-[#1c2d46]/70 flex items-center justify-between text-[11px] text-slate-500">
        <span>Chords: press <strong className="text-slate-400 font-mono">G</strong> then letter</span>
        <span className="flex items-center gap-1.5">
          <KeyCap>Esc</KeyCap>
          <span>to dismiss</span>
        </span>
      </div>
    </ModalShell>
  );
}
