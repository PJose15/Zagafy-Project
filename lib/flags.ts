/**
 * Phase 5.9 — feature flags via PostHog.
 *
 * Server-side: `isFeatureEnabled()` checks PostHog via posthog-node.
 * Client-side: `useFeatureFlag()` hook reads from posthog-js.
 *
 * When PostHog is not configured, all flags fall back to their defaults.
 * This keeps the app functional without PostHog in embed/dev mode.
 */

/**
 * Registry of all feature flags with their default (off/on) values.
 * Add new flags here — the type system ensures callers use valid keys.
 */
export const FLAG_DEFAULTS = {
  'realtime-collaboration': false,
  'ai-long-term-memory': false,
  'language-tool-grammar': false,
  'pdf-export-v2': false,
} as const;

export type FlagKey = keyof typeof FLAG_DEFAULTS;

const VALID_FLAGS = new Set<string>(Object.keys(FLAG_DEFAULTS));

export function isFlagKey(value: unknown): value is FlagKey {
  return typeof value === 'string' && VALID_FLAGS.has(value);
}

/**
 * Server-side flag check via posthog-node.
 *
 * Returns the flag default when PostHog is not configured or the check
 * fails — feature flags should never break application flow.
 */
export async function isFeatureEnabled(
  flag: FlagKey,
  userId?: string,
): Promise<boolean> {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!apiKey) return FLAG_DEFAULTS[flag];

  try {
    const { PostHog } = await import('posthog-node');
    const client = new PostHog(apiKey, { host: host || 'https://us.i.posthog.com' });
    const enabled = await client.isFeatureEnabled(
      flag,
      userId || 'anonymous',
    );
    await client.shutdown();
    return enabled ?? FLAG_DEFAULTS[flag];
  } catch {
    return FLAG_DEFAULTS[flag];
  }
}

/**
 * Client-side flag check via posthog-js.
 *
 * Returns the flag default when PostHog is not loaded or the flag
 * hasn't been fetched yet.
 */
export function getFeatureFlag(flag: FlagKey): boolean {
  if (typeof window === 'undefined') return FLAG_DEFAULTS[flag];
  try {
    const posthog = require('posthog-js').default; // dynamic require — client-only
    if (posthog.__loaded) {
      const value = posthog.isFeatureEnabled(flag);
      return typeof value === 'boolean' ? value : FLAG_DEFAULTS[flag];
    }
  } catch {
    // PostHog not available
  }
  return FLAG_DEFAULTS[flag];
}
