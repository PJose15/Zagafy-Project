// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @upstash/ratelimit so we can control success / throw per call.
const mockLimit = vi.fn();
vi.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    static slidingWindow() { return {}; }
    limit = mockLimit;
  }
  return { Ratelimit };
});

vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: () => ({}) },
}));

import { NextRequest } from 'next/server';

function makeRequest(ip = '1.2.3.4', path = '/api/x') {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  });
}

describe('rate-limit circuit breaker', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockLimit.mockReset();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok');
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 503 with circuit-open reason after 3 consecutive Upstash failures', async () => {
    const mod = await import('@/lib/rate-limit');
    mod._resetCircuitBreakerForTests();

    mockLimit.mockRejectedValue(new Error('upstream down'));

    // First 3 attempts fail with 503 'upstash-unreachable' and trip the breaker.
    for (let i = 0; i < 3; i++) {
      const res = await mod.rateLimit(makeRequest(), { maxRequests: 5, windowMs: 60000 });
      expect(res!.status).toBe(503);
      const body = await res!.json();
      expect(body.reason).toBe('upstash-unreachable');
    }

    // 4th attempt: breaker is now open; we never even call Upstash.
    const callsBefore = mockLimit.mock.calls.length;
    const res = await mod.rateLimit(makeRequest(), { maxRequests: 5, windowMs: 60000 });
    expect(res!.status).toBe(503);
    const body = await res!.json();
    expect(body.reason).toBe('circuit-open');
    expect(mockLimit.mock.calls.length).toBe(callsBefore);

    expect(mod.getRateLimitHealth().breakerState).toBe('open');
  });

  it('does not trip the breaker if failures are spread beyond the failure window', async () => {
    const mod = await import('@/lib/rate-limit');
    mod._resetCircuitBreakerForTests();

    const realNow = Date.now();
    let now = realNow;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      mockLimit.mockRejectedValue(new Error('blip'));

      // Two failures, then advance past the 30s window, then another failure.
      await mod.rateLimit(makeRequest(), { maxRequests: 5, windowMs: 60000 });
      await mod.rateLimit(makeRequest(), { maxRequests: 5, windowMs: 60000 });
      now += 31_000;
      await mod.rateLimit(makeRequest(), { maxRequests: 5, windowMs: 60000 });

      expect(mod.getRateLimitHealth().breakerState).toBe('closed');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('half-open probe closes the breaker on success', async () => {
    const mod = await import('@/lib/rate-limit');
    mod._resetCircuitBreakerForTests();

    const realNow = Date.now();
    let now = realNow;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      mockLimit.mockRejectedValue(new Error('down'));

      // Trip the breaker.
      for (let i = 0; i < 3; i++) {
        await mod.rateLimit(makeRequest(), { maxRequests: 5, windowMs: 60000 });
      }
      expect(mod.getRateLimitHealth().breakerState).toBe('open');

      // Within open window: still rejected without contacting Upstash.
      now += 30_000;
      const opened = await mod.rateLimit(makeRequest(), { maxRequests: 5, windowMs: 60000 });
      expect((await opened!.json()).reason).toBe('circuit-open');

      // Past open window: half-open probe attempt; succeed → breaker closes.
      now += 40_000;
      mockLimit.mockResolvedValueOnce({ success: true });
      const probe = await mod.rateLimit(makeRequest(), { maxRequests: 5, windowMs: 60000 });
      expect(probe).toBeNull();
      expect(mod.getRateLimitHealth().breakerState).toBe('closed');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('half-open probe re-opens the breaker on failure', async () => {
    const mod = await import('@/lib/rate-limit');
    mod._resetCircuitBreakerForTests();

    const realNow = Date.now();
    let now = realNow;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      mockLimit.mockRejectedValue(new Error('still down'));

      for (let i = 0; i < 3; i++) {
        await mod.rateLimit(makeRequest(), { maxRequests: 5, windowMs: 60000 });
      }
      expect(mod.getRateLimitHealth().breakerState).toBe('open');

      now += 70_000;
      const probe = await mod.rateLimit(makeRequest(), { maxRequests: 5, windowMs: 60000 });
      expect((await probe!.json()).reason).toBe('upstash-unreachable');
      expect(mod.getRateLimitHealth().breakerState).toBe('open');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('successful Upstash call clears prior failure count', async () => {
    const mod = await import('@/lib/rate-limit');
    mod._resetCircuitBreakerForTests();

    mockLimit.mockRejectedValueOnce(new Error('blip 1'));
    mockLimit.mockRejectedValueOnce(new Error('blip 2'));
    mockLimit.mockResolvedValueOnce({ success: true });

    await mod.rateLimit(makeRequest(), { maxRequests: 5, windowMs: 60000 });
    await mod.rateLimit(makeRequest(), { maxRequests: 5, windowMs: 60000 });
    const ok = await mod.rateLimit(makeRequest(), { maxRequests: 5, windowMs: 60000 });
    expect(ok).toBeNull();

    expect(mod.getRateLimitHealth().consecutiveFailures).toBe(0);
    expect(mod.getRateLimitHealth().breakerState).toBe('closed');
  });
});
