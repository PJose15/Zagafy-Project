import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(async () => ({ userId: 'user_test', embedMode: false })),
  requireCloudUser: vi.fn(async () => ({ userId: 'user_test', embedMode: false })),
  isAuthError: vi.fn((r: any) => r instanceof Response || (r && typeof r.status === 'number' && typeof r.json === 'function')),
}));

vi.mock('@/lib/logger', () => ({
  createRouteLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Plan resolver — default paid plan so pre-existing tests are unaffected;
// the plan-gating tests flip this to 'free'.
const mockGetUserPlan = vi.fn(async (_userId?: unknown): Promise<string> => 'writer');
vi.mock('@/lib/get-user-plan', () => ({
  // Lazy wrapper: the factory is hoisted above the const initializer, so it
  // must not touch mockGetUserPlan until call time.
  getUserPlan: (userId: unknown) => mockGetUserPlan(userId),
}));

// Track calls for assertions
const mockInsertValues = vi.fn().mockReturnThis();
const mockOnConflictDoUpdate = vi.fn().mockReturnThis();
const mockOnConflictDoNothing = vi.fn().mockReturnThis();
const mockUpdateSet = vi.fn().mockReturnThis();
const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);

const mockStoryFindFirst = vi.fn(async (): Promise<unknown> => ({ id: 'story-1', ownerId: 'user_test' }));
const mockCollabFindFirst = vi.fn(async (): Promise<unknown> => null);
const mockChapterFindFirst = vi.fn(async () => null);

vi.mock('@/db/client', () => ({
  db: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: mockInsertValues.mockReturnValue({
        onConflictDoUpdate: mockOnConflictDoUpdate.mockReturnValue({
          onConflictDoNothing: mockOnConflictDoNothing,
        }),
        onConflictDoNothing: mockOnConflictDoNothing,
      }),
    })),
    update: vi.fn(() => ({
      set: mockUpdateSet.mockReturnValue({
        where: mockUpdateWhere,
      }),
    })),
    delete: vi.fn(() => ({
      where: mockDeleteWhere,
    })),
    query: {
      stories: { findFirst: mockStoryFindFirst },
      storyCollaborators: { findFirst: mockCollabFindFirst },
      chapters: { findFirst: mockChapterFindFirst },
      chapterVersions: { findFirst: vi.fn(async () => null) },
    },
  })),
  isDatabaseConfigured: vi.fn(() => true),
}));

vi.mock('@/db/schema', () => ({
  stories: { id: 'id', ownerId: 'ownerId' },
  storyCollaborators: { storyId: 'storyId', userId: 'userId', role: 'role' },
  chapters: { id: 'id', storyId: 'storyId' },
  chapterVersions: { id: 'id' },
  storySnapshots: { id: 'id', storyId: 'storyId' },
  sessions: { id: 'id', storyId: 'storyId' },
  chatMessages: { id: 'id', storyId: 'storyId' },
  writerInsights: { id: 'id', storyId: 'storyId' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
  gte: vi.fn((...args: any[]) => args),
}));

import { POST } from '@/app/api/sync/push/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/sync/push', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoryFindFirst.mockResolvedValue({ id: 'story-1', ownerId: 'user_test' });
    mockCollabFindFirst.mockResolvedValue(null);
    mockGetUserPlan.mockResolvedValue('writer');
  });

  it('returns 403 with forbidden when the story owner is on the free plan (no cloud sync)', async () => {
    mockGetUserPlan.mockResolvedValue('free');

    const res = await POST(makeRequest({
      storyId: 'story-1',
      storyTitle: 'Test',
      deltas: [
        { entityType: 'story', entityId: 'current', op: 'upsert', payload: { title: 'Test' }, timestamp: Date.now() },
      ],
    }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('forbidden');
    expect(data.message).toMatch(/paid plan/i);
    // Nothing was written.
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it('gates a shared story on the OWNER plan, not the collaborator plan', async () => {
    // Story owned by user_owner (paid check happens against them); the caller
    // user_test is an editor collaborator.
    mockStoryFindFirst.mockResolvedValue({ id: 'story-1', ownerId: 'user_owner' });
    mockCollabFindFirst.mockResolvedValue({ storyId: 'story-1', userId: 'user_test', role: 'editor' });
    mockGetUserPlan.mockResolvedValue('writer');

    const res = await POST(makeRequest({
      storyId: 'story-1',
      storyTitle: 'Test',
      deltas: [
        { entityType: 'story', entityId: 'current', op: 'upsert', payload: { title: 'Test' }, timestamp: Date.now() },
      ],
    }));
    expect(res.status).toBe(200);
    expect(mockGetUserPlan).toHaveBeenCalledWith('user_owner');
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.message).toContain('Invalid JSON');
  });

  it('returns 400 when storyId missing', async () => {
    const req = makeRequest({ deltas: [] });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.message).toContain('storyId');
  });

  it('returns 200 with applied:0 for empty deltas array', async () => {
    const req = makeRequest({ storyId: 'story-1', storyTitle: 'Test', deltas: [] });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.applied).toBe(0);
    expect(data.data.conflicts).toEqual([]);
    expect(data.data.serverTimestamp).toBeDefined();
  });

  it('returns 400 when deltas exceed 500', async () => {
    const deltas = Array.from({ length: 501 }, (_, i) => ({
      entityType: 'chapter',
      entityId: `ch-${i}`,
      op: 'upsert',
      payload: { id: `ch-${i}`, content: 'test' },
      timestamp: Date.now(),
    }));

    const req = makeRequest({ storyId: 'story-1', storyTitle: 'Test', deltas });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.message).toContain('500');
  });

  it('returns 403 when user does not own the story', async () => {
    // Story exists but is owned by someone else and no collaborator row
    mockStoryFindFirst.mockResolvedValue({ id: 'story-other', ownerId: 'user_someone_else' });
    mockCollabFindFirst.mockResolvedValue(null);

    const req = makeRequest({
      storyId: 'story-other',
      storyTitle: 'Test',
      deltas: [
        { entityType: 'story', entityId: 'current', op: 'upsert', payload: { title: 'Test' }, timestamp: Date.now() },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.message).toContain('own');
  });

  it('returns 200 with applied count for valid deltas', async () => {
    const req = makeRequest({
      storyId: 'story-1',
      storyTitle: 'Test Story',
      deltas: [
        { entityType: 'story', entityId: 'current', op: 'upsert', payload: { title: 'Test Story' }, timestamp: Date.now() },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.data.applied).toBe('number');
    expect(Array.isArray(data.data.conflicts)).toBe(true);
    expect(data.data.serverTimestamp).toBeDefined();
  });

  it('returns 403 when a reader collaborator pushes', async () => {
    mockStoryFindFirst.mockResolvedValue({ id: 'story-shared', ownerId: 'user_other' });
    mockCollabFindFirst.mockResolvedValue({ storyId: 'story-shared', userId: 'user_test', role: 'reader' });

    const req = makeRequest({
      storyId: 'story-shared',
      storyTitle: 'Shared',
      deltas: [
        { entityType: 'story', entityId: 'current', op: 'upsert', payload: { title: 'Shared' }, timestamp: Date.now() },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.message).toContain('edit access');
  });

  it('allows an editor collaborator to push (never touching ownerId)', async () => {
    mockStoryFindFirst.mockResolvedValue({ id: 'story-shared', ownerId: 'user_other' });
    mockCollabFindFirst.mockResolvedValue({ storyId: 'story-shared', userId: 'user_test', role: 'editor' });

    const req = makeRequest({
      storyId: 'story-shared',
      storyTitle: 'Shared',
      deltas: [
        { entityType: 'story', entityId: 'current', op: 'upsert', payload: { title: 'Shared' }, timestamp: Date.now() },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.applied).toBe(1);
    // Editor path must NOT go through the story insert/ownership upsert
    expect(mockInsertValues).not.toHaveBeenCalled();
    // Title/updatedAt updates must never set ownerId
    for (const call of mockUpdateSet.mock.calls) {
      expect(call[0]).not.toHaveProperty('ownerId');
    }
  });

  it('guards the writerInsight upsert with a storyId where-clause', async () => {
    const req = makeRequest({
      storyId: 'story-1',
      storyTitle: 'Test',
      deltas: [
        {
          entityType: 'writerInsight',
          entityId: 'insight-1',
          op: 'upsert',
          payload: { category: 'voice', observation: 'test', lastObservedAt: Date.now() },
          timestamp: Date.now(),
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.applied).toBe(1);

    // The insight onConflictDoUpdate must scope its update to the caller's
    // story — mocked eq() returns its args, so where === ['storyId', 'story-1'].
    const insightCall = mockOnConflictDoUpdate.mock.calls.find(
      (c) => c[0]?.target === 'id' && Array.isArray(c[0]?.where),
    );
    expect(insightCall).toBeDefined();
    expect(insightCall![0].where).toEqual(['storyId', 'story-1']);
  });

  it('first push creates the story with an ownership-guarded upsert', async () => {
    // Plan-gate lookup → null (plan falls back to the caller), getStoryAccess
    // lookup → null, existence check → null, post-upsert ownership re-check →
    // row owned by the caller.
    mockStoryFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ownerId: 'user_test' });

    const req = makeRequest({
      storyId: 'story-new',
      storyTitle: 'Brand New',
      deltas: [
        { entityType: 'story', entityId: 'current', op: 'upsert', payload: { title: 'Brand New' }, timestamp: Date.now() },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.applied).toBe(1);

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'story-new', ownerId: 'user_test' }),
    );
    // The conflict update must be guarded so a colliding id owned by another
    // user is never retitled: where === eq(stories.ownerId, userId).
    const storyCall = mockOnConflictDoUpdate.mock.calls.find(
      (c) => c[0]?.target === 'id' && Array.isArray(c[0]?.where),
    );
    expect(storyCall).toBeDefined();
    expect(storyCall![0].where).toEqual(['ownerId', 'user_test']);
  });

  it('returns 403 when a first-push id collides with another user\'s story', async () => {
    // Plan-gate, access lookup and existence check race past a concurrent
    // insert; the post-upsert re-check reveals the row belongs to someone else.
    mockStoryFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ownerId: 'user_someone_else' });

    const req = makeRequest({
      storyId: 'story-collision',
      storyTitle: 'Hijack Attempt',
      deltas: [
        { entityType: 'story', entityId: 'current', op: 'upsert', payload: { title: 'Hijack' }, timestamp: Date.now() },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.message).toContain('own');
    // No deltas may be applied to the foreign story
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it('returns 500 when database not configured', async () => {
    const { isDatabaseConfigured } = await import('@/db/client');
    vi.mocked(isDatabaseConfigured).mockReturnValueOnce(false);

    const req = makeRequest({ storyId: 'story-1', storyTitle: 'Test', deltas: [] });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.message).toContain('Database not configured');
  });
});
