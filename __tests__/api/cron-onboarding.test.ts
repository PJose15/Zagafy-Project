import { describe, it, expect, beforeEach, vi } from 'vitest';

const originalEnv = { ...process.env };

const mockRunOnboardingDrip = vi.fn().mockResolvedValue({ examined: 0, sent: 0, skipped: 0 });
vi.mock('@/lib/onboarding-emails', () => ({
  runOnboardingDrip: (...args: unknown[]) => mockRunOnboardingDrip(...args),
}));

const mockIsDatabaseConfigured = vi.fn(() => true);
vi.mock('@/db/client', () => ({
  db: vi.fn(),
  isDatabaseConfigured: () => mockIsDatabaseConfigured(),
}));

function makeRequest(authorization?: string) {
  return new Request('http://localhost/api/cron/onboarding', {
    method: 'GET',
    headers: authorization ? { authorization } : {},
  }) as unknown as import('next/server').NextRequest;
}

describe('GET /api/cron/onboarding', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CRON_SECRET: 'cron_test_secret',
      DATABASE_URL: 'postgresql://test',
    };
    delete process.env.VERCEL_ENV;
    mockRunOnboardingDrip.mockClear().mockResolvedValue({ examined: 0, sent: 0, skipped: 0 });
    mockIsDatabaseConfigured.mockClear().mockReturnValue(true);
  });

  it('returns 401 without a bearer token', async () => {
    const { GET } = await import('@/app/api/cron/onboarding/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockRunOnboardingDrip).not.toHaveBeenCalled();
  });

  it('returns 401 with a wrong bearer token', async () => {
    const { GET } = await import('@/app/api/cron/onboarding/route');
    const res = await GET(makeRequest('Bearer wrong_secret'));
    expect(res.status).toBe(401);
    expect(mockRunOnboardingDrip).not.toHaveBeenCalled();
  });

  it('returns 200 with the correct bearer token and runs the drip', async () => {
    mockRunOnboardingDrip.mockResolvedValue({ examined: 5, sent: 3, skipped: 2 });
    const { GET } = await import('@/app/api/cron/onboarding/route');
    const res = await GET(makeRequest('Bearer cron_test_secret'));
    expect(res.status).toBe(200);
    expect(mockRunOnboardingDrip).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.data).toEqual({ examined: 5, sent: 3, skipped: 2 });
  });

  it('returns 500 when CRON_SECRET is unset in production', async () => {
    delete process.env.CRON_SECRET;
    process.env.VERCEL_ENV = 'production';
    const { GET } = await import('@/app/api/cron/onboarding/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    expect(mockRunOnboardingDrip).not.toHaveBeenCalled();
  });

  it('allows the request when CRON_SECRET is unset outside production', async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import('@/app/api/cron/onboarding/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(mockRunOnboardingDrip).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when the database is not configured', async () => {
    mockIsDatabaseConfigured.mockReturnValue(false);
    const { GET } = await import('@/app/api/cron/onboarding/route');
    const res = await GET(makeRequest('Bearer cron_test_secret'));
    expect(res.status).toBe(500);
    expect(mockRunOnboardingDrip).not.toHaveBeenCalled();
  });

  it('returns 500 when the drip run throws', async () => {
    mockRunOnboardingDrip.mockRejectedValue(new Error('db exploded'));
    const { GET } = await import('@/app/api/cron/onboarding/route');
    const res = await GET(makeRequest('Bearer cron_test_secret'));
    expect(res.status).toBe(500);
  });
});
