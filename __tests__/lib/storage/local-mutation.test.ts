import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { db, putVersion, putAllVersions, putSession, putAllSessions } from '@/lib/storage/dexie-db';
import { createSnapshot, deleteSnapshot } from '@/lib/snapshot';
import { observe, setInsightPinned, deleteInsight } from '@/lib/writer-memory';
import { addComment, updateCommentText, deleteComment } from '@/lib/comments/comments';
import { setActiveProjectId } from '@/lib/projects/active-project';
import { LOCAL_MUTATION_EVENT } from '@/lib/sync/local-mutation';
import { cloudTables } from '@/lib/sync/apply-cloud-data';

const version = (id = 'v_1') => ({ id, chapterId: 'ch_1', label: 'Draft', content: 'My writing', createdAt: '2026-10-02T10:00:00Z' });
const session = (id = 's_1') => ({ id, projectId: 'p_1', startedAt: '2026-10-02T10:00:00Z', endedAt: '2026-10-02T11:00:00Z', wordsAdded: 100 });
const comment = () => addComment({ chapterId: 'ch_1', startOffset: 0, endOffset: 2, quote: 'My', prefix: '', suffix: '', text: 'A note' });
const operations = [
  ['version', () => putVersion(version()), () => db.chapterVersions.count()],
  ['versions', () => putAllVersions([version()]), () => db.chapterVersions.count()],
  ['session', () => putSession(session()), () => db.sessions.count()],
  ['sessions', () => putAllSessions([session()]), () => db.sessions.count()],
  ['snapshot', () => createSnapshot({ chapters: [], characters: [], world_bible: [] } as any, { name: 'Backup' }), () => db.storySnapshots.count()],
  ['insight', () => observe({ category: 'voice', observation: 'Short sentences' }), () => db.writerInsights.count()],
  ['comment', comment, () => db.comments.count()],
] as const;
beforeEach(async () => {
  vi.restoreAllMocks(); localStorage.clear(); setActiveProjectId('p_1');
  await db.transaction('rw', cloudTables(), async () => { for (const table of cloudTables()) await table.clear(); });
});
afterEach(() => vi.restoreAllMocks());
describe('Durable local mutation transactions', () => {
  for (const [name, write, count] of operations) {
    it(`commits ${name} and a project-scoped queue entry before notifying sync`, async () => {
      const listener = vi.fn(); window.addEventListener(LOCAL_MUTATION_EVENT, listener);
      try {
        await write(); expect(await count()).toBe(1);
        expect(await db.syncQueue.toArray()).toEqual([expect.objectContaining({ projectId: 'p_1', op: 'upsert' })]);
        expect(listener).toHaveBeenCalledOnce();
      } finally { window.removeEventListener(LOCAL_MUTATION_EVENT, listener); }
    });
    it(`rolls back ${name} when the queue cannot be stored`, async () => {
      const listener = vi.fn(); window.addEventListener(LOCAL_MUTATION_EVENT, listener);
      try {
        vi.spyOn(db.syncQueue, 'put').mockRejectedValue(new Error('Queue storage unavailable'));
        await expect(write()).rejects.toThrow('Queue storage unavailable');
        expect(await count()).toBe(0); expect(await db.syncQueue.count()).toBe(0); expect(listener).not.toHaveBeenCalled();
      } finally { window.removeEventListener(LOCAL_MUTATION_EVENT, listener); }
    });
  }
  it('queues removal of versions and sessions omitted from a replacement without touching another project', async () => {
    await putVersion(version()); await putVersion(version('v_other'), 'p_other');
    await putSession(session()); await putSession({ ...session('s_other'), projectId: 'p_other' });
    await db.syncQueue.clear(); await putAllVersions([]); await putAllSessions([]);
    expect(await db.syncQueue.toArray()).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectId: 'p_1', entityType: 'chapterVersion', entityId: 'v_1', op: 'delete' }),
      expect.objectContaining({ projectId: 'p_1', entityType: 'session', entityId: 's_1', op: 'delete' }),
    ]));
    expect(await db.chapterVersions.get('v_other')).toBeDefined(); expect(await db.sessions.get('s_other')).toBeDefined();
  });
  it('preserves a previous session after a failed replacement', async () => {
    await putSession(session()); await db.syncQueue.clear();
    vi.spyOn(db.syncQueue, 'put').mockRejectedValue(new Error('Disk full'));
    await expect(putAllSessions([session('s_new')])).rejects.toThrow('Disk full');
    expect(await db.sessions.get('s_1')).toBeDefined(); expect(await db.sessions.get('s_new')).toBeUndefined();
  });
  it('refuses cross-project global ID collisions for history and sessions', async () => {
    await putVersion(version(), 'p_other'); await putSession({ ...session(), projectId: 'p_other' });
    await expect(putVersion(version())).rejects.toThrow('another project');
    await expect(putSession(session())).rejects.toThrow('another project');
    expect((await db.sessions.get('s_1'))?.projectId).toBe('p_other');
  });
  it('retains pinned insights and comment text when a mutation queue write fails', async () => {
    const insight = await observe({ category: 'voice', observation: 'Short sentences' }); const note = await comment(); await db.syncQueue.clear();
    vi.spyOn(db.syncQueue, 'put').mockRejectedValue(new Error('Disk full'));
    await expect(setInsightPinned(insight.id, true)).rejects.toThrow('Disk full');
    await expect(updateCommentText(note.id, 'Changed')).rejects.toThrow('Disk full');
    expect((await db.writerInsights.get(insight.id))?.pinned).toBe(0); expect((await db.comments.get(note.id))?.text).toBe('A note');
  });
  it('queues deletions against the original project even after switching', async () => {
    const snap = await createSnapshot({ chapters: [] } as any, { name: 'Backup' });
    const insight = await observe({ category: 'voice', observation: 'Short sentences' }); const note = await comment(); await db.syncQueue.clear();
    setActiveProjectId('p_other'); await deleteSnapshot(snap.id); await deleteInsight(insight.id); await deleteComment(note.id);
    const queued = await db.syncQueue.toArray(); expect(queued).toHaveLength(3);
    expect(queued.every(row => row.projectId === 'p_1' && row.op === 'delete')).toBe(true);
  });
});
