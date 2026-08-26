import { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db/client';
import * as schema from '@/db/schema';
import { requireCloudUser, isAuthError } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { getStoryAccess } from '@/lib/collab';

export const runtime = 'nodejs';

/**
 * DELETE /api/stories  — permanently delete a synced story and all its data.
 *
 * Auth: required (Clerk session). OWNER only — editors/readers/strangers get 403.
 * Body: { storyId }
 *
 * The `stories` row is deleted; every child table (chapters, chapter_versions,
 * story_snapshots, sessions, chat_messages, writer_insights, story_collaborators)
 * cascades via its `onDelete: 'cascade'` FK. This closes the gap where deleting a
 * project locally left the manuscript in the cloud forever (privacy) and let it
 * resurrect on another device still bound to the same story id.
 */
export async function DELETE(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/stories', requestId });

  const authResult = await requireCloudUser();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  const limited = await rateLimit(req, { maxRequests: 30, windowMs: 60_000 });
  if (limited) return limited;

  if (!isDatabaseConfigured()) {
    return err('internal_error', 'Database not configured', 500, undefined, { requestId });
  }

  let body: { storyId?: unknown };
  try {
    body = await req.json();
  } catch {
    return err('validation_failed', 'Invalid JSON body', 400, undefined, { requestId });
  }
  const storyId = typeof body.storyId === 'string' ? body.storyId : '';
  if (!storyId) {
    return err('validation_failed', 'storyId is required', 400, undefined, { requestId });
  }

  try {
    // Only the OWNER may delete a story — a destructive, irreversible action that
    // an editor/reader collaborator must never be able to trigger.
    const access = await getStoryAccess(storyId, userId);
    if (access === null) {
      // Nonexistent (or no access) — idempotent success so a client retrying a
      // delete of an already-gone story doesn't error.
      return ok({ deleted: false }, { requestId });
    }
    if (access !== 'owner') {
      return err('forbidden', 'Only the owner can delete this story', 403, undefined, { requestId });
    }

    // Scope the delete to the owner as defense-in-depth against a stale access
    // read; FK cascades remove all child rows.
    await db()
      .delete(schema.stories)
      .where(and(eq(schema.stories.id, storyId), eq(schema.stories.ownerId, userId)));

    log.info('story deleted', { storyId });
    return ok({ deleted: true }, { requestId });
  } catch (dbErr) {
    log.error('story delete failed', dbErr);
    return err('internal_error', 'Delete failed', 500, undefined, { requestId });
  }
}
