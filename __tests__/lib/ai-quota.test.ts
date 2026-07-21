import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Mocks ──
const mockIncr = vi.fn(async (): Promise<number> => 1);
const mockExpire = vi.fn(async (): Promise<number> => 1);
vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: vi.fn(() => ({ incr: mockIncr, expire: mockExpire })),
  },
}));

const mockGetUserPlan = vi.fn(async (_userId?: unknown): Promise<string> => 'free');
vi.mock('@/lib/get-user-plan', () => ({
  // Lazy wrapper: the factory is hoisted above the const initializer, so it
  // must not touch mockGetUserPlan until call time.
  getUserPlan: (userId: unknown) => mockGetUserPlan(userId),
}));

import { checkAiQuota, enforceAiQuota } from '@/lib/ai-quota';

function stubUpstashEnv() {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
}

describe('lib/ai-quota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);
    mockGetUserPlan.mockResolvedValue('free');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('checkAiQuota', () => {
    it('fails open when Upstash is not configured', async () => {
      const result = await checkAiQuota('user-1');
      expect(result.allowed).toBe(true);
      expect(mockIncr).not.toHaveBeenCalled();
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
      mockIncr.mockResolvedValue(40);

      const result = await checkAiQuota('user-1');
      expect(result).toEqual({ allowed: true, remaining: 60 });
      // Key is per-user per-UTC-month.
      expect(mockIncr).toHaveBeenCalledWith(expect.stringMatching(/^aiq:user-1:\d{4}-\d{2}$/));
      // TTL is only armed on the first call of the month.
      expect(mockExpire).not.toHaveBeenCalled();
    });

    it('arms the TTL on the first call of the month', async () => {
      stubUpstashEnv();
      mockIncr.mockResolvedValue(1);

      await checkAiQuota('user-1');
      expect(mockExpire).toHaveBeenCalledTimes(1);
    });

    it('blocks once the plan allowance is exhausted', async () => {
      stubUpstashEnv();
      mockGetUserPlan.mockResolvedValue('free'); // 100/month
      mockIncr.mockResolvedValue(101);

      const result = await checkAiQuota('user-1');
      expect(result).toEqual({ allowed: false, remaining: 0 });
    });

    it('uses the resolved plan limit (writer: 1500)', async () => {
      stubUpstashEnv();
      mockGetUserPlan.mockResolvedValue('writer');
      mockIncr.mockResolvedValue(101); // over free limit, well under writer

      const result = await checkAiQuota('user-1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1399);
    });

    it('fails open when Redis is unreachable', async () => {
      stubUpstashEnv();
      mockIncr.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await checkAiQuota('user-1');
      expect(result.allowed).toBe(true);
    });
  });

  describe('enforceAiQuota', () => {
    it('never meters embed-mode deployments', async () => {
      stubUpstashEnv();
      const res = await enforceAiQuota({ userId: 'embed-mode', embedMode: true });
      expect(res).toBeNull();
      expect(mockIncr).not.toHaveBeenCalled();
    });

    it('returns null while the allowance holds', async () => {
      stubUpstashEnv();
      mockIncr.mockResolvedValue(5);
      const res = await enforceAiQuota({ userId: 'user-1', embedMode: false });
      expect(res).toBeNull();
    });

    it('returns a 429 quota_exceeded response when exhausted', async () => {
      stubUpstashEnv();
      mockGetUserPlan.mockResolvedValue('free');
      mockIncr.mockResolvedValue(101);

      const res = await enforceAiQuota({ userId: 'user-1', embedMode: false });
      expect(res).not.toBeNull();
      expect(res!.status).toBe(429);
      const body = await res!.json();
      expect(body.ok).toBe(false);
      expect(body.code).toBe('quota_exceeded');
      expect(body.message).toMatch(/allowance/i);
    });
  });
});
