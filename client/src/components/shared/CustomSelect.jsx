import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';

export default function CustomSelect({ value, onChange, options, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => String(opt.value) === String(value)) || options[0] || { label: 'Select...', value: '' };

  return (
    <div className={clsx('relative', className)} ref={containerRef}>
      <button
        type="button"
        className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 flex items-center justify-between hover:border-emerald-500/50 focus:outline-none focus:border-emerald-500 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate">{selectedOption.label}</span>
        <ChevronDown className={clsx('w-4 h-4 text-slate-400 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-lg shadow-black/50 overflow-hidden py-1">
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={clsx(
                  'w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors',
                  String(value) === String(option.value) ? 'bg-emerald-500/20 text-emerald-400 font-medium' : 'text-slate-300 hover:bg-slate-700 hover:text-slate-200'
                )}
                onClick={() => {
                  onChange({ target: { value: option.value } });
                  setIsOpen(false);
                }}
              >
                <span className="truncate">{option.label}</span>
                {String(value) === String(option.value) && <Check className="w-4 h-4 text-emerald-400" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
