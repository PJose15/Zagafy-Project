import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(async () => ({ userId: 'user_test', embedMode: false })),
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

// Track calls for assertions
const mockInsertValues = vi.fn().mockReturnThis();
const mockOnConflictDoUpdate = vi.fn().mockReturnThis();
const mockOnConflictDoNothing = vi.fn().mockReturnThis();
const mockUpdateSet = vi.fn().mockReturnThis();
const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);

const mockStoryFindFirst = vi.fn(async () => ({ id: 'story-1', ownerId: 'user_test' }));
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
      chapters: { findFirst: mockChapterFindFirst },
      chapterVersions: { findFirst: vi.fn(async () => null) },
    },
  })),
  isDatabaseConfigured: vi.fn(() => true),
}));

vi.mock('@/db/schema', () => ({
  stories: { id: 'id', ownerId: 'ownerId' },
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
    mockStoryFindFirst.mockResolvedValue(null); // ownership check fails

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
