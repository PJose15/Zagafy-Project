import 'fake-indexeddb/auto';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { db, deleteProjectData } from '@/lib/storage/dexie-db';
import { applyCloudData, cloudTables } from '@/lib/sync/apply-cloud-data';
import { prepareInitialUpload } from '@/lib/sync/initial-upload';
import { flushCloudDeletes } from '@/lib/sync/cloud-delete-outbox';
import type { PullResponse } from '@/lib/sync/types';
const payload = (extra: Partial<PullResponse> = {}): PullResponse => ({ accountId: 'owner', storyId: 'server', story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], comments: [], serverTimestamp: '2026-10-03T10:00:00Z', ...extra });
beforeEach(async () => {
  localStorage.clear(); localStorage.setItem('zagafy_workspace_sync_owner', 'owner');
  for (const table of [...cloudTables(), db.cloudDeleteQueue]) await table.clear();
  await db.stories.put({ id: 'local', title: 'Local work', data: JSON.stringify({ title: 'Local work', chapters: [{ id: 'ch', title: 'Chapter', content: '' }] }), chapterCount: 1, wordCount: 2, status: 'draft', createdAt: 0, updatedAt: 0 });
  await db.chapters.put({ id: 'ch', projectId: 'local', title: 'Chapter', content: 'Unsynced offline writing', summary: '', updatedAt: 0 });
  await db.syncMeta.put({ id: 'local', serverStoryId: 'server', lastPulledAt: '2026-10-02T00:00:00Z', lastPushedAt: null });
  await db.syncQueue.put({ id: 'pending', projectId: 'local', entityType: 'chapter', entityId: 'ch', op: 'upsert', timestamp: 0 });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const deletedChapter = payload({ tombstones: [{ entityType: 'chapter', entityId: 'ch', deletedAt: '2026-10-03T09:00:00Z' }] });
it('preserves offline manuscript and dependent history before deleting them and acknowledging the watermark', async () => {
  await db.chapterVersions.put({ id: 'version', projectId: 'local', chapterId: 'ch', createdAt: '', data: '{"content":"Earlier writing"}' });
  await db.syncQueue.put({ id: 'version-pending', projectId: 'local', entityType: 'chapterVersion', entityId: 'version', op: 'upsert', timestamp: 0 });
  await applyCloudData(deletedChapter, 'local');
  expect(await db.chapters.count()).toBe(0); expect(await db.chapterVersions.count()).toBe(0); expect(await db.syncQueue.count()).toBe(0);
  const backups = await db.storySnapshots.toArray(); expect(backups).toHaveLength(1);
  const recovery = JSON.parse(backups[0].data); expect(recovery.chapters[0].content).toBe('Unsynced offline writing');
  expect(recovery.deletionRecoveryRecords).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'chapterVersion', id: 'version' })]));
  expect(JSON.parse((await db.stories.get('local'))!.data).chapters).toEqual([]);
  expect((await db.syncMeta.get('local'))?.lastPulledAt).toBe(deletedChapter.serverTimestamp);
  await applyCloudData(deletedChapter, 'local'); expect(await db.storySnapshots.count()).toBe(1);
});
it('failed recovery persistence rolls back deletion, queue cleanup and the watermark', async () => {
  vi.spyOn(db.storySnapshots, 'put').mockRejectedValueOnce(new Error('quota'));
  await expect(applyCloudData(deletedChapter, 'local')).rejects.toThrow('quota');
  expect((await db.chapters.get('ch'))?.content).toBe('Unsynced offline writing');
  expect(await db.syncQueue.count()).toBe(1);
  expect((await db.syncMeta.get('local'))?.lastPulledAt).toBe('2026-10-02T00:00:00Z');
});
it('refuses deletion collisions with a foreign local project', async () => {
  await db.chapters.update('ch', { projectId: 'foreign' });
  await expect(applyCloudData(deletedChapter, 'local')).rejects.toThrow('another local project');
  expect(await db.chapters.count()).toBe(1); expect(await db.storySnapshots.count()).toBe(0);
});
it('a whole-project receipt keeps all local writing and blocks initial re-upload', async () => {
  await applyCloudData(payload({ storyDeletedAt: '2026-10-03T10:00:00Z' }), 'local');
  expect((await db.chapters.get('ch'))?.content).toBe('Unsynced offline writing');
  expect(await db.syncQueue.count()).toBe(1); expect(await db.storySnapshots.count()).toBe(1);
  await expect(prepareInitialUpload('local')).rejects.toThrow('Cloud project was deleted');
  await applyCloudData(payload({ storyDeletedAt: '2026-10-03T10:00:00Z' }), 'local');
  expect(await db.storySnapshots.count()).toBe(1);
});
it('a project deletion receipt must match the established binding', async () => {
  await expect(applyCloudData(payload({ storyId: 'foreign', storyDeletedAt: '2026-10-03T10:00:00Z' }), 'local')).rejects.toThrow('binding');
  expect((await db.syncMeta.get('local'))?.serverDeletedAt).toBeUndefined();
});
it('local project removal retains a cloud outbox across network failure and retries until confirmed', async () => {
  await deleteProjectData('local', { storyId: 'server', accountId: 'owner' });
  expect(await db.stories.count()).toBe(0); expect(await db.syncMeta.count()).toBe(0); expect(await db.cloudDeleteQueue.count()).toBe(1);
  const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { accountId: 'owner', deleted: true } }) });
  vi.stubGlobal('fetch', fetch);
  await expect(flushCloudDeletes()).rejects.toThrow('offline'); expect(await db.cloudDeleteQueue.count()).toBe(1);
  await flushCloudDeletes(); expect(await db.cloudDeleteQueue.count()).toBe(0);
});
it('outbox acknowledgement from a different signed-in account cannot erase its pending delete', async () => {
  await db.cloudDeleteQueue.put({ id: 'server', accountId: 'owner', projectId: 'local', createdAt: 0 });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: { accountId: 'another', deleted: true } }) })));
  await expect(flushCloudDeletes()).rejects.toThrow('not confirmed'); expect(await db.cloudDeleteQueue.count()).toBe(1);
});
it('outbox failure and local deletion roll back together', async () => {
  vi.spyOn(db.cloudDeleteQueue, 'put').mockRejectedValueOnce(new Error('quota'));
  await expect(deleteProjectData('local', { storyId: 'server', accountId: 'owner' })).rejects.toThrow('quota');
  expect(await db.stories.count()).toBe(1); expect(await db.chapters.count()).toBe(1);
});

it('preserves textarea text not yet autosaved before applying a deletion', async () => {
  const { registerPendingRecovery } = await import('@/lib/storage/pending-recovery');
  const committed = vi.fn();
  const unregister = registerPendingRecovery({ projectId: 'local', priority: 1, capture: () => ({
    state: { title: 'Local work', chapters: [{ id: 'ch', title: 'Chapter', content: 'Newest textarea text', summary: '' }] } as import('@/lib/store').StoryState, committed,
  }) });
  try {
    await applyCloudData(deletedChapter, 'local');
    expect((await db.storySnapshots.toArray()).some(row => JSON.parse(row.data).chapters[0]?.content === 'Newest textarea text')).toBe(true);
    expect(committed).toHaveBeenCalledTimes(1);
    const { persistProjectState } = await import('@/lib/storage/persist-project');
    await expect(persistProjectState({ chapters: [{ id: 'ch', content: 'Stale tab text' }] } as import('@/lib/store').StoryState, 'local')).rejects.toThrow('deleted in the cloud');
    expect(await db.chapters.count()).toBe(0);
  } finally { unregister(); }
});
it('failed buffer recovery retains the editor checkpoint and leaves all rows untouched', async () => {
  const { registerPendingRecovery } = await import('@/lib/storage/pending-recovery');
  const committed = vi.fn();
  const unregister = registerPendingRecovery({ projectId: 'local', priority: 1, capture: () => ({ state: { chapters: [] } as unknown as import('@/lib/store').StoryState, committed }) });
  try {
    vi.spyOn(db.storySnapshots, 'put').mockRejectedValueOnce(new Error('quota'));
    await expect(applyCloudData(deletedChapter, 'local')).rejects.toThrow('quota');
    expect(committed).not.toHaveBeenCalled(); expect(await db.chapters.count()).toBe(1);
    expect((await db.syncMeta.get('local'))?.serverDeletedEntities).toBeUndefined();
  } finally { unregister(); }
});
it('cross-tab hydration preserves dirty memory and acknowledges it only after successful storage', async () => {
  const { registerPendingRecovery, checkpointPendingRecovery } = await import('@/lib/storage/pending-recovery');
  const committed = vi.fn();
  const unregister = registerPendingRecovery({ projectId: 'local', priority: 0, capture: () => ({
    state: { chapters: [{ id: 'ch', content: 'Pending other-tab edits' }] } as import('@/lib/store').StoryState, committed,
  }) });
  try {
    vi.spyOn(db.storySnapshots, 'put').mockRejectedValueOnce(new Error('quota'));
    await expect(checkpointPendingRecovery('local')).rejects.toThrow('quota'); expect(committed).not.toHaveBeenCalled();
    await checkpointPendingRecovery('local'); expect(committed).toHaveBeenCalledOnce();
    expect(JSON.parse((await db.storySnapshots.toArray())[0].data).chapters[0].content).toBe('Pending other-tab edits');
  } finally { unregister(); }
});
it('contradictory downloaded rows and deletion receipts roll back rather than resurrecting an ID', async () => {
  await expect(applyCloudData({ ...deletedChapter, chapters: [{ id: 'ch', content: 'Stale row' }] }, 'local')).rejects.toThrow('deleted record');
  expect((await db.chapters.get('ch'))?.content).toBe('Unsynced offline writing'); expect(await db.storySnapshots.count()).toBe(0);
});
it('acknowledges removing a shared local copy without requesting owner deletion again', async () => {
  await db.cloudDeleteQueue.put({ id: 'server', accountId: 'owner', projectId: 'local', createdAt: 0 });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ ok: false, error: 'Only the owner can delete this story', details: { accountId: 'owner' } }) })));
  await flushCloudDeletes(); expect(await db.cloudDeleteQueue.count()).toBe(0);
});
