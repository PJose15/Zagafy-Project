import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db } from '@/db/client';
import { checkoutAttempts, users } from '@/db/schema';

type Choice = { priceId: string; plan: string; interval: string; appUrl: string };
const ongoing = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']);
const replayWindow = 23 * 60 * 60 * 1000;
export class CheckoutUserMissing extends Error {}

/** Reserve immutable provider parameters before any side effect. The second
 * transaction serializes provider reconciliation per user. A provider success
 * followed by DB failure is retried with the same persisted idempotency key.
 * Unknown outcomes beyond Stripe's retention window require reconciliation.
 */
export async function checkoutUrl(userId: string, choice: Choice, provider: Stripe): Promise<string> {
  const database = db();
  async function lock(tx: Pick<ReturnType<typeof db>, 'execute'>) {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'zagafy-checkout:' + userId}, 0))`);
  }
  await database.transaction(async tx => {
    await lock(tx);
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new CheckoutUserMissing('User not found');
    const [attempt] = await tx.select().from(checkoutAttempts).where(eq(checkoutAttempts.userId, userId)).limit(1);
    if (!attempt) await tx.insert(checkoutAttempts).values({
      userId, id: randomUUID(), email: user.email, customerId: user.stripeCustomerId, ...choice,
    });
  });
  // No other checkout request may rotate/expire this user's attempt while
  // provider calls are in progress. Other users have independent lock keys.
  return database.transaction(async tx => {
    await lock(tx);
    let [attempt] = await tx.select().from(checkoutAttempts).where(eq(checkoutAttempts.userId, userId)).limit(1);
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!attempt || !user) throw new CheckoutUserMissing('User not found');
    const staleUnknown = () => !attempt.sessionId && Date.now() - attempt.createdAt.getTime() > replayWindow;
    let customerId = user.stripeCustomerId ?? attempt.customerId;
    if (!customerId) {
      if (staleUnknown()) throw new Error('Unresolved checkout customer requires provider reconciliation');
      const customer = await provider.customers.create({ email: attempt.email, metadata: { userId } },
        { idempotencyKey: `zagafy-customer:${attempt.id}` });
      customerId = customer.id;
      await tx.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, userId));
    }
    if (attempt.customerId && attempt.customerId !== customerId) throw new Error('Checkout customer binding changed');
    await tx.update(checkoutAttempts).set({ customerId }).where(eq(checkoutAttempts.userId, userId));
    const portal = async () => (await provider.billingPortal.sessions.create({ customer: customerId, return_url: `${choice.appUrl}/settings` })).url;
    const subscriptions = await provider.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
    if (subscriptions.has_more) throw new Error('Subscription lookup is incomplete');
    if (subscriptions.data.some(s => ongoing.has(s.status))) return portal();

    let session: Stripe.Checkout.Session | undefined;
    if (attempt.sessionId) session = await provider.checkout.sessions.retrieve(attempt.sessionId);
    else {
      // Reconcile legacy open sessions and responses lost before DB commit.
      const open = await provider.checkout.sessions.list({ customer: customerId, status: 'open', limit: 100 });
      if (open.has_more) throw new Error('Checkout lookup is incomplete');
      for (const candidate of open.data) {
        if (candidate.mode !== 'subscription') continue;
        if (candidate.metadata?.userId !== userId) throw new Error('Unrecognized open checkout requires reconciliation');
        if (candidate.metadata.attemptId === attempt.id) session = candidate;
        else {
          const expired = await provider.checkout.sessions.expire(candidate.id);
          if (expired.status !== 'expired') throw new Error('Legacy checkout expiration was not confirmed');
        }
      }
      if (session) {
        attempt = { ...attempt, sessionId: session.id };
        await tx.update(checkoutAttempts).set({ sessionId: session.id }).where(eq(checkoutAttempts.userId, userId));
      }
    }
    const matches = attempt.priceId === choice.priceId && attempt.plan === choice.plan && attempt.interval === choice.interval;
    if (session?.status === 'complete') return portal();
    if (session?.status === 'open' && matches && session.url) return session.url;
    if (session?.status === 'open') {
      const expired = await provider.checkout.sessions.expire(session.id);
      if (expired.status !== 'expired') throw new Error('Checkout expiration was not confirmed');
    }
    if (session && session.status !== 'expired' && session.status !== 'open') throw new Error('Unknown checkout state');
    if (!session && staleUnknown()) throw new Error('Unresolved checkout requires provider reconciliation');
    // Reconcile an unknown original outcome before rotating to a new choice.
    // Always create with the immutable original parameters first.
    if (!session) {
      const created = await provider.checkout.sessions.create({
        customer: customerId, mode: 'subscription', line_items: [{ price: attempt.priceId, quantity: 1 }],
        success_url: `${attempt.appUrl}/settings?billing=success`, cancel_url: `${attempt.appUrl}/settings?billing=cancelled`,
        subscription_data: { metadata: { userId, plan: attempt.plan } },
        metadata: { userId, plan: attempt.plan, attemptId: attempt.id },
      }, { idempotencyKey: `zagafy-checkout:${attempt.id}` });
      await tx.update(checkoutAttempts).set({ sessionId: created.id }).where(eq(checkoutAttempts.userId, userId));
      session = await provider.checkout.sessions.retrieve(created.id);
      if (session.status === 'complete') return portal();
      if (session.status === 'open' && matches && session.url) return session.url;
      if (session.status === 'open') {
        const expired = await provider.checkout.sessions.expire(session.id);
        if (expired.status !== 'expired') throw new Error('Checkout expiration was not confirmed');
      } else if (session.status !== 'expired') throw new Error('Unknown checkout state');
    }
    // Persist the next reservation in this transaction, then create on a later
    // request: never expose a new key to Stripe before its DB commit.
    await tx.update(checkoutAttempts).set({ id: randomUUID(), ...choice, email: user.email, customerId,
      sessionId: null, createdAt: new Date() }).where(eq(checkoutAttempts.userId, userId));
    return '';
  });
}
