import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, ChevronUp } from 'lucide-react';
import { memo } from 'react';

export const SortIcon = memo(function SortIcon({ field, sort }) {
  if (!sort || !sort.startsWith(field)) return null;
  return sort.endsWith('_asc')
    ? <ChevronUp className="w-3.5 h-3.5 inline ml-1" />
    : <ChevronDown className="w-3.5 h-3.5 inline ml-1" />;
});

export const FilterSelect = memo(function FilterSelect({ value, onChange, label, children, _accentColor, hideAll, className = '' }) {
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

  const isActive = isOpen || (hideAll ? (value && value !== '') : (value && value !== 'all'));

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-3.5 sm:gap-4 text-xs sm:text-sm font-medium px-3.5 py-2 rounded-xl border transition-colors ${
          isActive
            ? 'bg-[#0d2b51] text-[#e7ecf6] border-[#1b4273] shadow-sm'
            : 'bg-[#101e31] text-slate-300 border-[#1c2d46] hover:border-slate-600 hover:text-white'
        }`}
      >
        <span className="truncate">{selected.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isActive ? 'text-[#aac6dd]' : 'text-slate-400'} ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-48 max-w-[calc(100vw-2rem)] bg-[#0e1a2b] border border-[#1c2d46] rounded-xl shadow-xl shadow-black/50 z-[60] overflow-hidden py-1 max-h-64 overflow-y-auto custom-scrollbar">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`w-full text-left px-3.5 py-2 text-sm flex items-center justify-between transition-colors ${
                String(value) === String(opt.value)
                  ? 'bg-[#0d2b51] text-[#e7ecf6] font-medium'
                  : 'text-slate-300 hover:bg-[#16273d] hover:text-white'
              }`}
              onClick={() => {
                onChange({ target: { value: opt.value } });
                setIsOpen(false);
              }}
            >
              <span className="truncate">{opt.label}</span>
              {String(value) === String(opt.value) && <Check className="w-4 h-4 text-[#aac6dd] shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export const MultiFilterSelect = memo(function MultiFilterSelect({ values, onChange, label, children, className = '' }) {
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
  const isMultiActive = isOpen || selectedCount > 0;
  
  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-3.5 sm:gap-4 text-xs sm:text-sm font-medium px-3.5 py-2 rounded-xl border transition-colors ${
          isMultiActive
            ? 'bg-[#0d2b51] text-[#e7ecf6] border-[#1b4273] shadow-sm'
            : 'bg-[#101e31] text-slate-300 border-[#1c2d46] hover:border-slate-600 hover:text-white'
        }`}
      >
        <span className="truncate">{label} {selectedCount > 0 && `(${selectedCount})`}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isMultiActive ? 'text-[#aac6dd]' : 'text-slate-400'} ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-56 max-w-[calc(100vw-2rem)] max-h-64 overflow-y-auto bg-[#0e1a2b] border border-[#1c2d46] rounded-xl shadow-xl shadow-black/50 z-[60] py-1.5 custom-scrollbar">
          {options.map(opt => {
            const isSelected = values.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={`w-full text-left px-3.5 py-2 text-sm flex items-center justify-between transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#0d2b51]/60 text-white font-medium'
                    : 'text-slate-300 hover:bg-[#16273d] hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-[#0d2b51] border-[#1b4273]' : 'bg-slate-900 border-slate-700/80'}`}>
                    {isSelected && <Check className="w-3 h-3 text-[#e7ecf6]" />}
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
