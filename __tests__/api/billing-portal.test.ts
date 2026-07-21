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

// Always allow through the rate limiter.
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock Stripe
const mockPortalCreate = vi.fn();
vi.mock('@/lib/stripe', () => ({
  stripe: () => ({
    billingPortal: { sessions: { create: mockPortalCreate } },
  }),
  isStripeConfigured: () => true,
}));

// Mock DB
const mockSelectLimit = vi.fn();
const mockSelectFrom = vi.fn(() => ({ where: () => ({ limit: mockSelectLimit }) }));
const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

vi.mock('@/db/client', () => ({
  db: vi.fn(() => ({
    select: mockSelect,
  })),
  isDatabaseConfigured: vi.fn(() => true),
}));

function makeRequest() {
  return new Request('http://localhost/api/billing/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as import('next/server').NextRequest;
}

describe('POST /api/billing/portal', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      STRIPE_SECRET_KEY: 'sk_test_123',
      DATABASE_URL: 'postgresql://test',
    };
    mockRequireUser.mockResolvedValue({ userId: 'user_abc', embedMode: false });
    mockPortalCreate.mockReset();
    mockSelectLimit.mockReset();
  });

  it('returns 401 when not authenticated', async () => {
    const { err } = await import('@/lib/api-response');
    mockRequireUser.mockResolvedValue(err('unauthorized', 'Sign in required', 401));
    const { POST } = await import('@/app/api/billing/portal/route');
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 404 when user not found', async () => {
    mockSelectLimit.mockResolvedValue([]);
    const { POST } = await import('@/app/api/billing/portal/route');
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
  });

  it('returns 400 when user has no Stripe customer ID', async () => {
    mockSelectLimit.mockResolvedValue([{ stripeCustomerId: null }]);
    const { POST } = await import('@/app/api/billing/portal/route');
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('No billing account');
  });

  it('returns portal URL when user has Stripe customer', async () => {
    mockSelectLimit.mockResolvedValue([{ stripeCustomerId: 'cus_abc' }]);
    mockPortalCreate.mockResolvedValue({
      url: 'https://billing.stripe.com/session/bps_test_123',
    });
    const { POST } = await import('@/app/api/billing/portal/route');
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.url).toBe('https://billing.stripe.com/session/bps_test_123');
    expect(mockPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_abc' }),
    );
  });

  it('returns 500 when Stripe portal creation fails', async () => {
    mockSelectLimit.mockResolvedValue([{ stripeCustomerId: 'cus_abc' }]);
    mockPortalCreate.mockRejectedValue(new Error('Stripe error'));
    const { POST } = await import('@/app/api/billing/portal/route');
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});
