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

const mockStoryFindFirst = vi.fn(async (): Promise<unknown> => null);
const mockCollabFindFirst = vi.fn(async (): Promise<unknown> => null);
const mockChaptersFindMany = vi.fn(async (): Promise<unknown[]> => []);
const mockChapterVersionsFindMany = vi.fn(async () => []);
const mockSnapshotsFindMany = vi.fn(async () => []);
const mockSessionsFindMany = vi.fn(async () => []);
const mockChatMessagesFindMany = vi.fn(async () => []);
const mockInsightsFindMany = vi.fn(async () => []);

vi.mock('@/db/client', () => ({
  db: vi.fn(() => ({
    // Subquery builder used by fetchChapterVersions (chapter ids for story)
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ['chapter-ids-subquery']),
      })),
    })),
    query: {
      stories: { findFirst: mockStoryFindFirst },
      storyCollaborators: { findFirst: mockCollabFindFirst },
      chapters: { findMany: mockChaptersFindMany },
      chapterVersions: { findMany: mockChapterVersionsFindMany },
      storySnapshots: { findMany: mockSnapshotsFindMany },
      sessions: { findMany: mockSessionsFindMany },
      chatMessages: { findMany: mockChatMessagesFindMany },
      writerInsights: { findMany: mockInsightsFindMany },
    },
  })),
  isDatabaseConfigured: vi.fn(() => true),
}));

vi.mock('@/db/schema', () => ({
  stories: { id: 'id', ownerId: 'ownerId', updatedAt: 'updatedAt' },
  storyCollaborators: { storyId: 'storyId', userId: 'userId', role: 'role' },
  chapters: { id: 'id', storyId: 'storyId', updatedAt: 'updatedAt' },
  chapterVersions: { id: 'id', chapterId: 'chapterId', createdAt: 'createdAt' },
  storySnapshots: { id: 'id', storyId: 'storyId', createdAt: 'createdAt' },
  sessions: { id: 'id', storyId: 'storyId', startedAt: 'startedAt' },
  chatMessages: { id: 'id', storyId: 'storyId', timestamp: 'timestamp' },
  writerInsights: { id: 'id', storyId: 'storyId', lastObservedAt: 'lastObservedAt' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
  gte: vi.fn((...args: any[]) => args),
  inArray: vi.fn((...args: any[]) => args),
}));

import { GET } from '@/app/api/sync/pull/route';

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/sync/pull');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString(), { method: 'GET' });
}

describe('GET /api/sync/pull', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoryFindFirst.mockResolvedValue(null);
    mockCollabFindFirst.mockResolvedValue(null);
    mockChaptersFindMany.mockResolvedValue([]);
    mockChapterVersionsFindMany.mockResolvedValue([]);
    mockSnapshotsFindMany.mockResolvedValue([]);
    mockSessionsFindMany.mockResolvedValue([]);
    mockChatMessagesFindMany.mockResolvedValue([]);
    mockInsightsFindMany.mockResolvedValue([]);
  });

  it('returns empty response when no story exists for user', async () => {
    mockStoryFindFirst.mockResolvedValue(null);

    const req = makeRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.storyId).toBeNull();
    expect(data.data.story).toBeNull();
    expect(data.data.chapters).toEqual([]);
    expect(data.data.chapterVersions).toEqual([]);
    expect(data.data.storySnapshots).toEqual([]);
    expect(data.data.sessions).toEqual([]);
    expect(data.data.chatMessages).toEqual([]);
    expect(data.data.writerInsights).toEqual([]);
  });

  it('returns story + chapters when story exists', async () => {
    const now = new Date();
    mockStoryFindFirst.mockResolvedValue({
      id: 'story-1',
      ownerId: 'user_test',
      title: 'My Story',
      state: { title: 'My Story', genre: 'fantasy' },
      updatedAt: now,
    });

    mockChaptersFindMany.mockResolvedValue([
      {
        id: 'ch-1',
        storyId: 'story-1',
        title: 'Chapter One',
        content: 'Once upon a time',
        summary: null,
        canonStatus: 'flexible',
        source: null,
        orderIndex: 0,
        wordCount: 4,
        version: 1,
        updatedAt: now,
      },
    ]);

    const req = makeRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.storyId).toBe('story-1');
    expect(data.data.story).toBeDefined();
    expect(data.data.story.title).toBe('My Story');
    expect(data.data.chapters).toHaveLength(1);
    expect(data.data.chapters[0].id).toBe('ch-1');
    expect(data.data.chapters[0].title).toBe('Chapter One');
  });

  it('filters by since timestamp when provided', async () => {
    const now = new Date();
    mockStoryFindFirst.mockResolvedValue({
      id: 'story-1',
      ownerId: 'user_test',
      title: 'My Story',
      state: {},
      updatedAt: now,
    });

    mockChaptersFindMany.mockResolvedValue([]);

    const req = makeRequest({ since: '2026-01-01T00:00:00Z' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    // The route should have passed the since param to the query helpers
    // and chapters should respect the filter (returning empty here since mock returns empty)
    expect(data.data.chapters).toEqual([]);
  });

  it('filters by storyId when provided', async () => {
    const now = new Date();
    mockStoryFindFirst.mockResolvedValue({
      id: 'specific-story',
      ownerId: 'user_test',
      title: 'Specific Story',
      state: {},
      updatedAt: now,
    });

    const req = makeRequest({ storyId: 'specific-story' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.storyId).toBe('specific-story');

    // Verify findFirst was called (which will use the storyId filter internally)
    expect(mockStoryFindFirst).toHaveBeenCalled();
  });

  it('allows a collaborator to pull a shared story by storyId', async () => {
    const now = new Date();
    // Story owned by someone else…
    mockStoryFindFirst.mockResolvedValue({
      id: 'shared-story',
      ownerId: 'user_other',
      title: 'Shared Story',
      state: {},
      updatedAt: now,
    });
    // …but the caller has a collaborator row
    mockCollabFindFirst.mockResolvedValue({ storyId: 'shared-story', userId: 'user_test', role: 'reader' });

    const req = makeRequest({ storyId: 'shared-story' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.data.storyId).toBe('shared-story');
    expect(data.data.story).not.toBeNull();
  });

  it('returns empty payload for a storyId with no access', async () => {
    mockStoryFindFirst.mockResolvedValue({
      id: 'private-story',
      ownerId: 'user_other',
      title: 'Private',
      state: {},
      updatedAt: new Date(),
    });
    mockCollabFindFirst.mockResolvedValue(null);

    const req = makeRequest({ storyId: 'private-story' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.storyId).toBeNull();
    expect(data.data.story).toBeNull();
  });

  it('returns 400 for an invalid since timestamp', async () => {
    const req = makeRequest({ since: 'not-a-date' });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.message).toContain('since');
    // Validation must reject before any story lookup happens
    expect(mockStoryFindFirst).not.toHaveBeenCalled();
  });

  it('filters chapterVersions in SQL rather than fetching the whole table', async () => {
    mockStoryFindFirst.mockResolvedValue({
      id: 'story-1',
      ownerId: 'user_test',
      title: 'My Story',
      state: {},
      updatedAt: new Date(),
    });

    const req = makeRequest({ since: '2026-01-01T00:00:00Z' });
    const res = await GET(req);
    expect(res.status).toBe(200);

    // findMany must be called WITH a where clause (subquery scoping +
    // createdAt filter), never as an unfiltered full-table scan.
    expect(mockChapterVersionsFindMany).toHaveBeenCalledTimes(1);
    const arg = (mockChapterVersionsFindMany.mock.calls[0] as unknown[])[0] as { where?: unknown } | undefined;
    expect(arg?.where).toBeDefined();
  });

  it('captures the watermark before queries run (pre-query minus overlap)', async () => {
    mockStoryFindFirst.mockResolvedValue({
      id: 'story-1',
      ownerId: 'user_test',
      title: 'My Story',
      state: {},
      updatedAt: new Date(),
    });

    let queryFinishedAt = 0;
    mockChaptersFindMany.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30));
      queryFinishedAt = Date.now();
      return [];
    });

    const req = makeRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    const watermark = new Date(data.data.serverTimestamp).getTime();

    // Watermark must predate query completion by at least the ~2s overlap,
    // so rows committed during the query window are re-pulled next time.
    expect(queryFinishedAt).toBeGreaterThan(0);
    expect(queryFinishedAt - watermark).toBeGreaterThanOrEqual(2000);
  });

  it('returns 500 when database not configured', async () => {
    const { isDatabaseConfigured } = await import('@/db/client');
    vi.mocked(isDatabaseConfigured).mockReturnValueOnce(false);

    const req = makeRequest();
    const res = await GET(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.message).toContain('Database not configured');
  });

  it('includes serverTimestamp in response', async () => {
    mockStoryFindFirst.mockResolvedValue(null);

    const req = makeRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.serverTimestamp).toBeDefined();
    expect(typeof data.data.serverTimestamp).toBe('string');
    // Should be a valid ISO date string
    expect(() => new Date(data.data.serverTimestamp)).not.toThrow();
    expect(new Date(data.data.serverTimestamp).toISOString()).toBe(data.data.serverTimestamp);
  });
});
