import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/storage/dexie-db';
import { cloudTables } from '@/lib/sync/apply-cloud-data';
import { prepareInitialUpload } from '@/lib/sync/initial-upload';

beforeEach(async () => {
  vi.restoreAllMocks();
  await db.transaction('rw', cloudTables(), async () => { for (const table of cloudTables()) await table.clear(); });
  await db.stories.put({ id: 'p_1', data: '{"title":"Existing novel","chapters":[{"id":"ch_1"}]}', updatedAt: 1 });
  await db.chapters.put({ id: 'ch_1', projectId: 'p_1', title: 'Opening', content: 'Existing local writing', summary: '', updatedAt: 1 });
  await db.storySnapshots.put({ id: 'snap_1', storyId: 'p_1', name: 'Backup', description: '', createdAt: 1, wordCount: 3, chapterCount: 1, data: '{}' });
});
afterEach(() => vi.restoreAllMocks());
describe('Complete initial upload', () => {
  it('seeds the manuscript even when the original queue contains only a snapshot', async () => {
    await db.syncQueue.put({ id: 'original', projectId: 'p_1', entityType: 'storySnapshot', entityId: 'snap_1', op: 'upsert', timestamp: 1 });
    const binding = await prepareInitialUpload('p_1');
    expect((await db.syncMeta.get('p_1'))?.serverStoryId).toBe(binding);
    expect(await db.syncQueue.toArray()).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: 'story', entityId: 'p_1', projectId: 'p_1' }),
      expect.objectContaining({ entityType: 'chapter', entityId: 'ch_1', projectId: 'p_1' }),
      expect.objectContaining({ entityType: 'storySnapshot', entityId: 'snap_1', projectId: 'p_1' }),
    ]));
    expect((await db.chapters.get('ch_1'))?.content).toBe('Existing local writing');
  });
  it('creates only one binding and upload seed for simultaneous preparations', async () => {
    const bindings = await Promise.all([prepareInitialUpload('p_1'), prepareInitialUpload('p_1')]);
    expect(bindings[0]).toBe(bindings[1]); expect(await db.syncQueue.count()).toBe(3);
  });
  it('rolls back the seed and binding when queue storage fails', async () => {
    vi.spyOn(db.syncQueue, 'bulkPut').mockRejectedValue(new Error('Disk full'));
    await expect(prepareInitialUpload('p_1')).rejects.toThrow('Disk full');
    expect(await db.syncMeta.count()).toBe(0); expect(await db.syncQueue.count()).toBe(0);
    expect((await db.chapters.get('ch_1'))?.content).toBe('Existing local writing');
  });
  it('rejects an incomplete or corrupt local manuscript without binding it', async () => {
    await db.chapters.clear(); await expect(prepareInitialUpload('p_1')).rejects.toThrow('incomplete');
    await db.stories.update('p_1', { data: 'broken JSON' }); await expect(prepareInitialUpload('p_1')).rejects.toThrow();
    expect(await db.syncMeta.count()).toBe(0); expect(await db.syncQueue.count()).toBe(0);
  });
  it('leaves an existing cloud binding and its queue unchanged', async () => {
    await db.syncMeta.put({ id: 'p_1', serverStoryId: 'already-bound', lastPulledAt: null, lastPushedAt: null });
    expect(await prepareInitialUpload('p_1')).toBe('already-bound'); expect(await db.syncQueue.count()).toBe(0);
  });
  it('seeds only records scoped to this project', async () => {
    await db.chapters.put({ id: 'private_ch', projectId: 'other', title: 'Private', content: 'Other project text', summary: '', updatedAt: 1 });
    await prepareInitialUpload('p_1'); expect((await db.syncQueue.toArray()).some(row => row.entityId === 'private_ch')).toBe(false);
  });
});
