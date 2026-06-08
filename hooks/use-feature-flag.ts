'use client';

import { useSyncExternalStore } from 'react';
import { getFeatureFlag, FLAG_DEFAULTS, type FlagKey } from '@/lib/flags';

/**
 * Phase 5.9 — client-side feature flag hook.
 *
 * Reads the flag value from posthog-js. Falls back to the default when
 * PostHog is not loaded. Re-evaluates when PostHog flags are refreshed.
 */

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  // posthog-js emits events when flags are loaded/updated
  try {
    const posthog = require('posthog-js').default;
    if (posthog.__loaded && posthog.onFeatureFlags) {
      const unsub = posthog.onFeatureFlags(callback);
      // onFeatureFlags returns an unsubscribe function in newer versions
      if (typeof unsub === 'function') return unsub;
    }
  } catch {
    // PostHog not available
  }
  return () => {};
}

export function useFeatureFlag(flag: FlagKey): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getFeatureFlag(flag),
    () => FLAG_DEFAULTS[flag],
  );
}
