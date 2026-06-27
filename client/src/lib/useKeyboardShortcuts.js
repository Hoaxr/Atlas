import { useEffect, useRef } from 'react';

/**
 * Register global keyboard shortcuts.
 *
 * @param {Record<string, () => void>} shortcuts  - Map of key to handler.
 *   Keys are matched case-insensitively. Support sequences like 'g m' (two-key chord).
 * @param {boolean} [enabled=true] - Set to false to temporarily disable.
 */
export default function useKeyboardShortcuts(shortcuts, enabled = true) {
  const sequenceRef = useRef('');
  const timerRef    = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    const isEditableTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    };

    const handle = (e) => {
      if (isEditableTarget(document.activeElement)) return;
      // Ignore modifier combos (Ctrl+S etc.) except plain Shift
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();

      // Clear pending sequence and start fresh on each key
      clearTimeout(timerRef.current);
      sequenceRef.current += (sequenceRef.current ? ' ' : '') + key;

      // Check longest-match first (sequence keys like 'g m')
      const seq = sequenceRef.current;
      if (shortcuts[seq]) {
        e.preventDefault();
        shortcuts[seq]();
        sequenceRef.current = '';
        return;
      }

      // If the partial sequence could still match something, wait for next key
      const couldMatch = Object.keys(shortcuts).some(k => k.startsWith(seq + ' '));
      if (couldMatch) {
        timerRef.current = setTimeout(() => { sequenceRef.current = ''; }, 1000);
        return;
      }

      // No match and no possible continuation — reset
      sequenceRef.current = '';
    };

    window.addEventListener('keydown', handle);
    return () => {
      window.removeEventListener('keydown', handle);
      clearTimeout(timerRef.current);
    };
  }, [shortcuts, enabled]);
}
