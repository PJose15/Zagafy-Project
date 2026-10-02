// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { NextRequest } from 'next/server';
import * as schema from '@/db/schema';
import { POST } from '@/app/api/sync/push/route';
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
    await pg.exec(`TRUNCATE users CASCADE;
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
});
