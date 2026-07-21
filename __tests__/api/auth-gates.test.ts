import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 5.13 — SG-01: Auth Gates on All Protected Endpoints.
 *
 * Tests that:
 * 1. Unauthenticated calls to protected endpoints return 401
 * 2. Cross-tenant access attempts return 403
 * 3. Embed-mode bypass works (auth disabled)
 */

const originalEnv = { ...process.env };

// ─── Clerk mock ──────────────────────────────────────────────────
// Controls what requireUser() returns by manipulating the mock auth().

let mockUserId: string | null = null;

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: mockUserId })),
}));

// ─── DB mock (for sync cross-tenant tests) ──────────────────────

const mockStoryFindFirst = vi.fn();
const mockQueryStories = { findFirst: mockStoryFindFirst };
const mockCollabFindFirst = vi.fn(async () => null);

vi.mock('@/db/client', () => ({
  db: vi.fn(() => ({
    query: {
      stories: mockQueryStories,
      storyCollaborators: { findFirst: mockCollabFindFirst },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  })),
  isDatabaseConfigured: vi.fn(() => true),
}));

// ─── Rate limit mock ────────────────────────────────────────────

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
  getRateLimitMode: vi.fn(() => 'memory'),
  getRateLimitHealth: vi.fn(() => ({ reachable: true })),
}));

// ─── Plan resolver mock ─────────────────────────────────────────
// Paid plan by default so the sync plan gate never masks the auth behavior
// under test here.

vi.mock('@/lib/get-user-plan', () => ({
  getUserPlan: vi.fn(async () => 'writer'),
}));

// ─── Gemini mock (for AI routes) ────────────────────────────────

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({
        text: '{"result":"ok"}',
        candidates: [{ finishReason: 'STOP' }],
      }),
    },
    chats: {
      create: vi.fn(() => ({
        sendMessage: vi.fn().mockResolvedValue({
          text: '{"generatedText":"test"}',
          candidates: [{ finishReason: 'STOP' }],
        }),
      })),
    },
  })),
  FinishReason: { SAFETY: 'SAFETY', MAX_TOKENS: 'MAX_TOKENS', STOP: 'STOP', PROHIBITED_CONTENT: 'PROHIBITED_CONTENT', BLOCKLIST: 'BLOCKLIST' },
  HarmCategory: { HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT', HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH', HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT' },
  HarmBlockThreshold: { BLOCK_NONE: 'BLOCK_NONE' },
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING' },
}));

// ─── Sentry mock ────────────────────────────────────────────────

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  withScope: vi.fn((fn: (s: unknown) => void) => fn({ setTag: vi.fn(), setUser: vi.fn(), setContext: vi.fn() })),
}));

function makeRequest(url: string, method = 'POST', body?: unknown) {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const req = new Request(url, init);
  // Attach nextUrl so sync/pull can read searchParams
  (req as unknown as Record<string, unknown>).nextUrl = new URL(url);
  return req as unknown as import('next/server').NextRequest;
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Auth gates (Phase 5.13)', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_123',
      CLERK_SECRET_KEY: 'sk_test_123',
      GEMINI_API_KEY: 'test-key',
      ANTHROPIC_API_KEY: 'test-key',
    };
    // Ensure NOT embed mode for auth tests
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    mockUserId = null;
    mockStoryFindFirst.mockReset();
  });

  // ── 401: Unauthenticated ───────────────────────────────────────

  describe('unauthenticated requests return 401', () => {
    const protectedRoutes = [
      { path: '/api/chat', module: '@/app/api/chat/route', body: { userInput: 'hello', language: 'English', storyContext: '' } },
      { path: '/api/character-chat', module: '@/app/api/character-chat/route', body: { message: 'hi', mode: 'exploration', character: { name: 'A', role: 'R', description: 'D' } } },
      { path: '/api/audit', module: '@/app/api/audit/route', body: { userInput: 'test', language: 'English' } },
      { path: '/api/analyze-character', module: '@/app/api/analyze-character/route', body: { character: { name: 'A' }, language: 'English' } },
      { path: '/api/polish', module: '@/app/api/polish/route', body: { text: 'draft', mode: 'polish' } },
      { path: '/api/micro-prompt', module: '@/app/api/micro-prompt/route', body: { context: 'test', language: 'English' } },
      { path: '/api/story-coach', module: '@/app/api/story-coach/route', body: { storyState: {}, language: 'English' } },
      { path: '/api/closing-question', module: '@/app/api/closing-question/route', body: { sessionSummary: 'test', language: 'English' } },
      { path: '/api/extract-world-bible', module: '@/app/api/extract-world-bible/route', body: { chapters: [], language: 'English' } },
    ];

    for (const route of protectedRoutes) {
      it(`${route.path} → 401`, async () => {
        mockUserId = null; // no session
        const mod = await import(route.module);
        const res = await mod.POST(makeRequest(`http://localhost${route.path}`, 'POST', route.body));
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.code).toBe('unauthorized');
      });
    }

    it('/api/sync/pull → 401', async () => {
      mockUserId = null;
      const mod = await import('@/app/api/sync/pull/route');
      const res = await mod.GET(makeRequest('http://localhost/api/sync/pull', 'GET'));
      expect(res.status).toBe(401);
    });

    it('/api/sync/push → 401', async () => {
      mockUserId = null;
      const mod = await import('@/app/api/sync/push/route');
      const res = await mod.POST(makeRequest('http://localhost/api/sync/push', 'POST', {
        storyId: 'story-1', deltas: [],
      }));
      expect(res.status).toBe(401);
    });
  });

  // ── 403: Cross-tenant ──────────────────────────────────────────

  describe('cross-tenant access returns 403', () => {
    it('/api/sync/push rejects push to another user\'s story', async () => {
      mockUserId = 'user_attacker';

      // Story exists but is owned by user_victim, and the attacker has no
      // collaborator row (mockCollabFindFirst resolves null)
      mockStoryFindFirst.mockResolvedValue({ id: 'story-victim', ownerId: 'user_victim' });

      const mod = await import('@/app/api/sync/push/route');
      const res = await mod.POST(makeRequest('http://localhost/api/sync/push', 'POST', {
        storyId: 'story-victim',
        storyTitle: 'Stolen Story',
        deltas: [{ entityType: 'chapter', entityId: 'ch-1', op: 'upsert', payload: { title: 'x', content: 'x' } }],
      }));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('forbidden');
    });

    it('/api/sync/pull returns null story for non-owned storyId', async () => {
      mockUserId = 'user_attacker';

      // Ownership check: no story belongs to this user with that ID
      mockStoryFindFirst.mockResolvedValue(undefined);

      const mod = await import('@/app/api/sync/pull/route');
      const res = await mod.GET(makeRequest('http://localhost/api/sync/pull?storyId=story-victim', 'GET'));
      expect(res.status).toBe(200);
      const body = await res.json();
      // Returns empty state, never the other user's data
      expect(body.storyId).toBeNull();
      expect(body.chapters).toEqual([]);
    });
  });

  // ── Embed-mode bypass ──────────────────────────────────────────

  describe('embed-mode bypasses auth', () => {
    it('/api/chat succeeds without a Clerk session in embed mode', async () => {
      process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = 'embed';
      mockUserId = null; // no Clerk session

      const mod = await import('@/app/api/chat/route');
      const res = await mod.POST(makeRequest('http://localhost/api/chat', 'POST', {
        userInput: 'Write a scene',
        language: 'English',
        storyContext: 'A dark forest.',
      }));
      // Should NOT be 401 — embed mode bypasses auth
      expect(res.status).not.toBe(401);
    });

    it('/api/sync/push succeeds in embed mode', async () => {
      process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = 'embed';
      mockUserId = null;

      // In embed mode, userId is 'embed-mode'
      mockStoryFindFirst.mockResolvedValue({ id: 'story-1', ownerId: 'embed-mode' });

      const mod = await import('@/app/api/sync/push/route');
      const res = await mod.POST(makeRequest('http://localhost/api/sync/push', 'POST', {
        storyId: 'story-1',
        storyTitle: 'My Story',
        deltas: [],
      }));
      expect(res.status).not.toBe(401);
    });

    it('embed mode returns userId "embed-mode"', async () => {
      process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = 'embed';
      delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

      const { requireUser, isAuthError } = await import('@/lib/auth');
      const result = await requireUser();
      expect(isAuthError(result)).toBe(false);
      if (!isAuthError(result)) {
        expect(result.userId).toBe('embed-mode');
        expect(result.embedMode).toBe(true);
      }
    });
  });

  // ── Public routes stay public ──────────────────────────────────

  describe('public routes remain accessible without auth', () => {
    it('/api/health returns 200 without auth', async () => {
      mockUserId = null;
      const mod = await import('@/app/api/health/route');
      const res = mod.GET();
      expect(res.status).toBe(200);
    });
  });
});
