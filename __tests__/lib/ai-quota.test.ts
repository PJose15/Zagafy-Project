import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Mocks ──
const mockEval = vi.fn(async (): Promise<number> => 1);
const mockGet = vi.fn(async (): Promise<number | null> => 0);
vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: vi.fn(() => ({ eval: mockEval, get: mockGet })),
  },
}));

const mockGetUserPlan = vi.fn(async (_userId?: unknown): Promise<string> => 'free');
vi.mock('@/lib/get-user-plan', () => ({
  // Lazy wrapper: the factory is hoisted above the const initializer, so it
  // must not touch mockGetUserPlan until call time.
  getUserPlan: (userId: unknown) => mockGetUserPlan(userId),
}));

import { checkAiQuota, enforceAiQuota, peekAiQuota, enforceAiQuotaPeek } from '@/lib/ai-quota';

function stubUpstashEnv() {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
}

describe('lib/ai-quota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEval.mockResolvedValue(1);
    mockGet.mockResolvedValue(0);
    mockGetUserPlan.mockResolvedValue('free');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('checkAiQuota', () => {
    it.each(['true', 'false', ''])('fails closed on production Redis outage even with strict=%s', async (strict) => {
      stubUpstashEnv();
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('RATE_LIMIT_STRICT', strict);
      mockEval.mockRejectedValue(new Error('timeout'));
      expect(await checkAiQuota('user-1')).toEqual({ allowed: false, unavailable: true });
      expect((await enforceAiQuota({ userId: 'user-1', embedMode: false }))?.status).toBe(503);
    });
    it('fails closed on a reservation script failure in production', async () => {
      stubUpstashEnv(); vi.stubEnv('NODE_ENV', 'production');
      mockEval.mockRejectedValueOnce(new Error('timeout'));
      expect((await checkAiQuota('user-1')).allowed).toBe(false);
    });
    it('meters the shared embed budget in production', async () => {
      stubUpstashEnv(); vi.stubEnv('NODE_ENV', 'production');
      mockEval.mockResolvedValue(101);
      expect((await enforceAiQuota({ userId: 'embed-mode', embedMode: true }))?.status).toBe(429);
    });
    it('fails open when Upstash is not configured', async () => {
      const result = await checkAiQuota('user-1');
      expect(result.allowed).toBe(true);
      expect(mockEval).not.toHaveBeenCalled();
    });

    it('fails closed without Upstash in production strict mode', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('RATE_LIMIT_STRICT', 'true');
      const result = await checkAiQuota('user-1');
      expect(result.allowed).toBe(false);
    });

    it('allows calls under the plan limit and reports remaining', async () => {
      stubUpstashEnv();
      mockGetUserPlan.mockResolvedValue('free'); // 100/month
      mockEval.mockResolvedValue(40);

      const result = await checkAiQuota('user-1');
      expect(result).toEqual({ allowed: true, remaining: 60 });
      // Key is per-user per-UTC-month.
      expect(mockEval).toHaveBeenCalledWith(expect.stringContaining("redis.call('EXPIRE'"), [expect.stringMatching(/^aiq:user-1:\d{4}-\d{2}$/)], [100, 35 * 24 * 60 * 60]);
    });

    it('arms the TTL on the first call of the month', async () => {
      stubUpstashEnv();
      mockEval.mockResolvedValue(1);

      await checkAiQuota('user-1');
      expect(mockEval).toHaveBeenCalledTimes(1);
    });

    it('blocks once the plan allowance is exhausted', async () => {
      stubUpstashEnv();
      mockGetUserPlan.mockResolvedValue('free'); // 100/month
      mockEval.mockResolvedValue(101);

      const result = await checkAiQuota('user-1');
      expect(result).toEqual({ allowed: false, remaining: 0 });
    });

    it('uses the resolved plan limit (writer: 1500)', async () => {
      stubUpstashEnv();
      mockGetUserPlan.mockResolvedValue('writer');
      mockEval.mockResolvedValue(101); // over free limit, well under writer

      const result = await checkAiQuota('user-1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1399);
    });

    it('fails open when Redis is unreachable', async () => {
      stubUpstashEnv();
      mockEval.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await checkAiQuota('user-1');
      expect(result.allowed).toBe(true);
    });
  });

  describe('enforceAiQuota', () => {
    it('never meters embed-mode deployments', async () => {
      stubUpstashEnv();
      const res = await enforceAiQuota({ userId: 'embed-mode', embedMode: true });
      expect(res).toBeNull();
      expect(mockEval).not.toHaveBeenCalled();
    });

    it('returns null while the allowance holds', async () => {
      stubUpstashEnv();
      mockEval.mockResolvedValue(5);
      const res = await enforceAiQuota({ userId: 'user-1', embedMode: false });
      expect(res).toBeNull();
    });

    it('returns a 429 quota_exceeded response when exhausted', async () => {
      stubUpstashEnv();
      mockGetUserPlan.mockResolvedValue('free');
      mockEval.mockResolvedValue(101);

      const res = await enforceAiQuota({ userId: 'user-1', embedMode: false });
      expect(res).not.toBeNull();
      expect(res!.status).toBe(429);
      const body = await res!.json();
      expect(body.ok).toBe(false);
      expect(body.code).toBe('quota_exceeded');
      expect(body.message).toMatch(/allowance/i);
    });
  });

  // A1 — sidecar peek: read-only check that never increments the counter.
  describe('peekAiQuota', () => {
    it('fails closed on production Redis read failures', async () => {
      stubUpstashEnv(); vi.stubEnv('NODE_ENV', 'production');
      mockGet.mockRejectedValue(new Error('timeout'));
      expect(await peekAiQuota('user-1')).toEqual({ allowed: false, unavailable: true });
    });
    it('fails open when Upstash is not configured (no read)', async () => {
      const result = await peekAiQuota('user-1');
      expect(result.allowed).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('fails closed without Upstash in production strict mode', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('RATE_LIMIT_STRICT', 'true');
      const result = await peekAiQuota('user-1');
      expect(result.allowed).toBe(false);
    });

    it('allows when under the limit and NEVER increments', async () => {
      stubUpstashEnv();
      mockGetUserPlan.mockResolvedValue('free'); // 100/month
      mockGet.mockResolvedValue(40);

      const result = await peekAiQuota('user-1');
      expect(result.allowed).toBe(true);
      expect(mockGet).toHaveBeenCalledWith(expect.stringMatching(/^aiq:user-1:\d{4}-\d{2}$/));
      // Peeking must not consume quota.
      expect(mockEval).not.toHaveBeenCalled();
    });

    it('blocks when already at/over the limit', async () => {
      stubUpstashEnv();
      mockGetUserPlan.mockResolvedValue('free'); // 100/month
      mockGet.mockResolvedValue(100);

      const result = await peekAiQuota('user-1');
      expect(result.allowed).toBe(false);
      expect(mockEval).not.toHaveBeenCalled();
    });

    it('treats a missing counter as zero usage', async () => {
      stubUpstashEnv();
      mockGet.mockResolvedValue(null);
      const result = await peekAiQuota('user-1');
      expect(result.allowed).toBe(true);
    });

    it('fails open when Redis is unreachable', async () => {
      stubUpstashEnv();
      mockGet.mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await peekAiQuota('user-1');
      expect(result.allowed).toBe(true);
    });
  });

  describe('enforceAiQuotaPeek', () => {
    it('never meters embed-mode deployments', async () => {
      stubUpstashEnv();
      const res = await enforceAiQuotaPeek({ userId: 'embed-mode', embedMode: true });
      expect(res).toBeNull();
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('returns null while the allowance holds (no increment)', async () => {
      stubUpstashEnv();
      mockGet.mockResolvedValue(5);
      const res = await enforceAiQuotaPeek({ userId: 'user-1', embedMode: false });
      expect(res).toBeNull();
      expect(mockEval).not.toHaveBeenCalled();
    });

    it('returns a 429 when the user is already over quota', async () => {
      stubUpstashEnv();
      mockGetUserPlan.mockResolvedValue('free');
      mockGet.mockResolvedValue(150);

      const res = await enforceAiQuotaPeek({ userId: 'user-1', embedMode: false });
      expect(res).not.toBeNull();
      expect(res!.status).toBe(429);
      const body = await res!.json();
      expect(body.code).toBe('quota_exceeded');
      expect(mockEval).not.toHaveBeenCalled();
    });
  });
});
