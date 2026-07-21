import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { requireCloudUser, isAuthError } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { stripe, isStripeConfigured } from '@/lib/stripe';
import { db, isDatabaseConfigured } from '@/db/client';
import { users } from '@/db/schema';
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
    // Look up (or lazily create) the Stripe customer for this user
    const [user] = await db()
      .select({ stripeCustomerId: users.stripeCustomerId, email: users.email })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!user) {
      return err('not_found', 'User not found', 404, undefined, { requestId });
    }

    let customerId = user.stripeCustomerId;

    if (!customerId) {
      // Idempotency key pins concurrent creates for the same user to one
      // Stripe customer object (Stripe replays the original response).
      const customer = await stripe().customers.create(
        {
          email: user.email,
          metadata: { userId: auth.userId },
        },
        { idempotencyKey: `customer-create-${auth.userId}` },
      );
      // Re-check the user row: if a concurrent request already stored a
      // customer id, prefer it so the account keeps a single customer even
      // when the idempotency window has expired.
      const [fresh] = await db()
        .select({ stripeCustomerId: users.stripeCustomerId })
        .from(users)
        .where(eq(users.id, auth.userId))
        .limit(1);
      if (fresh?.stripeCustomerId) {
        customerId = fresh.stripeCustomerId;
      } else {
        customerId = customer.id;
        await db()
          .update(users)
          .set({ stripeCustomerId: customerId })
          .where(eq(users.id, auth.userId));
      }
    }

    const appUrl = resolveAppUrl();
    if (!appUrl) {
      log.error('APP_URL / NEXT_PUBLIC_APP_URL not configured in production');
      return err('internal_error', 'Billing not configured', 500, undefined, { requestId });
    }

    const session = await stripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/settings?billing=success`,
      cancel_url: `${appUrl}/settings?billing=cancelled`,
      subscription_data: {
        metadata: { userId: auth.userId, plan },
      },
      metadata: { userId: auth.userId, plan },
    });

    log.info('checkout session created', { userId: auth.userId, plan, interval, sessionId: session.id });
    return ok({ url: session.url }, { requestId });
  } catch (e) {
    log.error('Checkout session creation failed', e);
    return err('internal_error', 'Failed to create checkout session', 500, undefined, { requestId });
  }
}
