/**
 * Phase 5.4 -- sync queue management.
 *
 * Records local mutations into the Dexie `syncQueue` table and provides
 * functions to read, deduplicate, and clear queued entries.
 *
 * The queue stores WHAT changed (entity type + ID + operation), not the
 * actual payload. The sync engine reads the current data from Dexie at
 * push time so payloads are always fresh.
 */

import { db } from '@/lib/storage/dexie-db';
import { getActiveProjectId } from '@/lib/projects/active-project';
import type { SyncEntityType, SyncQueueEntry, SyncMeta } from './types';

/**
 * Record a local mutation in the sync queue. Call this after a successful
 * Dexie write so the sync engine knows what to push.
 *
 * Safe to call when sync is disabled -- the queue will simply accumulate
 * entries that are never flushed (and cleared on project reset).
 */
export async function recordDelta(
  entityType: SyncEntityType,
  entityId: string,
  op: 'upsert' | 'delete',
): Promise<void> {
  try {
    await db.syncQueue.put({
      id: crypto.randomUUID(),
      projectId: getActiveProjectId(),
      entityType,
      entityId,
      op,
      timestamp: Date.now(),
    });
  } catch {
    // Sync queue write failures are non-fatal. The data is safe in Dexie;
    // the sync engine will catch up on the next full push.
  }
}

export interface ReadQueueResult {
  /** Latest entry per entityType:entityId — what gets pushed. */
  entries: SyncQueueEntry[];
  /** ALL raw row ids covered by the dedup, including superseded duplicates.
   *  Clear these after a successful push — clearing only the deduped entry ids
   *  leaves older duplicate rows to resurface as "latest" on the next push. */
  coveredIds: string[];
}

/**
 * Read all queued entries, deduplicated by entityType+entityId.
 * For each unique entity, only the latest entry (by timestamp) is kept.
 * If the latest op is 'delete', earlier 'upsert' entries are discarded.
 */
export async function readQueue(
  projectId: string = getActiveProjectId(),
): Promise<ReadQueueResult> {
  // Active-project-only sync: never push another project's queued deltas under
  // the active project's server story.
  const all = await db.syncQueue
    .where('projectId')
    .equals(projectId)
    .sortBy('timestamp');

  // Deduplicate: keep the latest entry per entityType+entityId
  const map = new Map<string, SyncQueueEntry>();
  for (const entry of all) {
    const key = `${entry.entityType}:${entry.entityId}`;
    map.set(key, entry as SyncQueueEntry);
  }

  return {
    entries: Array.from(map.values()),
    coveredIds: all.map(e => e.id),
  };
}

/**
 * Clear specific entries from the sync queue after a successful push.
 * Uses the queue entry IDs (not entity IDs) to avoid race conditions
 * with new writes that arrive during push.
 */
export async function clearEntries(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.syncQueue.bulkDelete(ids);
}

/** Clear the active project's sync queue (used on project reset). */
export async function clearQueue(): Promise<void> {
  await db.syncQueue.where('projectId').equals(getActiveProjectId()).delete();
}

/** Returns true if the active project's sync queue has any pending entries. */
export async function hasPendingDeltas(): Promise<boolean> {
  const count = await db.syncQueue.where('projectId').equals(getActiveProjectId()).count();
  return count > 0;
}

// ─── Sync metadata (one row per project) ───

/** Read the active project's sync metadata. Returns null if not yet initialized. */
export async function getSyncMeta(): Promise<SyncMeta | null> {
  const row = await db.syncMeta.get(getActiveProjectId());
  return (row as SyncMeta | undefined) ?? null;
}

/** Read a project's server story ID, or null if first sync hasn't happened. */
export async function getServerStoryId(
  projectId: string = getActiveProjectId(),
): Promise<string | null> {
  const row = await db.syncMeta.get(projectId);
  return row?.serverStoryId ?? null;
}

/** Initialize or update a project's sync metadata (defaults to the active project). */
export async function updateSyncMeta(
  updates: Partial<Omit<import('./types').SyncMeta, 'id'>>,
  projectId: string = getActiveProjectId(),
): Promise<void> {
  const existing = await db.syncMeta.get(projectId);
  await db.syncMeta.put({
    id: projectId,
    serverStoryId: existing?.serverStoryId ?? null,
    lastPulledAt: existing?.lastPulledAt ?? null,
    lastPushedAt: existing?.lastPushedAt ?? null,
    ...updates,
  });
}
