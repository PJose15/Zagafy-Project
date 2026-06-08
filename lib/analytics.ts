/**
 * Phase 5.8 — PostHog analytics helpers.
 *
 * Client-side: thin wrappers around `posthog-js` that respect opt-out
 * and Do-Not-Track. The PostHogProvider component handles initialization.
 *
 * Server-side: `trackServerEvent()` sends events via `posthog-node` for
 * high-signal backend actions (subscribe, cancel, ai_call_completed, etc.).
 *
 * Privacy rules:
 * - Manuscript content is NEVER sent as an event property.
 * - Session recording masks all text (`maskAllText: true`).
 * - Users can opt out via settings; opt-out is persisted in localStorage.
 * - Do-Not-Track header is respected.
 */

// ─── Consent / opt-out (client) ──────────────────────────────────

const CONSENT_KEY = 'zagafy_analytics_consent';

export type ConsentState = 'granted' | 'denied' | 'pending';

export function readConsent(): ConsentState {
  if (typeof window === 'undefined') return 'pending';
  const stored = localStorage.getItem(CONSENT_KEY);
  if (stored === 'granted' || stored === 'denied') return stored;
  return 'pending';
}

export function writeConsent(state: 'granted' | 'denied'): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CONSENT_KEY, state);
}

/** True when the browser sends DNT:1 or GPC:1 headers. */
export function isDoNotTrack(): boolean {
  if (typeof navigator === 'undefined') return false;
  // globalPrivacyControl is defined on Navigator when GPC is active
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return navigator.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

/**
 * Whether analytics should be active for this user right now.
 * - DNT/GPC → always off
 * - Consent denied → off
 * - Consent pending → off (GDPR-safe default)
 */
export function isAnalyticsEnabled(): boolean {
  if (isDoNotTrack()) return false;
  return readConsent() === 'granted';
}

// ─── Client event helpers ────────────────────────────────────────

export type AnalyticsEvent =
  | 'signup'
  | 'subscribe'
  | 'cancel'
  | 'export'
  | 'import'
  | 'ai_call_completed'
  | 'story_created'
  | 'chapter_created'
  | 'snapshot_created'
  | 'session_started'
  | 'session_ended';

/**
 * Capture a client-side event. No-ops when analytics are disabled or
 * PostHog hasn't loaded yet.
 */
export function trackEvent(
  event: AnalyticsEvent,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  if (!isAnalyticsEnabled()) return;
  // Lazy import — posthog-js is only loaded when consent is granted
  try {
    const posthog = require('posthog-js').default; // dynamic require — client-only
    if (posthog.__loaded) {
      posthog.capture(event, properties);
    }
  } catch {
    // PostHog not available — silent no-op
  }
}

/**
 * Identify the user for PostHog. Called after sign-in.
 */
export function identifyUser(
  userId: string,
  traits?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  if (!isAnalyticsEnabled()) return;
  try {
    const posthog = require('posthog-js').default; // dynamic require — client-only
    if (posthog.__loaded) {
      posthog.identify(userId, traits);
    }
  } catch {
    // silent
  }
}

/**
 * Reset PostHog identity. Called on sign-out.
 */
export function resetAnalytics(): void {
  if (typeof window === 'undefined') return;
  try {
    const posthog = require('posthog-js').default; // dynamic require — client-only
    if (posthog.__loaded) {
      posthog.reset();
    }
  } catch {
    // silent
  }
}

// ─── Server-side events ──────────────────────────────────────────
// Server-side tracking lives in lib/analytics-server.ts (separate file)
// because posthog-node uses node:readline which webpack cannot bundle
// for the client. Import trackServerEvent from there in API routes.
