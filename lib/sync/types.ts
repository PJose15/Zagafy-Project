/**
 * Phase 5.4 -- sync engine type definitions.
 *
 * These types are shared between client (sync-engine, sync-queue) and server
 * (push/pull API routes). Keep this module free of DOM and Node imports.
 */

/** Entity types that participate in cloud sync. */
export type SyncEntityType =
  | 'story'
  | 'chapter'
  | 'chapterVersion'
  | 'storySnapshot'
  | 'session'
  | 'chatMessage'
  | 'writerInsight';

/** A recorded local mutation waiting to be pushed to the server. */
export interface SyncQueueEntry {
  /** Auto-generated queue ID (not the entity ID). */
  id: string;
  entityType: SyncEntityType;
  /** The entity's primary key. */
  entityId: string;
  op: 'upsert' | 'delete';
  /** Client-side timestamp when the mutation occurred. */
  timestamp: number;
}

/** A delta sent to the server during push. */
export interface SyncDelta {
  entityType: SyncEntityType;
  entityId: string;
  op: 'upsert' | 'delete';
  /** Entity payload resolved at push time. Null for deletes. */
  payload: Record<string, unknown> | null;
  /** Client timestamp of the mutation. */
  timestamp: number;
}

/** Persistent sync metadata stored in Dexie. */
export interface SyncMeta {
  /** Always 'sync' -- single-row table. */
  id: string;
  /** Server-side story UUID. Created on first sync. */
  serverStoryId: string | null;
  /** ISO timestamp of the last successful pull. */
  lastPulledAt: string | null;
  /** ISO timestamp of the last successful push. */
  lastPushedAt: string | null;
}

/** A conflict detected during push (server version wins). */
export interface ConflictRecord {
  entityType: SyncEntityType;
  entityId: string;
  localPayload: Record<string, unknown> | null;
  serverPayload: Record<string, unknown> | null;
  serverUpdatedAt: string;
  detectedAt: string;
}

/** Sync engine status for UI display. */
export type SyncStatus =
  | 'disabled'
  | 'idle'
  | 'pushing'
  | 'pulling'
  | 'offline'
  | 'error'
  | 'conflict';

/** Shape of the POST /api/sync/push request body. */
export interface PushRequest {
  storyId: string;
  storyTitle: string;
  deltas: SyncDelta[];
}

/** Shape returned by POST /api/sync/push. */
export interface PushResponse {
  applied: number;
  conflicts: ConflictRecord[];
  serverTimestamp: string;
}

/** Sync engine events emitted to subscribers. */
export type SyncEvent =
  | { type: 'status-change'; status: SyncStatus }
  | { type: 'push-complete'; applied: number; conflicts: ConflictRecord[] }
  | { type: 'pull-complete'; counts: Record<string, number> }
  | { type: 'error'; message: string };

/** Shape returned by GET /api/sync/pull. */
export interface PullResponse {
  storyId: string | null;
  story: Record<string, unknown> | null;
  chapters: Record<string, unknown>[];
  chapterVersions: Record<string, unknown>[];
  storySnapshots: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  chatMessages: Record<string, unknown>[];
  writerInsights: Record<string, unknown>[];
  serverTimestamp: string;
}
