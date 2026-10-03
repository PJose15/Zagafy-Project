// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type Stripe from 'stripe';
import * as schema from '@/db/schema';
import { POST } from '@/app/api/billing/checkout/route';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), customer: vi.fn(), list: vi.fn(), retrieve: vi.fn(), expire: vi.fn(), subscriptions: vi.fn(), portal: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireCloudUser: () => mocks.auth(), isAuthError: (r: unknown) => r instanceof Response }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => null }));
vi.mock('@/lib/stripe', () => ({ isStripeConfigured: () => true, stripe: () => ({
  customers: { create: mocks.customer }, subscriptions: { list: mocks.subscriptions }, billingPortal: { sessions: { create: mocks.portal } },
  checkout: { sessions: { create: mocks.create, list: mocks.list, retrieve: mocks.retrieve, expire: mocks.expire } },
}) }));
let database: PgliteDatabase<typeof schema>;
vi.mock('@/db/client', () => ({ db: () => database, isDatabaseConfigured: () => true }));
vi.mock('@/lib/billing', () => ({ getStripePriceId: (plan: string, interval: string) => plan === 'studio' ? null : `price_${plan}_${interval}`, resolveAppUrl: () => 'https://app.example.com' }));
let pg: PGlite;
let sessions: Map<string, Stripe.Checkout.Session>;
let keys: Map<string, string>;
function request(body: unknown) { return new Request('http://localhost/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as import('next/server').NextRequest; }
async function checkout(plan = 'writer') { return POST(request({ plan })); }
function openCount() { return [...sessions.values()].filter(s => s.status === 'open').length; }
describe('Checkout against migrated Postgres and idempotent provider', () => {
  beforeAll(async () => { pg = new PGlite(); database = drizzle(pg, { schema }); await migrate(database, { migrationsFolder: 'db/migrations' }); }, 30_000);
  afterAll(async () => { await pg.close(); });
  beforeEach(async () => {
    await pg.exec("TRUNCATE users CASCADE; INSERT INTO users(id,email) VALUES ('user_abc','author@example.com');");
    sessions = new Map(); keys = new Map();
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_abc' });
    mocks.customer.mockResolvedValue({ id: 'cus_1' });
    mocks.subscriptions.mockResolvedValue({ data: [], has_more: false });
    mocks.portal.mockResolvedValue({ url: 'https://billing.stripe.com/manage' });
    mocks.list.mockImplementation(async () => ({ data: [...sessions.values()].filter(s => s.status === 'open'), has_more: false }));
    mocks.retrieve.mockImplementation(async (id: string) => sessions.get(id));
    mocks.expire.mockImplementation(async (id: string) => {
      const session = sessions.get(id)!;
      if (session.status !== 'open') throw new Error('Not expireable');
      session.status = 'expired'; session.url = null; return session;
    });
    mocks.create.mockImplementation(async (params, options) => {
      const key = options.idempotencyKey;
      let id = keys.get(key);
      if (!id) { id = `cs_${keys.size + 1}`; keys.set(key, id); sessions.set(id, { id, status: 'open', url: `https://checkout.stripe.com/${id}`, mode: 'subscription', metadata: params.metadata } as Stripe.Checkout.Session); }
      return { ...sessions.get(id) };
    });
  });
  it('requires authentication', async () => { mocks.auth.mockResolvedValue(new Response('', { status: 401 })); expect((await checkout()).status).toBe(401); expect(mocks.customer).not.toHaveBeenCalled(); });
  it.each([{ plan: 'enterprise' }, { plan: 'free' }, { plan: 'writer', interval: 'biweekly' }, null, []])('rejects invalid request %j', async body => { expect((await POST(request(body))).status).toBe(400); expect(mocks.customer).not.toHaveBeenCalled(); });
  it('rejects malformed JSON', async () => { expect((await POST(new Request('http://localhost', { method: 'POST', body: 'bad' }) as import('next/server').NextRequest)).status).toBe(400); });
  it('requires a configured server price', async () => { expect((await checkout('studio')).status).toBe(500); expect(mocks.create).not.toHaveBeenCalled(); });
  it('requires an existing user', async () => { mocks.auth.mockResolvedValue({ userId: 'missing' }); expect((await checkout()).status).toBe(404); });
  it('reuses one customer and checkout across simultaneous requests', async () => {
    const responses = await Promise.all([checkout(), checkout(), checkout()]);
    expect(responses.map(r => r.status)).toEqual([200,200,200]);
    expect(new Set(await Promise.all(responses.map(async r => (await r.json()).url))).size).toBe(1);
    expect(mocks.customer).toHaveBeenCalledTimes(1); expect(mocks.create).toHaveBeenCalledTimes(1); expect(openCount()).toBe(1);
    expect((await pg.query('SELECT session_id FROM checkout_attempts')).rows).toEqual([{ session_id: 'cs_1' }]);
  });
  it('expires the old plan before creating its replacement', async () => {
    expect((await checkout()).status).toBe(200); expect((await checkout('author')).status).toBe(200);
    expect(sessions.get('cs_1')?.status).toBe('expired'); expect(openCount()).toBe(1);
    expect(mocks.create.mock.calls[1][0].line_items).toEqual([{ price: 'price_author_monthly', quantity: 1 }]);
  });
  it('recovers a lost provider response without creating another session', async () => {
    const implementation = mocks.create.getMockImplementation()!;
    mocks.create.mockImplementationOnce(async (...args) => { await implementation(...args); throw new Error('Response lost'); });
    expect((await checkout()).status).toBe(500); expect(openCount()).toBe(1);
    expect((await checkout()).status).toBe(200); expect(mocks.create).toHaveBeenCalledTimes(1); expect(openCount()).toBe(1);
  });
  it('replays the persisted key after DB commit failure', async () => {
    await pg.exec(`CREATE FUNCTION fail_checkout_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.session_id IS NOT NULL THEN RAISE EXCEPTION 'disk failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_checkout BEFORE UPDATE ON checkout_attempts FOR EACH ROW EXECUTE FUNCTION fail_checkout_update();`);
    try { expect((await checkout()).status).toBe(500); expect(openCount()).toBe(1); }
    finally { await pg.exec('DROP TRIGGER fail_checkout ON checkout_attempts; DROP FUNCTION fail_checkout_update();'); }
    expect((await checkout()).status).toBe(200); expect(openCount()).toBe(1); expect(mocks.customer.mock.calls[0][1]).toEqual(mocks.customer.mock.calls[1][1]);
  });
  it('blocks uncertain outcomes after the provider replay window', async () => {
    mocks.create.mockRejectedValueOnce(new Error('Timeout'));
    expect((await checkout()).status).toBe(500);
    await pg.exec("UPDATE checkout_attempts SET created_at=now()-interval '25 hours';");
    expect((await checkout()).status).toBe(500); expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('does not replace a checkout whose expiration fails', async () => {
    await checkout(); mocks.expire.mockRejectedValueOnce(new Error('Timeout'));
    expect((await checkout('author')).status).toBe(500); expect(mocks.create).toHaveBeenCalledTimes(1); expect(openCount()).toBe(1);
  });
  it('uses the portal when a checkout completed before webhook delivery', async () => {
    await checkout(); sessions.get('cs_1')!.status = 'complete';
    const response = await checkout('author'); expect(response.status).toBe(200); expect((await response.json()).url).toContain('billing.stripe.com'); expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it.each(['active','trialing','past_due','unpaid','paused','incomplete'])('uses portal for %s subscription', async status => {
    mocks.subscriptions.mockResolvedValue({ data: [{ status }], has_more: false });
    expect((await checkout()).status).toBe(200); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('fails closed on incomplete provider listings', async () => { mocks.subscriptions.mockResolvedValue({ data: [], has_more: true }); expect((await checkout()).status).toBe(500); expect(mocks.create).not.toHaveBeenCalled(); });
  it('does not expire another account’s unrecognized checkout', async () => {
    sessions.set('legacy', { id: 'legacy', status: 'open', mode: 'subscription', metadata: { userId: 'someone_else' } } as unknown as Stripe.Checkout.Session);
    expect((await checkout()).status).toBe(500); expect(mocks.expire).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('serializes competing plan choices with at most one open session', async () => {
    const responses = await Promise.all([checkout(), checkout('author')]);
    expect(responses.every(r => r.status === 200)).toBe(true); expect(openCount()).toBe(1);
  });
  it('expires a recognized legacy session before creating a tracked checkout', async () => {
    sessions.set('legacy', { id: 'legacy', status: 'open', mode: 'subscription', metadata: { userId: 'user_abc' } } as unknown as Stripe.Checkout.Session);
    expect((await checkout()).status).toBe(200); expect(sessions.get('legacy')?.status).toBe('expired'); expect(openCount()).toBe(1);
  });
  it('retains immutable attempt parameters across a failed request and changed account email', async () => {
    mocks.create.mockRejectedValueOnce(new Error('Network unavailable'));
    expect((await checkout()).status).toBe(500);
    await pg.exec("UPDATE users SET email='new@example.com' WHERE id='user_abc';");
    expect((await checkout()).status).toBe(200);
    expect(mocks.create.mock.calls[0]).toEqual(mocks.create.mock.calls[1]);
    expect(mocks.customer.mock.calls[0]).toEqual(mocks.customer.mock.calls[1]);
  });

});
