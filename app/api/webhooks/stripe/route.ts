import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { stripe } from '@/lib/stripe';
import { db, isDatabaseConfigured } from '@/db/client';
import { users, stripeEvents } from '@/db/schema';
import { isPlanId } from '@/lib/billing';
import { reconcileSubscriptionPlan } from '@/lib/billing-reconciliation';
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

  if (!HANDLED_EVENTS.has(event.type)) {
    return ok({ ignored: event.type }, { requestId });
  }

  // The claim and entitlement update commit together. An exception or process
  // crash rolls both back; a duplicate waits for the transaction before deciding
  // whether the original event actually completed.
  try {
    const result = await db().transaction(async tx => {
      const claimed = await tx.insert(stripeEvents)
        .values({ id: event.id, type: event.type })
        .onConflictDoNothing()
        .returning({ id: stripeEvents.id });
      if (claimed.length === 0) return { duplicate: true } as const;

      const object = event.data.object as Stripe.Checkout.Session | Stripe.Subscription | Stripe.Invoice;
      if (event.type === 'checkout.session.completed' &&
          ((object as Stripe.Checkout.Session).mode !== 'subscription' ||
           !(object as Stripe.Checkout.Session).subscription)) {
        return { ignored: true } as const;
      }
      const customer = object.customer;
      const customerId = typeof customer === 'string' ? customer : customer?.id;
      if (!customerId) throw new Error('Handled billing event has no customer');

      // Serialize reconciliation per customer, including provider reads. Different
      // event IDs for the same customer must not race to overwrite the new plan.
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`zagafy-billing:${customerId}`}, 0))`);
      const [user] = await tx.select({ id: users.id, plan: users.plan })
        .from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
      // Checkout links the customer before creating a session. A missing row can
      // indicate delayed account provisioning; retry rather than acknowledge a
      // billing update that was never applied. Event metadata cannot relink users.
      if (!user) throw new Error('Billing customer is not linked to a Zagafy user');

      const subscriptions = await stripe().subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
      if (subscriptions.has_more) throw new Error('Incomplete customer subscription list');
      const plan = reconcileSubscriptionPlan(subscriptions.data, isPlanId(user.plan) ? user.plan : 'free');
      const updated = await tx.update(users).set({ plan })
        .where(eq(users.id, user.id)).returning({ id: users.id });
      if (updated.length !== 1) throw new Error('Billing user disappeared during reconciliation');

      let notification: { template: EmailTemplate; data: Record<string, string> } | undefined;
      if (event.type === 'checkout.session.completed' && plan !== 'free') {
        notification = { template: 'subscription_confirmed', data: { plan } };
      } else if (event.type === 'customer.subscription.deleted' && plan === 'free') {
        notification = { template: 'subscription_canceled', data: {} };
      } else if (event.type === 'invoice.payment_failed') {
        notification = { template: 'payment_failed', data: {} };
      }
      return { customerId, notification, plan } as const;
    });

    if ('duplicate' in result) return ok({ skipped: 'duplicate' }, { requestId });
    if ('ignored' in result) return ok({ ignored: event.type }, { requestId });
    log.info('billing reconciled', { eventId: event.id, customerId: result.customerId, plan: result.plan });
    // Notifications remain best-effort after commit. A mail outage cannot roll
    // back the entitlement or repeat payment processing. Durable mail delivery
    // requires an outbox; it is not guaranteed by the webhook event guard.
    if (result.notification) {
      await notifyCustomer(result.customerId, result.notification.template, result.notification.data, log);
    }
    return ok({ processed: event.type }, { requestId });
  } catch (e) {
    log.error('Webhook reconciliation failed; event transaction rolled back', e);
    return err('internal_error', 'Webhook processing failed; retry required', 503, undefined, { requestId });
  }
}
