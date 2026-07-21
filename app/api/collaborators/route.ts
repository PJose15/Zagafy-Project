import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db/client';
import * as schema from '@/db/schema';
import { requireCloudUser, isAuthError } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { getStoryAccess } from '@/lib/collab';
import { getLimits } from '@/lib/billing';
import { getUserPlan } from '@/lib/get-user-plan';

export const runtime = 'nodejs';

const VALID_ROLES = ['editor', 'reader'] as const;
type CollabRole = (typeof VALID_ROLES)[number];

/**
 * POST /api/collaborators — share a story with an existing user by email.
 * Owner-only. Body: { storyId, email, role: 'editor' | 'reader' }.
 * Upserts the collaborator row (re-inviting updates the role).
 */
export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/collaborators', requestId });

  const authResult = await requireCloudUser();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  const limited = await rateLimit(req, { maxRequests: 20, windowMs: 60_000 });
  if (limited) return limited;

  if (!isDatabaseConfigured()) {
    return err('internal_error', 'Database not configured', 500, undefined, { requestId });
  }

  let body: { storyId?: unknown; email?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return err('validation_failed', 'Invalid JSON body', 400, undefined, { requestId });
  }

  const storyId = typeof body.storyId === 'string' ? body.storyId : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = body.role;

  if (!storyId || !email) {
    return err('validation_failed', 'storyId and email are required', 400, undefined, { requestId });
  }
  if (!VALID_ROLES.includes(role as CollabRole)) {
    return err('validation_failed', 'role must be editor or reader', 400, undefined, { requestId });
  }

  try {
    const access = await getStoryAccess(storyId, userId);
    if (access !== 'owner') {
      return err('forbidden', 'Only the story owner can manage collaborators', 403, undefined, { requestId });
    }

    const target = await db().query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    if (!target) {
      // Deliberately generic: a distinct "no account for that email" response
      // would let any story owner probe which email addresses have Zagafy
      // accounts. Same code/status regardless of why the invite failed.
      log.info('collaborator invite failed: no matching account', { storyId });
      return err(
        'invite_failed',
        "That invite couldn't be completed. Double-check the email address — the recipient needs a Zagafy account before they can be added.",
        400,
        undefined,
        { requestId },
      );
    }
    if (target.id === userId) {
      return err('validation_failed', 'You already own this story — no need to share it with yourself', 400, undefined, { requestId });
    }

    // Plan cap: the OWNER's plan governs how many collaborators a story may
    // have (the caller is the owner here — access === 'owner' above).
    // Re-inviting an existing collaborator (role change) never counts anew.
    const existing = await db().query.storyCollaborators.findMany({
      where: eq(schema.storyCollaborators.storyId, storyId),
      columns: { userId: true },
    });
    const alreadyCollaborator = existing.some((c) => c.userId === target.id);
    const maxCollaborators = getLimits(await getUserPlan(userId)).maxCollaborators;
    if (!alreadyCollaborator && existing.length >= maxCollaborators) {
      return err(
        'forbidden',
        maxCollaborators === 0
          ? 'Sharing stories with collaborators requires the Author or Studio plan.'
          : `Your plan allows up to ${maxCollaborators} collaborator${maxCollaborators === 1 ? '' : 's'} per story. Upgrade to add more.`,
        403,
        undefined,
        { requestId },
      );
    }

    await db()
      .insert(schema.storyCollaborators)
      .values({ storyId, userId: target.id, role: role as CollabRole })
      .onConflictDoUpdate({
        target: [schema.storyCollaborators.storyId, schema.storyCollaborators.userId],
        set: { role: role as CollabRole },
      });

    log.info('collaborator added', { storyId, role });
    return ok(
      {
        collaborator: {
          userId: target.id,
          email: target.email,
          name: target.name,
          role,
        },
      },
      { requestId },
    );
  } catch (dbErr) {
    log.error('add collaborator failed', dbErr);
    return err('internal_error', 'Failed to add collaborator', 500, undefined, { requestId });
  }
}

/**
 * GET /api/collaborators?storyId= — list a story's owner + collaborators.
 * Accessible to the owner and to any collaborator.
 */
export async function GET(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/collaborators', requestId });

  const authResult = await requireCloudUser();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  const limited = await rateLimit(req, { maxRequests: 20, windowMs: 60_000 });
  if (limited) return limited;

  if (!isDatabaseConfigured()) {
    return err('internal_error', 'Database not configured', 500, undefined, { requestId });
  }

  const storyId = req.nextUrl.searchParams.get('storyId');
  if (!storyId) {
    return err('validation_failed', 'storyId is required', 400, undefined, { requestId });
  }

  try {
    const access = await getStoryAccess(storyId, userId);
    if (access === null) {
      return err('forbidden', 'You do not have access to this story', 403, undefined, { requestId });
    }

    const story = await db().query.stories.findFirst({
      where: eq(schema.stories.id, storyId),
      columns: { ownerId: true },
    });
    const owner = story
      ? await db().query.users.findFirst({
          where: eq(schema.users.id, story.ownerId),
          columns: { email: true, name: true },
        })
      : null;

    const rows = await db()
      .select({
        userId: schema.storyCollaborators.userId,
        role: schema.storyCollaborators.role,
        addedAt: schema.storyCollaborators.addedAt,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.storyCollaborators)
      .innerJoin(schema.users, eq(schema.users.id, schema.storyCollaborators.userId))
      .where(eq(schema.storyCollaborators.storyId, storyId));

    return ok(
      {
        role: access,
        owner: owner ? { email: owner.email, name: owner.name } : null,
        collaborators: rows.map((r) => ({
          userId: r.userId,
          email: r.email,
          name: r.name,
          role: r.role,
          addedAt: r.addedAt instanceof Date ? r.addedAt.toISOString() : r.addedAt,
        })),
      },
      { requestId },
    );
  } catch (dbErr) {
    log.error('list collaborators failed', dbErr);
    return err('internal_error', 'Failed to list collaborators', 500, undefined, { requestId });
  }
}

/**
 * DELETE /api/collaborators — remove a collaborator.
 * Body: { storyId, userId }.
 *   - Owner may remove any collaborator (but not themselves).
 *   - A collaborator may remove ONLY themselves (leave the story).
 */
export async function DELETE(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/collaborators', requestId });

  const authResult = await requireCloudUser();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  const limited = await rateLimit(req, { maxRequests: 20, windowMs: 60_000 });
  if (limited) return limited;

  if (!isDatabaseConfigured()) {
    return err('internal_error', 'Database not configured', 500, undefined, { requestId });
  }

  let body: { storyId?: unknown; userId?: unknown };
  try {
    body = await req.json();
  } catch {
    return err('validation_failed', 'Invalid JSON body', 400, undefined, { requestId });
  }

  const storyId = typeof body.storyId === 'string' ? body.storyId : '';
  const targetUserId = typeof body.userId === 'string' ? body.userId : '';
  if (!storyId || !targetUserId) {
    return err('validation_failed', 'storyId and userId are required', 400, undefined, { requestId });
  }

  try {
    const access = await getStoryAccess(storyId, userId);

    const isOwnerRemovingOther = access === 'owner' && targetUserId !== userId;
    const isSelfLeave = access !== null && access !== 'owner' && targetUserId === userId;

    if (!isOwnerRemovingOther && !isSelfLeave) {
      return err('forbidden', 'You cannot remove this collaborator', 403, undefined, { requestId });
    }

    await db()
      .delete(schema.storyCollaborators)
      .where(
        and(
          eq(schema.storyCollaborators.storyId, storyId),
          eq(schema.storyCollaborators.userId, targetUserId),
        ),
      );

    log.info('collaborator removed', { storyId, selfLeave: isSelfLeave });
    return ok({ removed: true }, { requestId });
  } catch (dbErr) {
    log.error('remove collaborator failed', dbErr);
    return err('internal_error', 'Failed to remove collaborator', 500, undefined, { requestId });
  }
}
