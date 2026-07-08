import { NextRequest } from 'next/server';
import { eq, and, inArray } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db/client';
import * as schema from '@/db/schema';
import { requireUser, isAuthError } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { wordCount as lexicalWordCount } from '@/lib/editor/serialization';
import type { PushRequest, SyncDelta, ConflictRecord } from '@/lib/sync/types';

export const runtime = 'nodejs';

/**
 * POST /api/sync/push -- accept batched local deltas and apply to Postgres.
 *
 * Auth: required (Clerk session).
 * Body: { storyId, storyTitle, deltas: SyncDelta[] }
 *
 * Creates the story row on first push (upsert). For chapters, uses the
 * `version` column for optimistic concurrency: if the server version is
 * higher than what the client sent, the delta is rejected and returned
 * as a conflict so the client can pull the latest.
 */
export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/sync/push', requestId });

  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  // Sync is auth-gated and batch-capped, but still throttle per-IP so a
  // compromised/abusive client can't hammer the DB with rapid pushes.
  const limited = await rateLimit(req, { maxRequests: 60, windowMs: 60_000 });
  if (limited) return limited;

  if (!isDatabaseConfigured()) {
    return err('internal_error', 'Database not configured', 500, undefined, { requestId });
  }

  let body: PushRequest;
  try {
    body = await req.json();
  } catch {
    return err('validation_failed', 'Invalid JSON body', 400, undefined, { requestId });
  }

  const { storyId, storyTitle, deltas } = body;
  if (!storyId || !Array.isArray(deltas)) {
    return err('validation_failed', 'storyId and deltas[] are required', 400, undefined, { requestId });
  }

  if (deltas.length === 0) {
    return ok({ applied: 0, conflicts: [], serverTimestamp: new Date().toISOString() }, { requestId });
  }

  // Cap batch size to prevent abuse
  if (deltas.length > 500) {
    return err('validation_failed', 'Maximum 500 deltas per push', 400, undefined, { requestId });
  }

  try {
    // Ensure story exists (upsert). Verifies the user owns this story.
    await db()
      .insert(schema.stories)
      .values({
        id: storyId,
        ownerId: userId,
        title: storyTitle || 'Untitled',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.stories.id,
        set: {
          title: storyTitle || 'Untitled',
          updatedAt: new Date(),
        },
      });

    // Verify ownership (in case someone sends a storyId they don't own)
    const story = await db().query.stories.findFirst({
      where: and(eq(schema.stories.id, storyId), eq(schema.stories.ownerId, userId)),
    });
    if (!story) {
      return err('forbidden', 'You do not own this story', 403, undefined, { requestId });
    }

    let applied = 0;
    const conflicts: ConflictRecord[] = [];

    for (const delta of deltas) {
      try {
        const result = await applyDelta(storyId, delta, log);
        if (result.conflict) {
          conflicts.push(result.conflict);
        } else {
          applied++;
        }
      } catch (deltaErr) {
        log.warn('delta apply failed', { entityType: delta.entityType, entityId: delta.entityId, err: String(deltaErr) });
      }
    }

    // Update story's updatedAt after all deltas applied
    if (applied > 0) {
      await db()
        .update(schema.stories)
        .set({ updatedAt: new Date() })
        .where(eq(schema.stories.id, storyId));
    }

    const serverTimestamp = new Date().toISOString();
    log.info('push complete', { applied, conflicts: conflicts.length, deltas: deltas.length });
    return ok({ applied, conflicts, serverTimestamp }, { requestId });
  } catch (dbErr) {
    log.error('push failed', dbErr);
    return err('internal_error', 'Push failed', 500, undefined, { requestId });
  }
}

// ─── Delta application ───

interface ApplyResult {
  conflict?: ConflictRecord;
}

async function applyDelta(
  storyId: string,
  delta: SyncDelta,
  log: ReturnType<typeof createRouteLogger>,
): Promise<ApplyResult> {
  const { entityType, entityId, op, payload } = delta;

  if (op === 'delete') {
    await applyDelete(storyId, entityType, entityId);
    return {};
  }

  if (!payload) {
    log.warn('upsert delta missing payload', { entityType, entityId });
    return {};
  }

  switch (entityType) {
    case 'story':
      return applyStoryUpsert(storyId, payload);
    case 'chapter':
      return applyChapterUpsert(storyId, entityId, payload);
    case 'chapterVersion':
      return applyChapterVersionUpsert(storyId, entityId, payload);
    case 'storySnapshot':
      return applySnapshotUpsert(storyId, entityId, payload);
    case 'session':
      return applySessionUpsert(storyId, entityId, payload);
    case 'chatMessage':
      return applyChatMessageUpsert(storyId, entityId, payload);
    case 'writerInsight':
      return applyInsightUpsert(storyId, entityId, payload);
    default:
      log.warn('unknown entity type', { entityType });
      return {};
  }
}

async function applyDelete(
  storyId: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  switch (entityType) {
    case 'chapter':
      await db().delete(schema.chapters).where(
        and(eq(schema.chapters.id, entityId), eq(schema.chapters.storyId, storyId)),
      );
      break;
    case 'chapterVersion':
      // chapterVersions has no storyId column — scope through the parent
      // chapter so a version can only be deleted within the caller's story.
      await db().delete(schema.chapterVersions).where(
        and(
          eq(schema.chapterVersions.id, entityId),
          inArray(
            schema.chapterVersions.chapterId,
            db().select({ id: schema.chapters.id }).from(schema.chapters).where(eq(schema.chapters.storyId, storyId)),
          ),
        ),
      );
      break;
    case 'storySnapshot':
      await db().delete(schema.storySnapshots).where(
        and(eq(schema.storySnapshots.id, entityId), eq(schema.storySnapshots.storyId, storyId)),
      );
      break;
    case 'session':
      await db().delete(schema.sessions).where(
        and(eq(schema.sessions.id, entityId), eq(schema.sessions.storyId, storyId)),
      );
      break;
    case 'chatMessage':
      await db().delete(schema.chatMessages).where(
        and(eq(schema.chatMessages.id, entityId), eq(schema.chatMessages.storyId, storyId)),
      );
      break;
    case 'writerInsight':
      await db().delete(schema.writerInsights).where(
        and(eq(schema.writerInsights.id, entityId), eq(schema.writerInsights.storyId, storyId)),
      );
      break;
  }
}

async function applyStoryUpsert(
  storyId: string,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  await db()
    .update(schema.stories)
    .set({
      state: payload,
      updatedAt: new Date(),
    })
    .where(eq(schema.stories.id, storyId));
  return {};
}

async function applyChapterUpsert(
  storyId: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  const content = (payload.content as string) ?? '';
  // content may be Lexical JSON (CB-07); count words on the decoded prose so the
  // stored word_count is meaningful, not a count of JSON tokens.
  const wordCount = lexicalWordCount(content);
  const clientVersion = typeof payload.version === 'number' ? payload.version : 1;

  // Check for optimistic concurrency conflict. Scope to the owned story so a
  // chapter ID belonging to another user's story is never matched here.
  const existing = await db().query.chapters.findFirst({
    where: and(eq(schema.chapters.id, entityId), eq(schema.chapters.storyId, storyId)),
    columns: { version: true, updatedAt: true },
  });

  if (existing && existing.version > clientVersion) {
    // Server has a newer version -- reject this delta
    const serverRow = await db().query.chapters.findFirst({
      where: eq(schema.chapters.id, entityId),
    });
    return {
      conflict: {
        entityType: 'chapter',
        entityId,
        localPayload: payload,
        serverPayload: serverRow as unknown as Record<string, unknown>,
        serverUpdatedAt: existing.updatedAt.toISOString(),
        detectedAt: new Date().toISOString(),
      },
    };
  }

  const newVersion = (existing?.version ?? 0) + 1;

  await db()
    .insert(schema.chapters)
    .values({
      id: entityId,
      storyId,
      title: (payload.title as string) ?? '',
      content,
      summary: (payload.summary as string) ?? null,
      canonStatus: (payload.canonStatus as string) ?? 'flexible',
      source: (payload.source as string) ?? null,
      orderIndex: typeof payload.orderIndex === 'number' ? payload.orderIndex : 0,
      wordCount,
      version: newVersion,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.chapters.id,
      // Only update when the existing row belongs to the caller's story —
      // blocks cross-tenant overwrite of a chapter by guessing its ID.
      where: eq(schema.chapters.storyId, storyId),
      set: {
        title: (payload.title as string) ?? '',
        content,
        summary: (payload.summary as string) ?? null,
        canonStatus: (payload.canonStatus as string) ?? 'flexible',
        source: (payload.source as string) ?? null,
        orderIndex: typeof payload.orderIndex === 'number' ? payload.orderIndex : 0,
        wordCount,
        version: newVersion,
        updatedAt: new Date(),
      },
    });

  return {};
}

async function applyChapterVersionUpsert(
  storyId: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  const chapterId = (payload.chapterId as string) ?? '';
  // Require the parent chapter to exist AND belong to the caller's story —
  // prevents attaching version blobs to another user's chapter.
  const chapter = await db().query.chapters.findFirst({
    where: and(eq(schema.chapters.id, chapterId), eq(schema.chapters.storyId, storyId)),
    columns: { id: true },
  });
  if (!chapter) return {};

  await db()
    .insert(schema.chapterVersions)
    .values({
      id: entityId,
      chapterId,
      createdAt: payload.createdAt ? new Date(payload.createdAt as string) : new Date(),
      data: payload.data ?? payload,
    })
    .onConflictDoNothing();
  return {};
}

async function applySnapshotUpsert(
  storyId: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  await db()
    .insert(schema.storySnapshots)
    .values({
      id: entityId,
      storyId,
      name: (payload.name as string) ?? 'Unnamed',
      description: (payload.description as string) ?? '',
      wordCount: typeof payload.wordCount === 'number' ? payload.wordCount : 0,
      chapterCount: typeof payload.chapterCount === 'number' ? payload.chapterCount : 0,
      createdAt: payload.createdAt ? new Date(payload.createdAt as number) : new Date(),
      data: payload.data ?? payload,
    })
    .onConflictDoNothing();
  return {};
}

async function applySessionUpsert(
  storyId: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  await db()
    .insert(schema.sessions)
    .values({
      id: entityId,
      storyId,
      startedAt: payload.startedAt ? new Date(payload.startedAt as string) : new Date(),
      endedAt: payload.endedAt ? new Date(payload.endedAt as string) : null,
      wordsAdded: typeof payload.wordsAdded === 'number' ? payload.wordsAdded : 0,
      flowScore: typeof payload.flowScore === 'number' ? payload.flowScore : null,
      heteronymId: (payload.heteronymId as string) ?? null,
      data: payload.data ?? payload,
    })
    .onConflictDoNothing();
  return {};
}

async function applyChatMessageUpsert(
  storyId: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  await db()
    .insert(schema.chatMessages)
    .values({
      id: entityId,
      storyId,
      chapterId: (payload.chapterId as string) ?? null,
      role: (payload.role as string) ?? 'user',
      content: (payload.content as string) ?? '',
      timestamp: payload.timestamp
        ? new Date(payload.timestamp as number)
        : new Date(),
    })
    .onConflictDoNothing();
  return {};
}

async function applyInsightUpsert(
  storyId: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  await db()
    .insert(schema.writerInsights)
    .values({
      id: entityId,
      storyId,
      category: (payload.category as string) ?? 'voice',
      observation: (payload.observation as string) ?? '',
      evidenceCount: typeof payload.evidenceCount === 'number' ? payload.evidenceCount : 1,
      lastObservedAt: payload.lastObservedAt
        ? new Date(payload.lastObservedAt as number)
        : new Date(),
      confidence: typeof payload.confidence === 'number' ? payload.confidence : 50,
      pinned: typeof payload.pinned === 'number' ? payload.pinned : 0,
    })
    .onConflictDoUpdate({
      target: schema.writerInsights.id,
      set: {
        observation: (payload.observation as string) ?? '',
        evidenceCount: typeof payload.evidenceCount === 'number' ? payload.evidenceCount : 1,
        lastObservedAt: payload.lastObservedAt
          ? new Date(payload.lastObservedAt as number)
          : new Date(),
        confidence: typeof payload.confidence === 'number' ? payload.confidence : 50,
        pinned: typeof payload.pinned === 'number' ? payload.pinned : 0,
      },
    });
  return {};
}
