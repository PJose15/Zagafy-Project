import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db/client';
import * as schema from '@/db/schema';
import { requireUser, isAuthError } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * GET /api/collaborators/shared-with-me — stories shared with the caller.
 * Returns [{ storyId, title, role, ownerName, ownerEmail, updatedAt }].
 */
export async function GET(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/collaborators/shared-with-me', requestId });

  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  const limited = await rateLimit(req, { maxRequests: 20, windowMs: 60_000 });
  if (limited) return limited;

  if (!isDatabaseConfigured()) {
    return err('internal_error', 'Database not configured', 500, undefined, { requestId });
  }

  try {
    const rows = await db()
      .select({
        storyId: schema.storyCollaborators.storyId,
        role: schema.storyCollaborators.role,
        title: schema.stories.title,
        updatedAt: schema.stories.updatedAt,
        ownerName: schema.users.name,
        ownerEmail: schema.users.email,
      })
      .from(schema.storyCollaborators)
      .innerJoin(schema.stories, eq(schema.stories.id, schema.storyCollaborators.storyId))
      .innerJoin(schema.users, eq(schema.users.id, schema.stories.ownerId))
      .where(eq(schema.storyCollaborators.userId, userId));

    return ok(
      {
        // The caller's own user id — the client needs it for the self-leave
        // DELETE without pulling in Clerk client hooks.
        me: userId,
        stories: rows.map((r) => ({
          storyId: r.storyId,
          title: r.title,
          role: r.role,
          ownerName: r.ownerName,
          ownerEmail: r.ownerEmail,
          updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
        })),
      },
      { requestId },
    );
  } catch (dbErr) {
    log.error('shared-with-me failed', dbErr);
    return err('internal_error', 'Failed to load shared stories', 500, undefined, { requestId });
  }
}
