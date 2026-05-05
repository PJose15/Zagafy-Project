import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the actual in-memory limiter, so we do NOT mock @upstash/*.
// Instead we ensure the Upstash env vars are unset so the in-memory path is used.

// Reset the module between tests so the memoryStore is fresh
let rateLimit: typeof import('@/lib/rate-limit').rateLimit;
let validateRateLimitConfig: typeof import('@/lib/rate-limit').validateRateLimitConfig;

function makeRequest(ip: string, path = '/api/chat') {
  // Use the NextRequest constructor from next/server
  const { NextRequest } = require('next/server');
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  });
}

describe('rate-limit (in-memory)', () => {
  beforeEach(async () => {
    vi.resetModules();
    // Ensure Upstash is not configured so we hit the in-memory path
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubEnv('NODE_ENV', 'development');

    const mod = await import('@/lib/rate-limit');
    rateLimit = mod.rateLimit;
    validateRateLimitConfig = mod.validateRateLimitConfig;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows requests under the limit', async () => {
    const req = makeRequest('1.2.3.4');
    const result = await rateLimit(req, { maxRequests: 3, windowMs: 60000 });
    expect(result).toBeNull();
  });

  it('blocks requests that exceed the limit', async () => {
    for (let i = 0; i < 3; i++) {
      const result = await rateLimit(makeRequest('5.6.7.8'), { maxRequests: 3, windowMs: 60000 });
      expect(result).toBeNull();
    }
    // 4th request should be blocked
    const blocked = await rateLimit(makeRequest('5.6.7.8'), { maxRequests: 3, windowMs: 60000 });
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
  });

  it('isolates limits per IP', async () => {
    // Fill up IP A
    for (let i = 0; i < 2; i++) {
      await rateLimit(makeRequest('10.0.0.1'), { maxRequests: 2, windowMs: 60000 });
    }
    // IP A is blocked
    const blockedA = await rateLimit(makeRequest('10.0.0.1'), { maxRequests: 2, windowMs: 60000 });
    expect(blockedA).not.toBeNull();

    // IP B should still be allowed
    const allowedB = await rateLimit(makeRequest('10.0.0.2'), { maxRequests: 2, windowMs: 60000 });
    expect(allowedB).toBeNull();
  });

  it('isolates limits per path', async () => {
    for (let i = 0; i < 2; i++) {
      await rateLimit(makeRequest('20.0.0.1', '/api/chat'), { maxRequests: 2, windowMs: 60000 });
    }
    // /api/chat is blocked for this IP
    const blockedChat = await rateLimit(makeRequest('20.0.0.1', '/api/chat'), {
      maxRequests: 2,
      windowMs: 60000,
    });
    expect(blockedChat).not.toBeNull();

    // /api/audit should still be allowed for the same IP
    const allowedAudit = await rateLimit(makeRequest('20.0.0.1', '/api/audit'), {
      maxRequests: 2,
      windowMs: 60000,
    });
    expect(allowedAudit).toBeNull();
  });

  it('allows requests again after window expires', async () => {
    vi.useFakeTimers();

    for (let i = 0; i < 2; i++) {
      await rateLimit(makeRequest('30.0.0.1'), { maxRequests: 2, windowMs: 10000 });
    }

    // Blocked now
    const blocked = await rateLimit(makeRequest('30.0.0.1'), { maxRequests: 2, windowMs: 10000 });
    expect(blocked).not.toBeNull();

    // Advance time past the window
    vi.advanceTimersByTime(11000);

    // Should be allowed again
    const allowed = await rateLimit(makeRequest('30.0.0.1'), { maxRequests: 2, windowMs: 10000 });
    expect(allowed).toBeNull();

    vi.useRealTimers();
  });
});

describe('validateRateLimitConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does nothing in development', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');

    const mod = await import('@/lib/rate-limit');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mod.validateRateLimitConfig();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('errors in production when Upstash is not configured', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');

    const mod = await import('@/lib/rate-limit');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mod.validateRateLimitConfig();
    expect(spy).toHaveBeenCalled();
    const warning = spy.mock.calls[0][0] as string;
    expect(warning).toContain('UPSTASH');
    spy.mockRestore();
  });
});
