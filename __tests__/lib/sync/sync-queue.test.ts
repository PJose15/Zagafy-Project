import { describe, it, expect, beforeEach, vi } from 'vitest';

const syncQueueStore = new Map<string, any>();
const syncMetaStore = new Map<string, any>();

vi.mock('@/lib/storage/dexie-db', () => ({
  db: {
    syncQueue: {
      put: vi.fn(async (entry: any) => { syncQueueStore.set(entry.id, entry); }),
      get: vi.fn(async (id: string) => syncQueueStore.get(id) ?? undefined),
      orderBy: vi.fn(() => ({
        toArray: vi.fn(async () => Array.from(syncQueueStore.values())),
      })),
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
      syncQueueStore.set('q1', { id: 'q1', entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: 100 });
      syncQueueStore.set('q2', { id: 'q2', entityType: 'session', entityId: 's-1', op: 'upsert', timestamp: 200 });

      const result = await readQueue();
      expect(result).toHaveLength(2);
    });

    it('deduplicates by entityType+entityId keeping latest timestamp', async () => {
      syncQueueStore.set('q1', { id: 'q1', entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: 100 });
      syncQueueStore.set('q2', { id: 'q2', entityType: 'chapter', entityId: 'ch-1', op: 'delete', timestamp: 200 });

      const result = await readQueue();
      expect(result).toHaveLength(1);
      expect(result[0].op).toBe('delete');
      expect(result[0].id).toBe('q2');
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
    it('empties the entire queue', async () => {
      syncQueueStore.set('q1', { id: 'q1', entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: 100 });
      syncQueueStore.set('q2', { id: 'q2', entityType: 'session', entityId: 's-1', op: 'upsert', timestamp: 200 });

      await clearQueue();
      expect(syncQueueStore.size).toBe(0);
    });
  });

  // ─── hasPendingDeltas ───

  describe('hasPendingDeltas', () => {
    it('returns true when queue has entries', async () => {
      syncQueueStore.set('q1', { id: 'q1', entityType: 'chapter', entityId: 'ch-1', op: 'upsert', timestamp: 100 });

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
      syncMetaStore.set('sync', {
        id: 'sync',
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
    it('creates initial metadata', async () => {
      await updateSyncMeta({ serverStoryId: 'story-abc' });

      const stored = syncMetaStore.get('sync');
      expect(stored).toBeDefined();
      expect(stored.id).toBe('sync');
      expect(stored.serverStoryId).toBe('story-abc');
      expect(stored.lastPulledAt).toBeNull();
      expect(stored.lastPushedAt).toBeNull();
    });

    it('merges updates with existing metadata', async () => {
      syncMetaStore.set('sync', {
        id: 'sync',
        serverStoryId: 'story-abc',
        lastPulledAt: null,
        lastPushedAt: null,
      });

      await updateSyncMeta({ lastPushedAt: '2026-01-01T00:00:00Z' });

      const stored = syncMetaStore.get('sync');
      expect(stored.serverStoryId).toBe('story-abc');
      expect(stored.lastPushedAt).toBe('2026-01-01T00:00:00Z');
      expect(stored.lastPulledAt).toBeNull();
    });
  });
});
