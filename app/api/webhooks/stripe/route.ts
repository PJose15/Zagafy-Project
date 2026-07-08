import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { stripe } from '@/lib/stripe';
import { db, isDatabaseConfigured } from '@/db/client';
import { users, stripeEvents } from '@/db/schema';
import { isPlanId, type PlanId } from '@/lib/billing';
import { sendEmail, type EmailTemplate } from '@/lib/email';
import type Stripe from 'stripe';

export const runtime = 'nodejs';

/**
 * POST /api/webhooks/stripe
 *
 * Public route — verification is via Stripe webhook signature, not session
 * auth. Handles the subscription lifecycle:
 *
 * - checkout.session.completed → link customer + upgrade plan + confirmation email
 * - customer.subscription.updated → adjust plan on up/downgrade
 * - customer.subscription.deleted → revert to free + cancellation email
 * - invoice.payment_failed → log + payment-failed email
 *
 * All emails are best-effort (Resend no-ops when unconfigured; never throws), so
 * a mail failure can never fail the webhook.
 */

const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);

/**
 * Resolve a plan from subscription metadata or the Stripe price lookup.
 * Metadata is the primary source; price-based lookup is the fallback.
 */
function planFromMetadata(metadata: Stripe.Metadata | null): PlanId | null {
  const raw = metadata?.plan;
  return raw && isPlanId(raw) ? raw : null;
}

async function planFromSubscription(subscription: Stripe.Subscription): Promise<PlanId> {
  // Check subscription metadata first
  const fromMeta = planFromMetadata(subscription.metadata);
  if (fromMeta) return fromMeta;

  // Fallback: infer from price amount (monthly cents)
  const item = subscription.items.data[0];
  if (!item?.price?.unit_amount) return 'free';

  const monthlyCents = item.price.recurring?.interval === 'year'
    ? Math.round((item.price.unit_amount ?? 0) / 12)
    : (item.price.unit_amount ?? 0);

  if (monthlyCents >= 4900) return 'studio';
  if (monthlyCents >= 2400) return 'author';
  if (monthlyCents >= 1200) return 'writer';
  return 'free';
}

async function updateUserPlan(
  customerId: string,
  plan: PlanId,
  log: ReturnType<typeof createRouteLogger>,
): Promise<void> {
  const result = await db()
    .update(users)
    .set({ plan })
    .where(eq(users.stripeCustomerId, customerId))
    .returning({ id: users.id });

  if (result.length === 0) {
    log.warn('No user found for Stripe customer', { customerId, plan });
  } else {
    log.info('user plan updated', { userId: result[0].id, plan, customerId });
  }
}

/**
 * Send a best-effort transactional email to the user behind a Stripe customer.
 * Looks the user up by stripeCustomerId; no-ops (with a warning) when the user
 * or their email can't be resolved. Never throws — a mail failure must not fail
 * the webhook (Stripe would otherwise retry a fully-processed event).
 */
async function notifyCustomer(
  customerId: string,
  template: EmailTemplate,
  extra: Record<string, string>,
  log: ReturnType<typeof createRouteLogger>,
): Promise<void> {
  try {
    const [contact] = await db()
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.stripeCustomerId, customerId))
      .limit(1);

    if (!contact?.email) {
      log.warn('no user email for notification', { customerId, template });
      return;
    }

    const data: Record<string, string> = { ...extra };
    if (contact.name) data.name = contact.name;
    const appUrl = process.env.APP_URL;
    if (appUrl) data.appUrl = appUrl;

    await sendEmail({ to: contact.email, template, data });
  } catch (e) {
    log.warn('notification email failed', { customerId, template, err: String(e) });
  }
}

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/webhooks/stripe', requestId });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    log.error('STRIPE_WEBHOOK_SECRET not configured');
    return err('internal_error', 'Webhook not configured', 500, undefined, { requestId });
  }

  if (!isDatabaseConfigured()) {
    log.error('DATABASE_URL not configured');
    return err('internal_error', 'Database not configured', 500, undefined, { requestId });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return err('unauthorized', 'Missing stripe-signature header', 401, undefined, { requestId });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (verifyErr) {
    log.warn('Stripe signature verification failed', { err: String(verifyErr) });
    return err('unauthorized', 'Invalid webhook signature', 401, undefined, { requestId });
  }

  // Idempotency: skip events we've already processed
  if (HANDLED_EVENTS.has(event.type)) {
    try {
      const [existing] = await db()
        .select({ id: stripeEvents.id })
        .from(stripeEvents)
        .where(eq(stripeEvents.id, event.id))
        .limit(1);

      if (existing) {
        log.info('duplicate event skipped', { eventId: event.id, type: event.type });
        return ok({ skipped: 'duplicate' }, { requestId });
      }
    } catch (dbErr) {
      log.error('Idempotency check failed', dbErr);
      // Continue processing — better to double-process than drop
    }
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription' || !session.customer || !session.subscription) {
          log.info('non-subscription checkout ignored', { sessionId: session.id });
          break;
        }
        const customerId = typeof session.customer === 'string'
          ? session.customer
          : session.customer.id;

        const plan = planFromMetadata(session.metadata) ?? 'writer';

        // Link stripeCustomerId + set plan via userId from metadata
        const userId = session.metadata?.userId;
        if (userId) {
          await db()
            .update(users)
            .set({ stripeCustomerId: customerId, plan })
            .where(eq(users.id, userId));
          log.info('checkout completed — user linked', { userId, customerId, plan });
        } else {
          // Fallback: update by customer ID (already linked via checkout route)
          await updateUserPlan(customerId, plan, log);
        }

        // Confirmation email (only here — renewals/plan changes on
        // customer.subscription.updated stay silent to avoid duplicate mail).
        await notifyCustomer(customerId, 'subscription_confirmed', { plan }, log);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id;

        const status = subscription.status;
        if (status === 'active' || status === 'trialing') {
          const plan = await planFromSubscription(subscription);
          await updateUserPlan(customerId, plan, log);
        } else if (status === 'past_due' || status === 'unpaid') {
          log.warn('subscription past due', { customerId, status });
          // Keep current plan during grace period — downgrade happens on delete
        } else {
          log.info('subscription status change', { customerId, status });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id;
        await updateUserPlan(customerId, 'free', log);
        log.info('subscription deleted — downgraded to free', { customerId });
        await notifyCustomer(customerId, 'subscription_canceled', {}, log);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string'
          ? invoice.customer
          : invoice.customer?.id;
        log.warn('invoice payment failed', {
          customerId,
          invoiceId: invoice.id,
          attemptCount: invoice.attempt_count,
        });
        if (customerId) {
          await notifyCustomer(customerId, 'payment_failed', {}, log);
        }
        break;
      }

      default:
        log.info('ignoring unhandled event type', { type: event.type });
        return ok({ ignored: event.type }, { requestId });
    }

    // Record processed event for idempotency
    if (HANDLED_EVENTS.has(event.type)) {
      try {
        await db()
          .insert(stripeEvents)
          .values({ id: event.id, type: event.type })
          .onConflictDoNothing();
      } catch (dbErr) {
        log.warn('Failed to record event for idempotency', { err: String(dbErr) });
      }
    }

    return ok({ processed: event.type }, { requestId });
  } catch (e) {
    log.error('Webhook processing failed', e);
    return err('internal_error', 'Webhook processing failed', 500, undefined, { requestId });
  }
}
