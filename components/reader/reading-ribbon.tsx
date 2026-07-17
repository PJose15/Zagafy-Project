'use client';

import { useEffect, useState } from 'react';

/**
 * M22 — reading ribbon: a thin wax-red ribbon pinned to the top of the
 * reader that lengthens as you read, the digital cousin of the ribbon
 * bookmark. Tracks the app shell's scroll container (#main-content),
 * falling back to the window outside the shell.
 */
export function ReadingRibbon() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = document.getElementById('main-content');
    const target: HTMLElement | Window = el ?? window;
    const measure = () => {
      const scrollTop = el ? el.scrollTop : window.scrollY;
      const max = el
        ? el.scrollHeight - el.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(scrollTop / max, 1) : 0);
    };
    // Initial position lands on the next frame (not synchronously in the
    // effect) so a reader restored mid-scroll starts with the right length.
    const raf = requestAnimationFrame(measure);
    target.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      target.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <div aria-hidden="true" className="sticky top-0 z-40 h-0 -mt-px">
      <div
        className="h-[3px] origin-left rounded-r-full bg-gradient-to-r from-wax-700 via-wax-600 to-wax-500 shadow-[0_1px_2px_rgba(44,30,15,0.3)] transition-transform duration-150 ease-out"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
