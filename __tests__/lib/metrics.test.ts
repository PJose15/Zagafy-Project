import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub 'server-only' so the module loads in Vitest
vi.mock('server-only', () => ({}));

// Stub Sentry — the metrics module uses dynamic import('@sentry/nextjs')
vi.mock('@sentry/nextjs', () => ({
  getActiveSpan: vi.fn(() => ({
    setAttribute: vi.fn(),
  })),
  startSpan: vi.fn((_opts: unknown, fn: () => unknown) => fn()),
}));

// Stub posthog-node
const mockCapture = vi.fn();
const mockShutdown = vi.fn().mockResolvedValue(undefined);
vi.mock('posthog-node', () => ({
  PostHog: vi.fn().mockImplementation(() => ({
    capture: mockCapture,
    shutdown: mockShutdown,
  })),
}));

const originalEnv = { ...process.env };

/**
 * In dev mode the logger calls console.log('[INFO]', msg, ctx) with
 * separate arguments. This helper joins all args so we can search the
 * full output string.
 */
function joinArgs(args: unknown[]): string {
  return args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
}

describe('lib/metrics', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SENTRY_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test123';
    mockCapture.mockClear();
    mockShutdown.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // -- estimateTokenCost --------------------------------------------------

  describe('estimateTokenCost', () => {
    it('calculates cost for a known Gemini model', async () => {
      const { estimateTokenCost } = await import('@/lib/metrics');
      // gemini-2.5-flash: input $0.00015/1K, output $0.0006/1K
      // 1000 input + 1000 output = $0.00075 = 0.075 cents
      const cost = estimateTokenCost('gemini-2.5-flash', 1000, 1000);
      expect(cost).toBeCloseTo(0.075, 3);
    });

    it('calculates cost for a known Anthropic model', async () => {
      const { estimateTokenCost } = await import('@/lib/metrics');
      // claude-sonnet-4-5: input $0.003/1K, output $0.015/1K
      // 1000 input + 500 output = $0.003 + $0.0075 = $0.0105 = 1.05 cents
      const cost = estimateTokenCost('claude-sonnet-4-5-20250929', 1000, 500);
      expect(cost).toBeCloseTo(1.05, 3);
    });

    it('uses conservative default cost for unknown models', async () => {
      const { estimateTokenCost } = await import('@/lib/metrics');
      const cost = estimateTokenCost('unknown-model-v9', 1000, 1000);
      expect(cost).toBeCloseTo(1.8, 3);
    });

    it('returns 0 for zero tokens', async () => {
      const { estimateTokenCost } = await import('@/lib/metrics');
      expect(estimateTokenCost('gemini-2.5-flash', 0, 0)).toBe(0);
    });

    it('handles large token counts without overflow', async () => {
      const { estimateTokenCost } = await import('@/lib/metrics');
      // 1M input + 1M output with gemini-2.5-flash = $0.75 = 75 cents
      const cost = estimateTokenCost('gemini-2.5-flash', 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(75, 1);
    });
  });

  // -- recordEndpointMetric -----------------------------------------------

  describe('recordEndpointMetric', () => {
    it('does not throw for a valid metric', async () => {
      const { recordEndpointMetric } = await import('@/lib/metrics');
      expect(() =>
        recordEndpointMetric({
          endpoint: '/api/chat',
          method: 'POST',
          statusCode: 200,
          durationMs: 150,
          requestId: 'req-123',
        }),
      ).not.toThrow();
    });

    it('marks 5xx as errors in the structured log', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { recordEndpointMetric } = await import('@/lib/metrics');
      recordEndpointMetric({
        endpoint: '/api/chat',
        method: 'POST',
        statusCode: 500,
        durationMs: 250,
        requestId: 'req-500',
      });
      const found = consoleSpy.mock.calls.some((call) => {
        const s = joinArgs(call);
        return s.includes('metric:endpoint') && s.includes('"error":true');
      });
      expect(found).toBe(true);
      consoleSpy.mockRestore();
    });

    it('does not throw for 4xx status codes', async () => {
      const { recordEndpointMetric } = await import('@/lib/metrics');
      expect(() =>
        recordEndpointMetric({
          endpoint: '/api/chat',
          method: 'POST',
          statusCode: 429,
          durationMs: 5,
          requestId: 'req-429',
        }),
      ).not.toThrow();
    });
  });

  // -- recordAICost -------------------------------------------------------

  describe('recordAICost', () => {
    it('does not throw for valid input', async () => {
      const { recordAICost } = await import('@/lib/metrics');
      expect(() =>
        recordAICost({
          userId: 'user_abc',
          model: 'gemini-2.5-flash',
          inputTokens: 500,
          outputTokens: 1200,
          endpoint: '/api/chat',
          requestId: 'req-ai',
        }),
      ).not.toThrow();
    });

    it('logs a warning when cost exceeds threshold', async () => {
      process.env.DAILY_AI_SPEND_ALERT_CENTS = '1';
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { recordAICost } = await import('@/lib/metrics');
      // claude-sonnet with 100K input + 50K output = high cost
      recordAICost({
        userId: 'user_big',
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 100_000,
        outputTokens: 50_000,
        endpoint: '/api/character-chat',
      });
      const warned = consoleSpy.mock.calls.some((call) => {
        const s = joinArgs(call);
        return s.includes('call_exceeds_threshold');
      });
      expect(warned).toBe(true);
      consoleSpy.mockRestore();
    });

    it('does not warn when cost is below threshold', async () => {
      process.env.DAILY_AI_SPEND_ALERT_CENTS = '10000';
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { recordAICost } = await import('@/lib/metrics');
      recordAICost({
        userId: 'user_small',
        model: 'gemini-2.5-flash',
        inputTokens: 100,
        outputTokens: 200,
        endpoint: '/api/chat',
      });
      const warned = consoleSpy.mock.calls.some((call) => {
        const s = joinArgs(call);
        return s.includes('call_exceeds_threshold');
      });
      expect(warned).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  // -- recordSyncQueueDepth -----------------------------------------------

  describe('recordSyncQueueDepth', () => {
    it('does not throw', async () => {
      const { recordSyncQueueDepth } = await import('@/lib/metrics');
      expect(() => recordSyncQueueDepth(42, 'user_sync')).not.toThrow();
      expect(() => recordSyncQueueDepth(0)).not.toThrow();
    });
  });

  // -- withMetrics --------------------------------------------------------

  describe('withMetrics', () => {
    it('returns a function that calls the inner handler', async () => {
      const { withMetrics } = await import('@/lib/metrics');
      const { NextResponse } = await import('next/server');

      const inner = vi.fn().mockResolvedValue(
        NextResponse.json({ ok: true }, { status: 200 }),
      );
      const wrapped = withMetrics('/api/test', inner);

      const req = new Request('http://localhost/api/test', {
        method: 'POST',
      }) as unknown as import('next/server').NextRequest;

      const res = await wrapped(req);
      expect(inner).toHaveBeenCalledOnce();
      expect(res.status).toBe(200);
    });

    it('records the correct status code on success', async () => {
      const { withMetrics } = await import('@/lib/metrics');
      const { NextResponse } = await import('next/server');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const inner = vi.fn().mockResolvedValue(
        NextResponse.json({ ok: true }, { status: 201 }),
      );
      const wrapped = withMetrics('/api/create', inner);

      const req = new Request('http://localhost/api/create', {
        method: 'POST',
      }) as unknown as import('next/server').NextRequest;

      await wrapped(req);

      const found = consoleSpy.mock.calls.some((call) => {
        const s = joinArgs(call);
        return s.includes('metric:endpoint') && s.includes('"statusCode":201');
      });
      expect(found).toBe(true);
      consoleSpy.mockRestore();
    });

    it('records status 500 when the handler throws', async () => {
      const { withMetrics } = await import('@/lib/metrics');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const inner = vi.fn().mockRejectedValue(new Error('kaboom'));
      const wrapped = withMetrics('/api/fail', inner);

      const req = new Request('http://localhost/api/fail', {
        method: 'GET',
      }) as unknown as import('next/server').NextRequest;

      await expect(wrapped(req)).rejects.toThrow('kaboom');

      const found = consoleSpy.mock.calls.some((call) => {
        const s = joinArgs(call);
        return s.includes('metric:endpoint') && s.includes('"statusCode":500');
      });
      expect(found).toBe(true);
      consoleSpy.mockRestore();
    });

    it('preserves the response object from the handler', async () => {
      const { withMetrics } = await import('@/lib/metrics');
      const { NextResponse } = await import('next/server');

      const body = { ok: true, data: { id: 'x' } };
      const inner = vi.fn().mockResolvedValue(
        NextResponse.json(body, { status: 200 }),
      );
      const wrapped = withMetrics('/api/test', inner);

      const req = new Request('http://localhost/api/test', {
        method: 'POST',
      }) as unknown as import('next/server').NextRequest;

      const res = await wrapped(req);
      const json = await res.json();
      expect(json.data.id).toBe('x');
    });

    it('measures latency as a positive number', async () => {
      const { withMetrics } = await import('@/lib/metrics');
      const { NextResponse } = await import('next/server');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const inner = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return NextResponse.json({ ok: true });
      });
      const wrapped = withMetrics('/api/slow', inner);

      const req = new Request('http://localhost/api/slow', {
        method: 'POST',
      }) as unknown as import('next/server').NextRequest;

      await wrapped(req);

      const found = consoleSpy.mock.calls.some((call) => {
        const s = joinArgs(call);
        return s.includes('metric:endpoint') && s.includes('durationMs');
      });
      expect(found).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  // -- Graceful degradation -----------------------------------------------

  describe('graceful degradation', () => {
    it('recordEndpointMetric works without Sentry DSN', async () => {
      delete process.env.SENTRY_DSN;
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
      const { recordEndpointMetric } = await import('@/lib/metrics');
      expect(() =>
        recordEndpointMetric({
          endpoint: '/api/test',
          method: 'GET',
          statusCode: 200,
          durationMs: 10,
          requestId: 'req-no-sentry',
        }),
      ).not.toThrow();
    });

    it('recordEndpointMetric works without PostHog key', async () => {
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
      const { recordEndpointMetric } = await import('@/lib/metrics');
      expect(() =>
        recordEndpointMetric({
          endpoint: '/api/test',
          method: 'GET',
          statusCode: 200,
          durationMs: 10,
          requestId: 'req-no-ph',
          userId: 'user_x',
        }),
      ).not.toThrow();
    });

    it('recordAICost works without any external services', async () => {
      delete process.env.SENTRY_DSN;
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
      const { recordAICost } = await import('@/lib/metrics');
      expect(() =>
        recordAICost({
          userId: 'user_x',
          model: 'gemini-2.5-flash',
          inputTokens: 100,
          outputTokens: 200,
          endpoint: '/api/chat',
        }),
      ).not.toThrow();
    });

    it('withMetrics works without Sentry DSN', async () => {
      delete process.env.SENTRY_DSN;
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;
      const { withMetrics } = await import('@/lib/metrics');
      const { NextResponse } = await import('next/server');

      const inner = vi.fn().mockResolvedValue(
        NextResponse.json({ ok: true }),
      );
      const wrapped = withMetrics('/api/test', inner);

      const req = new Request('http://localhost/api/test', {
        method: 'POST',
      }) as unknown as import('next/server').NextRequest;

      const res = await wrapped(req);
      expect(res.status).toBe(200);
      expect(inner).toHaveBeenCalledOnce();
    });
  });
});
