import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { X } from 'lucide-react';

const SIZE_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-3xl',
  '3xl': 'max-w-4xl',
  '4xl': 'max-w-5xl',
  full: 'max-w-full mx-4',
};

/**
 * Shared modal wrapper — handles createPortal, backdrop, Escape key,
 * click-outside-to-close, z-index, header/footer slots, and consistent styling.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {'sm'|'md'|'lg'|'xl'|'2xl'|'3xl'|'4xl'|'full'} [props.size='xl']
 * @param {string|React.ReactNode} [props.title] — renders header with close button
 * @param {React.ReactNode} [props.icon] — icon rendered inside the header
 * @param {React.ReactNode} [props.footer] — content for the footer bar
 * @param {boolean} [props.noPadding] — remove body padding for custom layouts
 * @param {boolean} [props.noScroll] — disable internal scroll for simple content
 * @param {boolean} [props.noHeader] — hide header entirely (overrides title/icon)
 * @param {boolean} [props.noBackdropBlur] — remove backdrop-blur for certain modals
 * @param {boolean} [props.noFloatingClose] — hide the floating close button when noHeader is true (e.g. when header has its own close)
 * @param {string} [props.backdropClass] — override backdrop background class
 * @param {string} [props.className] — additional classes on the panel
 * @param {React.ReactNode} props.children
 */
export default function ModalShell({
  open,
  onClose,
  size = 'xl',
  title,
  icon,
  footer,
  noPadding,
  noScroll,
  noHeader,
  noBackdropBlur,
  noFloatingClose,
  backdropClass = 'bg-black/70',
  className = '',
  children,
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const maxW = SIZE_MAP[size] || SIZE_MAP.xl;

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 ${backdropClass} ${noBackdropBlur ? '' : 'backdrop-blur-sm'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`relative bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full ${maxW} ${noScroll ? '' : 'max-h-[85vh] flex flex-col'} ${className}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        {!noHeader && (title || icon) && (
          <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {icon && <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 shrink-0">{icon}</div>}
              <h2 className="text-lg font-bold text-white truncate">{title}</h2>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-all shrink-0 ml-3"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Close button standalone (when no header and no custom close) */}
        {noHeader && !noFloatingClose && onClose && (
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800/80 transition-all"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className={`${noPadding ? '' : 'p-5'} ${noScroll ? '' : 'overflow-y-auto flex-1 min-h-0'}`}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-4 border-t border-white/5 flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
