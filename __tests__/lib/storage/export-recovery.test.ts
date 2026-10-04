import 'fake-indexeddb/auto';
import { beforeEach, it, expect, vi } from 'vitest';
import { db, getStory, putChapterContent } from '@/lib/storage/dexie-db';
import { exportProjectRecovery } from '@/lib/storage/export-recovery';
beforeEach(async () => { await db.stories.clear(); await db.chapters.clear(); vi.restoreAllMocks(); });
it('exports corrupt metadata and full chapter content for only the selected project without changing it', async () => {
  await db.stories.put({ id: 'p1', data: '{corrupt', updatedAt: 1 });
  await db.stories.put({ id: 'p2', data: '{private', updatedAt: 1 });
  await putChapterContent('mine', 'Recover these words', '', '', undefined, undefined, 'p1');
  await putChapterContent('other', 'Other project text', '', '', undefined, undefined, 'p2');
  await expect(getStory('p1')).rejects.toThrow();
  const recovery = await exportProjectRecovery('p1');
  expect(recovery.story?.data).toBe('{corrupt');
  expect(recovery.chapters.map(row => row.content)).toEqual(['Recover these words']);
  expect(JSON.stringify(recovery)).not.toContain('Other project text');
  expect((await db.stories.get('p1'))?.data).toBe('{corrupt');
  expect(await db.chapters.count()).toBe(2);
});
it('propagates storage failures instead of reporting an empty project', async () => {
  vi.spyOn(db.stories, 'get').mockRejectedValueOnce(new Error('unavailable'));
  await expect(getStory('p1')).rejects.toThrow('unavailable');
});
it.each(['null', '[]', '"text"'])('rejects invalid story objects: %s', async data => {
  await db.stories.put({ id: 'p1', data, updatedAt: 1 });
  await expect(getStory('p1')).rejects.toThrow('not an object');
  expect((await db.stories.get('p1'))?.data).toBe(data);
});
