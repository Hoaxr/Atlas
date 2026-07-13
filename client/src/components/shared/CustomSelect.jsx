import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';

export default function CustomSelect({ value, onChange, options, className = '', theme = 'emerald' }) {
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

  const themes = {
    emerald: {
      buttonFocus: 'hover:border-emerald-500/50 focus:border-emerald-500',
      optionActive: 'bg-emerald-500/20 text-emerald-400 font-medium',
      checkIcon: 'text-emerald-400'
    },
    purple: {
      buttonFocus: 'hover:border-purple-500/50 focus:border-purple-500',
      optionActive: 'bg-purple-500/20 text-purple-400 font-medium',
      checkIcon: 'text-purple-400'
    },
    cyan: {
      buttonFocus: 'hover:border-cyan-500/50 focus:border-cyan-500',
      optionActive: 'bg-cyan-500/20 text-cyan-400 font-medium',
      checkIcon: 'text-cyan-400'
    }
  };

  const currentTheme = themes[theme] || themes.emerald;

  return (
    <div className={clsx('relative', className)} ref={containerRef}>
      <button
        type="button"
        className={clsx(
          "w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 flex items-center justify-between focus:outline-none transition-colors",
          currentTheme.buttonFocus
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate">{selectedOption.label}</span>
        <ChevronDown className={clsx('w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ml-2', isOpen && 'rotate-180')} />
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
                  String(value) === String(option.value) ? currentTheme.optionActive : 'text-slate-300 hover:bg-slate-700 hover:text-slate-200'
                )}
                onClick={() => {
                  onChange({ target: { value: option.value } });
                  setIsOpen(false);
                }}
              >
                <span className="truncate pr-2">{option.label}</span>
                {String(value) === String(option.value) && <Check className={clsx("w-4 h-4 flex-shrink-0", currentTheme.checkIcon)} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
