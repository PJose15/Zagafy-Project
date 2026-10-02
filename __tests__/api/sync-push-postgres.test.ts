// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { NextRequest } from 'next/server';
import * as schema from '@/db/schema';
import { POST } from '@/app/api/sync/push/route';
import { GET } from '@/app/api/sync/pull/route';
const identity = vi.hoisted(() => ({ userId: 'user_writer' }));
vi.mock('@/lib/auth', () => ({ requireCloudUser: async () => ({ userId: identity.userId }), isAuthError: () => false }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => null }));
let database: PgliteDatabase<typeof schema>;
vi.mock('@/db/client', () => ({ db: () => database, isDatabaseConfigured: () => true, schema }));
let pg: PGlite;
function chapter(id = 'ch_new', content = 'Offline work', version = 1) {
  return { entityType: 'chapter', entityId: id, op: 'upsert', payload: { title: 'Chapter', content, version }, timestamp: Date.now() };
}
function request(deltas: unknown[], storyId = 'story_1') {
  return new NextRequest('http://localhost/api/sync/push', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId, storyTitle: 'Stale request title', deltas }),
  });
}
describe('Transactional sync push against migrated Postgres', () => {
  beforeAll(async () => { pg = new PGlite(); database = drizzle(pg, { schema }); await migrate(database, { migrationsFolder: 'db/migrations' }); }, 30_000);
  afterAll(async () => { await pg.close(); });
  beforeEach(async () => {
    identity.userId = 'user_writer';
    await pg.exec(`SET TIME ZONE 'UTC'; TRUNCATE users CASCADE;
      INSERT INTO users (id,email,plan) VALUES ('user_writer','writer@example.com','writer'), ('user_other','other@example.com','writer');
      INSERT INTO stories (id,owner_id,title,state,version) VALUES ('story_1','user_writer','Server title','{"title":"Server title"}',0), ('story_other','user_other','Private title','{}',0);`);
  });
  it('persists the whole valid batch and keeps title on a chapter-only push', async () => {
    const response = await POST(request([chapter()]));
    expect(response.status).toBe(200);
    expect((await response.json()).data.applied).toBe(1);
    expect((await pg.query('SELECT content FROM chapters')).rows).toEqual([{ content: 'Offline work' }]);
    expect((await pg.query("SELECT title FROM stories WHERE id='story_1'")).rows[0]).toEqual({ title: 'Server title' });
  });
  it('rolls back an earlier chapter when a later write fails', async () => {
    const broken = { entityType: 'comment', entityId: 'note_bad', op: 'upsert', timestamp: Date.now(), payload: { chapterId: 'ch_new', updatedAt: 'invalid date' } };
    expect((await POST(request([chapter(), broken]))).status).toBe(500);
    expect((await pg.query('SELECT id FROM chapters')).rows).toEqual([]);
    expect((await pg.query('SELECT id FROM comments')).rows).toEqual([]);
    expect((await POST(request([chapter()]))).status).toBe(200);
  });
  it('rejects foreign chapter IDs without acknowledging a write', async () => {
    await pg.exec("INSERT INTO chapters (id,story_id,title,content) VALUES ('ch_private','story_other','Private','Private manuscript');");
    expect((await POST(request([chapter('ch_private', 'overwrite')]))).status).toBe(500);
    expect((await pg.query("SELECT content FROM chapters WHERE id='ch_private'")).rows[0]).toEqual({ content: 'Private manuscript' });
  });
  it('serializes same-base story edits and preserves one as a conflict', async () => {
    const story = (title: string) => ({ entityType: 'story', entityId: 'local_story', op: 'upsert', payload: { title, version: 0 }, timestamp: Date.now() });
    const responses = await Promise.all([POST(request([story('First')])), POST(request([story('Second')]))]);
    const results = await Promise.all(responses.map(r => r.json()));
    expect(results.map(r => r.data.applied).sort()).toEqual([0, 1]);
    expect(results.flatMap(r => r.data.conflicts)).toHaveLength(1);
    const conflict = results.flatMap(r => r.data.conflicts)[0];
    expect(conflict.serverPayload.title).toBe('First');
    expect(conflict.localPayload.title).toBe('Second');
    expect((await pg.query("SELECT title,version FROM stories WHERE id='story_1'")).rows[0]).toEqual({ title: 'First', version: 1 });
  });
  it('serializes same-base chapter edits and returns the losing manuscript', async () => {
    await pg.exec("INSERT INTO chapters (id,story_id,title,content,version) VALUES ('ch_shared','story_1','Chapter','Original',1);");
    const responses = await Promise.all([POST(request([chapter('ch_shared', 'First edit', 1)])), POST(request([chapter('ch_shared', 'Second edit', 1)]))]);
    const results = await Promise.all(responses.map(r => r.json()));
    expect(results.map(r => r.data.applied).sort()).toEqual([0, 1]);
    expect(results.flatMap(r => r.data.conflicts)[0]).toMatchObject({ localPayload: { content: 'Second edit' }, serverPayload: { content: 'First edit', version: 2 } });
  });
  it('does not accept a fabricated future base version', async () => {
    const delta = { entityType: 'story', entityId: 'local_story', op: 'upsert', payload: { title: 'Future', version: 99 }, timestamp: Date.now() };
    const result = await (await POST(request([delta]))).json();
    expect(result.data.applied).toBe(0); expect(result.data.conflicts).toHaveLength(1);
  });
  it('enforces reader access inside the batch transaction', async () => {
    await pg.exec("INSERT INTO story_collaborators (story_id,user_id,role) VALUES ('story_1','user_other','reader');");
    identity.userId = 'user_other';
    expect((await POST(request([chapter()]))).status).toBe(403);
    expect((await pg.query('SELECT id FROM chapters')).rows).toEqual([]);
  });
  it('enforces the owner paid plan before creating server data', async () => {
    await pg.exec("UPDATE users SET plan='free' WHERE id='user_writer';");
    expect((await POST(request([chapter()], 'new_story'))).status).toBe(403);
    expect((await pg.query("SELECT id FROM stories WHERE id='new_story'")).rows).toEqual([]);
  });
  it.each([null, [], { storyId: 123, deltas: [] }, { storyId: 'x', deltas: [null] }, { storyId: 'x', deltas: [{ entityType: 'unknown', entityId: 'x', op: 'upsert', payload: {}, timestamp: 1 }] }])('rejects malformed requests before touching storage: %j', async body => {
    const req = new NextRequest('http://localhost/api/sync/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect((await POST(req)).status).toBe(400);
  });
  const oldDate = '2000-01-01T00:00:00.000Z';
  const oldTime = new Date(oldDate).getTime();
  const historyPayloads = {
    chapterVersion: { chapterId: 'ch_new', createdAt: oldDate, content: 'Historic draft', label: 'Original' },
    storySnapshot: { name: 'Historic snapshot', createdAt: oldTime, data: { title: 'Original' } },
    session: { startedAt: oldDate, wordsAdded: 3 },
    chatMessage: { timestamp: oldTime, role: 'user', content: 'Old chat' },
    writerInsight: { lastObservedAt: oldTime, category: 'pacing', observation: 'Old insight' },
    comment: { chapterId: 'ch_new', updatedAt: oldDate, text: 'Old note' },
  };
  function historyDelta(entityType: string, payload: Record<string, unknown>, id = `history_${entityType}`) {
    return { entityType, entityId: id, op: 'upsert', payload, timestamp: Date.now() };
  }
  function pull(since?: string) {
    const url = new URL('http://localhost/api/sync/pull');
    url.searchParams.set('storyId', 'story_1');
    if (since) url.searchParams.set('since', since);
    return GET(new NextRequest(url));
  }
  it('delivers all late offline entity types using receipt time while retaining their historical display dates', async () => {
    await pg.exec("SET TIME ZONE 'Pacific/Honolulu';");
    const beforeUpload = (await (await pull()).json()).data.serverTimestamp;
    const deltas = Object.entries(historyPayloads).map(([type, payload]) => historyDelta(type, payload));
    expect((await POST(request([chapter(), ...deltas]))).status).toBe(200);
    const response = await pull(beforeUpload);
    expect(response.status).toBe(200);
    const result = (await response.json()).data;
    for (const key of ['chapterVersions', 'storySnapshots', 'sessions', 'chatMessages', 'writerInsights', 'comments']) {
      expect(result[key]).toHaveLength(1);
    }
    expect(result.chapterVersions[0].createdAt).toBe(oldDate);
    expect(result.sessions[0].startedAt).toBe(oldDate);
    expect(result.chatMessages[0].timestamp).toBe(oldTime);
    expect(result.comments[0].updatedAt).toBe(oldDate);
  });
  it('persists session completion and redelivers it after the original start time', async () => {
    expect((await POST(request([historyDelta('session', historyPayloads.session)]))).status).toBe(200);
    await pg.exec("UPDATE sessions SET synced_at='2000-01-01';");
    const since = (await (await pull()).json()).data.serverTimestamp;
    expect((await POST(request([historyDelta('session', { ...historyPayloads.session, endedAt: oldDate, wordsAdded: 250, flowScore: 85 })]))).status).toBe(200);
    const result = (await (await pull(since)).json()).data;
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({ wordsAdded: 250, flowScore: 85, endedAt: oldDate });
  });
  it('redelivers an existing version after its label is changed', async () => {
    await POST(request([chapter(), historyDelta('chapterVersion', historyPayloads.chapterVersion)]));
    await pg.exec("UPDATE chapter_versions SET synced_at='2000-01-01';");
    const since = (await (await pull()).json()).data.serverTimestamp;
    expect((await POST(request([historyDelta('chapterVersion', { ...historyPayloads.chapterVersion, label: 'Renamed' })]))).status).toBe(200);
    const result = (await (await pull(since)).json()).data;
    expect(result.chapterVersions).toHaveLength(1);
    expect(result.chapterVersions[0].data.label).toBe('Renamed');
  });
  it.each(Object.entries(historyPayloads))('rejects a foreign %s ID and rolls back the preceding write', async (type, payload) => {
    identity.userId = 'user_other';
    const foreign = { ...payload, chapterId: 'ch_private' };
    expect((await POST(request([chapter('ch_private'), historyDelta(type, foreign)], 'story_other'))).status).toBe(200);
    identity.userId = 'user_writer';
    const response = await POST(request([chapter(), historyDelta(type, payload)]));
    expect(response.status).toBe(500);
    expect((await pg.query("SELECT id FROM chapters WHERE story_id='story_1'")).rows).toEqual([]);
    const privateResponse = await GET(new NextRequest('http://localhost/api/sync/pull?storyId=story_other'));
    expect((await privateResponse.json()).data.story).toBeNull();
  });

  it('keeps a pull coherent with a concurrent push and delivers the next committed batch', async () => {
    const [before, pushed] = await Promise.all([pull(), POST(request([chapter(), historyDelta('session', historyPayloads.session)]))]);
    expect(pushed.status).toBe(200);
    const first = (await before.json()).data;
    expect(first.chapters.length).toBe(first.sessions.length);
    const next = (await (await pull(first.serverTimestamp)).json()).data;
    expect(next.chapters).toHaveLength(1);
    expect(next.sessions).toHaveLength(1);
  });
  it('can reapply the receipt migration without changing historical data', async () => {
    await POST(request([historyDelta('session', historyPayloads.session)]));
    const before = (await pg.query<{ started_at: Date; synced_at: Date }>('SELECT started_at, synced_at FROM sessions')).rows[0];
    await pg.exec(await readFile('db/migrations/0005_sync_receipts.sql', 'utf8'));
    const row = (await pg.query<{ started_at: Date; synced_at: Date }>('SELECT started_at, synced_at FROM sessions')).rows[0];
    expect(row).toEqual(before);
    expect(row.synced_at).toBeInstanceOf(Date);
    const types = (await pg.query<{ data_type: string }>("SELECT data_type FROM information_schema.columns WHERE column_name='synced_at'")).rows;
    expect(types).toHaveLength(6);
    expect(types.every(row => row.data_type === 'timestamp with time zone')).toBe(true);
  });

});
