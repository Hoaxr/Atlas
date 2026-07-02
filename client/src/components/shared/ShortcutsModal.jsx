import { Keyboard } from 'lucide-react';
import ModalShell from './ModalShell';

const SHORTCUTS = [
  { keys: ['G', 'M'], desc: 'Go to Movies' },
  { keys: ['G', 'S'], desc: 'Go to TV Shows' },
  { keys: ['G', 'D'], desc: 'Go to Discover' },
  { keys: ['G', 'C'], desc: 'Go to Calendar' },
  { keys: ['G', 'T'], desc: 'Go to Tasks' },
  { keys: ['G', 'X'], desc: 'Go to Statistics' },
  { keys: ['/'],      desc: 'Focus search bar' },
  { keys: ['?'],      desc: 'Show keyboard shortcuts' },
  { keys: ['Esc'],    desc: 'Close modal / clear focus' },
];

export default function ShortcutsModal({ onClose }) {
  return (
    <ModalShell open onClose={onClose} size="md" noHeader backdropClass="bg-black/60">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
          <Keyboard className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-bold text-white">Keyboard Shortcuts</h2>
      </div>

      <ul className="space-y-2">
        {SHORTCUTS.map(({ keys, desc }) => (
          <li key={desc} className="flex items-center justify-between text-sm">
            <span className="text-slate-400">{desc}</span>
            <span className="flex items-center gap-1">
              {keys.map((k) => (
                <kbd
                  key={k}
                  className="px-2 py-0.5 rounded-md bg-slate-800 border border-white/10 text-slate-200 font-mono text-xs font-semibold shadow"
                >
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-slate-600 text-center">
        Press any key or click outside to dismiss
      </p>
    </ModalShell>
  );
}
