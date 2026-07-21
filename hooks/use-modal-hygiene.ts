'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface StackEntry {
  ref: React.RefObject<HTMLElement | null>;
  close: () => void;
  /** Element focused when this overlay activated — focus returns here on close. */
  opener: HTMLElement | null;
}

// Module-level overlay stack: stacked overlays (e.g. FindReplaceDialog →
// Confirm, or the Ctrl+K catalog over a modal) each register an entry in
// mount order. Only the TOP entry handles Escape and the Tab trap, so one
// Escape closes one layer and nested traps never fight. Body scroll is
// locked once when the stack becomes non-empty and restored when it empties,
// so unmount order can't restore overflow out of sequence.
const stack: StackEntry[] = [];
let savedBodyOverflow = '';

function handleKey(e: KeyboardEvent) {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') {
    top.close();
    return;
  }
  if (e.key !== 'Tab') return;
  const root = top.ref.current;
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
}

function pushEntry(entry: StackEntry) {
  if (stack.length === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
  }
  stack.push(entry);
}

function popEntry(entry: StackEntry) {
  const idx = stack.indexOf(entry);
  if (idx !== -1) stack.splice(idx, 1);
  if (stack.length === 0) {
    document.body.style.overflow = savedBodyOverflow;
    savedBodyOverflow = '';
    window.removeEventListener('keydown', handleKey);
  }
  // Return focus to whoever opened this overlay (if it still exists) so
  // keyboard users aren't dropped back at <body>. Deferred a tick so any
  // exit animation / re-render settles first; when several overlays unmount
  // together, cleanup order (inner before outer) means the outermost
  // opener's restore runs last and wins.
  const opener = entry.opener;
  if (opener && document.contains(opener)) {
    setTimeout(() => {
      if (document.contains(opener)) opener.focus();
    }, 0);
  }
}

/**
 * Shared conduct for anything that overlays the page: locks body scroll while
 * open, closes on Escape, traps Tab focus inside the given container, and
 * restores focus to the opener on close. Stack-aware — see notes above.
 */
export function useModalHygiene(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  active: boolean = true,
) {
  // Keep the latest onClose in a ref so a changing callback identity doesn't
  // re-register the entry (which would hoist it to the top of the stack).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    const entry: StackEntry = {
      ref,
      close: () => onCloseRef.current(),
      opener:
        document.activeElement instanceof HTMLElement ? document.activeElement : null,
    };
    pushEntry(entry);
    return () => popEntry(entry);
  }, [ref, active]);
}
