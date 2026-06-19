import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  db,
  migrateFromLocalStorage,
  getChapterContent,
  putChapterContent,
  getAllChapterContents,
  deleteChapterContent,
  getVersions,
  putVersion,
  deleteVersionById,
  getSessions,
  putSession,
  getStory,
  putStory,
  clearAllStoryData,
} from '@/lib/storage/dexie-db';
import { getActiveProjectId } from '@/lib/projects/active-project';

describe('dexie-db', () => {
  let storage: Record<string, string>;

  beforeEach(async () => {
    // Clear all Dexie tables
    await db.chapters.clear();
    await db.sessions.clear();
    await db.chapterVersions.clear();
    await db.meta.clear();
    await db.stories.clear();

    storage = {};
    const localStorageMock: Storage = {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
      clear: vi.fn(() => { storage = {}; }),
      get length() { return Object.keys(storage).length; },
      key: vi.fn((index: number) => Object.keys(storage)[index] ?? null),
    };
    vi.stubGlobal('localStorage', localStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── Migration ───

  describe('migrateFromLocalStorage', () => {
    it('migrates chapters from zagafy_state into Dexie', async () => {
      storage['zagafy_state'] = JSON.stringify({
        title: 'My Novel',
        chapters: [
          { id: 'ch1', title: 'Chapter 1', content: 'Once upon a time...', summary: 'Intro', canonStatus: 'draft' },
          { id: 'ch2', title: 'Chapter 2', content: 'And then...', summary: 'Rising', canonStatus: 'confirmed' },
        ],
      });

      await migrateFromLocalStorage();

      const ch1 = await db.chapters.get('ch1');
      expect(ch1?.content).toBe('Once upon a time...');
      const ch2 = await db.chapters.get('ch2');
      expect(ch2?.content).toBe('And then...');

      // Legacy localStorage key removed after migration
      expect(storage['zagafy_state']).toBeUndefined();

      // Full state blob now lives in Dexie stories table (content stripped),
      // keyed by the active project id (multi-project).
      const row = await db.stories.get(getActiveProjectId());
      expect(row).toBeTruthy();
      const parsed = JSON.parse(row!.data);
      expect(parsed.title).toBe('My Novel');
      expect(parsed.chapters[0].content).toBe('');
      expect(parsed.chapters[1].content).toBe('');

      // Migrated chapters are tagged with the active project.
      const migratedCh1 = await db.chapters.get('ch1');
      expect(migratedCh1?.projectId).toBe(getActiveProjectId());
    });

    it('migrates chapter versions and removes localStorage key', async () => {
      const versions = [
        { id: 'v1', chapterId: 'ch1', label: 'A', content: 'text', createdAt: '2026-01-01T00:00:00Z', isCanonical: true, source: 'manual', wordCount: 1 },
      ];
      storage['zagafy_chapter_versions'] = JSON.stringify(versions);

      await migrateFromLocalStorage();

      const rows = await db.chapterVersions.toArray();
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0].data).id).toBe('v1');
      expect(storage['zagafy_chapter_versions']).toBeUndefined();
    });

    it('migrates writing sessions and removes localStorage key', async () => {
      const sessions = [
        { id: 's1', startedAt: '2026-01-01T10:00:00Z', endedAt: '2026-01-01T10:30:00Z', wordsAdded: 100, flowScore: null, heteronymId: null },
      ];
      storage['zagafy_sessions'] = JSON.stringify(sessions);

      await migrateFromLocalStorage();

      const rows = await db.sessions.toArray();
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0].data).id).toBe('s1');
      expect(storage['zagafy_sessions']).toBeUndefined();
    });

    it('is idempotent — skips on second call', async () => {
      storage['zagafy_state'] = JSON.stringify({
        chapters: [{ id: 'ch1', title: 'Ch1', content: 'Original', summary: '' }],
      });

      await migrateFromLocalStorage();
      storage['zagafy_state'] = JSON.stringify({
        chapters: [{ id: 'ch1', title: 'Ch1', content: 'Modified', summary: '' }],
      });

      await migrateFromLocalStorage();

      const ch1 = await db.chapters.get('ch1');
      expect(ch1?.content).toBe('Original');
    });

    it('handles empty localStorage gracefully', async () => {
      await migrateFromLocalStorage();
      const chapters = await db.chapters.toArray();
      expect(chapters).toHaveLength(0);
    });

    it('handles corrupt JSON in localStorage gracefully', async () => {
      storage['zagafy_state'] = 'not-json{{{';
      storage['zagafy_chapter_versions'] = 'also-bad';
      storage['zagafy_sessions'] = '{nope}';

      await migrateFromLocalStorage();

      // Should complete without throwing; migration marked done
      const meta = await db.meta.get('migration');
      expect(meta).toBeTruthy();
    });
  });

  // ─── Chapter Content CRUD ───

  describe('chapter content CRUD', () => {
    it('putChapterContent / getChapterContent round-trip', async () => {
      await putChapterContent('ch1', 'Hello world', 'Chapter 1');
      const content = await getChapterContent('ch1');
      expect(content).toBe('Hello world');
    });

    it('getChapterContent returns empty string for missing chapter', async () => {
      expect(await getChapterContent('nonexistent')).toBe('');
    });

    it('getAllChapterContents returns map of all contents', async () => {
      await putChapterContent('ch1', 'Content 1', 'Ch1');
      await putChapterContent('ch2', 'Content 2', 'Ch2');
      const map = await getAllChapterContents();
      expect(map.size).toBe(2);
      expect(map.get('ch1')).toBe('Content 1');
      expect(map.get('ch2')).toBe('Content 2');
    });

    it('deleteChapterContent removes a chapter', async () => {
      await putChapterContent('ch1', 'Content', 'Ch1');
      await deleteChapterContent('ch1');
      expect(await getChapterContent('ch1')).toBe('');
    });
  });

  // ─── Version CRUD ───

  describe('version CRUD', () => {
    it('putVersion / getVersions round-trip', async () => {
      await putVersion({ id: 'v1', chapterId: 'ch1', label: 'A', content: 'text', createdAt: '2026-01-01T00:00:00Z' });
      const versions = await getVersions('ch1');
      expect(versions).toHaveLength(1);
      expect(versions[0].id).toBe('v1');
    });

    it('deleteVersionById removes a version', async () => {
      await putVersion({ id: 'v1', chapterId: 'ch1', createdAt: '2026-01-01T00:00:00Z' });
      await deleteVersionById('v1');
      expect(await getVersions('ch1')).toHaveLength(0);
    });
  });

  // ─── Session CRUD ───

  describe('session CRUD', () => {
    it('putSession / getSessions round-trip', async () => {
      await putSession({ id: 's1', startedAt: '2026-01-01T10:00:00Z', endedAt: '2026-01-01T10:30:00Z', wordsAdded: 100 });
      const sessions = await getSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('s1');
    });

    it('putSession overwrites existing session with same id', async () => {
      await putSession({ id: 's1', wordsAdded: 100 });
      await putSession({ id: 's1', wordsAdded: 200 });
      const sessions = await getSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].wordsAdded).toBe(200);
    });
  });

  // ─── Story state CRUD ───

  describe('story state CRUD', () => {
    it('getStory returns null when no row exists', async () => {
      expect(await getStory()).toBeNull();
    });

    it('putStory / getStory round-trip', async () => {
      await putStory({ title: 'Test', genre: ['Fantasy'] });
      const row = await getStory();
      expect(row).toBeTruthy();
      expect(row!.title).toBe('Test');
      expect(row!.genre).toEqual(['Fantasy']);
    });

    it('putStory overwrites previous state', async () => {
      await putStory({ title: 'First' });
      await putStory({ title: 'Second' });
      const row = await getStory();
      expect(row!.title).toBe('Second');
      const all = await db.stories.toArray();
      expect(all).toHaveLength(1);
    });

    it('getStory returns null when stored JSON is corrupt', async () => {
      await db.stories.put({ id: getActiveProjectId(), data: '{not-json', updatedAt: Date.now() });
      expect(await getStory()).toBeNull();
    });
  });

  // ─── clearAllStoryData ───

  describe('clearAllStoryData', () => {
    it('clears all project tables', async () => {
      await putStory({ title: 'Gone' });
      await putChapterContent('ch1', 'bye', 'Ch1');
      await putSession({ id: 's1', wordsAdded: 10 });
      await putVersion({ id: 'v1', chapterId: 'ch1', createdAt: '2026-01-01T00:00:00Z' });

      await clearAllStoryData();

      expect(await getStory()).toBeNull();
      expect((await db.chapters.toArray())).toHaveLength(0);
      expect((await db.sessions.toArray())).toHaveLength(0);
      expect((await db.chapterVersions.toArray())).toHaveLength(0);
    });
  });
});
