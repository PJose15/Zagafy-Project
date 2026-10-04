import { db } from '@/lib/storage/dexie-db';
import { wordCount } from '@/lib/editor/serialization';
import { updateSyncMeta } from './sync-queue';
import type { DeletionReceipt } from './types';

export const deletionTables = () => [db.stories, db.chapters, db.chapterVersions, db.storySnapshots, db.sessions,
  db.chatMessages, db.writerInsights, db.comments, db.chapterAnalysis, db.syncQueue, db.syncMeta];
const entityTables = () => ({ chapter: db.chapters, chapterVersion: db.chapterVersions, storySnapshot: db.storySnapshots,
  session: db.sessions, chatMessage: db.chatMessages, writerInsight: db.writerInsights, comment: db.comments });

/** Call inside the pull transaction. Recovery, removals and queue cleanup must
 * succeed together; a failed recovery write must leave the watermark unchanged. */
export async function applyDeletionReceipts(receipts: DeletionReceipt[], projectId: string): Promise<number> {
  const tables = entityTables();
  const removals: { type: DeletionReceipt['entityType']; id: string; row: unknown }[] = [];
  for (const receipt of receipts) {
    if (!Object.hasOwn(tables, receipt.entityType) || typeof receipt.entityId !== 'string' || !receipt.entityId ||
        !Number.isFinite(Date.parse(receipt.deletedAt))) throw new Error('Invalid deletion receipt');
    const row = await tables[receipt.entityType].get(receipt.entityId);
    if (row) {
      const scope = 'storyId' in row ? row.storyId : row.projectId;
      if (scope !== projectId) throw new Error('Deleted cloud record belongs to another local project');
      removals.push({ type: receipt.entityType, id: receipt.entityId, row });
    }
    if (receipt.entityType === 'chapter') {
      for (const row of await db.chapterVersions.where('chapterId').equals(receipt.entityId).toArray()) {
        if (row.projectId === projectId) removals.push({ type: 'chapterVersion', id: row.id, row });
      }
      for (const row of await db.comments.where('chapterId').equals(receipt.entityId).toArray()) {
        if (row.projectId === projectId) removals.push({ type: 'comment', id: row.id, row });
      }
    }
  }
  const meta = await db.syncMeta.get(projectId);
  const serverDeletedEntities = { ...meta?.serverDeletedEntities };
  for (const receipt of receipts) serverDeletedEntities[`${receipt.entityType}:${receipt.entityId}`] = receipt.deletedAt;
  await updateSyncMeta({ serverDeletedEntities }, projectId);
  if (removals.length > 0) await preserveDeletionRecovery(projectId, removals);
  const chapterIds = new Set(receipts.filter(row => row.entityType === 'chapter').map(row => row.entityId));
  for (const row of removals) await tables[row.type].delete(row.id);
  for (const id of chapterIds) {
    const analysis = await db.chapterAnalysis.get(id);
    if (analysis?.projectId === projectId) await db.chapterAnalysis.delete(id);
  }
  const queue = await db.syncQueue.where('projectId').equals(projectId).toArray();
  for (const entry of queue) {
    if (receipts.some(receipt => receipt.entityType === entry.entityType && receipt.entityId === entry.entityId) ||
        removals.some(row => row.type === entry.entityType && row.id === entry.entityId)) await db.syncQueue.delete(entry.id);
  }
  const story = await db.stories.get(projectId);
  if (story && chapterIds.size > 0) {
    const state = JSON.parse(story.data);
    if (Array.isArray(state.chapters)) {
      state.chapters = state.chapters.filter((chapter: { id: string }) => !chapterIds.has(chapter.id));
      const chapters = await db.chapters.where('projectId').equals(projectId).toArray();
      await db.stories.put({ ...story, data: JSON.stringify(state), chapterCount: state.chapters.length,
        wordCount: chapters.reduce((sum, chapter) => sum + wordCount(chapter.content), 0), updatedAt: Date.now() });
    }
  }
  return removals.length;
}

/** A normal Versions snapshot also includes raw removed history records for
 * manual recovery/export. It is local-only and never re-queues deleted content. */
export async function preserveDeletionRecovery(projectId: string, records: unknown[]): Promise<void> {
  const story = await db.stories.get(projectId);
  if (!story) throw new Error('Cannot preserve deletion recovery without its local project');
  const state = JSON.parse(story.data);
  const rows = await db.chapters.where('projectId').equals(projectId).toArray();
  const refs = Array.isArray(state.chapters) ? state.chapters : [];
  const chapters = rows.map(row => ({ ...refs.find((ref: { id: string }) => ref.id === row.id), ...row }));
  await db.storySnapshots.put({ recoveryProtected: true, id: crypto.randomUUID(), storyId: projectId, name: 'Cloud deletion recovery (local only)',
    description: 'Local manuscript and removed history preserved before applying a cloud deletion. Export recovery for the raw history records.',
    createdAt: Date.now(), chapterCount: chapters.length, wordCount: chapters.reduce((sum, row) => sum + wordCount(row.content), 0),
    data: JSON.stringify({ ...state, chapters, deletionRecoveryRecords: records }) });
}

export async function markCloudProjectDeleted(projectId: string, serverStoryId: string | null, deletedAt: string): Promise<void> {
  if (!Number.isFinite(Date.parse(deletedAt))) throw new Error('Invalid project deletion receipt');
  const meta = await db.syncMeta.get(projectId);
  if (!serverStoryId || meta?.serverStoryId !== serverStoryId) throw new Error('Project deletion does not match its cloud binding');
  if (!meta.serverDeletedAt) await preserveDeletionRecovery(projectId, []);
  // Keep local manuscript/history and queued edits; block every future upload
  // through this binding instead of automatically recreating a removed project.
  await updateSyncMeta({ serverDeletedAt: deletedAt }, projectId);
}
