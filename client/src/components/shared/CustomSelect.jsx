import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';
import clsx from 'clsx';

export default function CustomSelect({
  value,
  onChange,
  options = [],
  name = '',
  className = '',
  theme = 'cyan',
  placeholder = 'Select...',
  disabled = false,
  searchable = undefined
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState({});
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedTrigger = containerRef.current && containerRef.current.contains(event.target);
      const clickedMenu = menuRef.current && menuRef.current.contains(event.target);
      if (!clickedTrigger && !clickedMenu) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const updatePos = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const estimatedHeight = 280;

      const openUpwards = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

      setMenuStyle({
        position: 'fixed',
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        ...(openUpwards
          ? { bottom: `${window.innerHeight - rect.top + 4}px`, top: 'auto' }
          : { top: `${rect.bottom + 4}px`, bottom: 'auto' }),
        zIndex: 9999
      });
    };

    updatePos();
    window.addEventListener('scroll', updatePos, { passive: true, capture: true });
    window.addEventListener('resize', updatePos);

    return () => {
      window.removeEventListener('scroll', updatePos);
      window.removeEventListener('resize', updatePos);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const normalizedOptions = useMemo(() => {
    return (options || []).map(opt => {
      if (typeof opt === 'string' || typeof opt === 'number') {
        return { label: String(opt), value: opt };
      }
      return opt;
    });
  }, [options]);

  const selectedOption = normalizedOptions.find(opt => String(opt.value) === String(value ?? '')) 
    || (value === '' ? normalizedOptions.find(opt => opt.value === '') : null)
    || (placeholder ? { label: placeholder, value: '' } : normalizedOptions[0]) 
    || { label: 'Select...', value: '' };

  const isSearchable = searchable ?? (normalizedOptions.length > 10);

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return normalizedOptions;
    const query = searchQuery.toLowerCase();
    return normalizedOptions.filter(opt => 
      String(opt.label || '').toLowerCase().includes(query) ||
      String(opt.value || '').toLowerCase().includes(query) ||
      (opt.group && String(opt.group).toLowerCase().includes(query))
    );
  }, [normalizedOptions, searchQuery]);

  // Check if any options have group headers
  const hasGroups = useMemo(() => {
    return filteredOptions.some(opt => Boolean(opt.group));
  }, [filteredOptions]);

  const groupedOptions = useMemo(() => {
    if (!hasGroups) return null;
    const groups = {};
    const ungrouped = [];

    filteredOptions.forEach(opt => {
      if (opt.group) {
        if (!groups[opt.group]) groups[opt.group] = [];
        groups[opt.group].push(opt);
      } else {
        ungrouped.push(opt);
      }
    });

    return { groups, ungrouped };
  }, [filteredOptions, hasGroups]);

  const themes = {
    cyan: {
      buttonFocus: 'hover:border-slate-500 focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/30',
      buttonOpen: 'border-cyan-500/80 ring-1 ring-cyan-500/30 shadow-sm shadow-cyan-950/40',
      optionActive: 'bg-cyan-500/15 text-cyan-300 font-semibold',
      checkIcon: 'text-cyan-400'
    },
    emerald: {
      buttonFocus: 'hover:border-slate-500 focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30',
      buttonOpen: 'border-emerald-500/80 ring-1 ring-emerald-500/30 shadow-sm shadow-emerald-950/40',
      optionActive: 'bg-emerald-500/15 text-emerald-300 font-semibold',
      checkIcon: 'text-emerald-400'
    },
    purple: {
      buttonFocus: 'hover:border-slate-500 focus:border-purple-500/80 focus:ring-1 focus:ring-purple-500/30',
      buttonOpen: 'border-purple-500/80 ring-1 ring-purple-500/30 shadow-sm shadow-purple-950/40',
      optionActive: 'bg-purple-500/15 text-purple-300 font-semibold',
      checkIcon: 'text-purple-400'
    }
  };

  const currentTheme = themes[theme] || themes.cyan;

  const handleSelect = (option) => {
    if (disabled) return;
    if (typeof onChange === 'function') {
      onChange({
        target: {
          name,
          value: option.value
        }
      });
    }
    setIsOpen(false);
    setSearchQuery('');
  };

  const renderOptionItem = (option) => {
    const isSelected = String(value ?? '') === String(option.value);
    return (
      <button
        key={option.value}
        type="button"
        className={clsx(
          'w-full text-left px-3.5 py-2 text-xs sm:text-sm flex items-center justify-between transition-colors duration-100 rounded-lg mx-1 my-0.5',
          isSelected
            ? currentTheme.optionActive
            : 'text-slate-300 hover:bg-[#15253b] hover:text-white'
        )}
        style={{ width: 'calc(100% - 0.5rem)' }}
        onClick={() => handleSelect(option)}
      >
        <div className="flex flex-col min-w-0 pr-2">
          <span className="truncate">{option.label}</span>
          {option.description && (
            <span className="text-[11px] text-slate-400 truncate mt-0.5">{option.description}</span>
          )}
        </div>
        {isSelected && (
          <Check className={clsx('w-4 h-4 flex-shrink-0', currentTheme.checkIcon)} />
        )}
      </button>
    );
  };

  return (
    <div className={clsx('relative select-none', className)} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        className={clsx(
          'w-full bg-[#0c1624] border rounded-xl px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-200 flex items-center justify-between focus:outline-none transition-all duration-150',
          disabled
            ? 'opacity-50 cursor-not-allowed border-slate-800'
            : isOpen
              ? currentTheme.buttonOpen
              : clsx('border-[#1c2d46]', currentTheme.buttonFocus)
        )}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            if (isOpen) setSearchQuery('');
          }
        }}
      >
        <span className="truncate text-left">{selectedOption.label}</span>
        <ChevronDown
          className={clsx(
            'w-4 h-4 transition-transform duration-200 flex-shrink-0 ml-2.5',
            isOpen ? 'rotate-180 text-cyan-400' : 'text-slate-400'
          )}
        />
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="bg-[#0c1624] border border-[#1c2d46] rounded-xl shadow-2xl shadow-black/90 overflow-hidden py-1 select-none"
        >
          {isSearchable && (
            <div className="p-2 border-b border-[#1c2d46]/80 bg-[#08101a]">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search options..."
                  className="w-full bg-[#101e31] border border-[#1c2d46] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto custom-scrollbar py-0.5">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-xs text-slate-500 text-center">
                No matching options
              </div>
            ) : hasGroups && groupedOptions ? (
              <>
                {groupedOptions.ungrouped.map(opt => renderOptionItem(opt))}
                {Object.entries(groupedOptions.groups).map(([groupName, groupOpts]) => (
                  <div key={groupName} className="mb-1">
                    <div className="px-3 py-1 text-[10px] sm:text-[11px] font-bold tracking-wider text-slate-400 uppercase bg-[#08101a] sticky top-0">
                      {groupName}
                    </div>
                    {groupOpts.map(opt => renderOptionItem(opt))}
                  </div>
                ))}
              </>
            ) : (
              filteredOptions.map(opt => renderOptionItem(opt))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
