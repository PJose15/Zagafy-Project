import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(async () => ({ userId: 'user_owner', embedMode: false })),
  requireCloudUser: vi.fn(async () => ({ userId: 'user_owner', embedMode: false })),
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

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// ── Chainable DB mocks ──
const mockStoryFindFirst = vi.fn(async (): Promise<unknown> => null);
const mockCollabFindFirst = vi.fn(async (): Promise<unknown> => null);
const mockUserFindFirst = vi.fn(async (): Promise<unknown> => null);

const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
const mockInsertValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
const mockSelectWhere = vi.fn(async (): Promise<unknown[]> => []);
const mockSelectChain = {
  from: vi.fn(() => mockSelectChain),
  innerJoin: vi.fn(() => mockSelectChain),
  where: mockSelectWhere,
};

vi.mock('@/db/client', () => ({
  db: vi.fn(() => ({
    query: {
      stories: { findFirst: mockStoryFindFirst },
      storyCollaborators: { findFirst: mockCollabFindFirst },
      users: { findFirst: mockUserFindFirst },
    },
    insert: vi.fn(() => ({ values: mockInsertValues })),
    delete: vi.fn(() => ({ where: mockDeleteWhere })),
    select: vi.fn(() => mockSelectChain),
  })),
  isDatabaseConfigured: vi.fn(() => true),
}));

vi.mock('@/db/schema', () => ({
  stories: { id: 'id', ownerId: 'ownerId', title: 'title', updatedAt: 'updatedAt' },
  storyCollaborators: { storyId: 'storyId', userId: 'userId', role: 'role', addedAt: 'addedAt' },
  users: { id: 'id', email: 'email', name: 'name' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
}));

import { POST, GET, DELETE } from '@/app/api/collaborators/route';
import { GET as GET_SHARED } from '@/app/api/collaborators/shared-with-me/route';

function makeRequest(method: string, body?: unknown, query: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/collaborators');
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** Caller is the story owner. */
function mockOwnerAccess() {
  mockStoryFindFirst.mockResolvedValue({ id: 'story-1', ownerId: 'user_owner' });
  mockCollabFindFirst.mockResolvedValue(null);
}

/** Caller is a collaborator with the given role (story owned by someone else). */
function mockCollaboratorAccess(role: string, userId = 'user_owner') {
  mockStoryFindFirst.mockResolvedValue({ id: 'story-1', ownerId: 'user_other' });
  mockCollabFindFirst.mockResolvedValue({ storyId: 'story-1', userId, role });
}

describe('/api/collaborators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoryFindFirst.mockResolvedValue(null);
    mockCollabFindFirst.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue(null);
    mockSelectWhere.mockResolvedValue([]);
  });

  // ── POST ──

  describe('POST', () => {
    it('owner can add a collaborator (upsert called)', async () => {
      mockOwnerAccess();
      mockUserFindFirst.mockResolvedValue({ id: 'user_collab', email: 'collab@test.com', name: 'Collab' });

      const res = await POST(makeRequest('POST', { storyId: 'story-1', email: 'Collab@Test.com', role: 'editor' }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.data.collaborator).toEqual({
        userId: 'user_collab',
        email: 'collab@test.com',
        name: 'Collab',
        role: 'editor',
      });
      expect(mockInsertValues).toHaveBeenCalledWith({ storyId: 'story-1', userId: 'user_collab', role: 'editor' });
      expect(mockOnConflictDoUpdate).toHaveBeenCalled();
    });

    it('non-owner add returns 403', async () => {
      mockCollaboratorAccess('editor');

      const res = await POST(makeRequest('POST', { storyId: 'story-1', email: 'x@test.com', role: 'reader' }));
      expect(res.status).toBe(403);
      expect(mockInsertValues).not.toHaveBeenCalled();
    });

    it('unknown email returns 404 user_not_found', async () => {
      mockOwnerAccess();
      mockUserFindFirst.mockResolvedValue(null);

      const res = await POST(makeRequest('POST', { storyId: 'story-1', email: 'ghost@test.com', role: 'editor' }));
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe('user_not_found');
    });

    it('invalid role returns 400', async () => {
      const res = await POST(makeRequest('POST', { storyId: 'story-1', email: 'x@test.com', role: 'admin' }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('validation_failed');
    });

    it('sharing with yourself returns 400', async () => {
      mockOwnerAccess();
      mockUserFindFirst.mockResolvedValue({ id: 'user_owner', email: 'me@test.com', name: 'Me' });

      const res = await POST(makeRequest('POST', { storyId: 'story-1', email: 'me@test.com', role: 'editor' }));
      expect(res.status).toBe(400);
      expect(mockInsertValues).not.toHaveBeenCalled();
    });
  });

  // ── GET ──

  describe('GET', () => {
    it('requires access (403 for stranger)', async () => {
      mockStoryFindFirst.mockResolvedValue({ id: 'story-1', ownerId: 'user_other' });
      mockCollabFindFirst.mockResolvedValue(null);

      const res = await GET(makeRequest('GET', undefined, { storyId: 'story-1' }));
      expect(res.status).toBe(403);
    });

    it('returns owner + collaborators for the owner', async () => {
      mockOwnerAccess();
      mockUserFindFirst.mockResolvedValue({ email: 'owner@test.com', name: 'Owner' });
      mockSelectWhere.mockResolvedValue([
        { userId: 'user_c1', role: 'editor', addedAt: new Date('2026-01-01'), email: 'c1@test.com', name: 'C1' },
      ]);

      const res = await GET(makeRequest('GET', undefined, { storyId: 'story-1' }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.role).toBe('owner');
      expect(data.data.owner).toEqual({ email: 'owner@test.com', name: 'Owner' });
      expect(data.data.collaborators).toHaveLength(1);
      expect(data.data.collaborators[0].userId).toBe('user_c1');
    });

    it('is accessible to a collaborator', async () => {
      mockCollaboratorAccess('reader');
      mockUserFindFirst.mockResolvedValue({ email: 'owner@test.com', name: 'Owner' });

      const res = await GET(makeRequest('GET', undefined, { storyId: 'story-1' }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.role).toBe('reader');
    });

    it('returns 400 when storyId is missing', async () => {
      const res = await GET(makeRequest('GET'));
      expect(res.status).toBe(400);
    });
  });

  // ── DELETE matrix ──

  describe('DELETE', () => {
    it('owner removes another collaborator → 200', async () => {
      mockOwnerAccess();

      const res = await DELETE(makeRequest('DELETE', { storyId: 'story-1', userId: 'user_collab' }));
      expect(res.status).toBe(200);
      expect(mockDeleteWhere).toHaveBeenCalled();
    });

    it('owner removing themselves → 403', async () => {
      mockOwnerAccess();

      const res = await DELETE(makeRequest('DELETE', { storyId: 'story-1', userId: 'user_owner' }));
      expect(res.status).toBe(403);
      expect(mockDeleteWhere).not.toHaveBeenCalled();
    });

    it('collaborator self-leave → 200', async () => {
      mockCollaboratorAccess('editor');

      const res = await DELETE(makeRequest('DELETE', { storyId: 'story-1', userId: 'user_owner' }));
      expect(res.status).toBe(200);
      expect(mockDeleteWhere).toHaveBeenCalled();
    });

    it('collaborator removing someone else → 403', async () => {
      mockCollaboratorAccess('editor');

      const res = await DELETE(makeRequest('DELETE', { storyId: 'story-1', userId: 'user_someone_else' }));
      expect(res.status).toBe(403);
      expect(mockDeleteWhere).not.toHaveBeenCalled();
    });

    it('stranger → 403', async () => {
      mockStoryFindFirst.mockResolvedValue({ id: 'story-1', ownerId: 'user_other' });
      mockCollabFindFirst.mockResolvedValue(null);

      const res = await DELETE(makeRequest('DELETE', { storyId: 'story-1', userId: 'user_owner' }));
      expect(res.status).toBe(403);
    });
  });

  // ── shared-with-me ──

  describe('GET /shared-with-me', () => {
    it('returns stories shared with the caller', async () => {
      mockSelectWhere.mockResolvedValue([
        {
          storyId: 'story-9',
          role: 'reader',
          title: 'Shared Epic',
          updatedAt: new Date('2026-02-02'),
          ownerName: 'Owner',
          ownerEmail: 'owner@test.com',
        },
      ]);

      const req = new NextRequest('http://localhost/api/collaborators/shared-with-me', { method: 'GET' });
      const res = await GET_SHARED(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.me).toBe('user_owner');
      expect(data.data.stories).toHaveLength(1);
      expect(data.data.stories[0]).toMatchObject({
        storyId: 'story-9',
        title: 'Shared Epic',
        role: 'reader',
        ownerEmail: 'owner@test.com',
      });
    });
  });
});
