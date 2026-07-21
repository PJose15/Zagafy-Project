import { NextRequest } from 'next/server';
import { eq, and, gte, inArray } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db/client';
import * as schema from '@/db/schema';
import { requireCloudUser, isAuthError } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { getStoryAccess } from '@/lib/collab';

export const runtime = 'nodejs';

// Watermark overlap: the returned serverTimestamp is backdated by this much so
// rows committed while the pull queries were in flight are picked up by the
// next incremental pull rather than falling into the gap.
const WATERMARK_OVERLAP_MS = 2_000;

/**
 * GET /api/sync/pull -- return all server data for the authenticated user,
 * optionally filtered to changes since a timestamp.
 *
 * Query params:
 *   since  - ISO timestamp. If omitted, returns everything (first sync).
 *   storyId - specific story ID. If omitted, returns the user's first story.
 *
 * Response shape: PullResponse (see lib/sync/types.ts)
 */
export async function GET(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/sync/pull', requestId });

  const authResult = await requireCloudUser();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  // Throttle per-IP — pull is auth-gated but should not be abusable as a
  // rapid-fire data exfiltration/DoS vector.
  const limited = await rateLimit(req, { maxRequests: 60, windowMs: 60_000 });
  if (limited) return limited;

  if (!isDatabaseConfigured()) {
    return err('internal_error', 'Database not configured', 500, undefined, { requestId });
  }

  const sinceParam = req.nextUrl.searchParams.get('since');
  const storyIdParam = req.nextUrl.searchParams.get('storyId');
  const sinceDate = sinceParam ? new Date(sinceParam) : null;
  if (sinceDate && isNaN(sinceDate.getTime())) {
    return err('validation_failed', 'since must be a valid ISO timestamp', 400, undefined, { requestId });
  }

  try {
    // Find the user's story. If storyId is provided, verify the caller has
    // access (owner OR collaborator — collaborators pull shared stories).
    // Otherwise, return the user's most recent OWNED story.
    let story: typeof schema.stories.$inferSelect | undefined;

    if (storyIdParam) {
      const access = await getStoryAccess(storyIdParam, userId);
      if (access !== null) {
        story = await db().query.stories.findFirst({
          where: eq(schema.stories.id, storyIdParam),
        });
      }
    } else {
      story = await db().query.stories.findFirst({
        where: eq(schema.stories.ownerId, userId),
        orderBy: (s, { desc }) => [desc(s.updatedAt)],
      });
    }

    if (!story) {
      // No story on server -- this is a first sync from a new user
      return ok({
        storyId: null,
        story: null,
        chapters: [],
        chapterVersions: [],
        storySnapshots: [],
        sessions: [],
        chatMessages: [],
        writerInsights: [],
        serverTimestamp: new Date().toISOString(),
      }, { requestId });
    }

    const storyId = story.id;

    // Capture the watermark BEFORE running the queries (with a small overlap)
    // so rows committed while the queries execute are re-delivered by the next
    // since-pull instead of being skipped forever. Re-delivery is safe: pull
    // consumers upsert by id, so overlap only costs a few duplicate rows.
    const serverTimestamp = new Date(Date.now() - WATERMARK_OVERLAP_MS).toISOString();

    // Fetch all entities, optionally filtered by since timestamp
    const [chapters, chapterVersions, storySnapshots, sessions, chatMessages, writerInsights] =
      await Promise.all([
        fetchChapters(storyId, sinceDate),
        fetchChapterVersions(storyId, sinceDate),
        fetchSnapshots(storyId, sinceDate),
        fetchSessions(storyId, sinceDate),
        fetchChatMessages(storyId, sinceDate),
        fetchInsights(storyId, sinceDate),
      ]);

    // Only include the story state if it was updated since the timestamp
    const includeStory = !sinceDate || story.updatedAt >= sinceDate;

    log.info('pull complete', {
      storyId,
      chapters: chapters.length,
      chapterVersions: chapterVersions.length,
      storySnapshots: storySnapshots.length,
      sessions: sessions.length,
      chatMessages: chatMessages.length,
      writerInsights: writerInsights.length,
      since: sinceParam ?? 'full',
    });

    return ok({
      storyId,
      story: includeStory ? {
        id: story.id,
        title: story.title,
        state: story.state,
        updatedAt: story.updatedAt.toISOString(),
      } : null,
      chapters: chapters.map(serializeChapter),
      chapterVersions: chapterVersions.map(serializeChapterVersion),
      storySnapshots: storySnapshots.map(serializeSnapshot),
      sessions: sessions.map(serializeSession),
      chatMessages: chatMessages.map(serializeChatMessage),
      writerInsights: writerInsights.map(serializeInsight),
      serverTimestamp,
    }, { requestId });
  } catch (dbErr) {
    log.error('pull failed', dbErr);
    return err('internal_error', 'Pull failed', 500, undefined, { requestId });
  }
}

// ─── Query helpers ───

async function fetchChapters(storyId: string, since: Date | null) {
  if (since) {
    return db().query.chapters.findMany({
      where: and(eq(schema.chapters.storyId, storyId), gte(schema.chapters.updatedAt, since)),
    });
  }
  return db().query.chapters.findMany({
    where: eq(schema.chapters.storyId, storyId),
  });
}

async function fetchChapterVersions(storyId: string, since: Date | null) {
  // chapterVersions has no storyId column — scope through a subquery of the
  // story's chapter ids (same pattern as applyDelete in push). Versions are
  // immutable, so createdAt stands in for updatedAt when filtering by since.
  const inStory = inArray(
    schema.chapterVersions.chapterId,
    db().select({ id: schema.chapters.id }).from(schema.chapters).where(eq(schema.chapters.storyId, storyId)),
  );
  if (since) {
    return db().query.chapterVersions.findMany({
      where: and(inStory, gte(schema.chapterVersions.createdAt, since)),
    });
  }
  return db().query.chapterVersions.findMany({ where: inStory });
}

async function fetchSnapshots(storyId: string, since: Date | null) {
  if (since) {
    return db().query.storySnapshots.findMany({
      where: and(eq(schema.storySnapshots.storyId, storyId), gte(schema.storySnapshots.createdAt, since)),
    });
  }
  return db().query.storySnapshots.findMany({
    where: eq(schema.storySnapshots.storyId, storyId),
  });
}

async function fetchSessions(storyId: string, since: Date | null) {
  if (since) {
    return db().query.sessions.findMany({
      where: and(eq(schema.sessions.storyId, storyId), gte(schema.sessions.startedAt, since)),
    });
  }
  return db().query.sessions.findMany({
    where: eq(schema.sessions.storyId, storyId),
  });
}

async function fetchChatMessages(storyId: string, since: Date | null) {
  if (since) {
    return db().query.chatMessages.findMany({
      where: and(eq(schema.chatMessages.storyId, storyId), gte(schema.chatMessages.timestamp, since)),
    });
  }
  return db().query.chatMessages.findMany({
    where: eq(schema.chatMessages.storyId, storyId),
  });
}

async function fetchInsights(storyId: string, since: Date | null) {
  if (since) {
    return db().query.writerInsights.findMany({
      where: and(eq(schema.writerInsights.storyId, storyId), gte(schema.writerInsights.lastObservedAt, since)),
    });
  }
  return db().query.writerInsights.findMany({
    where: eq(schema.writerInsights.storyId, storyId),
  });
}

// ─── Serialization (Postgres → JSON) ───

function serializeChapter(c: typeof schema.chapters.$inferSelect): Record<string, unknown> {
  return {
    id: c.id,
    title: c.title,
    content: c.content,
    summary: c.summary,
    canonStatus: c.canonStatus,
    source: c.source,
    orderIndex: c.orderIndex,
    wordCount: c.wordCount,
    version: c.version,
    updatedAt: c.updatedAt.toISOString(),
  };
}

function serializeChapterVersion(v: typeof schema.chapterVersions.$inferSelect): Record<string, unknown> {
  return {
    id: v.id,
    chapterId: v.chapterId,
    createdAt: v.createdAt.toISOString(),
    data: v.data,
  };
}

function serializeSnapshot(s: typeof schema.storySnapshots.$inferSelect): Record<string, unknown> {
  return {
    id: s.id,
    storyId: s.storyId,
    name: s.name,
    description: s.description,
    wordCount: s.wordCount,
    chapterCount: s.chapterCount,
    createdAt: s.createdAt.getTime(),
    data: s.data,
  };
}

function serializeSession(s: typeof schema.sessions.$inferSelect): Record<string, unknown> {
  return {
    id: s.id,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
    wordsAdded: s.wordsAdded,
    flowScore: s.flowScore,
    heteronymId: s.heteronymId,
    data: s.data,
  };
}

function serializeChatMessage(m: typeof schema.chatMessages.$inferSelect): Record<string, unknown> {
  return {
    id: m.id,
    chapterId: m.chapterId,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp.getTime(),
  };
}

function serializeInsight(i: typeof schema.writerInsights.$inferSelect): Record<string, unknown> {
  return {
    id: i.id,
    category: i.category,
    observation: i.observation,
    evidenceCount: i.evidenceCount,
    lastObservedAt: i.lastObservedAt.getTime(),
    confidence: i.confidence,
    pinned: i.pinned,
  };
}
