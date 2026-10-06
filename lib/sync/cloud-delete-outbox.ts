import { db } from '@/lib/storage/dexie-db';
import { getWorkspaceOwner } from './workspace-owner';
/** Called only by the authenticated workspace's engine. Failed deletes remain
 * durable even after local project data and its sync binding have been removed. */
export async function flushCloudDeletes(): Promise<void> {
  const accountId = getWorkspaceOwner();
  if (!accountId) return;
  const rows = await db.cloudDeleteQueue.where('accountId').equals(accountId).toArray();
  for (const row of rows) {
    const response = await fetch('/api/stories', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId: row.id }), signal: AbortSignal.timeout(15_000) });
    const result = await response.json();
    if (response.status === 403 && result.details?.accountId === accountId) {
      // A shared project's local copy was removed; only its owner may remove the cloud copy.
      await db.cloudDeleteQueue.delete(row.id);
      continue;
    }
    if (!response.ok) throw new Error(`Cloud deletion pending: ${response.status}`);
    if (result.data?.accountId !== accountId || (result.data?.deleted !== true && result.data?.localOnly !== true)) throw new Error('Cloud deletion is not confirmed; retry retained');
    await db.cloudDeleteQueue.delete(row.id);
  }
}
