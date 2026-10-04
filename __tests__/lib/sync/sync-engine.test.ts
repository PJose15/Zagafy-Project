import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const active = vi.hoisted(() => ({ id: 'current' }));
vi.mock('@/lib/projects/active-project', () => ({ getActiveProjectId: () => active.id }));

// Mock sync-queue before importing SyncEngine.
// getSyncMeta defaults to a BOUND project (serverStoryId set) so the pull-apply
// tests below exercise the normal bound path; unbound behavior is covered by a
// dedicated test.
vi.mock('@/lib/sync/initial-upload', () => ({ prepareInitialUpload: vi.fn(async () => 'new-server-story') }));

vi.mock('@/lib/sync/sync-queue', () => ({
  readQueue: vi.fn(async () => ({ entries: [], coveredIds: [] })),
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
    transaction: vi.fn(async (_mode, _tables, callback) => callback()),
    syncQueue: {},
    syncMeta: { get: vi.fn(async () => undefined) },
    stories: {
      get: vi.fn(async () => ({
        id: 'current',
        data: '{"title":"Test"}',
        updatedAt: Date.now(),
      })),
      put: vi.fn(async () => {}),
    },
    chapters: { get: vi.fn(async () => null), put: vi.fn(async () => {}), update: vi.fn(async () => 1) },
    chapterVersions: { get: vi.fn(async () => null), put: vi.fn(async () => {}) },
    storySnapshots: { get: vi.fn(async () => null), put: vi.fn(async () => {}) },
    sessions: { get: vi.fn(async () => null), put: vi.fn(async () => {}) },
    chatMessages: { get: vi.fn(async () => null), put: vi.fn(async () => {}) },
    writerInsights: { get: vi.fn(async () => null), put: vi.fn(async () => {}) },
    comments: { get: vi.fn(async () => null), put: vi.fn(async () => {}) },
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { SyncEngine } from '@/lib/sync/sync-engine';
import { readQueue, clearEntries, getServerStoryId, getSyncMeta, updateSyncMeta } from '@/lib/sync/sync-queue';
import { db } from '@/lib/storage/dexie-db';

describe('SyncEngine', () => {
  let engine: SyncEngine;

  beforeEach(() => {
    active.id = 'current';
    vi.mocked(db.sessions.get).mockResolvedValue(null as any);
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
    // applyPulledData now reads the queue for its dirty-guard, so a leaked
    // per-test readQueue implementation could wrongly mark pulled entities dirty.
    // Reset to the empty default each test (dirty-guard tests re-mock explicitly).
    vi.mocked(readQueue).mockResolvedValue({ entries: [], coveredIds: [] });
    engine = new SyncEngine({ pushDebounceMs: 100, pullIntervalMs: 60000 });
  });

  afterEach(() => {
    engine.destroy();
    vi.useRealTimers();
  });

  it('retries durable queued writes when the app starts and preserves a failed push status', async () => {
    vi.mocked(readQueue).mockResolvedValue({ entries: [{ id: 'q', entityType: 'story', entityId: 'current', op: 'upsert', timestamp: 1 }], coveredIds: ['q'] });
    mockFetch.mockResolvedValue(new Response('', { status: 503 }));
    await engine.start();
    expect(mockFetch).toHaveBeenCalledWith('/api/sync/push', expect.objectContaining({ method: 'POST' }));
    expect(mockFetch.mock.calls.some(call => String(call[0]).startsWith('/api/sync/pull'))).toBe(false);
    expect(engine.getStatus()).toBe('error'); expect(clearEntries).not.toHaveBeenCalled();
    mockFetch.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).toHaveBeenCalledWith('/api/sync/push', expect.objectContaining({ method: 'POST' }));
    expect(clearEntries).not.toHaveBeenCalled();
  });

  it('sends manuscript metadata and chapter parents before history in a bounded batch', async () => {
    const entries = Array.from({ length: 500 }, (_, i) => ({ id: `q_v${i}`, entityType: 'chapterVersion' as const, entityId: `v${i}`, op: 'upsert' as const, timestamp: 1 }));
    const all = [...entries, { id: 'q_story', entityType: 'story' as const, entityId: 'current', op: 'upsert' as const, timestamp: 2 }, { id: 'q_chapter', entityType: 'chapter' as const, entityId: 'ch_parent', op: 'upsert' as const, timestamp: 2 }];
    vi.mocked(readQueue).mockResolvedValue({ entries: all, coveredIds: all.map(e => e.id), coveredIdsByEntity: Object.fromEntries(all.map(e => [`${e.entityType}:${e.entityId}`, [e.id]])) });
    vi.mocked(getServerStoryId).mockResolvedValue('server-story-1');
    vi.mocked(db.chapterVersions.get).mockImplementation((async (id: string) => ({ id, chapterId: 'ch_parent', projectId: 'current', createdAt: '2026-10-02T10:00:00Z', data: '{}' })) as any);
    vi.mocked(db.chapters.get).mockResolvedValue({ id: 'ch_parent', projectId: 'current', title: 'Opening', content: 'Writing', summary: '', updatedAt: 1 } as any);
    mockFetch.mockResolvedValue(new Response('', { status: 503 }));
    try {
      await engine.start();
      const sent = JSON.parse(mockFetch.mock.calls[0][1].body).deltas;
      expect(sent).toHaveLength(500);
      expect(sent.slice(0, 2)).toEqual([expect.objectContaining({ entityType: 'story' }), expect.objectContaining({ entityType: 'chapter', entityId: 'ch_parent' })]);
      expect(clearEntries).not.toHaveBeenCalled();
    } finally {
      vi.mocked(db.chapterVersions.get).mockResolvedValue(null as any);
      vi.mocked(db.chapters.get).mockResolvedValue(null as any);
    }
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
      vi.mocked(readQueue).mockResolvedValue({ entries: [], coveredIds: [] });
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

      vi.mocked(readQueue).mockResolvedValue({ entries: [], coveredIds: [] });

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

      vi.mocked(readQueue).mockResolvedValue({
        entries: [{ id: 'q1', entityType: 'story', entityId: 'current', op: 'upsert', timestamp: Date.now() }],
        coveredIds: ['q1'],
      });
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

    it('retains the queue and chapter version on an incomplete acknowledgement', async () => {
      vi.mocked(readQueue).mockResolvedValue({ entries: [
        { id: 'q1', entityType: 'story', entityId: 'current', op: 'upsert', timestamp: Date.now() },
      ], coveredIds: ['q0', 'q1'] });
      vi.mocked(getServerStoryId).mockResolvedValue('server-story-1');
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { applied: 0, conflicts: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }));
      await (engine as any).push();
      expect(clearEntries).not.toHaveBeenCalled();
      expect(db.chapters.update).not.toHaveBeenCalled();
      expect(engine.getStatus()).toBe('error');
    });

    it('bounds a large push and clears only covered rows for the submitted entities', async () => {
      const entries = Array.from({ length: 501 }, (_, index) => ({ id: `q${index}`, entityType: 'chapter' as const, entityId: `ch${index}`, op: 'delete' as const, timestamp: index }));
      const coveredIdsByEntity = Object.fromEntries(entries.map(entry => [`chapter:${entry.entityId}`, [entry.id]]));
      coveredIdsByEntity['chapter:ch0'].push('superseded');
      vi.mocked(readQueue).mockResolvedValue({ entries, coveredIds: [...entries.map(entry => entry.id), 'superseded'], coveredIdsByEntity });
      vi.mocked(getServerStoryId).mockResolvedValue('server-story-1');
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { applied: 500, conflicts: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }));
      await (engine as any).push();
      const sent = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(sent.deltas).toHaveLength(500);
      expect(clearEntries).toHaveBeenCalledWith(expect.arrayContaining(['q0', 'superseded', 'q499']));
      expect(vi.mocked(clearEntries).mock.calls[0][0]).not.toContain('q500');
      expect(engine.getStatus()).toBe('idle');
    });

    it('retains local writing and queue when a chapter conflict backup cannot be saved', async () => {
      vi.mocked(readQueue).mockResolvedValue({ entries: [{ id: 'q1', entityType: 'chapter', entityId: 'ch1', op: 'upsert', timestamp: 1 }], coveredIds: ['q1'] });
      vi.mocked(getServerStoryId).mockResolvedValue('server-story-1');
      vi.mocked(db.chapters.get).mockResolvedValueOnce({ id: 'ch1', content: 'Local edit', title: 'Chapter', summary: '', version: 1 } as any).mockResolvedValueOnce({ id: 'ch1', content: 'Local edit' } as any);
      vi.mocked(db.chapterVersions.put).mockRejectedValueOnce(new Error('storage full'));
      const conflict = { entityType: 'chapter', entityId: 'ch1', localPayload: { content: 'Local edit' }, serverPayload: { id: 'ch1', content: 'Server edit', version: 3 }, serverUpdatedAt: '', detectedAt: '' };
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { applied: 0, conflicts: [conflict], serverTimestamp: '' } }), { status: 200 }));
      await (engine as any).push();
      expect(db.chapters.put).not.toHaveBeenCalled();
      expect(clearEntries).not.toHaveBeenCalled();
      expect(engine.getStatus()).toBe('error');
    });

    it('retains the story and queue when a user-visible recovery snapshot cannot be saved', async () => {
      vi.mocked(readQueue).mockResolvedValue({ entries: [{ id: 'q1', entityType: 'story', entityId: 'current', op: 'upsert', timestamp: 1 }], coveredIds: ['q1'] });
      vi.mocked(getServerStoryId).mockResolvedValue('server-story-1');
      vi.mocked(db.stories.get).mockResolvedValue({ id: 'current', data: '{"title":"My local story","chapters":[]}' } as any);
      vi.mocked(db.storySnapshots.put).mockRejectedValueOnce(new Error('storage full'));
      const conflict = { entityType: 'story', entityId: 'current', localPayload: {}, serverPayload: { title: 'Cloud', version: 3 }, serverUpdatedAt: '', detectedAt: '' };
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { applied: 0, conflicts: [conflict], serverTimestamp: '' } }), { status: 200 }));
      await (engine as any).push();
      expect(db.stories.put).not.toHaveBeenCalled();
      expect(clearEntries).not.toHaveBeenCalled();
      expect(engine.getStatus()).toBe('error');
    });

    it('clears ALL covered queue row ids (including superseded duplicates) on success', async () => {
      // Start the engine first
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );
      await engine.start();

      // q0 is a superseded duplicate of the same entity — the dedup dropped it
      // from entries, but a successful push must clear it too or it resurfaces
      // as "latest" on the next cycle and re-pushes stale content.
      vi.mocked(readQueue).mockResolvedValue({
        entries: [{ id: 'q1', entityType: 'story', entityId: 'current', op: 'upsert', timestamp: Date.now() }],
        coveredIds: ['q0', 'q1'],
      });
      vi.mocked(getServerStoryId).mockResolvedValue('server-story-1');

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { applied: 1, conflicts: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );

      await engine.syncNow();

      expect(clearEntries).toHaveBeenCalledWith(['q0', 'q1']);
    });

    it('sets status to conflict when server returns conflicts', async () => {
      // Start the engine first
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );
      await engine.start();

      vi.mocked(readQueue).mockResolvedValue({
        entries: [{ id: 'q1', entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: Date.now() }],
        coveredIds: ['q1'],
      });
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

      vi.mocked(readQueue).mockResolvedValue({
        entries: [{ id: 'q1', entityType: 'story', entityId: 'current', op: 'upsert', timestamp: Date.now() }],
        coveredIds: ['q1'],
      });
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

      vi.mocked(readQueue).mockResolvedValue({
        entries: [{ id: 'q1', entityType: 'story', entityId: 'current', op: 'upsert', timestamp: Date.now() }],
        coveredIds: ['q1'],
      });
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
    it('does not apply a delayed pull to the newly active project', async () => {
      mockFetch.mockImplementationOnce(async () => {
        active.id = 'other';
        return new Response(JSON.stringify({ data: { storyId: 'server-story-1', story: { state: '{}' }, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: '2026-01-01T00:00:00Z' } }), { status: 200 });
      });
      await engine.start();
      expect(updateSyncMeta).toHaveBeenCalledWith({ lastPulledAt: '2026-01-01T00:00:00Z' }, 'current');
      expect(vi.mocked(db.stories.put).mock.calls.every(([row]) => row.id !== 'other')).toBe(true);
    });

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
      vi.mocked(readQueue).mockResolvedValue({ entries: [], coveredIds: [] });

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

    it('refreshes a completed session already present in this project)', async () => {
      vi.mocked(db.sessions.get).mockResolvedValue({
        id: 's-1',
        projectId: 'current',
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

      expect(db.sessions.put).toHaveBeenCalledWith(expect.objectContaining({ id: 's-1', projectId: 'current', wordsAdded: 500 }));
    });
  });

  // ─── chapter version round-trip (C1) ───

  describe('chapter version round-trip', () => {
    async function startEngine() {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );
      await engine.start();
    }

    function queueChapterDelta() {
      vi.mocked(readQueue).mockResolvedValue({
        entries: [{ id: 'q1', entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: Date.now() }],
        coveredIds: ['q1'],
      });
      vi.mocked(getServerStoryId).mockResolvedValue('server-story-1');
    }

    function mockPushThenPull(pushData: Record<string, unknown>) {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: pushData }), { status: 200 }),
      );
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], serverTimestamp: new Date().toISOString() } }), { status: 200 }),
      );
    }

    function getPushedChapterDelta() {
      const pushCall = mockFetch.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0] === '/api/sync/push',
      );
      expect(pushCall).toBeDefined();
      const body = JSON.parse((pushCall![1] as RequestInit).body as string);
      return body.deltas.find((d: any) => d.entityType === 'chapter');
    }

    it('includes the local Dexie version in the pushed chapter payload', async () => {
      await startEngine();
      queueChapterDelta();
      vi.mocked(db.chapters.get).mockResolvedValueOnce({
        id: 'ch-1', title: 'Chapter 1', content: 'content', summary: '', updatedAt: 1, version: 3,
      } as any);
      mockPushThenPull({ applied: 1, conflicts: [], serverTimestamp: new Date().toISOString() });

      await engine.syncNow();

      expect(getPushedChapterDelta().payload.version).toBe(3);
    });

    it('omits version for legacy rows without one (server treats missing as 1)', async () => {
      await startEngine();
      queueChapterDelta();
      vi.mocked(db.chapters.get).mockResolvedValueOnce({
        id: 'ch-1', title: 'Chapter 1', content: 'content', summary: '', updatedAt: 1,
      } as any);
      mockPushThenPull({ applied: 1, conflicts: [], serverTimestamp: new Date().toISOString() });

      await engine.syncNow();

      expect('version' in getPushedChapterDelta().payload).toBe(false);
    });

    it('adopts pushed version + 1 locally after a successful push', async () => {
      await startEngine();
      queueChapterDelta();
      vi.mocked(db.chapters.get).mockResolvedValueOnce({
        id: 'ch-1', title: 'Chapter 1', content: 'content', summary: '', updatedAt: 1, version: 3,
      } as any);
      mockPushThenPull({ applied: 1, conflicts: [], serverTimestamp: new Date().toISOString() });

      await engine.syncNow();

      expect(db.chapters.update).toHaveBeenCalledWith('ch-1', { version: 4 });
    });

    it('prefers the response chapterVersions map when present', async () => {
      await startEngine();
      queueChapterDelta();
      vi.mocked(db.chapters.get).mockResolvedValueOnce({
        id: 'ch-1', title: 'Chapter 1', content: 'content', summary: '', updatedAt: 1, version: 3,
      } as any);
      mockPushThenPull({
        applied: 1,
        conflicts: [],
        serverTimestamp: new Date().toISOString(),
        chapterVersions: { 'ch-1': 7 },
      });

      await engine.syncNow();

      expect(db.chapters.update).toHaveBeenCalledWith('ch-1', { version: 7 });
    });

    it('does NOT bump the local version for a conflicted chapter', async () => {
      await startEngine();
      queueChapterDelta();
      vi.mocked(db.chapters.get).mockResolvedValueOnce({
        id: 'ch-1', title: 'Chapter 1', content: 'content', summary: '', updatedAt: 1, version: 3,
      } as any);
      mockPushThenPull({
        applied: 0,
        conflicts: [{
          entityType: 'chapter',
          entityId: 'ch-1',
          localPayload: { id: 'ch-1' },
          serverPayload: { id: 'ch-1', title: '', content: 'server', summary: '', version: 9, updatedAt: new Date().toISOString() },
          serverUpdatedAt: new Date().toISOString(),
          detectedAt: new Date().toISOString(),
        }],
        serverTimestamp: new Date().toISOString(),
      });

      await engine.syncNow();

      expect(db.chapters.update).not.toHaveBeenCalled();
      // The conflict resolution adopts the server's copy INCLUDING its version.
      const conflictPut = vi.mocked(db.chapters.put).mock.calls.find(
        (c) => (c[0] as any).content === 'server',
      );
      expect(conflictPut).toBeDefined();
      expect((conflictPut![0] as any).version).toBe(9);
    });

    it('persists the server version when applying pulled chapters', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({
          data: {
            storyId: 'server-story-1',
            story: null,
            chapters: [
              { id: 'ch-1', title: 'Chapter One', content: 'Once', summary: '', version: 5, updatedAt: new Date().toISOString() },
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

      const putCall = vi.mocked(db.chapters.put).mock.calls[0][0] as any;
      expect(putCall.id).toBe('ch-1');
      expect(putCall.version).toBe(5);
    });
  });

  // ─── Phase 1 data-loss fixes (C1/C2/C3) ───

  function emptyPull() {
    return { storyId: null, story: null, chapters: [], chapterVersions: [], storySnapshots: [], sessions: [], chatMessages: [], writerInsights: [], comments: [], serverTimestamp: new Date().toISOString() };
  }
  function pullResponse(over: Record<string, unknown>) {
    return new Response(JSON.stringify({ data: { ...emptyPull(), ...over } }), { status: 200 });
  }
  function pushResponse(data: Record<string, unknown>) {
    return new Response(JSON.stringify({ data }), { status: 200 });
  }

  describe('story blob optimistic concurrency (C1)', () => {
    async function startEngine() {
      mockFetch.mockResolvedValueOnce(pullResponse({}));
      await engine.start();
    }
    function queueStoryDelta() {
      vi.mocked(readQueue).mockResolvedValue({
        entries: [{ id: 'q1', entityType: 'story', entityId: 'current', op: 'upsert', timestamp: Date.now() }],
        coveredIds: ['q1'],
      });
      vi.mocked(getServerStoryId).mockResolvedValue('server-story-1');
    }
    function pushedStoryDelta() {
      const pushCall = mockFetch.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0] === '/api/sync/push',
      );
      const body = JSON.parse((pushCall![1] as RequestInit).body as string);
      return body.deltas.find((d: any) => d.entityType === 'story');
    }

    it('keeps the captured version when the active project changes during a push', async () => {
      await startEngine();
      queueStoryDelta();
      vi.mocked(getServerStoryId).mockImplementationOnce(async () => { active.id = 'other'; return 'server-story-1'; });
      vi.mocked(getSyncMeta).mockImplementation(async projectId => ({ id: projectId ?? active.id, serverStoryId: 'server-story-1', lastPulledAt: null, lastPushedAt: null, serverStoryVersion: projectId === 'current' ? 4 : 99 }));
      mockFetch.mockResolvedValueOnce(pushResponse({ applied: 1, conflicts: [], serverTimestamp: new Date().toISOString(), storyVersion: 5 }));
      mockFetch.mockResolvedValueOnce(pullResponse({}));
      await engine.syncNow();
      expect(pushedStoryDelta().payload.version).toBe(4);
      expect(updateSyncMeta).toHaveBeenCalledWith({ serverStoryVersion: 5 }, 'current');
    });

    it('stamps the pushed story delta with the base serverStoryVersion', async () => {
      vi.mocked(getSyncMeta).mockResolvedValue({
        id: 'current', serverStoryId: 'server-story-1', lastPulledAt: null, lastPushedAt: null, serverStoryVersion: 4,
      });
      await startEngine();
      queueStoryDelta();
      mockFetch.mockResolvedValueOnce(pushResponse({ applied: 1, conflicts: [], serverTimestamp: new Date().toISOString(), storyVersion: 5 }));
      mockFetch.mockResolvedValueOnce(pullResponse({}));

      await engine.syncNow();

      expect(pushedStoryDelta().payload.version).toBe(4);
    });

    it('adopts the returned storyVersion into sync meta after a successful push', async () => {
      vi.mocked(getSyncMeta).mockResolvedValue({
        id: 'current', serverStoryId: 'server-story-1', lastPulledAt: null, lastPushedAt: null, serverStoryVersion: 4,
      });
      await startEngine();
      queueStoryDelta();
      mockFetch.mockResolvedValueOnce(pushResponse({ applied: 1, conflicts: [], serverTimestamp: new Date().toISOString(), storyVersion: 5 }));
      mockFetch.mockResolvedValueOnce(pullResponse({}));

      await engine.syncNow();

      expect(updateSyncMeta).toHaveBeenCalledWith({ serverStoryVersion: 5 }, expect.anything());
    });

    it('on a story conflict: backs up local blob, adopts server state, tracks server version', async () => {
      await startEngine();
      queueStoryDelta();
      vi.mocked(db.stories.get).mockResolvedValue({
        id: 'current', data: JSON.stringify({ title: 'Local', characters: [{ id: 'c1' }] }), updatedAt: Date.now(),
      } as any);
      const conflict = {
        entityType: 'story',
        entityId: 'server-story-1',
        localPayload: { title: 'Local' },
        serverPayload: { title: 'Server', characters: [{ id: 'c2' }], version: 9 },
        serverUpdatedAt: new Date().toISOString(),
        detectedAt: new Date().toISOString(),
      };
      mockFetch.mockResolvedValueOnce(pushResponse({ applied: 0, conflicts: [conflict], serverTimestamp: new Date().toISOString() }));
      mockFetch.mockResolvedValueOnce(pullResponse({}));
      localStorage.clear();

      await engine.syncNow();

      // Adopted the server state into Dexie.
      const adopt = vi.mocked(db.stories.put).mock.calls.find((c) => (c[0] as any).data?.includes('Server'));
      expect(adopt).toBeDefined();
      // Recovery is visible in Versions, rather than an inaccessible localStorage key.
      const backup = vi.mocked(db.storySnapshots.put).mock.calls.at(-1)?.[0] as any;
      expect(backup).toMatchObject({ storyId: 'current', name: 'Sync conflict backup (local edit)' });
      expect(JSON.parse(backup.data).title).toBe('Local');

      // Tracked the server version so the next push doesn't re-conflict.
      expect(updateSyncMeta).toHaveBeenCalledWith({ serverStoryVersion: 9 }, expect.anything());
    });
  });

  describe('pull dirty guard (C2)', () => {
    it('does NOT overwrite a chapter that has a pending local edit', async () => {
      vi.mocked(readQueue).mockResolvedValue({
        entries: [{ id: 'q1', entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: Date.now() }],
        coveredIds: ['q1'],
      });
      mockFetch.mockResolvedValue(pullResponse({
        storyId: 'server-story-1',
        chapters: [{ id: 'ch-1', title: 'Server', content: 'server', summary: '', updatedAt: new Date().toISOString() }],
      }));

      await engine.start();

      const put = vi.mocked(db.chapters.put).mock.calls.find((c) => (c[0] as any).id === 'ch-1');
      expect(put).toBeUndefined();
    });

    it('DOES apply a chapter that has no pending local edit', async () => {
      vi.mocked(readQueue).mockResolvedValue({ entries: [], coveredIds: [] });
      mockFetch.mockResolvedValue(pullResponse({
        storyId: 'server-story-1',
        chapters: [{ id: 'ch-2', title: 'Server', content: 'server', summary: '', updatedAt: new Date().toISOString() }],
      }));

      await engine.start();

      const put = vi.mocked(db.chapters.put).mock.calls.find((c) => (c[0] as any).id === 'ch-2');
      expect(put).toBeDefined();
    });

    it('applies a pulled comment (A7) and re-stamps the active projectId', async () => {
      vi.mocked(readQueue).mockResolvedValue({ entries: [], coveredIds: [] });
      mockFetch.mockResolvedValue(pullResponse({
        storyId: 'server-story-1',
        comments: [{
          id: 'cm-1', chapterId: 'ch-1', startOffset: 3, endOffset: 8, quote: 'quote',
          prefix: '', suffix: '', text: 'a note', replies: [], resolved: false, orphaned: false,
          createdAt: '2026-08-26T00:00:00Z', updatedAt: '2026-08-26T00:00:00Z',
        }],
      }));

      await engine.start();

      const put = vi.mocked(db.comments.put).mock.calls.find((c) => (c[0] as any).id === 'cm-1');
      expect(put).toBeDefined();
      // Re-stamped with the active project (server scopes by storyId, not projectId).
      expect(typeof (put![0] as any).projectId).toBe('string');
      expect((put![0] as any).projectId.length).toBeGreaterThan(0);
      expect((put![0] as any).text).toBe('a note');
    });

    it('does NOT overwrite a comment that has a pending local edit (A7 dirty guard)', async () => {
      vi.mocked(readQueue).mockResolvedValue({
        entries: [{ id: 'q1', entityType: 'comment', entityId: 'cm-1', op: 'upsert', timestamp: Date.now() }],
        coveredIds: ['q1'],
      });
      mockFetch.mockResolvedValue(pullResponse({
        storyId: 'server-story-1',
        comments: [{ id: 'cm-1', chapterId: 'ch-1', text: 'server version', replies: [], createdAt: '', updatedAt: '' }],
      }));

      await engine.start();

      const put = vi.mocked(db.comments.put).mock.calls.find((c) => (c[0] as any).id === 'cm-1');
      expect(put).toBeUndefined();
    });

    it('does NOT overwrite the story blob when a story edit is pending', async () => {
      vi.mocked(readQueue).mockResolvedValue({
        entries: [{ id: 'q1', entityType: 'story', entityId: 'current', op: 'upsert', timestamp: Date.now() }],
        coveredIds: ['q1'],
      });
      mockFetch.mockResolvedValue(pullResponse({
        storyId: 'server-story-1',
        story: { id: 'server-story-1', title: 'Server', state: { title: 'Server' }, version: 3, updatedAt: new Date().toISOString() },
      }));

      await engine.start();

      expect(db.stories.put).not.toHaveBeenCalled();
    });
  });

  describe('chapter conflict backup (C3)', () => {
    it('snapshots the losing local chapter content before adopting the server copy', async () => {
      mockFetch.mockResolvedValueOnce(pullResponse({}));
      await engine.start();

      vi.mocked(readQueue).mockResolvedValue({
        entries: [{ id: 'q1', entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: Date.now() }],
        coveredIds: ['q1'],
      });
      vi.mocked(getServerStoryId).mockResolvedValue('server-story-1');
      vi.mocked(db.chapters.get).mockResolvedValue({
        id: 'ch-1', title: '', content: 'my local edit', summary: '', updatedAt: 1, version: 2,
      } as any);

      const conflict = {
        entityType: 'chapter',
        entityId: 'ch-1',
        localPayload: { id: 'ch-1', content: 'my local edit' },
        serverPayload: { id: 'ch-1', title: '', content: 'server content', summary: '', version: 9, updatedAt: new Date().toISOString() },
        serverUpdatedAt: new Date().toISOString(),
        detectedAt: new Date().toISOString(),
      };
      mockFetch.mockResolvedValueOnce(pushResponse({ applied: 0, conflicts: [conflict], serverTimestamp: new Date().toISOString() }));
      mockFetch.mockResolvedValueOnce(pullResponse({}));

      await engine.syncNow();

      // A recovery chapterVersion was written carrying the local content.
      const backup = vi.mocked(db.chapterVersions.put).mock.calls.find(
        (c) => (c[0] as any).data?.includes('my local edit'),
      );
      expect(backup).toBeDefined();
      expect((backup![0] as any).data).toContain('Conflict backup');
      // The server copy was still adopted.
      const adopt = vi.mocked(db.chapters.put).mock.calls.find((c) => (c[0] as any).content === 'server content');
      expect(adopt).toBeDefined();
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
      vi.mocked(readQueue).mockResolvedValue({ entries: [], coveredIds: [] });

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
