import 'server-only';
import type { AnalyticsEvent } from './analytics';

/**
 * Phase 5.8 — server-side PostHog event capture.
 *
 * Separated from lib/analytics.ts because posthog-node uses node:readline
 * which webpack cannot bundle for the client. This file is server-only.
 */
export async function trackServerEvent(
  userId: string,
  event: AnalyticsEvent,
  properties?: Record<string, unknown>,
): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!apiKey) return;

  try {
    const { PostHog } = await import('posthog-node');
    const client = new PostHog(apiKey, { host: host || 'https://us.i.posthog.com' });
    client.capture({ distinctId: userId, event, properties });
    await client.shutdown();
  } catch {
    // Analytics should never break application flow
  }
}
