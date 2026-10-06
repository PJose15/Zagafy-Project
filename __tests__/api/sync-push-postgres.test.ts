// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { NextRequest } from 'next/server';
import * as schema from '@/db/schema';
import { GET as readiness } from '@/app/api/health/readiness/route';
import { POST } from '@/app/api/sync/push/route';
import { GET } from '@/app/api/sync/pull/route';
import { DELETE as removeStory } from '@/app/api/stories/route';
import { GET as catalog } from '@/app/api/stories/route';
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
  it('catalog exposes owned and shared metadata without leaking unrelated stories or manuscript content', async () => {
    await pg.exec(`INSERT INTO story_collaborators (story_id,user_id,role) VALUES ('story_other','user_writer','reader');
      INSERT INTO stories (id,owner_id,title,state) VALUES ('secret_story','user_other','Secret novel','{"synopsis":"Private manuscript"}');`);
    const response = await catalog(new NextRequest('http://localhost/api/stories'));
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.json();
    expect(body.data.me).toBe('user_writer');
    expect(body.data.stories).toEqual([
      expect.objectContaining({ storyId: 'story_1', role: 'owner', canSync: true }),
      expect.objectContaining({ storyId: 'story_other', role: 'reader', canSync: true }),
    ]);
    expect(JSON.stringify(body)).not.toContain('secret_story');
    expect(JSON.stringify(body)).not.toContain('synopsis');
    expect(JSON.stringify(body)).not.toContain('email');
    await pg.exec(`DELETE FROM story_collaborators WHERE user_id='user_writer'`);
    expect((await (await catalog(new NextRequest('http://localhost/api/stories'))).json()).data.stories).toHaveLength(1);
  });
  it('catalog reflects the owner plan for shared projects', async () => {
    await pg.exec(`UPDATE users SET plan='free' WHERE id='user_other';
      INSERT INTO story_collaborators (story_id,user_id,role) VALUES ('story_other','user_writer','editor');`);
    const body = await (await catalog(new NextRequest('http://localhost/api/stories'))).json();
    expect(body.data.stories.find((s: {storyId: string}) => s.storyId === 'story_other')).toMatchObject({ canSync: false, role: 'editor' });
  });
  it('catalog pages deterministically without duplicates or another owner’s stories', async () => {
    await pg.exec(`INSERT INTO stories (id,owner_id,title,state)
      SELECT 'page_' || lpad(i::text,3,'0'), 'user_writer', 'Novel ' || i, '{}'::jsonb FROM generate_series(1,55) i;`);
    const first = (await (await catalog(new NextRequest('http://localhost/api/stories'))).json()).data;
    expect(first.stories).toHaveLength(50); expect(first.nextCursor).toBe('page_050');
    const second = (await (await catalog(new NextRequest('http://localhost/api/stories?cursor=' + first.nextCursor))).json()).data;
    expect(second.stories).toHaveLength(6); expect(second.nextCursor).toBeNull();
    const ids = [...first.stories, ...second.stories].map((s: {storyId:string}) => s.storyId);
    expect(new Set(ids).size).toBe(56); expect(ids).not.toContain('story_other');
    expect((await catalog(new NextRequest('http://localhost/api/stories?cursor='))).status).toBe(400);
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

  it('delivers chapter and dependent deletion receipts and blocks stale resurrection', async () => {
    await pg.exec(`UPDATE stories SET state='{"title":"Server title","chapters":[{"id":"gone","title":"Removed"}]}' WHERE id='story_1';
      INSERT INTO chapters (id,story_id,title,content) VALUES ('gone','story_1','Chapter','Current cloud writing');
      INSERT INTO chapter_versions (id,chapter_id,data) VALUES ('old-version','gone','{}');
      INSERT INTO comments (id,story_id,chapter_id,data,updated_at) VALUES ('old-comment','story_1','gone','{}',now());`);
    const before = (await (await GET(new NextRequest('http://localhost/api/sync/pull?storyId=story_1'))).json()).data.serverTimestamp;
    const response = await POST(request([{ entityType: 'chapter', entityId: 'gone', op: 'delete', payload: null, timestamp: Date.now() }]));
    expect(response.status).toBe(200);
    expect((await response.json()).data.storyVersion).toBe(1);
    const pulled = (await (await GET(new NextRequest(`http://localhost/api/sync/pull?storyId=story_1&since=${encodeURIComponent(before)}`))).json()).data;
    expect(pulled.chapters).toEqual([]);
    expect(pulled.tombstones).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: 'chapter', entityId: 'gone' }),
      expect.objectContaining({ entityType: 'chapterVersion', entityId: 'old-version' }),
      expect.objectContaining({ entityType: 'comment', entityId: 'old-comment' }),
    ]));
    expect(pulled.story.state.chapters).toEqual([]);
    const stale = await POST(request([chapter('gone', 'Offline old writing'),
      { entityType: 'chapterVersion', entityId: 'new-offline-version', op: 'upsert', payload: { chapterId: 'gone', data: {} }, timestamp: Date.now() }]));
    const result = (await stale.json()).data;
    expect(result.applied).toBe(0); expect(result.conflicts).toHaveLength(2);
    expect(result.conflicts.every((conflict: { serverPayload: unknown }) => conflict.serverPayload === null)).toBe(true);
    expect(await database.query.chapters.findFirst({ where: undefined })).toBeUndefined();
  });

  it('receipts and cascading deletion roll back with a failed batch', async () => {
    await pg.exec(`INSERT INTO chapters (id,story_id,title) VALUES ('gone','story_1','Chapter'), ('foreign','story_other','Private');`);
    const response = await POST(request([{ entityType: 'chapter', entityId: 'gone', op: 'delete', payload: null, timestamp: Date.now() }, chapter('foreign')]));
    expect(response.status).toBe(500);
    expect(await database.query.syncTombstones.findMany()).toEqual([]);
    expect(await database.query.chapters.findMany()).toHaveLength(2);
  });

  it('a whole-project receipt reaches its former collaborators without leaking manuscript or unrelated accounts', async () => {
    await pg.exec(`INSERT INTO story_collaborators (story_id,user_id,role) VALUES ('story_1','user_other','reader');
      INSERT INTO chapters (id,story_id,title,content) VALUES ('secret','story_1','Chapter','Manuscript to remove');`);
    const removed = await removeStory(new NextRequest('http://localhost/api/stories', { method: 'DELETE', body: JSON.stringify({ storyId: 'story_1' }) }));
    expect(removed.status).toBe(200);
    expect(await database.query.chapters.findMany()).toEqual([]);
    expect(await database.query.storyCollaborators.findMany()).toEqual([]);
    identity.userId = 'user_other';
    const result = (await (await GET(new NextRequest('http://localhost/api/sync/pull?storyId=story_1'))).json()).data;
    expect(result.storyDeletedAt).toEqual(expect.any(String)); expect(result.story).toBeNull(); expect(result.chapters).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('Manuscript to remove');
    expect((await POST(request([chapter()], 'story_1'))).status).toBe(410);
    await pg.exec(`INSERT INTO users (id,email,plan) VALUES ('stranger','stranger@example.com','writer')`);
    identity.userId = 'stranger';
    const stranger = (await (await GET(new NextRequest('http://localhost/api/sync/pull?storyId=story_1'))).json()).data;
    expect(stranger.storyDeletedAt).toBeUndefined();
    expect((await POST(request([chapter()], 'story_1'))).status).toBe(403);
  });

  it('deleting an unuploaded project also prevents its delayed first upload', async () => {
    const removed = await removeStory(new NextRequest('http://localhost/api/stories', { method: 'DELETE', body: JSON.stringify({ storyId: 'not-uploaded-yet' }) }));
    expect((await removed.json()).data.deleted).toBe(true);
    expect((await POST(request([chapter()], 'not-uploaded-yet'))).status).toBe(410);
  });

  it('round-trips structured chat metadata and returns committed versions',async()=>{
    const metadata={kind:'character-session',payload:{id:'chat',messages:[{content:'Retained writing'}]}};
    const delta={entityType:'chatMessage',entityId:'chat',op:'upsert',timestamp:Date.now(),payload:{role:'assistant',content:'',timestamp:Date.now(),metadata,version:0}};
    const result=(await(await POST(request([delta]))).json()).data;
    expect(result.applied).toBe(1);expect(result.chatVersions).toEqual({chat:1});
    const pulled=(await(await GET(new NextRequest('http://localhost/api/sync/pull?storyId=story_1'))).json()).data;
    expect(pulled.chatMessages).toEqual(expect.arrayContaining([expect.objectContaining({id:'chat',metadata,version:1})]));
  });
  it('returns a chat conflict instead of overwriting a newer session',async()=>{
    const delta=(content:string,version:number)=>({entityType:'chatMessage',entityId:'chat',op:'upsert',timestamp:Date.now(),payload:{role:'assistant',content,version,timestamp:Date.now(),metadata:{kind:'assistant'}}});
    await POST(request([delta('Original',0)]));
    const results=await Promise.all((await Promise.all([POST(request([delta('First edit',1)])),POST(request([delta('Second edit',1)]))])).map(r=>r.json()));
    expect(results.map(r=>r.data.applied).sort()).toEqual([0,1]);
    expect(results.flatMap(r=>r.data.conflicts)).toEqual([expect.objectContaining({entityId:'chat',localPayload:expect.objectContaining({content:'Second edit'}),serverPayload:expect.objectContaining({content:'First edit',version:2})})]);
  });

  it('attests the migrated staging schema and fails after a required chat column is removed',async()=>{
    for(const [key,value] of Object.entries({HEALTH_TOKEN:'probe',ZAGAFY_STAGING:'true',VERCEL_ENV:'preview',NEXT_PUBLIC_DEPLOYMENT_MODE:'saas',NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:'pk_test_a',CLERK_SECRET_KEY:'sk_test_a',DATABASE_URL:'configured',UPSTASH_REDIS_REST_URL:'configured',UPSTASH_REDIS_REST_TOKEN:'configured',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40)}))vi.stubEnv(key,value);
    const req=()=>new NextRequest('http://localhost/api/health/readiness',{headers:{'x-health-token':'probe'}});
    try {
      expect((await readiness(req())).status).toBe(200);
      await pg.exec('ALTER TABLE chat_messages DROP COLUMN metadata');
      const response=await readiness(req());expect(response.status).toBe(503);expect((await response.json()).data.missing).toContain('schema:chat_messages.metadata');
    } finally {await pg.exec('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata jsonb');vi.unstubAllEnvs();}
  });

});
