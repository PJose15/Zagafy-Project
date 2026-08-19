'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessibility helper for modal/overlay dialogs. While `active`:
 *  - moves focus into the dialog on open,
 *  - traps Tab / Shift+Tab within it (so focus can't reach the obscured page),
 *  - closes it on Escape (unless disabled), and
 *  - restores focus to the previously-focused element on close.
 *
 * Attach the returned ref to the dialog's content container.
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  onClose: () => void,
  options?: { closeOnEscape?: boolean }
) {
  const containerRef = useRef<T | null>(null);
  const closeOnEscape = options?.closeOnEscape ?? true;
  // Keep the latest onClose without re-running the trap effect (callers often
  // pass an inline function). Updated in an effect — React 19 forbids ref writes
  // during render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = containerRef.current;

    const focusables = (): HTMLElement[] =>
      container
        ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
            el => el.offsetParent !== null || el === document.activeElement
          )
        : [];

    // Move focus into the dialog. Defer a tick so animated content is mounted.
    const focusTimer = setTimeout(() => {
      const items = focusables();
      if (items.length > 0) items[0].focus();
      else container?.focus();
    }, 20);

    const handleKey = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !container) return;

      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement;

      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey, true);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKey, true);
      // Restore focus to where it was before the dialog opened.
      previouslyFocused?.focus?.();
    };
  }, [active, closeOnEscape]);

  return containerRef;
}
