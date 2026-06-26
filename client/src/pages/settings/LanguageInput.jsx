import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function LanguageInput({ selected, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target) &&
          menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open || !ref.current) return;
    const updatePos = () => {
      const rect = ref.current.getBoundingClientRect();
      setMenuStyle({
        left: rect.left,
        top: rect.bottom + 4,
        width: rect.width,
      });
    };
    updatePos();
    window.addEventListener('scroll', updatePos, { passive: true });
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos);
      window.removeEventListener('resize', updatePos);
    };
  }, [open]);

  const allLangs = [
    { code: 'en', label: 'English' },
    { code: 'nl', label: 'Dutch' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'es', label: 'Spanish' },
    { code: 'it', label: 'Italian' },
    { code: 'pt', label: 'Portuguese' },
  ];

  const filtered = allLangs.filter(l =>
    !selected.includes(l.code) &&
    l.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={ref}>
      <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-950/50 border border-white/10 rounded-lg min-h-[42px] focus-within:ring-2 focus-within:ring-cyan-500/50 focus-within:border-cyan-500/50 transition-all">
        {selected.map(code => {
          const lang = allLangs.find(l => l.code === code);
          return (
            <span key={code} className="inline-flex items-center gap-1 text-xs font-medium bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full">
              {lang?.label || code}
              <button onClick={() => onChange(selected.filter(c => c !== code))} className="hover:text-white transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          );
        })}
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? 'Type to search languages...' : ''}
          className="flex-1 min-w-[80px] bg-transparent border-none outline-none text-xs text-slate-200 placeholder-slate-600 py-0.5"
        />
      </div>

      {open && filtered.length > 0 && createPortal(
        <div
          ref={menuRef}
          className="fixed bg-slate-800 border border-white/10 rounded-xl py-1 shadow-2xl z-[9999] max-h-48 overflow-y-auto"
          style={menuStyle}
        >
          {filtered.map(l => (
            <button
              key={l.code}
              onClick={() => { onChange([...selected, l.code]); setQuery(''); }}
              className="block w-full text-left text-xs font-medium px-3 py-2 text-slate-300 hover:bg-slate-700/50 transition-colors"
            >
              {l.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
