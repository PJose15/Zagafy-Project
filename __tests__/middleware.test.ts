import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

describe('middleware', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  function makeRequest(headerValues: Record<string, string> = {}) {
    const req = new NextRequest('http://localhost/api/test');
    vi.spyOn(req.headers, 'get').mockImplementation(
      (name: string) => headerValues[name.toLowerCase()] ?? null
    );
    return req;
  }

  // Phase 5.2: middleware return type widened to a union covering both the
  // sync embed-mode path and the async clerkMiddleware-wrapped path. Tests
  // run in embed mode (no Clerk key set), so the actual return is always a
  // sync NextResponse — but we await + cast so the type-narrowing is local.
  async function loadMiddleware() {
    const mod = await import('@/middleware');
    return {
      middleware: async (req: NextRequest): Promise<NextResponse> => {
        const result = await mod.middleware(req);
        return result as NextResponse;
      },
      config: mod.config,
    };
  }

  it('allows requests with no Origin or Referer (server-side/SSR)', async () => {
    const { middleware } = await loadMiddleware();
    const res = await middleware(makeRequest({ host: 'myapp.com' }));
    expect(res.status).not.toBe(403);
  });

  it('allows same-origin request (Origin host matches Host header)', async () => {
    const { middleware } = await loadMiddleware();
    const res = await middleware(makeRequest({
      host: 'myapp.com',
      origin: 'https://myapp.com',
    }));
    expect(res.status).not.toBe(403);
  });

  it('allows same-origin via Referer fallback when Origin is absent', async () => {
    const { middleware } = await loadMiddleware();
    const res = await middleware(makeRequest({
      host: 'myapp.com',
      referer: 'https://myapp.com/some-page',
    }));
    expect(res.status).not.toBe(403);
  });

  it('blocks cross-origin request (different Origin host) with 403', async () => {
    const { middleware } = await loadMiddleware();
    const res = await middleware(makeRequest({
      host: 'myapp.com',
      origin: 'https://evil.com',
    }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('blocks malformed Origin URL with 403', async () => {
    const { middleware } = await loadMiddleware();
    const res = await middleware(makeRequest({
      host: 'myapp.com',
      origin: 'not-a-url',
    }));
    expect(res.status).toBe(403);
  });

  it('blocks malformed Referer URL with 403', async () => {
    const { middleware } = await loadMiddleware();
    const res = await middleware(makeRequest({
      host: 'myapp.com',
      referer: 'not-a-url',
    }));
    expect(res.status).toBe(403);
  });

  it('allows localhost Origin in development mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { middleware } = await loadMiddleware();
    const res = await middleware(makeRequest({
      host: 'myapp.com',
      origin: 'http://localhost:3000',
    }));
    expect(res.status).not.toBe(403);
  });

  it('blocks localhost Origin in production mode', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { middleware } = await loadMiddleware();
    const res = await middleware(makeRequest({
      host: 'myapp.com',
      origin: 'http://localhost:3000',
    }));
    expect(res.status).toBe(403);
  });

  it('config.matcher covers /api/* and skips Next internals + static assets', async () => {
    const { config } = await loadMiddleware();
    // Phase 5.2: matcher widened to cover page routes so Clerk can enforce
    // auth on navigations as well as API calls. The /api/* path is still
    // matched via the second pattern.
    expect(config.matcher).toEqual([
      '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
      '/(api|trpc)(.*)',
    ]);
  });

  it('allows ai.studio Origin (AI Studio iframe embed)', async () => {
    const { middleware } = await loadMiddleware();
    const res = await middleware(makeRequest({
      host: 'myapp.vercel.app',
      origin: 'https://ai.studio',
    }));
    expect(res.status).not.toBe(403);
  });

  it('allows aistudio.google.com Origin', async () => {
    const { middleware } = await loadMiddleware();
    const res = await middleware(makeRequest({
      host: 'myapp.vercel.app',
      origin: 'https://aistudio.google.com',
    }));
    expect(res.status).not.toBe(403);
  });

  it('allows subdomains of ai.studio', async () => {
    const { middleware } = await loadMiddleware();
    const res = await middleware(makeRequest({
      host: 'myapp.vercel.app',
      origin: 'https://apps.ai.studio',
    }));
    expect(res.status).not.toBe(403);
  });

  it('allows ai.studio via Referer when Origin is absent', async () => {
    const { middleware } = await loadMiddleware();
    const res = await middleware(makeRequest({
      host: 'myapp.vercel.app',
      referer: 'https://ai.studio/apps/abc123',
    }));
    expect(res.status).not.toBe(403);
  });

  it('does NOT allow suffix-spoofing attacks like notai.studio', async () => {
    const { middleware } = await loadMiddleware();
    const res = await middleware(makeRequest({
      host: 'myapp.vercel.app',
      origin: 'https://notai.studio',
    }));
    expect(res.status).toBe(403);
  });

  // ── SG-10 (Phase 2.3) — structured CORS deny logging ──
  // The middleware also logs bot signals for the same request, so we filter
  // warn.mock.calls by event tag rather than asserting on call[0].

  type WarnSpy = ReturnType<typeof vi.spyOn>;
  function findEvent(warn: WarnSpy, event: string): Record<string, unknown> | null {
    for (const call of warn.mock.calls) {
      const payload = call[1] as Record<string, unknown> | undefined;
      if (payload && payload.event === event) return payload;
    }
    return null;
  }

  it('emits a structured cors_deny log on 403 (allowlist miss)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { middleware } = await loadMiddleware();
      await middleware(makeRequest({
        host: 'myapp.com',
        origin: 'https://evil.com',
        'user-agent': 'curl/8.0',
        'x-forwarded-for': '203.0.113.7',
      }));
      const payload = findEvent(warn, 'cors_deny');
      expect(payload).not.toBeNull();
      expect(payload!.reason).toBe('origin-and-referer-not-in-allowlist');
      expect(payload!.origin).toBe('https://evil.com');
      expect(payload!.host).toBe('myapp.com');
      expect(payload!.userAgent).toBe('curl/8.0');
      expect(payload!.ip).toBe('203.0.113.7');
      expect(typeof payload!.timestamp).toBe('string');
    } finally {
      warn.mockRestore();
    }
  });

  it('logs reason="invalid-origin-url" when Origin is malformed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { middleware } = await loadMiddleware();
      await middleware(makeRequest({ host: 'myapp.com', origin: 'not-a-url' }));
      const payload = findEvent(warn, 'cors_deny');
      expect(payload).not.toBeNull();
      expect(payload!.reason).toBe('invalid-origin-url');
    } finally {
      warn.mockRestore();
    }
  });

  it('does not emit cors_deny when an allowed embed Origin passes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { middleware } = await loadMiddleware();
      await middleware(makeRequest({
        host: 'myapp.vercel.app',
        origin: 'https://ai.studio',
      }));
      expect(findEvent(warn, 'cors_deny')).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it('does not emit cors_deny when localhost passes the dev allowlist', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { middleware } = await loadMiddleware();
      await middleware(makeRequest({
        host: 'myapp.com',
        origin: 'http://localhost:3000',
      }));
      expect(findEvent(warn, 'cors_deny')).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  // ── Phase 2.4 — bot signals integration ──

  it('emits bot_signals log when the request lacks browser-shaped headers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { middleware } = await loadMiddleware();
      await middleware(makeRequest({
        host: 'myapp.com',
        origin: 'https://myapp.com',
        'user-agent': 'curl/8.0',
      }));
      const payload = findEvent(warn, 'bot_signals');
      expect(payload).not.toBeNull();
      expect(payload!.score).toBeGreaterThanOrEqual(30);
      expect(Array.isArray(payload!.signals)).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});
