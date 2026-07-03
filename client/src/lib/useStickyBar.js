import { useState, useEffect, useRef } from 'react';

/**
 * Returns a ref to attach to the header element, and a boolean
 * indicating whether the sticky bar should be visible.
 */
export function useStickyBar() {
  const headerRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { headerRef, stickyVisible: visible };
}
