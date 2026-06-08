import Stripe from 'stripe';

/**
 * Phase 5.7 — Stripe client singleton.
 *
 * Follows the same lazy-init pattern as `db/client.ts`: importing this
 * module is always safe — only calling `stripe()` from code paths that
 * genuinely need Stripe will throw if the secret key is unset.
 */

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Add it to .env.local for billing features.',
    );
  }
  cached = new Stripe(key);
  return cached;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
