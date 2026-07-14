import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import * as schema from '@/db/schema';

/**
 * Collaboration access control (Phase 5.6 — story_collaborators).
 *
 * A story is accessible to:
 *   - its owner (stories.ownerId) → 'owner'
 *   - any user with a story_collaborators row → that row's role
 *
 * Used by the sync pull/push routes and the /api/collaborators routes.
 */

export type StoryRole = 'owner' | 'editor' | 'reader';

/**
 * Resolve a user's access level for a story.
 *
 * Returns 'owner' when stories.ownerId matches, otherwise the collaborator
 * row's role, otherwise null (no access — or the story does not exist).
 */
export async function getStoryAccess(
  storyId: string,
  userId: string,
): Promise<StoryRole | null> {
  const story = await db().query.stories.findFirst({
    where: eq(schema.stories.id, storyId),
    columns: { ownerId: true },
  });
  if (story && story.ownerId === userId) return 'owner';

  const collab = await db().query.storyCollaborators.findFirst({
    where: and(
      eq(schema.storyCollaborators.storyId, storyId),
      eq(schema.storyCollaborators.userId, userId),
    ),
  });
  if (!collab) return null;

  const role = collab.role;
  return role === 'owner' || role === 'editor' || role === 'reader' ? role : null;
}
