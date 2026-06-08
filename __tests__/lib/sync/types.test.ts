import { describe, it, expect } from 'vitest';
import type {
  SyncEntityType,
  SyncStatus,
  ConflictRecord,
  SyncQueueEntry,
  SyncDelta,
  SyncMeta,
  PushRequest,
  PushResponse,
  PullResponse,
  SyncEvent,
} from '@/lib/sync/types';

describe('sync types', () => {
  describe('SyncEntityType', () => {
    it('accepts all 7 expected entity type values', () => {
      const entityTypes: SyncEntityType[] = [
        'story',
        'chapter',
        'chapterVersion',
        'storySnapshot',
        'session',
        'chatMessage',
        'writerInsight',
      ];

      expect(entityTypes).toHaveLength(7);
      expect(entityTypes).toContain('story');
      expect(entityTypes).toContain('chapter');
      expect(entityTypes).toContain('chapterVersion');
      expect(entityTypes).toContain('storySnapshot');
      expect(entityTypes).toContain('session');
      expect(entityTypes).toContain('chatMessage');
      expect(entityTypes).toContain('writerInsight');
    });
  });

  describe('SyncStatus', () => {
    it('includes all expected status values', () => {
      const statuses: SyncStatus[] = [
        'disabled',
        'idle',
        'pushing',
        'pulling',
        'offline',
        'error',
        'conflict',
      ];

      expect(statuses).toHaveLength(7);
      expect(statuses).toContain('disabled');
      expect(statuses).toContain('idle');
      expect(statuses).toContain('pushing');
      expect(statuses).toContain('pulling');
      expect(statuses).toContain('offline');
      expect(statuses).toContain('error');
      expect(statuses).toContain('conflict');
    });
  });

  describe('ConflictRecord', () => {
    it('has the expected shape with all required fields', () => {
      const conflict: ConflictRecord = {
        entityType: 'chapter',
        entityId: 'ch-123',
        localPayload: { id: 'ch-123', content: 'local version' },
        serverPayload: { id: 'ch-123', content: 'server version' },
        serverUpdatedAt: '2026-01-01T00:00:00Z',
        detectedAt: '2026-01-01T00:00:01Z',
      };

      expect(conflict.entityType).toBe('chapter');
      expect(conflict.entityId).toBe('ch-123');
      expect(conflict.localPayload).toEqual({ id: 'ch-123', content: 'local version' });
      expect(conflict.serverPayload).toEqual({ id: 'ch-123', content: 'server version' });
      expect(conflict.serverUpdatedAt).toBe('2026-01-01T00:00:00Z');
      expect(conflict.detectedAt).toBe('2026-01-01T00:00:01Z');
    });

    it('allows null payloads for delete operations', () => {
      const conflict: ConflictRecord = {
        entityType: 'chapter',
        entityId: 'ch-456',
        localPayload: null,
        serverPayload: null,
        serverUpdatedAt: '2026-01-01T00:00:00Z',
        detectedAt: '2026-01-01T00:00:01Z',
      };

      expect(conflict.localPayload).toBeNull();
      expect(conflict.serverPayload).toBeNull();
    });
  });

  describe('SyncQueueEntry', () => {
    it('has the expected shape', () => {
      const entry: SyncQueueEntry = {
        id: 'queue-1',
        entityType: 'chapter',
        entityId: 'ch-1',
        op: 'upsert',
        timestamp: 1700000000000,
      };

      expect(entry.id).toBe('queue-1');
      expect(entry.entityType).toBe('chapter');
      expect(entry.entityId).toBe('ch-1');
      expect(entry.op).toBe('upsert');
      expect(entry.timestamp).toBe(1700000000000);
    });
  });

  describe('SyncDelta', () => {
    it('has the expected shape with payload', () => {
      const delta: SyncDelta = {
        entityType: 'chapter',
        entityId: 'ch-1',
        op: 'upsert',
        payload: { id: 'ch-1', title: 'Test', content: 'Hello' },
        timestamp: 1700000000000,
      };

      expect(delta.payload).toBeDefined();
      expect(delta.op).toBe('upsert');
    });

    it('has null payload for delete operations', () => {
      const delta: SyncDelta = {
        entityType: 'chapter',
        entityId: 'ch-1',
        op: 'delete',
        payload: null,
        timestamp: 1700000000000,
      };

      expect(delta.payload).toBeNull();
      expect(delta.op).toBe('delete');
    });
  });

  describe('SyncMeta', () => {
    it('has the expected shape', () => {
      const meta: SyncMeta = {
        id: 'sync',
        serverStoryId: 'story-abc',
        lastPulledAt: '2026-01-01T00:00:00Z',
        lastPushedAt: '2026-01-01T00:00:00Z',
      };

      expect(meta.id).toBe('sync');
      expect(meta.serverStoryId).toBe('story-abc');
    });

    it('allows null values for initial state', () => {
      const meta: SyncMeta = {
        id: 'sync',
        serverStoryId: null,
        lastPulledAt: null,
        lastPushedAt: null,
      };

      expect(meta.serverStoryId).toBeNull();
      expect(meta.lastPulledAt).toBeNull();
      expect(meta.lastPushedAt).toBeNull();
    });
  });

  describe('PullResponse', () => {
    it('has the expected shape with all entity arrays', () => {
      const response: PullResponse = {
        storyId: 'story-1',
        story: { id: 'story-1', title: 'Test', state: {} },
        chapters: [{ id: 'ch-1' }],
        chapterVersions: [],
        storySnapshots: [],
        sessions: [],
        chatMessages: [],
        writerInsights: [],
        serverTimestamp: '2026-01-01T00:00:00Z',
      };

      expect(response.storyId).toBe('story-1');
      expect(response.story).toBeDefined();
      expect(Array.isArray(response.chapters)).toBe(true);
      expect(Array.isArray(response.chapterVersions)).toBe(true);
      expect(Array.isArray(response.storySnapshots)).toBe(true);
      expect(Array.isArray(response.sessions)).toBe(true);
      expect(Array.isArray(response.chatMessages)).toBe(true);
      expect(Array.isArray(response.writerInsights)).toBe(true);
      expect(response.serverTimestamp).toBe('2026-01-01T00:00:00Z');
    });
  });
});
