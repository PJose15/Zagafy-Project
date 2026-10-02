import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/storage/dexie-db';
import { persistProjectState } from '@/lib/storage/persist-project';
import type { StoryState } from '@/lib/store';
function state(title: string, chapters = [{ id: 'ch1', title: 'Chapter', content: 'Words worth keeping', summary: '' }]) {
  return { title, chapters } as StoryState;
}
describe('Atomic project persistence', () => {
  beforeEach(async () => { await db.stories.clear(); await db.chapters.clear(); await db.syncQueue.clear(); vi.restoreAllMocks(); });
  it('commits chapter contents, stripped story metadata and queue under the supplied project', async () => {
    await persistProjectState(state('Saved'), 'captured_project');
    expect((await db.chapters.get('ch1'))?.projectId).toBe('captured_project');
    expect((await db.chapters.get('ch1'))?.content).toBe('Words worth keeping');
    const story = await db.stories.get('captured_project');
    expect(JSON.parse(story!.data).chapters[0].content).toBe('');
    expect(story?.wordCount).toBe(3);
    const queued = await db.syncQueue.toArray();
    expect(queued).toHaveLength(2); expect(queued.every(row => row.projectId === 'captured_project')).toBe(true);
  });
  it('rolls back metadata and deletions when any chapter write fails', async () => {
    await persistProjectState(state('Previous'), 'p1'); await db.syncQueue.clear();
    vi.spyOn(db.chapters, 'put').mockRejectedValueOnce(new Error('quota exhausted'));
    await expect(persistProjectState(state('New', [{ id: 'ch2', title: 'New', content: 'Unsaved', summary: '' }]), 'p1')).rejects.toThrow('quota exhausted');
    expect((await db.stories.get('p1'))?.title).toBe('Previous');
    expect((await db.chapters.get('ch1'))?.content).toBe('Words worth keeping');
    expect(await db.chapters.get('ch2')).toBeUndefined();
    expect(await db.syncQueue.count()).toBe(0);
  });
  it('rolls back the manuscript when the durable queue write fails', async () => {
    await persistProjectState(state('Previous'), 'p1'); await db.syncQueue.clear();
    vi.spyOn(db.syncQueue, 'bulkPut').mockRejectedValueOnce(new Error('queue write failure'));
    await expect(persistProjectState(state('New'), 'p1')).rejects.toThrow();
    expect((await db.stories.get('p1'))?.title).toBe('Previous');
  });
  it('queues chapter deletion after removing content, without touching another project', async () => {
    await persistProjectState(state('Keep other', [{ id: 'other_ch', title: 'Other', content: 'Private', summary: '' }]), 'p2');
    await persistProjectState(state('Mine'), 'p1'); await db.syncQueue.clear();
    await persistProjectState(state('Empty', []), 'p1');
    expect(await db.chapters.get('ch1')).toBeUndefined();
    expect((await db.chapters.get('other_ch'))?.content).toBe('Private');
    expect(await db.syncQueue.toArray()).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: 'chapter', entityId: 'ch1', op: 'delete', projectId: 'p1' })]));
  });
  it('keeps server version across local autosave', async () => {
    await persistProjectState(state('Mine'), 'p1'); await db.chapters.update('ch1', { version: 8 });
    await persistProjectState(state('Edited'), 'p1');
    expect((await db.chapters.get('ch1'))?.version).toBe(8);
  });
  it('refuses a chapter ID that belongs to another project without overwriting it', async () => {
    await persistProjectState(state('Other'), 'p2');
    await expect(persistProjectState(state('Mine'), 'p1')).rejects.toThrow('another project');
    expect(await db.stories.get('p1')).toBeUndefined();
    expect((await db.chapters.get('ch1'))?.projectId).toBe('p2');
  });
});
