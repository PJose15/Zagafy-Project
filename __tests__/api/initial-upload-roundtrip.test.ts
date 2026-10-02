// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { NextRequest } from 'next/server';
import * as schema from '@/db/schema';
import { POST } from '@/app/api/sync/push/route';
import { GET } from '@/app/api/sync/pull/route';
import { db as local } from '@/lib/storage/dexie-db';
import { cloudTables } from '@/lib/sync/apply-cloud-data';
import { SyncEngine } from '@/lib/sync/sync-engine';
import { openCloudProject } from '@/lib/projects/cloud-projects';
import { setActiveProjectId } from '@/lib/projects/active-project';
vi.mock('@/lib/auth', () => ({ requireCloudUser: async () => ({ userId: 'writer' }), isAuthError: () => false }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => null }));
let database: PgliteDatabase<typeof schema>;
vi.mock('@/db/client', () => ({ db: () => database, isDatabaseConfigured: () => true, schema }));
let pg: PGlite;
beforeAll(async () => { pg = new PGlite(); database = drizzle(pg, { schema }); await migrate(database, { migrationsFolder: 'db/migrations' }); }, 30_000);
afterAll(async () => { await pg.close(); vi.unstubAllGlobals(); });
describe('First history write → real Postgres → fresh local device', () => {
  it('uploads and reopens an existing manuscript, history and insights from a snapshot-only trigger', async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() });
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const req = new NextRequest('http://localhost' + url, { ...init, signal: init?.signal ?? undefined });
      return url === '/api/sync/push' ? POST(req) : GET(req);
    }));
    await pg.exec(`INSERT INTO users (id,email,plan) VALUES ('writer','writer@example.com','writer');`);
    setActiveProjectId('first_device');
    await local.transaction('rw', cloudTables(), async () => {
      for (const table of cloudTables()) await table.clear();
      await local.stories.put({ id: 'first_device', data: JSON.stringify({ title: 'Existing novel', author_name: 'Writer', chapters: [{ id: 'ch_1', title: 'Opening', content: '' }] }), updatedAt: 1 });
      await local.chapters.put({ id: 'ch_1', projectId: 'first_device', title: 'Opening', content: 'Existing local manuscript', summary: '', updatedAt: 1 });
      await local.chapterVersions.put({ id: 'v_1', projectId: 'first_device', chapterId: 'ch_1', createdAt: '2026-10-02T10:00:00Z', data: JSON.stringify({ id: 'v_1', chapterId: 'ch_1', label: 'Earlier draft', content: 'Earlier writing', isCanonical: false, source: 'manual', wordCount: 2 }) });
      await local.storySnapshots.put({ id: 'snap_1', storyId: 'first_device', name: 'Backup', description: '', createdAt: 1, wordCount: 3, chapterCount: 1, data: '{"title":"Existing novel"}' });
      await local.writerInsights.put({ id: 'insight_1', projectId: 'first_device', category: 'voice', observation: 'Short sentences', evidenceCount: 4, lastObservedAt: Date.now(), confidence: 0.83, pinned: 1 });
      await local.writerInsights.put({ id: 'insight_legacy', projectId: 'first_device', category: 'voice', observation: 'Legacy insight', evidenceCount: 3, lastObservedAt: Date.now(), confidence: 50, pinned: 0 });
      const session = { id: 'session_1', projectId: 'first_device', projectName: 'Existing novel', startedAt: '2026-10-02T10:00:00Z', endedAt: '2026-10-02T11:00:00Z', wordsStart: 0, wordsEnd: 3, wordsAdded: 3, flowScore: 3, heteronymId: null, heteronymName: null };
      await local.sessions.put({ ...session, data: JSON.stringify(session) });
      await local.chatMessages.put({ id: 'chat_1', projectId: 'first_device', chapterId: 'ch_1', role: 'assistant', content: 'Review the opening', timestamp: Date.now() });
      await local.comments.put({ id: 'comment_1', projectId: 'first_device', chapterId: 'ch_1', startOffset: 0, endOffset: 8, quote: 'Existing', prefix: '', suffix: ' local', text: 'Keep this opening', replies: [], resolved: false, orphaned: false, createdAt: '2026-10-02T10:00:00Z', updatedAt: '2026-10-02T10:00:00Z' });
      await local.syncQueue.put({ id: 'snapshot_trigger', projectId: 'first_device', entityType: 'storySnapshot', entityId: 'snap_1', op: 'upsert', timestamp: 1 });
    });
    const engine = new SyncEngine();
    try { await engine.start(); expect(engine.getStatus()).toBe('idle'); } finally { engine.destroy(); }
    expect(await local.syncQueue.count()).toBe(0);
    const meta = await local.syncMeta.get('first_device'); expect(meta?.serverStoryId).toBeTruthy();
    expect((await pg.query('SELECT content FROM chapters')).rows).toEqual([{ content: 'Existing local manuscript' }]);
    expect((await pg.query('SELECT confidence FROM writer_insights ORDER BY id')).rows).toEqual([{ confidence: 83 }, { confidence: 50 }]);
    // A clean IndexedDB models a second browser profile; the server remains intact.
    await local.transaction('rw', cloudTables(), async () => { for (const table of cloudTables()) await table.clear(); });
    setActiveProjectId('fresh_device');
    const opened = await openCloudProject(meta!.serverStoryId!, 'writer', () => 'writer');
    expect((await local.chapters.get('ch_1'))?.content).toBe('Existing local manuscript');
    expect((await local.storySnapshots.get('snap_1'))?.storyId).toBe(opened.projectId);
    expect(JSON.parse((await local.chapterVersions.get('v_1'))!.data).label).toBe('Earlier draft');
    expect((await local.writerInsights.get('insight_1'))?.confidence).toBe(0.83);
    expect((await local.writerInsights.get('insight_legacy'))?.confidence).toBe(0.5);
    expect(JSON.parse((await local.stories.get(opened.projectId))!.data)).toMatchObject({ title: 'Existing novel', author_name: 'Writer' });
    expect(JSON.parse((await local.sessions.get('session_1'))!.data)).toMatchObject({ projectId: opened.projectId, wordsAdded: 3, flowScore: 3 });
    expect(await local.chatMessages.get('chat_1')).toMatchObject({ projectId: opened.projectId, content: 'Review the opening' });
    expect(await local.comments.get('comment_1')).toMatchObject({ projectId: opened.projectId, text: 'Keep this opening' });
    expect(await local.syncQueue.count()).toBe(0);
  }, 30_000);
});
