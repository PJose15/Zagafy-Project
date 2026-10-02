import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/storage/dexie-db';
import { openCloudProject } from '@/lib/projects/cloud-projects';
import { applyCloudData, cloudTables } from '@/lib/sync/apply-cloud-data';
import { getActiveProjectId, setActiveProjectId } from '@/lib/projects/active-project';
import type { PullResponse } from '@/lib/sync/types';

let account: string | null;
const fetchMock = vi.fn();
function payload(): PullResponse {
  return { accountId: 'user_1', storyId: 'remote_1', story: { state: { title: 'Cloud novel', author_name: 'Writer', chapters: [{ id: 'ch_1', title: 'Opening' }] }, version: 4 },
    chapters: [{ id: 'ch_1', title: 'Opening', content: 'Saved cloud manuscript', version: 3 }],
    chapterVersions: [{ id: 'v_1', chapterId: 'ch_1', data: { label: 'Draft', content: 'Earlier text' } }],
    storySnapshots: [{ id: 'snap_1', storyId: 'remote_1', name: 'Earlier draft', data: { title: 'Earlier' } }],
    sessions: [{ id: 'session_1', wordsAdded: 99, data: { projectId: 'another-device-local-id', wordsAdded: 99 } }],
    chatMessages: [{ id: 'chat_1', role: 'assistant', content: 'Advice' }],
    writerInsights: [{ id: 'insight_1', observation: 'Concise voice' }],
    comments: [{ id: 'comment_1', chapterId: 'ch_1', text: 'Keep this' }], serverTimestamp: '2026-10-02T12:00:00Z' };
}
function respond(data = payload()) { fetchMock.mockImplementation(async () => new Response(JSON.stringify({ data }), { status: 200 })); }
beforeEach(async () => {
  await db.transaction('rw', cloudTables(), async () => { for (const table of cloudTables()) await table.clear(); });
  localStorage.clear(); setActiveProjectId('local_old'); account = 'user_1';
  await db.stories.put({ id: 'local_old', data: '{"title":"Offline novel"}', updatedAt: 1 });
  fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); respond();
});
afterEach(() => vi.restoreAllMocks());
describe('Download before activation', () => {
  it('imports all entity types and binds them to the new local project without queuing an upload', async () => {
    const result = await openCloudProject('remote_1', 'user_1', () => account);
    expect(result.created).toBe(true); expect(getActiveProjectId()).toBe(result.projectId);
    expect((await db.chapters.get('ch_1'))?.content).toBe('Saved cloud manuscript');
    expect((await db.chapterVersions.get('v_1'))?.projectId).toBe(result.projectId);
    expect((await db.storySnapshots.get('snap_1'))?.storyId).toBe(result.projectId);
    const session = await db.sessions.get('session_1');
    expect(JSON.parse(session!.data).projectId).toBe(result.projectId);
    expect((await db.chatMessages.get('chat_1'))?.projectId).toBe(result.projectId);
    expect((await db.writerInsights.get('insight_1'))?.projectId).toBe(result.projectId);
    expect((await db.comments.get('comment_1'))?.projectId).toBe(result.projectId);
    expect(await db.syncQueue.count()).toBe(0);
    expect(await db.syncMeta.get(result.projectId)).toMatchObject({ serverStoryId: 'remote_1', serverStoryVersion: 4, lastPulledAt: payload().serverTimestamp });
    expect(await db.stories.get(result.projectId)).toMatchObject({ title: 'Cloud novel', chapterCount: 1, wordCount: 3 });
  });
  it('keeps the old project active throughout the network request', async () => {
    fetchMock.mockImplementation(async () => { expect(getActiveProjectId()).toBe('local_old'); expect(await db.stories.count()).toBe(1); return new Response(JSON.stringify({ data: payload() })); });
    await openCloudProject('remote_1', 'user_1', () => account);
  });
  it('reuses a binding without downloading or replacing pending local edits', async () => {
    const first = await openCloudProject('remote_1', 'user_1', () => account);
    await db.chapters.update('ch_1', { content: 'New offline writing' }); fetchMock.mockClear();
    expect(await openCloudProject('remote_1', 'user_1', () => account)).toEqual({ ...first, created: false });
    expect(fetchMock).not.toHaveBeenCalled(); expect((await db.chapters.get('ch_1'))?.content).toBe('New offline writing');
  });
  it('coalesces simultaneous imports to a single local project', async () => {
    const results = await Promise.all([openCloudProject('remote_1', 'user_1', () => account), openCloudProject('remote_1', 'user_1', () => account)]);
    expect(results[0].projectId).toBe(results[1].projectId); expect(await db.syncMeta.count()).toBe(1);
  });
  it.each(['account', 'identity', 'incomplete', 'network', 'collision', 'storage'])('leaves no partial binding or activation after a %s failure', async failure => {
    if (failure === 'account') fetchMock.mockImplementation(async () => { account = 'user_2'; return new Response(JSON.stringify({ data: payload() })); });
    if (failure === 'identity') { const data = payload(); data.accountId = 'user_2'; respond(data); }
    if (failure === 'incomplete') { const data = payload(); data.chapters = []; respond(data); }
    if (failure === 'network') fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    if (failure === 'collision') await db.comments.put({ id: 'comment_1', projectId: 'local_old', chapterId: 'old', text: 'Keep offline comment' } as any);
    if (failure === 'storage') vi.spyOn(db.sessions, 'put').mockRejectedValue(new Error('Storage full'));
    await expect(openCloudProject('remote_1', 'user_1', () => account)).rejects.toThrow();
    expect(getActiveProjectId()).toBe('local_old'); expect(await db.syncMeta.count()).toBe(0);
    expect(await db.stories.count()).toBe(1); expect(await db.chapters.count()).toBe(0);
    expect(await db.storySnapshots.count()).toBe(0); expect(await db.chapterVersions.count()).toBe(0);
  });
  it('refuses a browser bound to another account before requesting any data', async () => {
    localStorage.setItem('zagafy_workspace_sync_owner', 'user_2');
    await expect(openCloudProject('remote_1', 'user_1', () => account)).rejects.toThrow(); expect(fetchMock).not.toHaveBeenCalled();
  });
});
describe('Atomic incremental cloud application', () => {
  it('updates completion, version labels and snapshot names, while preserving queued edits', async () => {
    const { projectId } = await openCloudProject('remote_1', 'user_1', () => account);
    const next = payload(); next.story = null;
    next.sessions[0].wordsAdded = 150; next.sessions[0].data = { wordsAdded: 150 };
    next.chapterVersions[0].data = { label: 'Renamed draft' }; next.storySnapshots[0].name = 'Renamed snapshot';
    await db.syncQueue.put({ id: 'q_1', projectId, entityId: 'ch_1', entityType: 'chapter', op: 'upsert', timestamp: 1 });
    next.chapters[0].content = 'Stale cloud text';
    await applyCloudData(next, projectId);
    expect((await db.chapters.get('ch_1'))?.content).toBe('Saved cloud manuscript');
    expect((await db.sessions.get('session_1'))?.wordsAdded).toBe(150);
    expect(JSON.parse((await db.chapterVersions.get('v_1'))!.data).label).toBe('Renamed draft');
    expect((await db.storySnapshots.get('snap_1'))?.name).toBe('Renamed snapshot');
  });
  it('repairs the earlier server-ID snapshot scope only for its uniquely bound local project', async () => {
    const { projectId } = await openCloudProject('remote_1', 'user_1', () => account);
    await db.storySnapshots.update('snap_1', { storyId: 'remote_1' });
    await applyCloudData(payload(), projectId);
    expect((await db.storySnapshots.get('snap_1'))?.storyId).toBe(projectId);
    await db.storySnapshots.update('snap_1', { storyId: 'remote_1' });
    await db.syncMeta.put({ id: 'other', serverStoryId: 'remote_1', lastPulledAt: null, lastPushedAt: null });
    await expect(applyCloudData(payload(), projectId)).rejects.toThrow('another local project');
  });
  it('normalizes cloud percentage confidence into the local fractional scale', async () => {
    const data = payload(); data.writerInsights[0].confidence = 83; respond(data);
    await openCloudProject('remote_1', 'user_1', () => account);
    expect((await db.writerInsights.get('insight_1'))?.confidence).toBe(0.83);
  });
  it('rolls back all changed rows and the watermark on a late storage failure', async () => {
    const { projectId } = await openCloudProject('remote_1', 'user_1', () => account);
    const next = payload(); next.chapters[0].content = 'New text'; next.serverTimestamp = '2026-10-02T13:00:00Z';
    vi.spyOn(db.comments, 'put').mockRejectedValue(new Error('Storage full'));
    await expect(applyCloudData(next, projectId)).rejects.toThrow('Storage full');
    expect((await db.chapters.get('ch_1'))?.content).toBe('Saved cloud manuscript');
    expect((await db.syncMeta.get(projectId))?.lastPulledAt).toBe(payload().serverTimestamp);
  });
});
