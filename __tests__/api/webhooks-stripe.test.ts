// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import type Stripe from 'stripe';
import { POST } from '@/app/api/webhooks/stripe/route';

const { constructEvent, listSubscriptions, sendEmail } = vi.hoisted(() => ({
  constructEvent: vi.fn(), listSubscriptions: vi.fn(), sendEmail: vi.fn(),
}));
vi.mock('@/lib/stripe', () => ({ stripe: () => ({
  webhooks: { constructEvent }, subscriptions: { list: listSubscriptions },
}) }));
vi.mock('@/lib/email', () => ({ sendEmail }));
let database: PgliteDatabase<typeof schema>;
vi.mock('@/db/client', () => ({ db: () => database, isDatabaseConfigured: () => true }));
let pg: PGlite;

function subscription(plan = 'writer', status = 'active') {
  return { id: `sub_${plan}`, status, customer: 'cus_abc', metadata: { plan: 'studio' },
    items: { data: [{ price: { id: `price_${plan}_monthly`, unit_amount: 1 } }], has_more: false },
  } as unknown as Stripe.Subscription;
}
function event(type = 'checkout.session.completed', object: Record<string, unknown> = {}, id = 'evt_test') {
  return { id, type, data: { object: {
    id: 'cs_test', mode: 'subscription', customer: 'cus_abc', subscription: 'sub_writer',
    metadata: { userId: 'user_wrong', plan: 'studio' }, ...object,
  } } } as unknown as Stripe.Event;
}
function request(signature = 'sig_test') {
  return new Request('http://localhost/api/webhooks/stripe', { method: 'POST',
    headers: { 'stripe-signature': signature }, body: '{}',
  }) as unknown as import('next/server').NextRequest;
}
async function storedPlan() {
  return (await pg.query<{ plan: string }>("SELECT plan FROM users WHERE id='user_abc'")).rows[0].plan;
}
async function claims() { return (await pg.query('SELECT id FROM stripe_events')).rows; }

describe('Stripe webhooks with real Postgres transactions and registered migrations', () => {
  beforeAll(async () => {
    pg = new PGlite(); database = drizzle(pg, { schema });
    await migrate(database, { migrationsFolder: 'db/migrations' });
  }, 30_000);
  afterAll(async () => { await pg.close(); });
  afterEach(() => { vi.unstubAllEnvs(); });
  beforeEach(async () => {
    await pg.exec('DROP TRIGGER IF EXISTS fail_billing_update ON users; TRUNCATE users CASCADE; TRUNCATE stripe_events;');
    await pg.exec("INSERT INTO users (id,email,name,plan,stripe_customer_id) VALUES ('user_abc','writer@example.com','Ada','writer','cus_abc');");
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
    for (const plan of ['WRITER', 'AUTHOR', 'STUDIO']) {
      for (const interval of ['MONTHLY', 'YEARLY']) vi.stubEnv(`STRIPE_PRICE_${plan}_${interval}`, `price_${plan.toLowerCase()}_${interval.toLowerCase()}`);
    }
    constructEvent.mockReset().mockReturnValue(event());
    listSubscriptions.mockReset().mockResolvedValue({ data: [subscription()], has_more: false });
    sendEmail.mockReset().mockResolvedValue(true);
  });

  it('creates the previously missing table and migration-only columns', async () => {
    const columns = (await pg.query<{ table_name: string; column_name: string }>("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'")).rows;
    for (const [table, column] of [['stripe_events', 'processed_at'], ['users', 'onboarding_stage'], ['stories', 'version'], ['comments', 'data']]) {
      expect(columns).toContainEqual({ table_name: table, column_name: column });
    }
  });
  it('refuses missing webhook configuration', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    expect((await POST(request())).status).toBe(500);
    expect(constructEvent).not.toHaveBeenCalled();
  });
  it('refuses an unsigned request', async () => {
    expect((await POST(request(''))).status).toBe(401);
    expect(await claims()).toEqual([]);
  });
  it('refuses an invalid signature', async () => {
    constructEvent.mockImplementation(() => { throw new Error('bad signature'); });
    expect((await POST(request())).status).toBe(401);
    expect(await claims()).toEqual([]);
  });
  it('ignores unhandled events without recording or reading Stripe', async () => {
    constructEvent.mockReturnValue(event('payment_intent.succeeded'));
    expect((await POST(request())).status).toBe(200);
    expect(await claims()).toEqual([]);
    expect(listSubscriptions).not.toHaveBeenCalled();
  });
  it('ignores non-subscription checkout without changing entitlement', async () => {
    constructEvent.mockReturnValue(event('checkout.session.completed', { mode: 'payment' }));
    expect((await POST(request())).status).toBe(200);
    expect(await storedPlan()).toBe('writer');
    expect(listSubscriptions).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('derives checkout access from current prices, ignoring stale metadata and amount', async () => {
    listSubscriptions.mockResolvedValue({ data: [subscription('author')], has_more: false });
    expect((await POST(request())).status).toBe(200);
    expect(await storedPlan()).toBe('author');
    expect(listSubscriptions).toHaveBeenCalledWith({ customer: 'cus_abc', status: 'all', limit: 100 });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ template: 'subscription_confirmed', data: expect.objectContaining({ plan: 'author' }) }));
  });
  it('handles configured annual prices regardless of discount or dollar amount', async () => {
    const sub = subscription('studio'); sub.items.data[0].price.id = 'price_studio_yearly';
    listSubscriptions.mockResolvedValue({ data: [sub], has_more: false });
    expect((await POST(request())).status).toBe(200);
    expect(await storedPlan()).toBe('studio');
  });
  it.each(['active', 'trialing'])('reconciles %s upgrades', async status => {
    constructEvent.mockReturnValue(event('customer.subscription.updated'));
    listSubscriptions.mockResolvedValue({ data: [subscription('author', status)], has_more: false });
    expect((await POST(request())).status).toBe(200);
    expect(await storedPlan()).toBe('author');
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('retains existing past-due grace without upgrading unpaid access', async () => {
    constructEvent.mockReturnValue(event('customer.subscription.updated'));
    listSubscriptions.mockResolvedValue({ data: [subscription('studio', 'past_due')], has_more: false });
    expect((await POST(request())).status).toBe(200);
    expect(await storedPlan()).toBe('writer');
  });
  it.each(['unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused'])('revokes access for %s subscriptions', async status => {
    constructEvent.mockReturnValue(event('customer.subscription.updated'));
    listSubscriptions.mockResolvedValue({ data: [subscription('writer', status)], has_more: false });
    expect((await POST(request())).status).toBe(200);
    expect(await storedPlan()).toBe('free');
  });
  it('does not grant access when checkout payment remains incomplete', async () => {
    await pg.exec("UPDATE users SET plan='free';");
    listSubscriptions.mockResolvedValue({ data: [subscription('studio', 'incomplete')], has_more: false });
    expect((await POST(request())).status).toBe(200);
    expect(await storedPlan()).toBe('free');
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('processes a cancellation and sends mail only after the transaction commits', async () => {
    constructEvent.mockReturnValue(event('customer.subscription.deleted'));
    listSubscriptions.mockResolvedValue({ data: [], has_more: false });
    sendEmail.mockImplementation(async () => {
      expect(await storedPlan()).toBe('free'); expect(await claims()).toHaveLength(1); return true;
    });
    expect((await POST(request())).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ template: 'subscription_canceled' }));
  });
  it('does not revoke a replacement subscription on delayed cancellation', async () => {
    constructEvent.mockReturnValue(event('customer.subscription.deleted', { status: 'canceled' }));
    listSubscriptions.mockResolvedValue({ data: [subscription('author'), subscription('writer', 'canceled')], has_more: false });
    expect((await POST(request())).status).toBe(200);
    expect(await storedPlan()).toBe('author');
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('does not replay stale upgrades over a newer downgrade', async () => {
    constructEvent.mockReturnValue(event('customer.subscription.updated', { status: 'active', metadata: { plan: 'studio' } }));
    listSubscriptions.mockResolvedValue({ data: [subscription('writer')], has_more: false });
    expect((await POST(request())).status).toBe(200);
    expect(await storedPlan()).toBe('writer');
  });
  it('deduplicates sequential and overlapping deliveries with a real unique constraint', async () => {
    const responses = await Promise.all([POST(request()), POST(request())]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    const bodies = await Promise.all(responses.map(r => r.json()));
    expect(bodies.filter(b => b.skipped === 'duplicate')).toHaveLength(1);
    expect(await claims()).toHaveLength(1);
    expect(listSubscriptions).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect((await (await POST(request())).json()).skipped).toBe('duplicate');
  });
  it('rolls back the claim on a provider outage and processes the same event on retry', async () => {
    listSubscriptions.mockRejectedValueOnce(new Error('provider timeout'));
    expect((await POST(request())).status).toBe(503);
    expect(await claims()).toEqual([]);
    expect(await storedPlan()).toBe('writer');
    expect(sendEmail).not.toHaveBeenCalled();
    expect((await POST(request())).status).toBe(200);
    expect(await claims()).toHaveLength(1);
  });
  it('rolls back the claim on a database update failure with no notification', async () => {
    await pg.exec(`CREATE OR REPLACE FUNCTION reject_billing_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected update failure'; END; $$;
      CREATE TRIGGER fail_billing_update BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION reject_billing_update();`);
    listSubscriptions.mockResolvedValue({ data: [subscription('author')], has_more: false });
    expect((await POST(request())).status).toBe(503);
    expect(await claims()).toEqual([]);
    expect(await storedPlan()).toBe('writer');
    expect(sendEmail).not.toHaveBeenCalled();
    await pg.exec('DROP TRIGGER fail_billing_update ON users;');
    expect((await POST(request())).status).toBe(200);
    expect(await storedPlan()).toBe('author');
  });
  it('refuses unconfigured prices without consuming the event', async () => {
    const sub = subscription(); sub.items.data[0].price.id = 'price_unknown';
    listSubscriptions.mockResolvedValue({ data: [sub], has_more: false });
    expect((await POST(request())).status).toBe(503);
    expect(await claims()).toEqual([]);
    expect(await storedPlan()).toBe('writer');
  });
  it('refuses an incomplete provider page', async () => {
    listSubscriptions.mockResolvedValue({ data: [subscription('author')], has_more: true });
    expect((await POST(request())).status).toBe(503);
    expect(await claims()).toEqual([]);
    expect(await storedPlan()).toBe('writer');
  });
  it('retries an unlinked customer rather than acknowledging a lost entitlement', async () => {
    constructEvent.mockReturnValue(event('checkout.session.completed', { customer: 'cus_missing' }));
    expect((await POST(request())).status).toBe(503);
    expect(await claims()).toEqual([]);
    expect(listSubscriptions).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('supports expanded customer objects', async () => {
    constructEvent.mockReturnValue(event('customer.subscription.updated', { customer: { id: 'cus_abc' } }));
    expect((await POST(request())).status).toBe(200);
  });
  it('reconciles payment failures and sends the existing notification', async () => {
    constructEvent.mockReturnValue(event('invoice.payment_failed'));
    listSubscriptions.mockResolvedValue({ data: [subscription('writer', 'past_due')], has_more: false });
    expect((await POST(request())).status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ template: 'payment_failed' }));
  });
});
