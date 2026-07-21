import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { requireCloudUser, isAuthError } from '@/lib/auth';
import { stripe, isStripeConfigured } from '@/lib/stripe';
import { db, isDatabaseConfigured } from '@/db/client';
import { users } from '@/db/schema';
import { resolveAppUrl } from '@/lib/billing';

export const runtime = 'nodejs';

/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Customer Portal session so the user can manage their
 * subscription, update payment methods, download invoices, or cancel.
 * Returns `{ url }` — the client redirects the browser there.
 */
export async function POST(_req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/billing/portal', requestId });

  const auth = await requireCloudUser();
  if (isAuthError(auth)) return auth;

  if (!isStripeConfigured()) {
    log.error('STRIPE_SECRET_KEY not configured');
    return err('internal_error', 'Billing not configured', 500, undefined, { requestId });
  }

  if (!isDatabaseConfigured()) {
    log.error('DATABASE_URL not configured');
    return err('internal_error', 'Database not configured', 500, undefined, { requestId });
  }

  try {
    const [user] = await db()
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!user) {
      return err('not_found', 'User not found', 404, undefined, { requestId });
    }

    if (!user.stripeCustomerId) {
      return err('validation_failed', 'No billing account found. Subscribe to a plan first.', 400, undefined, { requestId });
    }

    const appUrl = resolveAppUrl();
    if (!appUrl) {
      log.error('APP_URL / NEXT_PUBLIC_APP_URL not configured in production');
      return err('internal_error', 'Billing not configured', 500, undefined, { requestId });
    }

    const session = await stripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appUrl}/settings`,
    });

    log.info('portal session created', { userId: auth.userId });
    return ok({ url: session.url }, { requestId });
  } catch (e) {
    log.error('Portal session creation failed', e);
    return err('internal_error', 'Failed to create portal session', 500, undefined, { requestId });
  }
}
