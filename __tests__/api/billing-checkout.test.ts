import { describe, it, expect, beforeEach, vi } from 'vitest';

const originalEnv = { ...process.env };

// Mock auth
const mockRequireUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireUser: () => mockRequireUser(),
  requireCloudUser: () => mockRequireUser(),
  isAuthError: (r: unknown) => r instanceof Response,
  isAuthEnabled: () => true,
}));

// Mock Stripe
const mockCheckoutCreate = vi.fn();
const mockCustomerCreate = vi.fn();
vi.mock('@/lib/stripe', () => ({
  stripe: () => ({
    checkout: { sessions: { create: mockCheckoutCreate } },
    customers: { create: mockCustomerCreate },
  }),
  isStripeConfigured: () => true,
}));

// Mock DB
const mockSelectLimit = vi.fn();
const mockSelectFrom = vi.fn(() => ({ where: () => ({ limit: mockSelectLimit }) }));
const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));
const mockUpdateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

vi.mock('@/db/client', () => ({
  db: vi.fn(() => ({
    select: mockSelect,
    update: mockUpdate,
  })),
  isDatabaseConfigured: vi.fn(() => true),
}));

// Mock billing
vi.mock('@/lib/billing', () => ({
  getStripePriceId: (plan: string, interval: string) =>
    plan === 'writer' && interval === 'monthly' ? 'price_writer_monthly' : null,
  isPlanId: (v: unknown) => typeof v === 'string' && ['free', 'writer', 'author', 'studio'].includes(v),
  resolveAppUrl: () => 'http://localhost:3000',
}));

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      STRIPE_SECRET_KEY: 'sk_test_123',
      DATABASE_URL: 'postgresql://test',
    };
    mockRequireUser.mockResolvedValue({ userId: 'user_abc', embedMode: false });
    mockCheckoutCreate.mockReset();
    mockCustomerCreate.mockReset();
    mockSelectLimit.mockReset();
    mockUpdate.mockClear();
    mockUpdateSet.mockClear();
  });

  it('returns 401 when not authenticated', async () => {
    const { err } = await import('@/lib/api-response');
    mockRequireUser.mockResolvedValue(err('unauthorized', 'Sign in required', 401));
    const { POST } = await import('@/app/api/billing/checkout/route');
    const res = await POST(makeRequest({ plan: 'writer' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid plan', async () => {
    const { POST } = await import('@/app/api/billing/checkout/route');
    const res = await POST(makeRequest({ plan: 'enterprise' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it('returns 400 for free plan', async () => {
    const { POST } = await import('@/app/api/billing/checkout/route');
    const res = await POST(makeRequest({ plan: 'free' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid interval', async () => {
    const { POST } = await import('@/app/api/billing/checkout/route');
    const res = await POST(makeRequest({ plan: 'writer', interval: 'biweekly' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    const { POST } = await import('@/app/api/billing/checkout/route');
    const req = new Request('http://localhost/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    }) as unknown as import('next/server').NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 when user not found in DB', async () => {
    mockSelectLimit.mockResolvedValue([]);
    const { POST } = await import('@/app/api/billing/checkout/route');
    const res = await POST(makeRequest({ plan: 'writer' }));
    expect(res.status).toBe(404);
  });

  it('creates a Stripe customer when none exists and returns checkout URL', async () => {
    mockSelectLimit.mockResolvedValue([{ stripeCustomerId: null, email: 'pj@example.com' }]);
    mockCustomerCreate.mockResolvedValue({ id: 'cus_new123' });
    mockCheckoutCreate.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/session/cs_test_123',
    });

    const { POST } = await import('@/app/api/billing/checkout/route');
    const res = await POST(makeRequest({ plan: 'writer' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.url).toBe('https://checkout.stripe.com/session/cs_test_123');
    expect(mockCustomerCreate).toHaveBeenCalledWith({
      email: 'pj@example.com',
      metadata: { userId: 'user_abc' },
    });
  });

  it('reuses existing Stripe customer ID', async () => {
    mockSelectLimit.mockResolvedValue([{ stripeCustomerId: 'cus_existing', email: 'pj@example.com' }]);
    mockCheckoutCreate.mockResolvedValue({
      id: 'cs_test_456',
      url: 'https://checkout.stripe.com/session/cs_test_456',
    });

    const { POST } = await import('@/app/api/billing/checkout/route');
    const res = await POST(makeRequest({ plan: 'writer' }));
    expect(res.status).toBe(200);
    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing' }),
    );
  });

  it('returns 500 when price ID is not configured', async () => {
    // Mock getStripePriceId returning null for author
    mockSelectLimit.mockResolvedValue([{ stripeCustomerId: 'cus_x', email: 'x@x.com' }]);
    const { POST } = await import('@/app/api/billing/checkout/route');
    const res = await POST(makeRequest({ plan: 'author' }));
    expect(res.status).toBe(500);
  });
});
