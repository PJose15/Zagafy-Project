import { NextRequest } from 'next/server';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db/client';
import * as schema from '@/db/schema';
import { requireCloudUser, isAuthError } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { wordCount as lexicalWordCount } from '@/lib/editor/serialization';
import { getStoryAccess } from '@/lib/collab';
import { getLimits } from '@/lib/billing';
import { getUserPlan } from '@/lib/get-user-plan';
import type { PushRequest, SyncDelta, ConflictRecord } from '@/lib/sync/types';

export const runtime = 'nodejs';

type SyncDatabase = Pick<ReturnType<typeof db>, 'query' | 'select' | 'insert' | 'update' | 'delete'>;
const ENTITY_TYPES = new Set(['story', 'chapter', 'chapterVersion', 'storySnapshot', 'session', 'chatMessage', 'writerInsight', 'comment']);
function validPush(value: unknown): value is PushRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as PushRequest;
  if (typeof body.storyId !== 'string' || !body.storyId.trim() || body.storyId.length > 200 ||
      (body.storyTitle !== undefined && (typeof body.storyTitle !== 'string' || body.storyTitle.length > 1000)) ||
      !Array.isArray(body.deltas) || body.deltas.length > 500) return false;
  return body.deltas.every(delta => {
    if (!delta || typeof delta !== 'object' || !ENTITY_TYPES.has(delta.entityType) ||
        typeof delta.entityId !== 'string' || !delta.entityId || delta.entityId.length > 200 ||
        !Number.isFinite(delta.timestamp) || delta.timestamp < 0 ||
        (delta.op !== 'upsert' && delta.op !== 'delete')) return false;
    if (delta.op === 'delete') return delta.entityType !== 'story' && delta.payload === null;
    const payload = delta.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    if (payload.version !== undefined && (!Number.isSafeInteger(payload.version) || (payload.version as number) < 0)) return false;
    if (delta.entityType === 'chapter' && (typeof payload.content !== 'string' || payload.content.length > 5_000_000)) return false;
    return true;
  });
}

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

  const authResult = await requireCloudUser();
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

  if (!validPush(body)) return err('validation_failed', 'Invalid storyId, deltas or sync payload (maximum 500 deltas)', 400, undefined, { requestId });
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
    return await db().transaction(async database => {
        // One transaction owns this story's authorization, version checks and
        // complete batch. Concurrent pushes cannot both accept the same base.
        await database.execute(sql`SET LOCAL lock_timeout = '5s'`);
        await database.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`zagafy-sync:${storyId}`}, 0))`);
      // Plan gate: cloud sync is a paid feature. For SHARED stories the story
      // OWNER's plan governs — a collaborator with a free plan may still push to
      // a paid owner's story, and a paid collaborator cannot sync a free owner's
      // story. Checked BEFORE the first-push upsert so a free user never creates
      // a server story row.
      const storyRow = await database.query.stories.findFirst({
        where: eq(schema.stories.id, storyId),
        columns: { ownerId: true },
      });
      const plan = await getUserPlan(storyRow?.ownerId ?? userId, database);
      if (!getLimits(plan).cloudSync) {
        return err(
          'forbidden',
          'Cloud sync requires a paid plan. Upgrade to sync this story across devices.',
          403,
          undefined,
          { requestId },
        );
      }

      // Access check FIRST — owner and editor collaborators may push;
      // readers and strangers may not.
      const access = await getStoryAccess(storyId, userId, database);

      if (access === null) {
        // Either the story doesn't exist yet (first push — create it for the
        // caller as owner) or it exists and the caller has no access (403).
        const existing = await database.query.stories.findFirst({
          where: eq(schema.stories.id, storyId),
          columns: { id: true },
        });
        if (existing) {
          return err('forbidden', 'You do not own this story', 403, undefined, { requestId });
        }
        // First push: create the story owned by the caller. Kept as an upsert
        // to stay race-safe against a concurrent first push from another tab.
        await database
          .insert(schema.stories)
          .values({
            id: storyId,
            ownerId: userId,
            title: storyTitle || 'Untitled',
            updatedAt: sql`clock_timestamp() AT TIME ZONE 'UTC'`,
          })
          .onConflictDoUpdate({
            target: schema.stories.id,
            // Only update when the conflicting row already belongs to the
            // caller — a colliding id owned by someone else must not be retitled.
            where: eq(schema.stories.ownerId, userId),
            set: {
              title: storyTitle || 'Untitled',
              updatedAt: sql`clock_timestamp() AT TIME ZONE 'UTC'`,
            },
          });
        // Re-check ownership: if another user's story appeared between the
        // access check and the insert, the guarded update matched nothing —
        // refuse to write deltas into a story the caller does not own.
        const created = await database.query.stories.findFirst({
          where: eq(schema.stories.id, storyId),
          columns: { ownerId: true },
        });
        if (!created || created.ownerId !== userId) {
          return err('forbidden', 'You do not own this story', 403, undefined, { requestId });
        }
      } else if (access === 'owner' || access === 'editor') {
        // Metadata title is updated only by an accepted story-blob delta below.
        // A stale chapter-only push must not rename a newer server story.
      } else {
        // 'reader' — read-only collaborators cannot push.
        return err('forbidden', 'You do not have edit access to this story', 403, undefined, { requestId });
      }

      let applied = 0;
      const conflicts: ConflictRecord[] = [];
      const chapterVersions: Record<string, number> = {};
      let storyVersion: number | undefined;

      for (const delta of deltas) {
        const result = await applyDelta(database, storyId, delta, log);
        if (result.conflict) {
          conflicts.push(result.conflict);
        } else {
          applied++;
          if (typeof result.newChapterVersion === 'number') chapterVersions[delta.entityId] = result.newChapterVersion;
          if (typeof result.newStoryVersion === 'number') storyVersion = result.newStoryVersion;
        }
      }

      // Update story's updatedAt after all deltas applied
      if (applied > 0) {
        await database
          .update(schema.stories)
          .set({ updatedAt: sql`clock_timestamp() AT TIME ZONE 'UTC'` })
          .where(eq(schema.stories.id, storyId));
      }

      const serverTimestamp = new Date().toISOString();
      log.info('push complete', { applied, conflicts: conflicts.length, deltas: deltas.length });
      return ok({ applied, conflicts, chapterVersions, storyVersion, serverTimestamp }, { requestId });
    });
  } catch (dbErr) {
    log.error('push failed', dbErr);
    return err('internal_error', 'Push failed', 500, undefined, { requestId });
  }
}

// ─── Delta application ───

interface ApplyResult {
  conflict?: ConflictRecord;
  /** New server version for accepted chapter upserts — echoed to the client
   *  so its local copy tracks the server and later pushes don't false-conflict. */
  newChapterVersion?: number;
  /** New server version for an accepted story-blob upsert — echoed so the
   *  client adopts it as the base version for its next story push. */
  newStoryVersion?: number;
}

async function applyDelta(
  database: SyncDatabase,
  storyId: string,
  delta: SyncDelta,
  log: ReturnType<typeof createRouteLogger>,
): Promise<ApplyResult> {
  const { entityType, entityId, op, payload } = delta;

  if (op === 'delete') {
    await applyDelete(database, storyId, entityType, entityId);
    return {};
  }

  if (!payload) {
    throw new Error('Upsert delta missing payload');
  }

  switch (entityType) {
    case 'story':
      return applyStoryUpsert(database, storyId, payload);
    case 'chapter':
      return applyChapterUpsert(database, storyId, entityId, payload);
    case 'chapterVersion':
      return applyChapterVersionUpsert(database, storyId, entityId, payload);
    case 'storySnapshot':
      return applySnapshotUpsert(database, storyId, entityId, payload);
    case 'session':
      return applySessionUpsert(database, storyId, entityId, payload);
    case 'chatMessage':
      return applyChatMessageUpsert(database, storyId, entityId, payload);
    case 'writerInsight':
      return applyInsightUpsert(database, storyId, entityId, payload);
    case 'comment':
      return applyCommentUpsert(database, storyId, entityId, payload);
    default:
      throw new Error('Unknown sync entity type');
  }
}

async function applyDelete(
  database: SyncDatabase,
  storyId: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  switch (entityType) {
    case 'chapter':
      await database.delete(schema.chapters).where(
        and(eq(schema.chapters.id, entityId), eq(schema.chapters.storyId, storyId)),
      );
      break;
    case 'chapterVersion':
      // chapterVersions has no storyId column — scope through the parent
      // chapter so a version can only be deleted within the caller's story.
      await database.delete(schema.chapterVersions).where(
        and(
          eq(schema.chapterVersions.id, entityId),
          inArray(
            schema.chapterVersions.chapterId,
            database.select({ id: schema.chapters.id }).from(schema.chapters).where(eq(schema.chapters.storyId, storyId)),
          ),
        ),
      );
      break;
    case 'storySnapshot':
      await database.delete(schema.storySnapshots).where(
        and(eq(schema.storySnapshots.id, entityId), eq(schema.storySnapshots.storyId, storyId)),
      );
      break;
    case 'session':
      await database.delete(schema.sessions).where(
        and(eq(schema.sessions.id, entityId), eq(schema.sessions.storyId, storyId)),
      );
      break;
    case 'chatMessage':
      await database.delete(schema.chatMessages).where(
        and(eq(schema.chatMessages.id, entityId), eq(schema.chatMessages.storyId, storyId)),
      );
      break;
    case 'writerInsight':
      await database.delete(schema.writerInsights).where(
        and(eq(schema.writerInsights.id, entityId), eq(schema.writerInsights.storyId, storyId)),
      );
      break;
    case 'comment':
      await database.delete(schema.comments).where(
        and(eq(schema.comments.id, entityId), eq(schema.comments.storyId, storyId)),
      );
      break;
  }
}

async function applyStoryUpsert(
  database: SyncDatabase,
  storyId: string,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  // The client injects the base version it last saw from the server as
  // `payload.version`; the rest of the payload is the StoryState blob. Strip the
  // version key so it isn't persisted inside `state`.
  const baseVersion = typeof payload.version === 'number' ? payload.version : 0;
  const { version: _clientVersion, ...state } = payload;

  const existing = await database.query.stories.findFirst({
    where: eq(schema.stories.id, storyId),
    columns: { version: true, state: true, updatedAt: true },
  });

  // Optimistic concurrency: if the server blob has advanced past the base the
  // client pushed from, reject rather than overwrite. Returning the server copy
  // lets the client preserve its losing edits (as a recovery snapshot) and adopt
  // the server state instead of silently destroying characters/canon/world-bible.
  if (existing && (existing.version ?? 0) !== baseVersion) {
    return {
      conflict: {
        entityType: 'story',
        entityId: storyId,
        localPayload: payload,
        serverPayload: {
          ...(existing.state as Record<string, unknown> | null ?? {}),
          version: existing.version,
        },
        serverUpdatedAt: existing.updatedAt.toISOString(),
        detectedAt: new Date().toISOString(),
      },
    };
  }

  const newVersion = (existing?.version ?? 0) + 1;
  await database
    .update(schema.stories)
    .set({
      state,
      ...(typeof state.title === 'string' ? { title: state.title } : {}),
      version: newVersion,
      updatedAt: sql`clock_timestamp() AT TIME ZONE 'UTC'`,
    })
    .where(eq(schema.stories.id, storyId));
  return { newStoryVersion: newVersion };
}

async function applyChapterUpsert(
  database: SyncDatabase,
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
  const existing = await database.query.chapters.findFirst({
    where: and(eq(schema.chapters.id, entityId), eq(schema.chapters.storyId, storyId)),
    columns: { version: true, updatedAt: true },
  });

  if (existing && existing.version !== clientVersion) {
    // Server has a newer version -- reject this delta
    const serverRow = await database.query.chapters.findFirst({
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

  const saved = await database
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
      updatedAt: sql`clock_timestamp() AT TIME ZONE 'UTC'`,
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
        updatedAt: sql`clock_timestamp() AT TIME ZONE 'UTC'`,
      },
    }).returning({ id: schema.chapters.id });
  if (saved.length !== 1) throw new Error('Chapter id is not writable in this story');

  return { newChapterVersion: newVersion };
}

async function applyChapterVersionUpsert(
  database: SyncDatabase,
  storyId: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  const chapterId = (payload.chapterId as string) ?? '';
  // Require the parent chapter to exist AND belong to the caller's story —
  // prevents attaching version blobs to another user's chapter.
  const chapter = await database.query.chapters.findFirst({
    where: and(eq(schema.chapters.id, chapterId), eq(schema.chapters.storyId, storyId)),
    columns: { id: true },
  });
  if (!chapter) throw new Error('Chapter version parent is not in this story');

  const saved = await database
    .insert(schema.chapterVersions)
    .values({
      id: entityId,
      chapterId,
      createdAt: payload.createdAt ? new Date(payload.createdAt as string) : new Date(),
      data: payload.data ?? payload,
    })
    .onConflictDoUpdate({
      target: schema.chapterVersions.id,
      where: eq(schema.chapterVersions.chapterId, chapterId),
      set: {
        createdAt: payload.createdAt ? new Date(payload.createdAt as string) : new Date(),
        data: payload.data ?? payload,
        syncedAt: sql`clock_timestamp()`,
      },
    }).returning({ id: schema.chapterVersions.id });
  if (saved.length !== 1) throw new Error('Entity id is not writable in this story');
  return {};
}

async function applySnapshotUpsert(
  database: SyncDatabase,
  storyId: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  const saved = await database
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
    .onConflictDoUpdate({
      target: schema.storySnapshots.id,
      where: eq(schema.storySnapshots.storyId, storyId),
      set: {
        name: (payload.name as string) ?? 'Unnamed',
        description: (payload.description as string) ?? '',
        wordCount: typeof payload.wordCount === 'number' ? payload.wordCount : 0,
        chapterCount: typeof payload.chapterCount === 'number' ? payload.chapterCount : 0,
        createdAt: payload.createdAt ? new Date(payload.createdAt as number) : new Date(),
        data: payload.data ?? payload,
        syncedAt: sql`clock_timestamp()`,
      },
    }).returning({ id: schema.storySnapshots.id });
  if (saved.length !== 1) throw new Error('Entity id is not writable in this story');
  return {};
}

async function applySessionUpsert(
  database: SyncDatabase,
  storyId: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  const saved = await database
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
    .onConflictDoUpdate({
      target: schema.sessions.id,
      where: eq(schema.sessions.storyId, storyId),
      set: {
        startedAt: payload.startedAt ? new Date(payload.startedAt as string) : new Date(),
        endedAt: payload.endedAt ? new Date(payload.endedAt as string) : null,
        wordsAdded: typeof payload.wordsAdded === 'number' ? payload.wordsAdded : 0,
        flowScore: typeof payload.flowScore === 'number' ? payload.flowScore : null,
        heteronymId: (payload.heteronymId as string) ?? null,
        data: payload.data ?? payload,
        syncedAt: sql`clock_timestamp()`,
      },
    }).returning({ id: schema.sessions.id });
  if (saved.length !== 1) throw new Error('Entity id is not writable in this story');
  return {};
}

async function applyChatMessageUpsert(
  database: SyncDatabase,
  storyId: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  const saved = await database
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
    .onConflictDoUpdate({
      target: schema.chatMessages.id,
      where: eq(schema.chatMessages.storyId, storyId),
      set: {
        chapterId: (payload.chapterId as string) ?? null,
        role: (payload.role as string) ?? 'user',
        content: (payload.content as string) ?? '',
        timestamp: payload.timestamp
          ? new Date(payload.timestamp as number)
          : new Date(),
        syncedAt: sql`clock_timestamp()`,
      },
    }).returning({ id: schema.chatMessages.id });
  if (saved.length !== 1) throw new Error('Entity id is not writable in this story');
  return {};
}

async function applyInsightUpsert(
  database: SyncDatabase,
  storyId: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  const saved = await database
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
      // Only update when the existing row belongs to the caller's story —
      // blocks cross-tenant overwrite of an insight by guessing its ID.
      where: eq(schema.writerInsights.storyId, storyId),
      set: {
          syncedAt: sql`clock_timestamp()`,
          observation: (payload.observation as string) ?? '',
          evidenceCount: typeof payload.evidenceCount === 'number' ? payload.evidenceCount : 1,
          lastObservedAt: payload.lastObservedAt
            ? new Date(payload.lastObservedAt as number)
            : new Date(),
          confidence: typeof payload.confidence === 'number' ? payload.confidence : 50,
          pinned: typeof payload.pinned === 'number' ? payload.pinned : 0,
      },
    }).returning({ id: schema.writerInsights.id });
  if (saved.length !== 1) throw new Error('Entity id is not writable in this story');
  return {};
}

async function applyCommentUpsert(
  database: SyncDatabase,
  storyId: string,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  // The full ManuscriptComment rides in `payload`. Comments are per-user
  // annotations with no version — last-write-wins is acceptable — so this is a
  // straight upsert scoped to the caller's story (the onConflict guard blocks
  // cross-tenant overwrite of a comment id belonging to another user's story).
  const updatedAt = payload.updatedAt
    ? new Date(payload.updatedAt as string)
    : new Date();
  const saved = await database
    .insert(schema.comments)
    .values({
      id: entityId,
      storyId,
      chapterId: (payload.chapterId as string) ?? '',
      updatedAt,
      data: payload,
    })
    .onConflictDoUpdate({
      target: schema.comments.id,
      where: eq(schema.comments.storyId, storyId),
      set: {
          syncedAt: sql`clock_timestamp()`,
          chapterId: (payload.chapterId as string) ?? '',
          updatedAt,
          data: payload,
      },
    }).returning({ id: schema.comments.id });
  if (saved.length !== 1) throw new Error('Entity id is not writable in this story');
  return {};
}
