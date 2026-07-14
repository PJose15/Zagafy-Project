import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockStoryFindFirst = vi.fn(async (): Promise<unknown> => null);
const mockCollabFindFirst = vi.fn(async (): Promise<unknown> => null);

vi.mock('@/db/client', () => ({
  db: vi.fn(() => ({
    query: {
      stories: { findFirst: mockStoryFindFirst },
      storyCollaborators: { findFirst: mockCollabFindFirst },
    },
  })),
  isDatabaseConfigured: vi.fn(() => true),
}));

vi.mock('@/db/schema', () => ({
  stories: { id: 'id', ownerId: 'ownerId' },
  storyCollaborators: { storyId: 'storyId', userId: 'userId', role: 'role' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

import { getStoryAccess } from '@/lib/collab';

describe('getStoryAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoryFindFirst.mockResolvedValue(null);
    mockCollabFindFirst.mockResolvedValue(null);
  });

  it("returns 'owner' when stories.ownerId matches", async () => {
    mockStoryFindFirst.mockResolvedValue({ ownerId: 'user_a' });

    const access = await getStoryAccess('story-1', 'user_a');
    expect(access).toBe('owner');
    // Owner short-circuits — no collaborator lookup needed
    expect(mockCollabFindFirst).not.toHaveBeenCalled();
  });

  it("returns 'editor' from the collaborator row", async () => {
    mockStoryFindFirst.mockResolvedValue({ ownerId: 'user_owner' });
    mockCollabFindFirst.mockResolvedValue({ storyId: 'story-1', userId: 'user_b', role: 'editor' });

    const access = await getStoryAccess('story-1', 'user_b');
    expect(access).toBe('editor');
  });

  it("returns 'reader' from the collaborator row", async () => {
    mockStoryFindFirst.mockResolvedValue({ ownerId: 'user_owner' });
    mockCollabFindFirst.mockResolvedValue({ storyId: 'story-1', userId: 'user_c', role: 'reader' });

    const access = await getStoryAccess('story-1', 'user_c');
    expect(access).toBe('reader');
  });

  it('returns null when neither owner nor collaborator', async () => {
    mockStoryFindFirst.mockResolvedValue({ ownerId: 'user_owner' });
    mockCollabFindFirst.mockResolvedValue(null);

    const access = await getStoryAccess('story-1', 'user_stranger');
    expect(access).toBeNull();
  });

  it('returns null when the story does not exist', async () => {
    mockStoryFindFirst.mockResolvedValue(null);
    mockCollabFindFirst.mockResolvedValue(null);

    const access = await getStoryAccess('story-missing', 'user_a');
    expect(access).toBeNull();
  });

  it('returns null for an unexpected role value', async () => {
    mockStoryFindFirst.mockResolvedValue({ ownerId: 'user_owner' });
    mockCollabFindFirst.mockResolvedValue({ storyId: 'story-1', userId: 'user_d', role: 'admin' });

    const access = await getStoryAccess('story-1', 'user_d');
    expect(access).toBeNull();
  });
});
