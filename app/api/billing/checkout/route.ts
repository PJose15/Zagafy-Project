import { NextRequest } from 'next/server';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { requireCloudUser, isAuthError } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { stripe, isStripeConfigured } from '@/lib/stripe';
import { isDatabaseConfigured } from '@/db/client';
import { checkoutUrl, CheckoutUserMissing } from '@/lib/billing/checkout-attempt';
import { getStripePriceId, resolveAppUrl, type PlanId } from '@/lib/billing';

export const runtime = 'nodejs';

const PAID_PLANS = new Set<string>(['writer', 'author', 'studio']);

/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout session for the requested plan + interval.
 * Returns `{ url }` — the client redirects the browser there.
 *
 * Body: { plan: 'writer' | 'author' | 'studio', interval?: 'monthly' | 'yearly' }
 */
export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/billing/checkout', requestId });

  const auth = await requireCloudUser();
  if (isAuthError(auth)) return auth;

  const limited = await rateLimit(req, { maxRequests: 10, windowMs: 60_000 });
  if (limited) return limited;

  if (!isStripeConfigured()) {
    log.error('STRIPE_SECRET_KEY not configured');
    return err('internal_error', 'Billing not configured', 500, undefined, { requestId });
  }

  if (!isDatabaseConfigured()) {
    log.error('DATABASE_URL not configured');
    return err('internal_error', 'Database not configured', 500, undefined, { requestId });
  }

  let body: { plan?: unknown; interval?: unknown };
  try {
    body = await req.json();
  } catch {
    return err('validation_failed', 'Invalid JSON body', 400, undefined, { requestId });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('validation_failed', 'Body must be an object', 400, undefined, { requestId });
  }
  const { plan, interval = 'monthly' } = body;

  if (typeof plan !== 'string' || !PAID_PLANS.has(plan)) {
    return err('validation_failed', 'plan must be writer, author, or studio', 400, undefined, { requestId });
  }

  if (interval !== 'monthly' && interval !== 'yearly') {
    return err('validation_failed', 'interval must be monthly or yearly', 400, undefined, { requestId });
  }

  const priceId = getStripePriceId(plan as Exclude<PlanId, 'free'>, interval);
  if (!priceId) {
    log.error('Stripe price ID not configured', { plan, interval });
    return err('internal_error', `Price not configured for ${plan} ${interval}`, 500, undefined, { requestId });
  }

  try {
    const appUrl = resolveAppUrl();
    if (!appUrl) return err('internal_error', 'Billing not configured', 500, undefined, { requestId });
    const choice = { priceId, plan, interval, appUrl };
    // A changed/expired choice commits a new reservation before contacting
    // Stripe. Bound retries also handle competing requests choosing plans.
    for (let retry = 0; retry < 3; retry++) {
      const url = await checkoutUrl(auth.userId, choice, stripe());
      if (url) return ok({ url }, { requestId });
    }
    throw new Error('Checkout changed concurrently; retry');
  } catch (e) {
    if (e instanceof CheckoutUserMissing) return err('not_found', 'User not found', 404, undefined, { requestId });
    log.error('Checkout session creation failed', e);
    return err('internal_error', 'Failed to create checkout session', 500, undefined, { requestId });
  }
}
