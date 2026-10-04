import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '@/lib/storage/dexie-db';
import { readSessions, writeSessions, addSession, updateSessionFlowScore, saveWipSession, readWipSession, readWipSessions, clearWipSession, saveCompletedSession, recoverSessions } from '@/lib/types/writing-session';
import type { WritingSession } from '@/lib/types/writing-session';
const project = 'session-project';
const session = (id = 's1', extra: Partial<WritingSession> = {}): WritingSession => ({ id, projectId: project, projectName: 'My novel', startedAt: '2026-10-03T10:00:00Z', endedAt: '2026-10-03T10:30:00Z', wordsStart: 100, wordsEnd: 250, wordsAdded: 150, flowScore: null, heteronymId: null, heteronymName: null, keystrokeMetrics: null, autoFlowScore: null, flowMoments: null, ...extra });
const wip = (id = 's1', currentWords = 250) => ({ id, projectId: project, projectName: 'My novel', startedAt: '2026-10-03T10:00:00Z', wordsStart: 100, currentWords, heteronymId: null, heteronymName: null });
async function seedRaw(value: unknown) { await db.sessions.put({ id: 's1', projectId: project, startedAt: '', endedAt: '', wordsAdded: 0, flowScore: null, heteronymId: null, data: JSON.stringify(value) }); }
beforeEach(async () => {
  localStorage.clear(); localStorage.setItem('zagafy_project_id', project);
  await db.sessions.clear(); await db.syncQueue.clear(); await db.stories.clear();
  await db.stories.put({ id: project, data: '{}', title: 'Novel', chapterCount: 0, wordCount: 0, status: 'draft', createdAt: 0, updatedAt: 0 });
});
afterEach(() => vi.restoreAllMocks());
describe('durable session history and recovery', () => {
  it('empty IndexedDB does not revive global legacy sessions', async () => {
    localStorage.setItem('zagafy_sessions', JSON.stringify([session()]));
    expect(await readSessions(project)).toEqual([]);
  });
  it('adds and queues sessions within their captured project', async () => {
    localStorage.setItem('zagafy_project_id', 'other-project');
    await addSession(session());
    expect(await readSessions(project)).toEqual([session()]);
    expect(await readSessions('other-project')).toEqual([]);
    expect(await db.syncQueue.toArray()).toEqual([expect.objectContaining({ projectId: project, entityType: 'session', entityId: 's1' })]);
  });
  it('propagates write failures without touching the legacy global store', async () => {
    vi.spyOn(db.syncQueue, 'put').mockRejectedValueOnce(new Error('quota'));
    await expect(addSession(session())).rejects.toThrow('quota');
    expect(await db.sessions.count()).toBe(0);
    expect(localStorage.getItem('zagafy_sessions')).toBeNull();
  });
  it('read failures and corrupt JSON reject instead of returning a fake empty history', async () => {
    await seedRaw(session()); await db.sessions.update('s1', { data: '{' });
    await expect(readSessions(project)).rejects.toThrow();
    expect((await db.sessions.get('s1'))?.data).toBe('{');
  });
  const invalid: [string, unknown][] = [
    ...['id','projectId','projectName','startedAt','endedAt'].flatMap(field => [null, 123].map(value => [field, value] as [string, unknown])),
    ...['wordsStart','wordsEnd','wordsAdded'].flatMap(field => [null, '100'].map(value => [field, value] as [string, unknown])),
    ...[0, -1, 6, 0.5, 1.5, '3', true].map(value => ['flowScore', value] as [string, unknown]),
    ['heteronymId', 123], ['heteronymName', true], ['keystrokeMetrics', 'bad'], ['autoFlowScore', 'bad'], ['flowMoments', {}],
  ];
  it.each(invalid)('rejects damaged %s=%j without altering the record', async (field, value) => {
    await seedRaw({ ...session(), [field]: value });
    await expect(readSessions(project)).rejects.toThrow();
    expect(await db.sessions.count()).toBe(1);
  });
  it.each([1,2,3,4,5] as const)('updates only the requested session to score %i', async score => {
    await addSession(session()); await addSession(session('s2')); await db.syncQueue.clear();
    await updateSessionFlowScore('s1', score, project);
    expect((await readSessions(project)).find(s => s.id === 's1')?.flowScore).toBe(score);
    expect((await readSessions(project)).find(s => s.id === 's2')?.flowScore).toBeNull();
    expect((await db.syncQueue.toArray()).map(row => row.entityId)).toEqual(['s1']);
  });
  it('normalizes older sessions with missing optional fields', async () => {
    const old: Record<string, unknown> = { ...session() };
    for (const key of ['heteronymId','heteronymName','keystrokeMetrics','autoFlowScore','flowMoments']) delete old[key];
    await seedRaw(old); expect(await readSessions(project)).toEqual([session()]);
  });
  it('simultaneous scores and session additions retain every record', async () => {
    await addSession(session());
    await Promise.all([updateSessionFlowScore('s1', 5, project), ...Array.from({ length: 30 }, (_, i) => addSession(session(`new-${i}`)))]);
    expect(await readSessions(project)).toHaveLength(31);
    expect((await db.sessions.get('s1'))?.flowScore).toBe(5);
  });
  it('score and queue rollback together when persistence fails', async () => {
    await addSession(session()); await db.syncQueue.clear();
    vi.spyOn(db.syncQueue, 'put').mockRejectedValueOnce(new Error('queue failed'));
    await expect(updateSessionFlowScore('s1', 5, project)).rejects.toThrow('queue failed');
    expect((await db.sessions.get('s1'))?.flowScore).toBeNull();
    expect(await db.syncQueue.count()).toBe(0);
  });
  it('wrong-project score updates cannot mutate a foreign session', async () => {
    await addSession(session()); await db.syncQueue.clear(); await updateSessionFlowScore('s1', 5, 'other');
    expect((await db.sessions.get('s1'))?.flowScore).toBeNull(); expect(await db.syncQueue.count()).toBe(0);
  });
  it('bulk restore rejects mixed projects before replacing any history', async () => {
    await addSession(session());
    await expect(writeSessions([session('other', { projectId: 'other' })], project)).rejects.toThrow();
    expect(await readSessions(project)).toEqual([session()]);
  });
  it('keeps separate WIP records and clears only the completed session', () => {
    saveWipSession(wip('s1')); saveWipSession(wip('s2')); clearWipSession('s1');
    expect(readWipSessions().map(s => s.id)).toEqual(['s2']);
  });
  it('failed completed writes preserve the rich journal across another session starting', async () => {
    saveWipSession(wip()); vi.spyOn(db.syncQueue, 'put').mockRejectedValueOnce(new Error('quota'));
    const rich = session('s1', { autoFlowScore: 87, flowMoments: [{ startTime: 1, endTime: 2, avgWPM: 20, peakWPM: 30 }] });
    await expect(saveCompletedSession(rich)).rejects.toThrow('quota'); saveWipSession(wip('s2'));
    await recoverSessions();
    expect(await readSessions(project)).toEqual([rich]);
    expect(readWipSessions().map(s => s.id)).toEqual(['s2']);
    expect(Object.keys(localStorage).some(key => key.startsWith('zagafy_session_pending:'))).toBe(false);
  });
  it('does not steal a fresh heartbeat from another active tab', async () => {
    saveWipSession(wip()); await recoverSessions(); expect(await db.sessions.count()).toBe(0);
  });
  it('recovers abandoned WIP and keeps the original project', async () => {
    saveWipSession({ ...wip(), abandoned: true }); localStorage.setItem('zagafy_project_id', 'other');
    await recoverSessions(); expect((await readSessions(project))[0]).toMatchObject({ id: 's1', projectId: project, wordsAdded: 150 });
    expect(readWipSession()).toBeNull();
  });
  it('duplicate recovery preserves an existing flow score and adds no duplicate queue entry', async () => {
    const rich = session('s1', { flowScore: 5, autoFlowScore: 87 }); await addSession(rich); await db.syncQueue.clear();
    localStorage.setItem('zagafy_session_pending:retry', JSON.stringify(session()));
    await Promise.all([recoverSessions(), recoverSessions()]);
    expect(await readSessions(project)).toEqual([rich]); expect(await db.syncQueue.count()).toBe(0);
  });
  it('full completion can replace a partial recovery while preserving a later flow score', async () => {
    await addSession(session('s1', { endedAt: '2026-10-03T10:10:00Z', flowScore: 4, wordsEnd: 150, wordsAdded: 50 }));
    await addSession(session()); expect((await readSessions(project))[0]).toMatchObject({ flowScore: 4, wordsAdded: 150 });
  });
  it('corrupt recovery data is retained and reported, not silently cleared', async () => {
    localStorage.setItem('zagafy_session_pending:bad', '{'); await expect(recoverSessions()).rejects.toThrow();
    expect(localStorage.getItem('zagafy_session_pending:bad')).toBe('{');
  });
  it('recovery cannot resurrect an already deleted project', async () => {
    await db.stories.delete(project); localStorage.setItem('zagafy_session_pending:old', JSON.stringify(session()));
    await recoverSessions(); expect(await db.sessions.count()).toBe(0); expect(localStorage.getItem('zagafy_session_pending:old')).not.toBeNull();
  });
  it('reads and restores 500 sessions through IndexedDB', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => session(`s-${i}`)); await writeSessions(rows, project);
    expect(await readSessions(project)).toHaveLength(500);
  });
});
