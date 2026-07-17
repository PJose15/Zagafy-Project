'use client';

import { useEffect } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared conduct for anything that overlays the page: locks body scroll while
 * open, closes on Escape, and traps Tab focus inside the given container so
 * keyboard users can't wander into the page behind the overlay.
 */
export function useModalHygiene(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  active: boolean = true,
) {
  useEffect(() => {
    if (!active) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = ref.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;
      if (e.shiftKey) {
        if (current === first || !root.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !root.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [ref, onClose, active]);
}
