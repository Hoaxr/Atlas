import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, ChevronUp } from 'lucide-react';
import { memo } from 'react';

export const SortIcon = memo(function SortIcon({ field, sort }) {
  if (!sort || !sort.startsWith(field)) return null;
  return sort.endsWith('_asc')
    ? <ChevronUp className="w-3.5 h-3.5 inline ml-1" />
    : <ChevronDown className="w-3.5 h-3.5 inline ml-1" />;
});

export const FilterSelect = memo(function FilterSelect({ value, onChange, label, children, accentColor, hideAll }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options = [];
  if (!hideAll) {
    options.push({ value: 'all', label });
  }
  const childArray = Array.isArray(children) ? children : [children];
  childArray.forEach(child => {
    if (child?.props?.value !== undefined) {
      options.push({ value: child.props.value, label: child.props.children });
    }
  });

  const selected = options.find(o => String(o.value) === String(value)) || options[0] || { value: 'all', label };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
          isOpen || value !== 'all'
            ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
            : 'bg-slate-900/50 text-slate-400 border-white/5 hover:bg-slate-800/50 hover:text-slate-200 shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)]'
        }`}
      >
        {selected.label}
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-48 bg-slate-800 border border-white/10 rounded-xl shadow-xl z-[60] overflow-hidden py-1">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${
                String(value) === String(opt.value)
                  ? 'bg-emerald-500/20 text-emerald-400 font-medium'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-slate-200'
              }`}
              onClick={() => {
                onChange({ target: { value: opt.value } });
                setIsOpen(false);
              }}
            >
              <span className="truncate">{opt.label}</span>
              {String(value) === String(opt.value) && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export const MultiFilterSelect = memo(function MultiFilterSelect({ values, onChange, label, children }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options = [];
  const childArray = Array.isArray(children) ? children : [children];
  childArray.forEach(child => {
    if (child?.props?.value !== undefined) {
      options.push({ value: child.props.value, label: child.props.children });
    }
  });

  const selectedCount = values.length;
  
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
          isOpen || selectedCount > 0
            ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
            : 'bg-slate-900/50 text-slate-400 border-white/5 hover:bg-slate-800/50 hover:text-slate-200 shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)]'
        }`}
      >
        {label} {selectedCount > 0 && `(${selectedCount})`}
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-56 max-h-64 overflow-y-auto bg-slate-800 border border-white/10 rounded-xl shadow-xl z-[60] py-1 custom-scrollbar">
          {options.map(opt => {
            const isSelected = values.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-500/20 text-emerald-400 font-medium'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-emerald-500/30 border-emerald-500/50' : 'bg-slate-900 border-slate-600/50'}`}>
                    {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                  </div>
                  <span className="truncate">{opt.label}</span>
                </div>
                <input 
                  type="checkbox" 
                  className="hidden" 
                  checked={isSelected}
                  onChange={(e) => {
                    const newValues = e.target.checked 
                      ? [...values, opt.value] 
                      : values.filter(v => v !== opt.value);
                    onChange(newValues);
                  }}
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
});
