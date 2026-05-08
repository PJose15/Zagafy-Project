'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Phase 4.5 / MP-07 v1 — native browser spellcheck preference.
 *
 * Stored in localStorage so it survives reloads. Defaults to enabled
 * (browsers spellcheck textareas by default; this just lets writers
 * silence the red squiggles when they're polishing intentional dialect).
 *
 * v2 (Phase 7) will swap the inline browser spellcheck for a richer
 * grammar layer (LanguageTool) — see docs/ROADMAP.md.
 */

const STORAGE_KEY = 'zagafy_spellcheck_enabled';

export function readSpellcheckPreference(): boolean {
  if (typeof window === 'undefined') return true;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return true;
  return raw === '1';
}

function writeSpellcheckPreference(value: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
}

// Same-tab subscribers — storage events only fire across tabs, so we keep
// a tiny in-process emitter for setEnabled() callers in the same window.
const sameTabListeners = new Set<() => void>();

function notifySameTab(): void {
  for (const cb of sameTabListeners) cb();
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener('storage', handler);
  sameTabListeners.add(callback);
  return () => {
    window.removeEventListener('storage', handler);
    sameTabListeners.delete(callback);
  };
}

function getSnapshot(): boolean {
  return readSpellcheckPreference();
}

function getServerSnapshot(): boolean {
  return true;
}

export function useSpellcheckPreference(): {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  toggle: () => void;
} {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setEnabled = useCallback((next: boolean) => {
    writeSpellcheckPreference(next);
    notifySameTab();
  }, []);

  const toggle = useCallback(() => {
    setEnabled(!readSpellcheckPreference());
  }, [setEnabled]);

  return { enabled, setEnabled, toggle };
}
