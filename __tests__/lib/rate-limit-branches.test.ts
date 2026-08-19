import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Tests for rate-limit branch coverage gaps:
// - Memory store cleanup (stale entries, hard cap)
// - Production warning (one-time log)
// - getClientIP fallback chain (x-real-ip, unknown)
// - Default config parameters
// - validateRateLimitConfig with Upstash configured in production (no-op)

let rateLimit: typeof import('@/lib/rate-limit').rateLimit;
let validateRateLimitConfig: typeof import('@/lib/rate-limit').validateRateLimitConfig;

function makeRequest(ip: string, path = '/api/chat', headers?: Record<string, string>) {
  const { NextRequest } = require('next/server');
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { ...headers, ...(ip ? { 'x-forwarded-for': ip } : {}) },
  });
}

function makeRequestWithRealIP(realIp: string, path = '/api/chat') {
  const { NextRequest } = require('next/server');
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'x-real-ip': realIp },
  });
}

function makeRequestNoIP(path = '/api/chat') {
  const { NextRequest } = require('next/server');
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
  });
}

describe('rate-limit branch coverage', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubEnv('NODE_ENV', 'development');

    const mod = await import('@/lib/rate-limit');
    rateLimit = mod.rateLimit;
    validateRateLimitConfig = mod.validateRateLimitConfig;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  describe('getClientIP fallback chain', () => {
    it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
      const req = makeRequestWithRealIP('99.99.99.99');
      const result = await rateLimit(req, { maxRequests: 1, windowMs: 60000 });
      expect(result).toBeNull(); // First request allowed

      const blocked = await rateLimit(req, { maxRequests: 1, windowMs: 60000 });
      expect(blocked?.status).toBe(429); // Same IP blocked
    });

    it('falls back to "unknown" when no IP headers present', async () => {
      const req = makeRequestNoIP();
      const result = await rateLimit(req, { maxRequests: 1, windowMs: 60000 });
      expect(result).toBeNull();

      const blocked = await rateLimit(req, { maxRequests: 1, windowMs: 60000 });
      expect(blocked?.status).toBe(429);
    });

    it('uses the right-most (trusted-hop) IP from x-forwarded-for, not the spoofable left-most', async () => {
      const { NextRequest } = require('next/server');
      const req = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' },
      });
      const result = await rateLimit(req, { maxRequests: 1, windowMs: 60000 });
      expect(result).toBeNull();

      // Same trusted right-most hop (3.3.3.3) but a *different* spoofed left-most
      // value must still land in the same bucket and be blocked — otherwise a
      // caller could rotate the left-most value to bypass the limit entirely.
      const req2 = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'x-forwarded-for': '9.9.9.9, 8.8.8.8, 3.3.3.3' },
      });
      const blocked = await rateLimit(req2, { maxRequests: 1, windowMs: 60000 });
      expect(blocked?.status).toBe(429);
    });

    it('prefers the platform x-vercel-forwarded-for header over client x-forwarded-for', async () => {
      const { NextRequest } = require('next/server');
      const req = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {
          'x-vercel-forwarded-for': '5.5.5.5',
          'x-forwarded-for': '1.1.1.1',
        },
      });
      const result = await rateLimit(req, { maxRequests: 1, windowMs: 60000 });
      expect(result).toBeNull();

      // A second request that changes the spoofable x-forwarded-for but keeps the
      // platform header must remain in the same (platform-identified) bucket.
      const req2 = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {
          'x-vercel-forwarded-for': '5.5.5.5',
          'x-forwarded-for': '7.7.7.7',
        },
      });
      const blocked = await rateLimit(req2, { maxRequests: 1, windowMs: 60000 });
      expect(blocked?.status).toBe(429);
    });

    it('enforces a global per-route ceiling regardless of client IP (anti-spoof backstop)', async () => {
      const { NextRequest } = require('next/server');
      // maxRequests=1 → global ceiling = 1 * 50 = 50. Rotate a fresh IP each time
      // so the per-IP limiter never trips; only the global ceiling can stop this.
      let blockedAt = -1;
      for (let i = 0; i < 60; i++) {
        const req = new NextRequest('http://localhost:3000/api/chat', {
          method: 'POST',
          headers: { 'x-forwarded-for': `10.0.0.${i}` },
        });
        const res = await rateLimit(req, { maxRequests: 1, windowMs: 60000 });
        if (res?.status === 429) { blockedAt = i; break; }
      }
      expect(blockedAt).toBe(50);
    });
  });

  describe('default config', () => {
    it('uses default maxRequests=10 and windowMs=60000', async () => {
      // Send 10 requests — all should pass with defaults
      for (let i = 0; i < 10; i++) {
        const result = await rateLimit(makeRequest('40.0.0.1'));
        expect(result).toBeNull();
      }
      // 11th should be blocked
      const blocked = await rateLimit(makeRequest('40.0.0.1'));
      expect(blocked?.status).toBe(429);
    });
  });

  describe('memory store cleanup', () => {
    it('cleans up stale entries after cleanup interval', async () => {
      vi.useFakeTimers();

      // Fill some entries with a short window
      for (let i = 0; i < 3; i++) {
        await rateLimit(makeRequest(`50.0.0.${i}`), { maxRequests: 5, windowMs: 5000 });
      }

      // Advance past the cleanup interval (60s) AND past the window (5s)
      vi.advanceTimersByTime(65000);

      // Trigger cleanup via a new request
      const result = await rateLimit(makeRequest('50.0.0.0'), { maxRequests: 5, windowMs: 5000 });
      expect(result).toBeNull(); // Should be allowed — old entries cleaned up
    });
  });
});

describe('validateRateLimitConfig branches', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does nothing in production when Upstash IS configured', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token123');

    const mod = await import('@/lib/rate-limit');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mod.validateRateLimitConfig();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('rate-limit production memory warning', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('logs production warning once when Upstash is not configured', async () => {
    vi.resetModules();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubEnv('NODE_ENV', 'production');

    const mod = await import('@/lib/rate-limit');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await mod.rateLimit(makeRequest('60.0.0.1'), { maxRequests: 10, windowMs: 60000 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('UPSTASH_REDIS_REST_URL');

    // Second call should NOT warn again
    await mod.rateLimit(makeRequest('60.0.0.2'), { maxRequests: 10, windowMs: 60000 });
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});
