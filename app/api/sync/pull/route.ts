import { NextRequest } from 'next/server';
import { eq, and, gte } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db/client';
import * as schema from '@/db/schema';
import { requireUser, isAuthError } from '@/lib/auth';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';

export const runtime = 'nodejs';

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

  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  if (!isDatabaseConfigured()) {
    return err('internal_error', 'Database not configured', 500, undefined, { requestId });
  }

  const sinceParam = req.nextUrl.searchParams.get('since');
  const storyIdParam = req.nextUrl.searchParams.get('storyId');
  const sinceDate = sinceParam ? new Date(sinceParam) : null;

  try {
    // Find the user's story. If storyId is provided, verify ownership.
    // Otherwise, return the user's most recent story.
    let story: typeof schema.stories.$inferSelect | undefined;

    if (storyIdParam) {
      story = await db().query.stories.findFirst({
        where: and(
          eq(schema.stories.id, storyIdParam),
          eq(schema.stories.ownerId, userId),
        ),
      });
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

    const serverTimestamp = new Date().toISOString();

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
  // chapterVersions don't have updatedAt; use createdAt for filtering
  const allChapters = await db().query.chapters.findMany({
    where: eq(schema.chapters.storyId, storyId),
    columns: { id: true },
  });
  const chapterIds = allChapters.map(c => c.id);
  if (chapterIds.length === 0) return [];

  const versions = await db().query.chapterVersions.findMany();
  return versions.filter(v => {
    if (!chapterIds.includes(v.chapterId)) return false;
    if (since && v.createdAt < since) return false;
    return true;
  });
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
