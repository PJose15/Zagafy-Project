import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock sync-queue before importing SyncEngine.
// getSyncMeta defaults to a BOUND project (serverStoryId set) so the pull-apply
// tests below exercise the normal bound path; unbound behavior is covered by a
// dedicated test.
vi.mock('@/lib/sync/sync-queue', () => ({
  readQueue: vi.fn(async () => []),
  clearEntries: vi.fn(async () => {}),
  updateSyncMeta: vi.fn(async () => {}),
  getServerStoryId: vi.fn(async () => null),
  getSyncMeta: vi.fn(async () => ({
    id: 'current',
    serverStoryId: 'server-story-1',
    lastPulledAt: null,
    lastPushedAt: null,
  })),
}));

vi.mock('@/lib/storage/dexie-db', () => ({
  db: {
    syncMeta: { get: vi.fn(async () => undefined) },
    stories: {
      get: vi.fn(async () => ({
        id: 'current',
        data: '{"title":"Test"}',
        updatedAt: Date.now(),
      })),
      put: vi.fn(async () => {}),
    },
    chapters: { get: vi.fn(async () => null), put: vi.fn(async () => {}) },
    chapterVersions: { get: vi.fn(async () => null), put: vi.fn(async () => {}) },
    storySnapshots: { get: vi.fn(async () => null), put: vi.fn(async () => {}) },
    sessions: { get: vi.fn(async () => null), put: vi.fn(async () => {}) },
    chatMessages: { get: vi.fn(async () => null), put: vi.fn(async () => {}) },
    writerInsights: { put: vi.fn(async () => {}) },
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { SyncEngine } from '@/lib/sync/sync-engine';
import { readQueue, clearEntries, getServerStoryId, getSyncMeta } from '@/lib/sync/sync-queue';
import { db } from '@/lib/storage/dexie-db';

describe('SyncEngine', () => {
  let engine: SyncEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockFetch.mockReset();
    // clearAllMocks resets call history but NOT implementations, so a per-test
    // mockResolvedValue would leak. Re-assert the bound-project default each test.
    vi.mocked(getSyncMeta).mockResolvedValue({
      id: 'current',
      serverStoryId: 'server-story-1',
      lastPulledAt: null,
      lastPushedAt: null,
    });
    engine = new SyncEngine({ pushDebounceMs: 100, pullIntervalMs: 60000 });
  });

  afterEach(() => {
    engine.destroy();
    vi.useRealTimers();
  });

  // ─── Constructor / getStatus ───

  describe('constructor', () => {
    it('sets status to disabled initially', () => {
      expect(engine.getStatus()).toBe('disabled');
    });
  });

  describe('getStatus', () => {
    it('returns current status', () => {
      const status = engine.getStatus();
      expect(typeof status).toBe('string');
      expect(status).toBe('disabled');
    });
  });

  // ─── subscribe ───

  describe('subscribe', () => {
    it('receives status-change events', async () => {
      const events: any[] = [];
      engine.subscribe((event) => events.push(event));

      // Trigger a push to cause status changes
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { applied: 0, conflicts: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );

      // Start engine to trigger status changes (pull)
      vi.mocked(readQueue).mockResolvedValue([]);
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );

      await engine.start();

      // Should have received at least a status-change event
      const statusEvents = events.filter(e => e.type === 'status-change');
      expect(statusEvents.length).toBeGreaterThan(0);
    });

    it('returns an unsubscribe function that works', () => {
      const events: any[] = [];
      const unsub = engine.subscribe((event) => events.push(event));

      expect(typeof unsub).toBe('function');
      unsub();

      // After unsubscribe, no more events should be received
      // We can't easily trigger events without starting, but verify the function exists
      expect(events).toHaveLength(0);
    });
  });

  // ─── notifyWrite ───

  describe('notifyWrite', () => {
    it('is a no-op when status is disabled', () => {
      expect(engine.getStatus()).toBe('disabled');
      // Should not throw and should not schedule anything
      engine.notifyWrite();
      // No fetch calls should have been made
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ─── destroy ───

  describe('destroy', () => {
    it('cleans up timers and listeners', async () => {
      const listener = vi.fn();
      engine.subscribe(listener);

      // Start the engine so pull interval is set
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );
      await engine.start();

      listener.mockClear();
      engine.destroy();

      // After destroy, no more events should fire
      // Advance timers to verify pull interval doesn't fire
      await vi.advanceTimersByTimeAsync(120000);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ─── push ───

  describe('push (via syncNow)', () => {
    it('sets status to idle with empty queue', async () => {
      const events: any[] = [];
      engine.subscribe((e) => events.push(e));

      // Start the engine first to get out of disabled state
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );
      await engine.start();

      vi.mocked(readQueue).mockResolvedValue([]);

      // Mock the pull fetch for syncNow's pull call
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );

      await engine.syncNow();

      expect(engine.getStatus()).toBe('idle');
    });

    it('calls fetch with correct URL and body shape when queue has deltas', async () => {
      // Start the engine first
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );
      await engine.start();

      vi.mocked(readQueue).mockResolvedValue([
        { id: 'q1', entityType: 'story', entityId: 'current', op: 'upsert', timestamp: Date.now() },
      ]);
      vi.mocked(getServerStoryId).mockResolvedValue('server-story-1');

      // Push fetch
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { applied: 1, conflicts: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );
      // Pull fetch
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: 'server-story-1', story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );

      await engine.syncNow();

      // Find the push call (POST to /api/sync/push)
      const pushCall = mockFetch.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0] === '/api/sync/push',
      );
      expect(pushCall).toBeDefined();
      const pushOptions = pushCall![1] as RequestInit;
      expect(pushOptions.method).toBe('POST');
      const body = JSON.parse(pushOptions.body as string);
      expect(body.storyId).toBe('server-story-1');
      expect(Array.isArray(body.deltas)).toBe(true);
    });

    it('clears queue entries on successful response', async () => {
      // Start the engine first
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );
      await engine.start();

      vi.mocked(readQueue).mockResolvedValue([
        { id: 'q1', entityType: 'story', entityId: 'current', op: 'upsert', timestamp: Date.now() },
      ]);
      vi.mocked(getServerStoryId).mockResolvedValue('server-story-1');

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { applied: 1, conflicts: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );

      await engine.syncNow();

      expect(clearEntries).toHaveBeenCalledWith(['q1']);
    });

    it('sets status to conflict when server returns conflicts', async () => {
      // Start the engine first
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );
      await engine.start();

      vi.mocked(readQueue).mockResolvedValue([
        { id: 'q1', entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: Date.now() },
      ]);
      vi.mocked(getServerStoryId).mockResolvedValue('server-story-1');

      // Mock chapter resolution
      vi.mocked(db.chapters.get).mockResolvedValueOnce({
        id: 'ch-1',
        title: 'Chapter 1',
        content: 'content',
        summary: '',
        updatedAt: Date.now(),
      } as any);

      const conflict = {
        entityType: 'chapter',
        entityId: 'ch-1',
        localPayload: { id: 'ch-1', content: 'local' },
        serverPayload: { id: 'ch-1', content: 'server', title: '', summary: '' },
        serverUpdatedAt: new Date().toISOString(),
        detectedAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { applied: 0, conflicts: [conflict], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );
      // Pull fetch
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );

      await engine.syncNow();

      expect(engine.getStatus()).toBe('conflict');
    });

    it('sets status to error on fetch failure', async () => {
      const events: any[] = [];
      engine.subscribe((e) => events.push(e));

      // Start the engine first
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );
      await engine.start();
      events.length = 0; // clear start events

      vi.mocked(readQueue).mockResolvedValue([
        { id: 'q1', entityType: 'story', entityId: 'current', op: 'upsert', timestamp: Date.now() },
      ]);
      vi.mocked(getServerStoryId).mockResolvedValue('server-story-1');

      // Both push and pull fail so error status persists
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await engine.syncNow();

      // Verify error status was emitted during push
      const errorEvents = events.filter((e: any) => e.type === 'status-change' && e.status === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
    });

    it('sets status to offline when navigator.onLine is false', async () => {
      const events: any[] = [];
      engine.subscribe((e) => events.push(e));

      // Start the engine first
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );
      await engine.start();
      events.length = 0;

      vi.mocked(readQueue).mockResolvedValue([
        { id: 'q1', entityType: 'story', entityId: 'current', op: 'upsert', timestamp: Date.now() },
      ]);
      vi.mocked(getServerStoryId).mockResolvedValue('server-story-1');

      // Simulate offline
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

      // Both push and pull fail while offline
      mockFetch.mockRejectedValueOnce(new Error('offline'));
      mockFetch.mockRejectedValueOnce(new Error('offline'));

      await engine.syncNow();

      // Verify offline status was emitted
      const offlineEvents = events.filter((e: any) => e.type === 'status-change' && e.status === 'offline');
      expect(offlineEvents.length).toBeGreaterThan(0);

      // Restore online
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    });
  });

  // ─── pull ───

  describe('pull (via syncNow)', () => {
    it('calls fetch with the bound storyId and the incremental since watermark', async () => {
      // REG-3: the since watermark comes from the project-keyed sync meta
      // (getSyncMeta), not a hardcoded 'sync' row. Bound project with a prior
      // pull timestamp → the pull URL must carry both storyId and since.
      vi.mocked(getSyncMeta).mockResolvedValue({
        id: 'current',
        serverStoryId: 'server-story-1',
        lastPulledAt: '2026-01-01T00:00:00Z',
        lastPushedAt: null,
      });

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { storyId: 'server-story-1', story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );

      await engine.start();

      // Find pull calls (GET requests)
      const pullCalls = mockFetch.mock.calls.filter(
        (call) => typeof call[0] === 'string' && (call[0] as string).startsWith('/api/sync/pull'),
      );
      expect(pullCalls.length).toBeGreaterThan(0);
      const pullUrl = pullCalls[0][0] as string;
      expect(pullUrl).toContain('/api/sync/pull');
      expect(pullUrl).toContain('storyId=server-story-1');
      expect(pullUrl).toContain(`since=${encodeURIComponent('2026-01-01T00:00:00Z')}`);
    });

    it('does NOT pull for an unbound project (no serverStoryId) — prevents cross-project overwrite', async () => {
      // REG-4: an unbound project must never adopt the server's "most recent
      // story", which would overwrite the active project. Pull should no-op:
      // no GET to /api/sync/pull, no destructive writes to the stories table.
      vi.mocked(getSyncMeta).mockResolvedValue({
        id: 'current',
        serverStoryId: null,
        lastPulledAt: null,
        lastPushedAt: null,
      });
      vi.mocked(readQueue).mockResolvedValue([]);

      await engine.start();

      const pullCalls = mockFetch.mock.calls.filter(
        (call) => typeof call[0] === 'string' && (call[0] as string).startsWith('/api/sync/pull'),
      );
      expect(pullCalls.length).toBe(0);
      expect(db.stories.put).not.toHaveBeenCalled();
      expect(db.chapters.put).not.toHaveBeenCalled();
      // The engine still settles into a normal idle state.
      expect(engine.getStatus()).toBe('idle');
    });

    it('applies story data to Dexie stories table', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({
          data: {
            storyId: 'server-story-1',
            story: { id: 'server-story-1', title: 'My Story', state: { title: 'My Story', genre: 'fantasy' }, updatedAt: new Date().toISOString() },
            chapters: [],
            chapterVersions: [],
            storySnapshots: [],
            sessions: [],
            chatMessages: [],
            writerInsights: [],
            serverTimestamp: new Date().toISOString(),
          },
        }), { status: 200 }),
      );

      await engine.start();

      expect(db.stories.put).toHaveBeenCalled();
    });

    it('applies chapters to Dexie chapters table', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({
          data: {
            storyId: 'server-story-1',
            story: null,
            chapters: [
              { id: 'ch-1', title: 'Chapter One', content: 'Once upon a time', summary: '', updatedAt: new Date().toISOString() },
            ],
            chapterVersions: [],
            storySnapshots: [],
            sessions: [],
            chatMessages: [],
            writerInsights: [],
            serverTimestamp: new Date().toISOString(),
          },
        }), { status: 200 }),
      );

      await engine.start();

      expect(db.chapters.put).toHaveBeenCalled();
      const putCall = vi.mocked(db.chapters.put).mock.calls[0][0] as any;
      expect(putCall.id).toBe('ch-1');
      expect(putCall.title).toBe('Chapter One');
    });

    it('skips entities that already exist locally (for immutable types like sessions)', async () => {
      vi.mocked(db.sessions.get).mockResolvedValue({
        id: 's-1',
        startedAt: '2026-01-01T00:00:00Z',
        endedAt: '2026-01-01T01:00:00Z',
        wordsAdded: 500,
        flowScore: null,
        heteronymId: null,
        data: '{}',
      } as any);

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({
          data: {
            storyId: 'server-story-1',
            story: null,
            chapters: [],
            chapterVersions: [],
            storySnapshots: [],
            sessions: [
              { id: 's-1', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T01:00:00Z', wordsAdded: 500, data: '{}' },
            ],
            chatMessages: [],
            writerInsights: [],
            serverTimestamp: new Date().toISOString(),
          },
        }), { status: 200 }),
      );

      await engine.start();

      // sessions.put should NOT have been called because the session already exists
      expect(db.sessions.put).not.toHaveBeenCalled();
    });
  });

  // ─── syncNow ───

  describe('syncNow', () => {
    it('triggers both push and pull', async () => {
      // Start engine
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );

      await engine.start();
      mockFetch.mockClear();

      // SyncNow should call push (readQueue) and then pull (fetch /api/sync/pull)
      vi.mocked(readQueue).mockResolvedValue([]);

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );

      await engine.syncNow();

      // readQueue should have been called (push)
      expect(readQueue).toHaveBeenCalled();
      // fetch should have been called (pull)
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
