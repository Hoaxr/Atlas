import { useEffect, useRef, useCallback } from 'react';

/**
 * Calls handler when a click occurs outside the referenced element.
 * Pass `enabled` to conditionally activate the listener.
 */
export function useOutsideClick(handler, enabled = true) {
  const ref = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const listener = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        handler(e);
      }
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [handler, enabled]);

  return ref;
}
