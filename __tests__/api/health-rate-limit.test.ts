// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/health/rate-limit', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/health/rate-limit', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 503 in production when HEALTH_TOKEN is not set', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('HEALTH_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok');
    const { GET } = await import('@/app/api/health/rate-limit/route');
    const res = GET(makeRequest());
    expect(res.status).toBe(503);
  });

  it('returns 403 when HEALTH_TOKEN is set but the request omits or mis-matches it', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('HEALTH_TOKEN', 'shhh');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok');
    const { GET } = await import('@/app/api/health/rate-limit/route');

    expect(GET(makeRequest()).status).toBe(403);
    expect(GET(makeRequest({ 'x-health-token': 'wrong' })).status).toBe(403);
  });

  it('returns 200 with mode + breaker detail when the token matches', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('HEALTH_TOKEN', 'shhh');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok');
    const { GET } = await import('@/app/api/health/rate-limit/route');

    const res = GET(makeRequest({ 'x-health-token': 'shhh' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('upstash');
    expect(typeof body.reachable).toBe('boolean');
    expect(['closed', 'open', 'half-open']).toContain(body.breakerState);
    expect(typeof body.consecutiveFailures).toBe('number');
  });

  it('is open without a token in development for local debugging', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('HEALTH_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    const { GET } = await import('@/app/api/health/rate-limit/route');

    const res = GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('memory');
  });
});
