import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db, putVersion, migrateFromLocalStorage } from '@/lib/storage/dexie-db';
import { readAllVersions, readVersions, addVersion, setCanonical, deleteVersion, renameVersion, ensureInitialVersion, getCanonicalVersion } from '@/lib/types/chapter-version';
import type { ChapterVersion } from '@/lib/types/chapter-version';

const project = 'history-a';
const version = (id = 'v1', extra: Partial<ChapterVersion> = {}): ChapterVersion => ({ id, chapterId: 'ch1', label: 'Version A', content: 'hello world', createdAt: '2026-10-02T00:00:00.000Z', isCanonical: false, source: 'manual', wordCount: 2, ...extra });
const seed = async (value: ChapterVersion, scope = project) => putVersion(value as unknown as Record<string, unknown>, scope);

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('zagafy_project_id', project);
  await db.transaction('rw', [db.chapterVersions, db.syncQueue, db.meta], async () => {
    await db.chapterVersions.clear(); await db.syncQueue.clear(); await db.meta.clear();
  });
});
afterEach(() => vi.restoreAllMocks());

describe('chapter history with authoritative IndexedDB', () => {
  it('returns empty history without reviving legacy global data', async () => {
    localStorage.setItem('zagafy_chapter_versions', JSON.stringify([version()]));
    expect(await readAllVersions(project)).toEqual([]);
  });
  it('keeps legacy data available for the dedicated migration', async () => {
    localStorage.setItem('zagafy_chapter_versions', JSON.stringify([version()]));
    await migrateFromLocalStorage();
    expect(await readAllVersions(project)).toEqual([version()]);
  });
  it('reads valid versions only from the requested project', async () => {
    await seed(version()); await seed(version('other'), 'history-b');
    expect(await readAllVersions(project)).toEqual([version()]);
  });
  it('filters by chapter without sharing history between projects', async () => {
    await seed(version()); await seed(version('v2', { chapterId: 'ch2' }));
    expect(await readVersions('ch1', project)).toEqual([version()]);
    expect(await readVersions('missing', project)).toEqual([]);
  });
  it.each(['{', 'null', '[]', JSON.stringify(version('v1', { source: 'invalid' as never }))])('rejects corrupt history %s without replacing it', async data => {
    await db.chapterVersions.put({ id: 'v1', chapterId: 'ch1', projectId: project, createdAt: '', data });
    await expect(readAllVersions(project)).rejects.toThrow();
    await expect(addVersion('ch1', 'new', 'new', 'manual', false, project)).rejects.toThrow();
    expect((await db.chapterVersions.get('v1'))?.data).toBe(data);
    expect(await db.syncQueue.count()).toBe(0);
  });
  it('rejects mismatched record identities', async () => {
    await db.chapterVersions.put({ id: 'v1', chapterId: 'ch1', projectId: project, createdAt: '', data: JSON.stringify(version('wrong')) });
    await expect(readAllVersions(project)).rejects.toThrow('damaged');
  });
  it.each(['manual', 'scene-change', 'auto-snapshot'] as const)('creates and durably queues a %s version', async source => {
    const added = await addVersion('ch1', 'hello world', 'Draft', source, false, project);
    expect(added).toMatchObject({ chapterId: 'ch1', content: 'hello world', label: 'Draft', source, isCanonical: false, wordCount: 2 });
    expect(await readVersions('ch1', project)).toEqual([added]);
    expect(await db.syncQueue.toArray()).toEqual([expect.objectContaining({ projectId: project, entityId: added.id, entityType: 'chapterVersion', op: 'upsert' })]);
  });
  it.each([['  one\n two\tthree  ', 3], ['', 0], ['   ', 0]] as const)('counts words in %s', async (content, wordCount) => {
    expect((await addVersion('ch1', content, 'Draft', 'manual', false, project)).wordCount).toBe(wordCount);
  });
  it('unmarks only canonical versions of the same chapter', async () => {
    await seed(version('v1', { isCanonical: true }));
    await seed(version('v2', { chapterId: 'ch2', isCanonical: true }));
    const added = await addVersion('ch1', 'next', 'B', 'manual', true, project);
    expect(await getCanonicalVersion('ch1', project)).toEqual(added);
    expect((await getCanonicalVersion('ch2', project))?.id).toBe('v2');
  });
  it('marks a version canonical and keeps other chapters unchanged', async () => {
    await seed(version('v1', { isCanonical: true })); await seed(version('v2'));
    await setCanonical('v2', project);
    expect((await getCanonicalVersion('ch1', project))?.id).toBe('v2');
  });
  it('renames one version without rewriting unrelated rows', async () => {
    await seed(version()); await seed(version('v2')); await db.syncQueue.clear();
    await renameVersion('v1', 'Renamed', project);
    expect((await readVersions('ch1', project)).map(v => v.label)).toEqual(['Renamed', 'Version A']);
    expect((await db.syncQueue.toArray()).map(row => row.entityId)).toEqual(['v1']);
  });
  it('deletes one version and queues its deletion', async () => {
    await seed(version()); await seed(version('v2')); await db.syncQueue.clear();
    await deleteVersion('v1', project);
    expect((await readAllVersions(project)).map(v => v.id)).toEqual(['v2']);
    expect(await db.syncQueue.toArray()).toEqual([expect.objectContaining({ entityId: 'v1', op: 'delete', projectId: project })]);
  });
  it('missing or foreign project IDs cannot rename, delete, or mark foreign history', async () => {
    await seed(version('foreign'), 'history-b'); await db.syncQueue.clear();
    await renameVersion('foreign', 'changed', project); await deleteVersion('foreign', project); await setCanonical('foreign', project);
    expect(await readAllVersions('history-b')).toEqual([version('foreign')]);
    expect(await db.syncQueue.count()).toBe(0);
  });
  it('seeds the initial version once under simultaneous mounts', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => ensureInitialVersion('ch1', 'Initial words', project)));
    expect(new Set(results.map(rows => rows[0].id)).size).toBe(1);
    expect(await db.chapterVersions.count()).toBe(1);
    expect(await db.syncQueue.count()).toBe(1);
    expect(results[0][0]).toMatchObject({ label: 'Version A', source: 'auto-snapshot', isCanonical: true });
  });
  it.each(['', '   '])('does not seed empty content %s', async content => {
    expect(await ensureInitialVersion('ch1', content, project)).toEqual([]);
    expect(await db.chapterVersions.count()).toBe(0);
  });
  it('returns existing versions rather than reseeding', async () => {
    await seed(version());
    expect(await ensureInitialVersion('ch1', 'changed text', project)).toEqual([version()]);
  });
  it('preserves all simultaneous additions and exactly one canonical version', async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => addVersion('ch1', `text ${i}`, `Draft ${i}`, 'manual', true, project)));
    const rows = await readAllVersions(project);
    expect(rows).toHaveLength(20); expect(rows.filter(v => v.isCanonical)).toHaveLength(1);
  });
  it('concurrent rename, add and delete preserve unrelated history', async () => {
    await seed(version('v1')); await seed(version('v2')); await seed(version('v3'));
    await Promise.all([renameVersion('v1', 'changed', project), deleteVersion('v2', project), addVersion('ch1', 'four', 'v4', 'manual', false, project)]);
    const rows = await readAllVersions(project);
    expect(rows).toHaveLength(3); expect(rows.find(v => v.id === 'v1')?.label).toBe('changed'); expect(rows.some(v => v.id === 'v2')).toBe(false); expect(rows.some(v => v.id === 'v3')).toBe(true);
  });
  it('rolls back both canonical changes and additions when queue persistence fails', async () => {
    await seed(version('v1', { isCanonical: true })); await db.syncQueue.clear();
    vi.spyOn(db.syncQueue, 'put').mockRejectedValueOnce(new Error('QuotaExceededError'));
    await expect(addVersion('ch1', 'new text', 'new', 'manual', true, project)).rejects.toThrow('Quota');
    expect(await readAllVersions(project)).toEqual([version('v1', { isCanonical: true })]);
    expect(await db.syncQueue.count()).toBe(0);
    expect(localStorage.getItem('zagafy_chapter_versions')).toBeNull();
  });
  it('read failures never revive global legacy versions', async () => {
    localStorage.setItem('zagafy_chapter_versions', JSON.stringify([version()]));
    vi.spyOn(db.chapterVersions, 'where').mockImplementationOnce(() => { throw new Error('storage unavailable'); });
    await expect(readAllVersions(project)).rejects.toThrow('storage unavailable');
  });
  it('returns null when no canonical version exists', async () => {
    expect(await getCanonicalVersion('ch1', project)).toBeNull();
    await seed(version()); expect(await getCanonicalVersion('ch1', project)).toBeNull();
  });
});
