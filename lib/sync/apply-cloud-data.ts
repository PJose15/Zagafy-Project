import { db as dexieDb } from '@/lib/storage/dexie-db';
import { wordCount } from '@/lib/editor/serialization';
import type { ManuscriptComment } from '@/lib/types/comment';
import type { PullResponse } from './types';
import { readQueue, updateSyncMeta } from './sync-queue';

/** All downloaded rows and their watermark commit together, or none do. */
export const cloudTables = () => [dexieDb.stories, dexieDb.chapters, dexieDb.chapterVersions,
  dexieDb.storySnapshots, dexieDb.sessions, dexieDb.chatMessages, dexieDb.writerInsights,
  dexieDb.comments, dexieDb.syncQueue, dexieDb.syncMeta];

export async function applyCloudData(data: PullResponse, projectId: string): Promise<Record<string, number>> {
  return dexieDb.transaction('rw', cloudTables(), async () => {
    const counts: Record<string, number> = {};
    // Refuse global primary-key collisions with another local project before writing.
    const scoped = [
      [data.chapters, dexieDb.chapters],
      [data.chapterVersions, dexieDb.chapterVersions],
      [data.sessions, dexieDb.sessions],
      [data.chatMessages, dexieDb.chatMessages],
      [data.writerInsights, dexieDb.writerInsights],
      [data.comments ?? [], dexieDb.comments],
    ] as const;
    for (const [rows, table] of scoped) {
      for (const row of rows) {
        if (typeof row.id !== 'string' || !row.id) throw new Error('Invalid cloud record');
        const existing = await table.get(row.id);
        if (existing && existing.projectId !== projectId) throw new Error('Cloud record belongs to another local project');
      }
    }
    for (const row of data.storySnapshots) {
      const existing = await dexieDb.storySnapshots.get(row.id as string);
      if (existing && existing.storyId !== projectId) {
        // Older pulls stored the server ID in this local scope field. Repair
        // only when one existing binding unambiguously identifies this project.
        const bindings = await dexieDb.syncMeta.toArray();
        const owners = bindings.filter(meta => meta.serverStoryId === data.storyId);
        if (existing.storyId !== data.storyId || owners.length !== 1 || owners[0].id !== projectId) {
          throw new Error('Cloud snapshot belongs to another local project');
        }
      }
    }
    // Rows belong to the project captured before the network request.

    // Dirty guard: an entity with a pending (unpushed) local write must NOT be
    // overwritten by a background pull — that silently discards live edits. Its
    // queued delta will push on the next cycle, where server-side version checks
    // reconcile it. History, session and snapshot edits receive the same guard.
    const { entries: pending } = await readQueue(projectId);
    const pendingChapterIds = new Set(
      pending.filter(e => e.entityType === 'chapter').map(e => e.entityId),
    );
    const pendingInsightIds = new Set(
      pending.filter(e => e.entityType === 'writerInsight').map(e => e.entityId),
    );
    const pendingCommentIds = new Set(
      pending.filter(e => e.entityType === 'comment').map(e => e.entityId),
    );
    const isPending = (type: string, id: unknown) => pending.some(e => e.entityType === type && e.entityId === id);
    const storyDirty = pending.some(e => e.entityType === 'story');

    // Apply story state (skip if a local story edit is pending — see dirty guard)
    if (data.story?.state && !storyDirty) {
      const state = data.story.state as Record<string, unknown>;
      // Merge server state into local Dexie story blob
      const existingStory = await dexieDb.stories.get(projectId);
      let chapterCount = existingStory?.chapterCount ?? 0;
      const stateChapters = (state as { chapters?: unknown[] }).chapters;
      if (Array.isArray(stateChapters)) chapterCount = stateChapters.length;
      await dexieDb.stories.put({
        id: projectId,
        data: JSON.stringify(state),
        title: typeof (state as { title?: unknown }).title === 'string'
          ? (state as { title: string }).title
          : existingStory?.title ?? 'Untitled Project',
        chapterCount,
        wordCount: existingStory?.wordCount ?? data.chapters.reduce((sum, ch) => sum + wordCount(typeof ch.content === 'string' ? ch.content : ''), 0),
        status: existingStory?.status ?? 'draft',
        createdAt: existingStory?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      });
      // Track the server blob version so the next story push bases its
      // optimistic-concurrency check on what we just adopted.
      const pulledVersion = (data.story as { version?: unknown }).version;
      if (typeof pulledVersion === 'number') {
        await updateSyncMeta({ serverStoryVersion: pulledVersion }, projectId);
      }
      counts.story = 1;
    }

    // Apply chapters (skip any with a pending local edit — dirty guard)
    if (data.chapters.length > 0) {
      let appliedChapters = 0;
      for (const ch of data.chapters) {
        if (pendingChapterIds.has(ch.id as string)) continue;
        await dexieDb.chapters.put({
          id: ch.id as string,
          projectId,
          title: (ch.title as string) ?? '',
          content: (ch.content as string) ?? '',
          summary: (ch.summary as string) ?? '',
          canonStatus: ch.canonStatus as string | undefined,
          source: ch.source as string | undefined,
          updatedAt: ch.updatedAt
            ? new Date(ch.updatedAt as string).getTime()
            : Date.now(),
          // Round-trip the server's optimistic-concurrency version — without it
          // every subsequent push of this chapter conflicts forever.
          version: typeof ch.version === 'number' ? ch.version : undefined,
        });
        appliedChapters++;
      }
      counts.chapters = appliedChapters;
    }

    // Apply chapter versions
    if (data.chapterVersions.length > 0) {
      let applied = 0;
      for (const v of data.chapterVersions) {
        if (!isPending('chapterVersion', v.id)) {
          await dexieDb.chapterVersions.put({
            id: v.id as string,
            projectId,
            chapterId: (v.chapterId as string) ?? '',
            createdAt: (v.createdAt as string) ?? new Date().toISOString(),
            data: typeof v.data === 'string' ? v.data : JSON.stringify(v.data),
          });
          applied++;
        }
      }
      counts.chapterVersions = applied;
    }

    // Apply snapshots
    if (data.storySnapshots.length > 0) {
      let applied = 0;
      for (const s of data.storySnapshots) {
        if (!isPending('storySnapshot', s.id)) {
          await dexieDb.storySnapshots.put({
            id: s.id as string,
            storyId: projectId,
            name: (s.name as string) ?? '',
            description: (s.description as string) ?? '',
            createdAt: (s.createdAt as number) ?? Date.now(),
            wordCount: (s.wordCount as number) ?? 0,
            chapterCount: (s.chapterCount as number) ?? 0,
            data: typeof s.data === 'string' ? s.data : JSON.stringify(s.data),
          });
          applied++;
        }
      }
      counts.storySnapshots = applied;
    }

    // Apply sessions
    if (data.sessions.length > 0) {
      let applied = 0;
      for (const s of data.sessions) {
        if (!isPending('session', s.id)) {
          await dexieDb.sessions.put({
            id: s.id as string,
            projectId,
            startedAt: (s.startedAt as string) ?? '',
            endedAt: (s.endedAt as string) ?? '',
            wordsAdded: (s.wordsAdded as number) ?? 0,
            flowScore: (s.flowScore as number) ?? null,
            heteronymId: (s.heteronymId as string) ?? null,
            data: JSON.stringify({ ...(typeof s.data === 'string' ? JSON.parse(s.data) : s.data as Record<string, unknown>), projectId }),
          });
          applied++;
        }
      }
      counts.sessions = applied;
    }

    // Apply chat messages
    if (data.chatMessages.length > 0) {
      let applied = 0;
      for (const m of data.chatMessages) {
        if (!isPending('chatMessage', m.id)) {
          await dexieDb.chatMessages.put({
            id: m.id as string,
            projectId,
            role: (m.role as 'user' | 'assistant') ?? 'user',
            content: (m.content as string) ?? '',
            timestamp: (m.timestamp as number) ?? Date.now(),
            chapterId: m.chapterId as string | undefined,
          });
          applied++;
        }
      }
      counts.chatMessages = applied;
    }

    // Apply writer insights (skip any with a pending local edit — dirty guard)
    if (data.writerInsights.length > 0) {
      let appliedInsights = 0;
      for (const i of data.writerInsights) {
        if (pendingInsightIds.has(i.id as string)) continue;
        await dexieDb.writerInsights.put({
          id: i.id as string,
          projectId,
          category: (i.category as string) ?? 'voice',
          observation: (i.observation as string) ?? '',
          evidenceCount: (i.evidenceCount as number) ?? 1,
          lastObservedAt: (i.lastObservedAt as number) ?? Date.now(),
          confidence: Math.min(100, Math.max(0, (i.confidence as number) ?? 50)) / 100,
          pinned: (i.pinned as number) ?? 0,
        });
        appliedInsights++;
      }
      counts.writerInsights = appliedInsights;
    }

    // Apply comments (A7). Skip any with a pending local edit (dirty guard). The
    // pulled payload is a full ManuscriptComment minus projectId (the server
    // scopes by storyId), so re-stamp the active projectId. Offsets were computed
    // against the (also-synced) chapter text; the manuscript editor re-anchors on
    // load, so a small drift self-heals without special handling here.
    const pulledComments = Array.isArray(data.comments) ? data.comments : [];
    if (pulledComments.length > 0) {
      let appliedComments = 0;
      for (const c of pulledComments) {
        const id = c.id as string;
        if (!id || pendingCommentIds.has(id)) continue;
        await dexieDb.comments.put({
          id,
          projectId,
          chapterId: (c.chapterId as string) ?? '',
          startOffset: typeof c.startOffset === 'number' ? c.startOffset : 0,
          endOffset: typeof c.endOffset === 'number' ? c.endOffset : 0,
          quote: (c.quote as string) ?? '',
          prefix: (c.prefix as string) ?? '',
          suffix: (c.suffix as string) ?? '',
          text: (c.text as string) ?? '',
          replies: Array.isArray(c.replies) ? (c.replies as ManuscriptComment['replies']) : [],
          resolved: c.resolved === true,
          orphaned: c.orphaned === true,
          createdAt: (c.createdAt as string) ?? new Date().toISOString(),
          updatedAt: (c.updatedAt as string) ?? new Date().toISOString(),
        });
        appliedComments++;
      }
      counts.comments = appliedComments;
    }

    await updateSyncMeta({ lastPulledAt: data.serverTimestamp }, projectId);
    return counts;
  });
}
