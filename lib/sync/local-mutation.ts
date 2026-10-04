import type { SyncEntityType } from './types';
import { db } from '@/lib/storage/dexie-db';

export const LOCAL_MUTATION_EVENT = 'zagafy:local-mutation';
/** Call inside the same transaction as the local entity write. Never swallow failures. */
export async function queueLocalMutation(projectId: string, entityType: SyncEntityType, entityId: string, op: 'upsert' | 'delete' = 'upsert'): Promise<void> {
  await db.syncQueue.put({ id: crypto.randomUUID(), projectId, entityType, entityId, op, timestamp: Date.now() });
}
/** Notify only after commit; persisted entries also retry on startup and periodic sync. */
export function notifyLocalMutation(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCAL_MUTATION_EVENT));
}
