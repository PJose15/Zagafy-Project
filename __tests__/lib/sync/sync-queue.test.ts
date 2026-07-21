import { describe, it, expect, beforeEach, vi } from 'vitest';

const PROJECT_ID = 'p1';

const syncQueueStore = new Map<string, any>();
const syncMetaStore = new Map<string, any>();

// The active project scopes the queue + sync-meta rows.
vi.mock('@/lib/projects/active-project', () => ({
  getActiveProjectId: () => PROJECT_ID,
}));

// where('projectId').equals(value) → a collection scoped to that project.
function projectCollection(value: string) {
  const matches = () => Array.from(syncQueueStore.values()).filter((e: any) => e.projectId === value);
  return {
    sortBy: vi.fn(async (key: string) => matches().sort((a: any, b: any) => a[key] - b[key])),
    delete: vi.fn(async () => { matches().forEach((e: any) => syncQueueStore.delete(e.id)); }),
    count: vi.fn(async () => matches().length),
    toArray: vi.fn(async () => matches()),
  };
}

vi.mock('@/lib/storage/dexie-db', () => ({
  db: {
    syncQueue: {
      put: vi.fn(async (entry: any) => { syncQueueStore.set(entry.id, entry); }),
      get: vi.fn(async (id: string) => syncQueueStore.get(id) ?? undefined),
      where: vi.fn((_field: string) => ({ equals: (value: string) => projectCollection(value) })),
      bulkDelete: vi.fn(async (ids: string[]) => { ids.forEach(id => syncQueueStore.delete(id)); }),
      clear: vi.fn(async () => { syncQueueStore.clear(); }),
      count: vi.fn(async () => syncQueueStore.size),
    },
    syncMeta: {
      get: vi.fn(async (id: string) => syncMetaStore.get(id) ?? undefined),
      put: vi.fn(async (entry: any) => { syncMetaStore.set(entry.id, entry); }),
      clear: vi.fn(async () => { syncMetaStore.clear(); }),
    },
  },
}));

import {
  recordDelta,
  readQueue,
  clearEntries,
  clearQueue,
  hasPendingDeltas,
  getServerStoryId,
  updateSyncMeta,
} from '@/lib/sync/sync-queue';

describe('sync-queue', () => {
  beforeEach(() => {
    syncQueueStore.clear();
    syncMetaStore.clear();
    vi.clearAllMocks();
  });

  // ─── recordDelta ───

  describe('recordDelta', () => {
    it('records an entry with correct entityType, entityId, op, and timestamp', async () => {
      await recordDelta('chapter', 'ch-1', 'upsert');

      expect(syncQueueStore.size).toBe(1);
      const entry = Array.from(syncQueueStore.values())[0];
      expect(entry.entityType).toBe('chapter');
      expect(entry.entityId).toBe('ch-1');
      expect(entry.op).toBe('upsert');
      expect(typeof entry.timestamp).toBe('number');
      expect(typeof entry.id).toBe('string');
    });

    it('does not throw on failure (catches errors)', async () => {
      // Make put throw
      const { db } = await import('@/lib/storage/dexie-db');
      vi.mocked(db.syncQueue.put).mockRejectedValueOnce(new Error('write failed'));

      // Should not throw
      await expect(recordDelta('story', 's-1', 'upsert')).resolves.toBeUndefined();
    });
  });

  // ─── readQueue ───

  describe('readQueue', () => {
    it('returns all entries', async () => {
      syncQueueStore.set('q1', { id: 'q1', projectId: PROJECT_ID, entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: 100 });
      syncQueueStore.set('q2', { id: 'q2', projectId: PROJECT_ID, entityType: 'session', entityId: 's-1', op: 'upsert', timestamp: 200 });

      const { entries } = await readQueue();
      expect(entries).toHaveLength(2);
    });

    it('deduplicates by entityType+entityId keeping latest timestamp', async () => {
      syncQueueStore.set('q1', { id: 'q1', projectId: PROJECT_ID, entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: 100 });
      syncQueueStore.set('q2', { id: 'q2', projectId: PROJECT_ID, entityType: 'chapter', entityId: 'ch-1', op: 'delete', timestamp: 200 });

      const { entries } = await readQueue();
      expect(entries).toHaveLength(1);
      expect(entries[0].op).toBe('delete');
      expect(entries[0].id).toBe('q2');
    });

    it('returns coveredIds for ALL raw rows including superseded duplicates', async () => {
      syncQueueStore.set('q1', { id: 'q1', projectId: PROJECT_ID, entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: 100 });
      syncQueueStore.set('q2', { id: 'q2', projectId: PROJECT_ID, entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: 200 });
      syncQueueStore.set('q3', { id: 'q3', projectId: PROJECT_ID, entityType: 'session', entityId: 's-1', op: 'upsert', timestamp: 300 });

      const { entries, coveredIds } = await readQueue();
      // Dedup keeps only the latest chapter entry...
      expect(entries).toHaveLength(2);
      // ...but coveredIds must include the superseded q1 so a post-push clear
      // removes it (otherwise it resurfaces as "latest" and re-pushes stale content).
      expect(coveredIds.sort()).toEqual(['q1', 'q2', 'q3']);
    });

    it('clearing coveredIds after a push empties superseded rows too', async () => {
      syncQueueStore.set('q1', { id: 'q1', projectId: PROJECT_ID, entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: 100 });
      syncQueueStore.set('q2', { id: 'q2', projectId: PROJECT_ID, entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: 200 });

      const { coveredIds } = await readQueue();
      await clearEntries(coveredIds);

      expect(syncQueueStore.size).toBe(0);
      const { entries } = await readQueue();
      expect(entries).toHaveLength(0);
    });

    it('excludes entries belonging to other projects', async () => {
      syncQueueStore.set('q1', { id: 'q1', projectId: PROJECT_ID, entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: 100 });
      syncQueueStore.set('q2', { id: 'q2', projectId: 'other', entityType: 'chapter', entityId: 'ch-2', op: 'upsert', timestamp: 200 });

      const { entries, coveredIds } = await readQueue();
      expect(entries).toHaveLength(1);
      expect(entries[0].entityId).toBe('ch-1');
      expect(coveredIds).toEqual(['q1']);
    });

    it('scopes to an explicitly passed projectId', async () => {
      syncQueueStore.set('q1', { id: 'q1', projectId: PROJECT_ID, entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: 100 });
      syncQueueStore.set('q2', { id: 'q2', projectId: 'other', entityType: 'chapter', entityId: 'ch-2', op: 'upsert', timestamp: 200 });

      const { entries } = await readQueue('other');
      expect(entries).toHaveLength(1);
      expect(entries[0].entityId).toBe('ch-2');
    });
  });

  // ─── clearEntries ───

  describe('clearEntries', () => {
    it('removes specific IDs from the queue', async () => {
      syncQueueStore.set('q1', { id: 'q1', entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: 100 });
      syncQueueStore.set('q2', { id: 'q2', entityType: 'session', entityId: 's-1', op: 'upsert', timestamp: 200 });

      await clearEntries(['q1']);
      expect(syncQueueStore.size).toBe(1);
      expect(syncQueueStore.has('q1')).toBe(false);
      expect(syncQueueStore.has('q2')).toBe(true);
    });
  });

  // ─── clearQueue ───

  describe('clearQueue', () => {
    it('empties the active project queue', async () => {
      syncQueueStore.set('q1', { id: 'q1', projectId: PROJECT_ID, entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: 100 });
      syncQueueStore.set('q2', { id: 'q2', projectId: PROJECT_ID, entityType: 'session', entityId: 's-1', op: 'upsert', timestamp: 200 });

      await clearQueue();
      expect(syncQueueStore.size).toBe(0);
    });
  });

  // ─── hasPendingDeltas ───

  describe('hasPendingDeltas', () => {
    it('returns true when queue has entries', async () => {
      syncQueueStore.set('q1', { id: 'q1', projectId: PROJECT_ID, entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: 100 });

      const result = await hasPendingDeltas();
      expect(result).toBe(true);
    });

    it('returns false when queue is empty', async () => {
      const result = await hasPendingDeltas();
      expect(result).toBe(false);
    });
  });

  // ─── getServerStoryId ───

  describe('getServerStoryId', () => {
    it('returns null when no meta exists', async () => {
      const result = await getServerStoryId();
      expect(result).toBeNull();
    });

    it('returns the stored ID', async () => {
      syncMetaStore.set(PROJECT_ID, {
        id: PROJECT_ID,
        serverStoryId: 'server-story-123',
        lastPulledAt: null,
        lastPushedAt: null,
      });

      const result = await getServerStoryId();
      expect(result).toBe('server-story-123');
    });
  });

  // ─── updateSyncMeta ───

  describe('updateSyncMeta', () => {
    it('creates initial metadata keyed by the active project', async () => {
      await updateSyncMeta({ serverStoryId: 'story-abc' });

      const stored = syncMetaStore.get(PROJECT_ID);
      expect(stored).toBeDefined();
      expect(stored.id).toBe(PROJECT_ID);
      expect(stored.serverStoryId).toBe('story-abc');
      expect(stored.lastPulledAt).toBeNull();
      expect(stored.lastPushedAt).toBeNull();
    });

    it('merges updates with existing metadata', async () => {
      syncMetaStore.set(PROJECT_ID, {
        id: PROJECT_ID,
        serverStoryId: 'story-abc',
        lastPulledAt: null,
        lastPushedAt: null,
      });

      await updateSyncMeta({ lastPushedAt: '2026-01-01T00:00:00Z' });

      const stored = syncMetaStore.get(PROJECT_ID);
      expect(stored.serverStoryId).toBe('story-abc');
      expect(stored.lastPushedAt).toBe('2026-01-01T00:00:00Z');
      expect(stored.lastPulledAt).toBeNull();
    });

    it('writes to an explicitly passed projectId (mid-push project switch safety)', async () => {
      await updateSyncMeta({ serverStoryId: 'story-x' }, 'other');

      expect(syncMetaStore.get('other')?.serverStoryId).toBe('story-x');
      expect(syncMetaStore.get(PROJECT_ID)).toBeUndefined();
    });
  });
});
