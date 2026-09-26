import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, ChevronUp } from 'lucide-react';
import { memo } from 'react';

export const SortIcon = memo(function SortIcon({ field, sort }) {
  if (!sort || !sort.startsWith(field)) return null;
  return sort.endsWith('_asc')
    ? <ChevronUp className="w-3.5 h-3.5 inline ml-1" />
    : <ChevronDown className="w-3.5 h-3.5 inline ml-1" />;
});

export const FilterSelect = memo(function FilterSelect({
  value,
  onChange,
  label,
  children,
  _accentColor,
  hideAll,
  className = '',
  icon: Icon,
  mobileIconOnly = false,
  defaultValue,
  title,
  dropdownAlign
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuOffset, setMenuOffset] = useState(0);
  const ref = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setMenuOffset(0);
      return;
    }

    const adjustPosition = () => {
      if (!ref.current || !menuRef.current) return;
      const triggerRect = ref.current.getBoundingClientRect();
      const menuRect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const margin = 8;

      let offset = 0;
      if (dropdownAlign === 'right') {
        offset = triggerRect.width - menuRect.width;
      }

      const computedLeft = triggerRect.left + offset;
      const computedRight = computedLeft + menuRect.width;

      if (computedRight > viewportWidth - margin) {
        offset -= (computedRight - (viewportWidth - margin));
      }
      if (triggerRect.left + offset < margin) {
        offset = margin - triggerRect.left;
      }

      setMenuOffset(offset);
    };

    adjustPosition();
    const frame = requestAnimationFrame(adjustPosition);
    window.addEventListener('resize', adjustPosition);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', adjustPosition);
    };
  }, [isOpen, dropdownAlign]);

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

  const isFiltered = defaultValue !== undefined
    ? String(value) !== String(defaultValue)
    : (hideAll ? (value && value !== '') : (value && value !== 'all'));
  const isActive = isOpen || isFiltered;

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={title || selected.label}
        aria-label={title || selected.label}
        className={`relative ${
          mobileIconOnly
            ? 'w-9 h-9 sm:w-auto sm:h-auto p-0 sm:px-3.5 sm:py-2 flex items-center justify-center sm:justify-between gap-1.5 sm:gap-4'
            : 'w-full flex items-center justify-between gap-3.5 sm:gap-4 px-3.5 py-2'
        } text-xs sm:text-sm font-medium rounded-xl border transition-colors ${
          isActive
            ? 'bg-[#0d2b51] text-[#e7ecf6] border-[#1b4273] shadow-sm'
            : 'bg-[#101e31] text-slate-300 border-[#1c2d46] hover:border-slate-600 hover:text-white'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
          )}
          <span className={`truncate ${mobileIconOnly ? 'hidden sm:inline' : ''}`}>
            {selected.label}
          </span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${
          mobileIconOnly ? 'hidden sm:block' : ''
        } ${isActive ? 'text-[#aac6dd]' : 'text-slate-400'} ${isOpen ? 'rotate-180' : ''}`} />
        {mobileIconOnly && isFiltered && (
          <span className="sm:hidden absolute top-1 right-1 w-2 h-2 rounded-full bg-cyan-400 ring-2 ring-[#0e1a2b]" />
        )}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          style={{ left: `${menuOffset}px` }}
          className="absolute top-full mt-1.5 w-48 max-w-[calc(100vw-1rem)] bg-[#0e1a2b] border border-[#1c2d46] rounded-xl shadow-xl shadow-black/50 z-[60] overflow-hidden py-1 max-h-64 overflow-y-auto custom-scrollbar"
        >
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

export const MultiFilterSelect = memo(function MultiFilterSelect({
  values,
  onChange,
  label,
  children,
  className = '',
  icon: Icon,
  mobileIconOnly = false,
  title,
  dropdownAlign
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuOffset, setMenuOffset] = useState(0);
  const ref = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setMenuOffset(0);
      return;
    }

    const adjustPosition = () => {
      if (!ref.current || !menuRef.current) return;
      const triggerRect = ref.current.getBoundingClientRect();
      const menuRect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const margin = 8;

      let offset = 0;
      if (dropdownAlign === 'right') {
        offset = triggerRect.width - menuRect.width;
      }

      const computedLeft = triggerRect.left + offset;
      const computedRight = computedLeft + menuRect.width;

      if (computedRight > viewportWidth - margin) {
        offset -= (computedRight - (viewportWidth - margin));
      }
      if (triggerRect.left + offset < margin) {
        offset = margin - triggerRect.left;
      }

      setMenuOffset(offset);
    };

    adjustPosition();
    const frame = requestAnimationFrame(adjustPosition);
    window.addEventListener('resize', adjustPosition);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', adjustPosition);
    };
  }, [isOpen, dropdownAlign]);

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
        title={title || `${label}${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
        aria-label={title || `${label}${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
        className={`relative ${
          mobileIconOnly
            ? 'w-9 h-9 sm:w-auto sm:h-auto p-0 sm:px-3.5 sm:py-2 flex items-center justify-center sm:justify-between gap-1.5 sm:gap-4'
            : 'w-full flex items-center justify-between gap-3.5 sm:gap-4 px-3.5 py-2'
        } text-xs sm:text-sm font-medium rounded-xl border transition-colors ${
          isMultiActive
            ? 'bg-[#0d2b51] text-[#e7ecf6] border-[#1b4273] shadow-sm'
            : 'bg-[#101e31] text-slate-300 border-[#1c2d46] hover:border-slate-600 hover:text-white'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <Icon className={`w-4 h-4 shrink-0 transition-colors ${isMultiActive ? 'text-cyan-400' : 'text-slate-400'}`} />
          )}
          <span className={`truncate ${mobileIconOnly ? 'hidden sm:inline' : ''}`}>
            {label} {selectedCount > 0 && `(${selectedCount})`}
          </span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${
          mobileIconOnly ? 'hidden sm:block' : ''
        } ${isMultiActive ? 'text-[#aac6dd]' : 'text-slate-400'} ${isOpen ? 'rotate-180' : ''}`} />
        {mobileIconOnly && selectedCount > 0 && (
          <span className="sm:hidden absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-cyan-500 text-slate-950 text-[10px] font-bold flex items-center justify-center shadow-sm">
            {selectedCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          style={{ left: `${menuOffset}px` }}
          className="absolute top-full mt-1.5 w-56 max-w-[calc(100vw-1rem)] max-h-64 overflow-y-auto bg-[#0e1a2b] border border-[#1c2d46] rounded-xl shadow-xl shadow-black/50 z-[60] py-1.5 custom-scrollbar"
        >
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
