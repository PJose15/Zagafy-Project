import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Stripe from 'stripe';

const originalEnv = { ...process.env };

// Mock Stripe SDK
const mockConstructEvent = vi.fn();
vi.mock('@/lib/stripe', () => ({
  stripe: () => ({
    webhooks: { constructEvent: mockConstructEvent },
  }),
}));

// Mock DB
const mockInsertOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
const mockInsertValues = vi.fn(() => ({ onConflictDoNothing: mockInsertOnConflictDoNothing }));
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

const mockUpdateReturning = vi.fn().mockResolvedValue([{ id: 'user_abc' }]);
const mockUpdateSetWhere = vi.fn(() => ({ returning: mockUpdateReturning }));
const mockUpdateSet = vi.fn(() => ({ where: mockUpdateSetWhere }));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

const mockSelectLimit = vi.fn().mockResolvedValue([]);
const mockSelectFrom = vi.fn(() => ({ where: () => ({ limit: mockSelectLimit }) }));
const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

vi.mock('@/db/client', () => ({
  db: vi.fn(() => ({
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
  })),
  isDatabaseConfigured: vi.fn(() => true),
}));

vi.mock('@/db/schema', () => ({
  users: { id: 'id', stripeCustomerId: 'stripe_customer_id', plan: 'plan' },
  stripeEvents: { id: 'id', type: 'type' },
}));

vi.mock('@/lib/billing', () => ({
  isPlanId: (v: unknown) => typeof v === 'string' && ['free', 'writer', 'author', 'studio'].includes(v),
}));

function makeRequest(body: string, signature = 'sig_test') {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
    body,
  }) as unknown as import('next/server').NextRequest;
}

function fakeEvent(
  type: string,
  data: Record<string, unknown>,
  id = 'evt_test_123',
) {
  return { id, type, data: { object: data } } as unknown as Stripe.Event;
}

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      DATABASE_URL: 'postgresql://test',
    };
    mockConstructEvent.mockReset();
    mockInsert.mockClear();
    mockInsertValues.mockClear();
    mockInsertOnConflictDoNothing.mockClear();
    mockUpdate.mockClear();
    mockUpdateSet.mockClear();
    mockUpdateSetWhere.mockClear();
    mockUpdateReturning.mockClear().mockResolvedValue([{ id: 'user_abc' }]);
    mockSelectLimit.mockReset().mockResolvedValue([]); // no duplicate by default
  });

  it('returns 500 when STRIPE_WEBHOOK_SECRET is unset', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(500);
  });

  it('returns 401 when stripe-signature header is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }) as unknown as import('next/server').NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when signature verification fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('bad signature');
    });
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(401);
  });

  it('processes checkout.session.completed and updates user plan', async () => {
    mockConstructEvent.mockReturnValue(
      fakeEvent('checkout.session.completed', {
        id: 'cs_test_123',
        mode: 'subscription',
        customer: 'cus_abc',
        subscription: 'sub_abc',
        metadata: { userId: 'user_abc', plan: 'writer' },
      }),
    );

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.processed).toBe('checkout.session.completed');
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: 'cus_abc', plan: 'writer' }),
    );
  });

  it('skips non-subscription checkout sessions', async () => {
    mockConstructEvent.mockReturnValue(
      fakeEvent('checkout.session.completed', {
        id: 'cs_test_456',
        mode: 'payment', // not subscription
        customer: 'cus_abc',
      }),
    );

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    // Should not attempt to update user plan
    expect(mockUpdateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ plan: expect.any(String) }),
    );
  });

  it('processes customer.subscription.updated for active subscription', async () => {
    mockConstructEvent.mockReturnValue(
      fakeEvent('customer.subscription.updated', {
        customer: 'cus_abc',
        status: 'active',
        metadata: { plan: 'author' },
        items: { data: [{ price: { unit_amount: 2400, recurring: { interval: 'month' } } }] },
      }),
    );

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockUpdateSet).toHaveBeenCalled();
  });

  it('processes customer.subscription.deleted and downgrades to free', async () => {
    mockConstructEvent.mockReturnValue(
      fakeEvent('customer.subscription.deleted', {
        customer: 'cus_abc',
        status: 'canceled',
      }),
    );

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe('customer.subscription.deleted');
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ plan: 'free' }));
  });

  it('processes invoice.payment_failed without crashing', async () => {
    mockConstructEvent.mockReturnValue(
      fakeEvent('invoice.payment_failed', {
        id: 'in_test_123',
        customer: 'cus_abc',
        attempt_count: 2,
      }),
    );

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe('invoice.payment_failed');
  });

  it('ignores unhandled event types with 200', async () => {
    mockConstructEvent.mockReturnValue(
      fakeEvent('payment_intent.succeeded', { id: 'pi_test' }),
    );

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ignored).toBe('payment_intent.succeeded');
  });

  it('skips duplicate events (idempotency)', async () => {
    // Simulate event already processed
    mockSelectLimit.mockResolvedValue([{ id: 'evt_dup' }]);
    mockConstructEvent.mockReturnValue(
      fakeEvent('checkout.session.completed', {
        id: 'cs_test',
        mode: 'subscription',
        customer: 'cus_abc',
        subscription: 'sub_abc',
        metadata: { userId: 'user_abc', plan: 'writer' },
      }, 'evt_dup'),
    );

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe('duplicate');
    // Should not have updated the user
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it('records event after processing for idempotency', async () => {
    mockConstructEvent.mockReturnValue(
      fakeEvent('customer.subscription.deleted', {
        customer: 'cus_abc',
        status: 'canceled',
      }),
    );

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    await POST(makeRequest('{}'));
    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'customer.subscription.deleted' }),
    );
  });

  it('handles customer as object (expanded)', async () => {
    mockConstructEvent.mockReturnValue(
      fakeEvent('customer.subscription.deleted', {
        customer: { id: 'cus_obj', name: 'Test' },
        status: 'canceled',
      }),
    );

    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ plan: 'free' }));
  });
});
