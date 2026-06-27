import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('returns status ok and a timestamp', async () => {
    const res = GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    // Phase 3.1 — timestamp is now an ISO string from the envelope.
    expect(typeof body.timestamp).toBe('string');
    expect(Number.isFinite(Date.parse(body.timestamp))).toBe(true);
    expect(Date.parse(body.timestamp)).toBeLessThanOrEqual(Date.now());
    expect(body.ok).toBe(true);
  });

  it('surfaces a basic rate-limit subsystem snapshot', async () => {
    const res = GET();
    const body = await res.json();
    expect(body.rateLimit).toBeDefined();
    expect(['upstash', 'memory', 'disabled']).toContain(body.rateLimit.mode);
    expect(typeof body.rateLimit.reachable).toBe('boolean');
  });

  it('reports AI provider key presence as booleans (never values)', async () => {
    const res = GET();
    const body = await res.json();
    expect(body.ai).toBeDefined();
    expect(typeof body.ai.gemini).toBe('boolean');
    expect(typeof body.ai.anthropic).toBe('boolean');
  });
});
