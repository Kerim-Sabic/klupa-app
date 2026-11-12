import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Width of a container in CSS pixels. Charts draw at their real size instead of scaling
 * a fixed viewBox, so axis text stays legible on a phone. Falls back to `fallback`
 * where ResizeObserver is missing (tests, very old browsers).
 */
export function useElementWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0;
      if (measured > 0) setWidth(Math.round(measured));
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);
  return { ref, width };
}
