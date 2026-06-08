'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  readConsent,
  writeConsent,
  isDoNotTrack,
  type ConsentState,
} from '@/lib/analytics';

/**
 * Phase 5.8 — analytics consent preference hook.
 *
 * Follows the same `useSyncExternalStore` pattern as
 * `useSpellcheckPreference` to avoid setState-in-effect.
 */

const STORAGE_KEY = 'zagafy_analytics_consent';

// Same-tab emitter (storage events only fire cross-tab)
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

function getSnapshot(): ConsentState {
  return readConsent();
}

function getServerSnapshot(): ConsentState {
  return 'pending';
}

function getDntSnapshot(): boolean {
  return isDoNotTrack();
}

function getDntServerSnapshot(): boolean {
  return false;
}

function subscribeDnt(_callback: () => void): () => void {
  // DNT doesn't change at runtime — no subscription needed
  return () => {};
}

export function useAnalyticsConsent(): {
  consent: ConsentState;
  dnt: boolean;
  setConsent: (next: 'granted' | 'denied') => void;
} {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const dnt = useSyncExternalStore(subscribeDnt, getDntSnapshot, getDntServerSnapshot);

  const setConsent = useCallback((next: 'granted' | 'denied') => {
    writeConsent(next);
    notifySameTab();
  }, []);

  return { consent, dnt, setConsent };
}
