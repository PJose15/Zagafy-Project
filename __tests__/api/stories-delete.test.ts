import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireCloudUser: vi.fn(async () => ({ userId: 'user_test', embedMode: false })),
  isAuthError: vi.fn((r: any) => r instanceof Response || (r && typeof r.status === 'number' && typeof r.json === 'function')),
}));

vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => null) }));

vi.mock('@/lib/logger', () => ({
  createRouteLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

// getStoryAccess controls the owner/editor/reader/none matrix.
const mockGetStoryAccess = vi.fn(async (): Promise<string | null> => 'owner');
vi.mock('@/lib/collab', () => ({
  getStoryAccess: (storyId: unknown, userId: unknown) => mockGetStoryAccess(),
}));

const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
vi.mock('@/db/client', () => ({
  db: vi.fn(() => ({
    delete: vi.fn(() => ({ where: mockDeleteWhere })),
  })),
  isDatabaseConfigured: vi.fn(() => true),
}));

vi.mock('@/db/schema', () => ({
  stories: { id: 'id', ownerId: 'ownerId' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: any[]) => a),
  and: vi.fn((...a: any[]) => a),
}));

import { DELETE } from '@/app/api/stories/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/stories', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('DELETE /api/stories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStoryAccess.mockResolvedValue('owner');
  });

  it('deletes the story when the caller is the owner', async () => {
    const res = await DELETE(makeRequest({ storyId: 'story-1' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.deleted).toBe(true);
    expect(mockDeleteWhere).toHaveBeenCalled();
  });

  it('returns 403 when an editor tries to delete', async () => {
    mockGetStoryAccess.mockResolvedValue('editor');
    const res = await DELETE(makeRequest({ storyId: 'story-1' }));
    expect(res.status).toBe(403);
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });

  it('returns 403 when a reader tries to delete', async () => {
    mockGetStoryAccess.mockResolvedValue('reader');
    const res = await DELETE(makeRequest({ storyId: 'story-1' }));
    expect(res.status).toBe(403);
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });

  it('is idempotent: no access / nonexistent story returns 200 deleted:false', async () => {
    mockGetStoryAccess.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ storyId: 'ghost' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.deleted).toBe(false);
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });

  it('returns 400 when storyId is missing', async () => {
    const res = await DELETE(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/stories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });
});
