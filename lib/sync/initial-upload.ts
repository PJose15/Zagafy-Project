import { db } from '@/lib/storage/dexie-db';
import { cloudTables } from './apply-cloud-data';
import type { SyncEntityType } from './types';

/** A first upload must include existing local writing, even when only history changed. */
export async function prepareInitialUpload(projectId: string): Promise<string> {
  return db.transaction('rw', cloudTables(), async () => {
    const existing = await db.syncMeta.get(projectId);
    if (existing?.serverStoryId) return existing.serverStoryId;
    const story = await db.stories.get(projectId);
    if (!story) throw new Error('Cannot sync a missing local project');
    const state: unknown = JSON.parse(story.data);
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Cannot sync corrupt project data');
    const chapters = await db.chapters.where('projectId').equals(projectId).toArray();
    const refs = (state as { chapters?: unknown }).chapters;
    if (refs !== undefined && (!Array.isArray(refs) || refs.some(ref => !ref || typeof ref !== 'object' || !chapters.some(row => row.id === ref.id)))) {
      throw new Error('Local manuscript is incomplete; cloud upload paused');
    }
    const entities: { entityType: SyncEntityType; entityId: string }[] = [{ entityType: 'story', entityId: projectId }];
    const scoped = [
      ['chapter', chapters],
      ['chapterVersion', await db.chapterVersions.where('projectId').equals(projectId).toArray()],
      ['storySnapshot', await db.storySnapshots.where('storyId').equals(projectId).toArray()],
      ['session', await db.sessions.where('projectId').equals(projectId).toArray()],
      ['chatMessage', await db.chatMessages.where('projectId').equals(projectId).toArray()],
      ['writerInsight', await db.writerInsights.where('projectId').equals(projectId).toArray()],
      ['comment', await db.comments.where('projectId').equals(projectId).toArray()],
    ] as const;
    for (const [entityType, rows] of scoped) for (const row of rows) entities.push({ entityType, entityId: row.id });
    const timestamp = Date.now();
    await db.syncQueue.bulkPut(entities.map(entity => ({ ...entity, id: crypto.randomUUID(), projectId, op: 'upsert' as const, timestamp })));
    const serverStoryId = crypto.randomUUID();
    await db.syncMeta.put({ id: projectId, serverStoryId, lastPulledAt: null, lastPushedAt: null, serverStoryVersion: 0 });
    return serverStoryId;
  });
}
