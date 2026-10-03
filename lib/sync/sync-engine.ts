/**
 * Phase 5.4 -- client-side sync engine.
 *
 * Orchestrates the push/pull cycle between Dexie (local) and Neon (server).
 * Offline-first: all writes go to Dexie immediately; the sync engine pushes
 * deltas in the background and pulls server changes on load + periodically.
 *
 * This module is client-only ('use client' implied by its consumers).
 */

import { capturePendingRecovery, preservePendingRecovery } from '@/lib/storage/pending-recovery';
import { db as dexieDb } from '@/lib/storage/dexie-db';
import { getActiveProjectId } from '@/lib/projects/active-project';
import { wordCount } from '@/lib/editor/serialization';
import { prepareInitialUpload } from './initial-upload';
import { LOCAL_MUTATION_EVENT } from './local-mutation';
import { flushCloudDeletes } from './cloud-delete-outbox';
import { applyDeletionReceipts, deletionTables } from './cloud-deletions';
import { applyCloudData } from './apply-cloud-data';
import type {
  SyncDelta,
  SyncStatus,
  SyncEvent,
  PullResponse,
  PushResponse,
  ConflictRecord,
  SyncEntityType,
} from './types';
import {
  readQueue,
  clearEntries,
  updateSyncMeta,
  getServerStoryId,
  getSyncMeta,
} from './sync-queue';

export interface SyncEngineConfig {
  /** Debounce delay after a local write before pushing (ms). Default: 5000 */
  pushDebounceMs?: number;
  /** Periodic pull interval (ms). Default: 60000 */
  pullIntervalMs?: number;
}

export type SyncEventListener = (event: SyncEvent) => void;

export class SyncEngine {
  private status: SyncStatus = 'disabled';
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pullInterval: ReturnType<typeof setInterval> | null = null;
  private pushing = false;
  private pulling = false;
  private listeners: Set<SyncEventListener> = new Set();
  private readonly pushDebounceMs: number;
  private readonly pullIntervalMs: number;
  private destroyed = false;

  constructor(config: SyncEngineConfig = {}) {
    this.pushDebounceMs = config.pushDebounceMs ?? 5000;
    this.pullIntervalMs = config.pullIntervalMs ?? 60_000;
  }

  // ─── Lifecycle ───

  /**
   * Start the sync engine. Call once after confirming auth is enabled and
   * the database is configured. Performs an initial pull, then sets up
   * periodic pull and listens for push triggers.
   */
  async start(): Promise<void> {
    if (this.destroyed) return;
    this.setStatus('pulling');

    try {
      await this.syncNow();
      if (this.destroyed) return;
    } catch {
      if (this.isOffline()) {
        this.setStatus('offline');
      } else {
        this.setStatus('error');
      }
    }

    // Periodic pull
    this.pullInterval = setInterval(() => {
      if (!this.pushing && !this.pulling) {
        this.syncNow().catch(() => { /* logged internally */ });
      }
    }, this.pullIntervalMs);

    // Push on beforeunload (best-effort)
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleBeforeUnload);
      window.addEventListener(LOCAL_MUTATION_EVENT, this.handleLocalMutation);
    }
  }

  /** Stop the sync engine and clean up timers. */
  destroy(): void {
    this.destroyed = true;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.pullInterval) clearInterval(this.pullInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleBeforeUnload);
      window.removeEventListener(LOCAL_MUTATION_EVENT, this.handleLocalMutation);
    }
    this.listeners.clear();
  }

  /** Subscribe to sync events. Returns an unsubscribe function. */
  subscribe(listener: SyncEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  private handleLocalMutation = () => this.notifyWrite();

  // ─── Trigger ───

  /**
   * Notify the engine that a local write occurred. Debounces and
   * schedules a push after `pushDebounceMs`.
   */
  notifyWrite(): void {
    if (this.destroyed || this.status === 'disabled') return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.push().catch(() => { /* logged internally */ });
    }, this.pushDebounceMs);
  }

  /** Force an immediate push + pull cycle. */
  async syncNow(): Promise<void> {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    await this.push();
    if (this.status !== 'error') await this.pull();
  }

  // ─── Push ───

  private async push(): Promise<void> {
    if (this.pushing || this.destroyed) return;
    this.pushing = true;
    this.setStatus('pushing');

    try {
      // Bind the entire push cycle to one project: resolvePayload/getStoryTitle
      // re-reading the active project mid-push would push the wrong story after
      // a project switch.
      await flushCloudDeletes();
      if (this.destroyed) return;
      const projectId = getActiveProjectId();
      const deletionMeta = await getSyncMeta(projectId);
      if (deletionMeta?.serverDeletedAt) throw new Error('Cloud project was deleted. Your local copy and recovery snapshot are retained; export or copy it before syncing again.');
      let pending = await readQueue(projectId);
      if (pending.entries.length === 0) {
        this.setStatus('idle');
        return;
      }
      // An existing manuscript must accompany a first history/session upload.
      // Seed all scoped rows and the binding in one transaction, then re-read
      // the queue so even a failed network request retains the complete upload.
      let serverStoryId = await getServerStoryId(projectId);
      if (!serverStoryId) {
        serverStoryId = await prepareInitialUpload(projectId);
        pending = await readQueue(projectId);
      }
      // Send story metadata and chapter parents before history in bounded batches.
      const priority = (type: string) => type === 'story' ? 0 : type === 'chapter' ? 1 : 2;
      const queue = [...pending.entries].sort((a, b) => priority(a.entityType) - priority(b.entityType)).slice(0, 500);
      if (pending.entries.length > 500 && !pending.coveredIdsByEntity) {
        throw new Error('Cannot safely batch sync queue');
      }
      const coveredIds = pending.entries.length <= 500 ? pending.coveredIds :
        queue.flatMap(entry => pending.coveredIdsByEntity![`${entry.entityType}:${entry.entityId}`] ?? []);

      // Base version for the story blob's optimistic-concurrency check. The
      // server compares this against its stored version and rejects a stale
      // overwrite as a conflict instead of clobbering bible edits made elsewhere.
      const bindMeta = await getSyncMeta(projectId);
      const baseStoryVersion = bindMeta?.serverStoryVersion ?? 0;

      // Resolve payloads from Dexie for each queued entry
      const deltas: SyncDelta[] = [];
      for (const entry of queue) {
        const payload = entry.op === 'delete'
          ? null
          : await resolvePayload(entry.entityType as SyncEntityType, entry.entityId, projectId);

        // Skip upserts where the entity no longer exists locally
        if (entry.op === 'upsert' && !payload) continue;

        // Stamp the story delta with the base version the server will check.
        if (entry.entityType === 'story' && payload) {
          payload.version = baseStoryVersion;
        }

        deltas.push({
          entityType: entry.entityType as SyncEntityType,
          entityId: entry.entityId,
          op: entry.op,
          payload,
          timestamp: entry.timestamp,
        });
      }

      if (deltas.length === 0) {
        await clearEntries(coveredIds);
        this.setStatus('idle');
        this.pushing = false;
        return;
      }

      // Get story title for server-side story record
      const storyTitle = await getStoryTitle(projectId);

      if (this.destroyed) return;
      const res = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: serverStoryId,
          storyTitle,
          deltas,
        }),
      });

      if (!res.ok) {
        if (res.status === 410) {
          const receiptResponse = await fetch(`/api/sync/pull?storyId=${encodeURIComponent(serverStoryId)}`);
          if (!receiptResponse.ok) throw new Error('Unable to verify cloud project deletion; local changes retained');
          const receipt = (await receiptResponse.json()).data as PullResponse;
          if (!receipt.storyDeletedAt || this.destroyed) throw new Error('Cloud project deletion is not confirmed');
          await this.applyPulledData(receipt, projectId);
          this.setStatus('error');
          this.emit({ type: 'error', message: 'Cloud project was deleted. Your local writing and recovery snapshot are retained.' });
          return;
        }
        if (res.status === 401) {
          this.setStatus('error');
          this.emit({ type: 'error', message: 'Authentication expired' });
          this.pushing = false;
          return;
        }
        throw new Error(`Push failed: ${res.status}`);
      }

      const data = await res.json() as { data: PushResponse };
      const result = data.data;
      if (this.destroyed) return;

      // A legacy/partial server acknowledgement must never erase mutations it
      // did not apply. Keep the whole queue if the response cannot account for
      // every sent delta; the transactional server accounts for all of them.
      if (!Number.isSafeInteger(result.applied) || result.applied < 0 ||
          !Array.isArray(result.conflicts) || result.applied + result.conflicts.length !== deltas.length) {
        throw new Error('Incomplete sync acknowledgement; local changes retained');
      }

      // Clear ALL raw queue rows covered by the dedup — clearing only the
      // deduped "latest" ids would leave superseded duplicates to resurface
      // as latest on the next push and re-push stale content.
      await updateSyncMeta({ lastPushedAt: result.serverTimestamp }, projectId);

      // Adopt the server's post-push chapter versions so the next push
      // round-trips them instead of re-sending a stale version forever.
      await this.adoptPushedChapterVersions(deltas, result);

      // Adopt the story blob's new server version so the next story push is
      // based on it and doesn't false-conflict.
      if (typeof result.storyVersion === 'number') {
        await updateSyncMeta({ serverStoryVersion: result.storyVersion }, projectId);
      }

      if (result.conflicts.length > 0) {
        this.setStatus('conflict');
        this.emit({ type: 'push-complete', applied: result.applied, conflicts: result.conflicts });
        // Apply server versions for conflicted chapters
        await this.applyConflictResolutions(result.conflicts, projectId);
        // The overwrite must reach this tab's in-memory store too.
        if (getActiveProjectId() === projectId) this.broadcastStateUpdated();
      } else {
        this.setStatus('idle');
        this.emit({ type: 'push-complete', applied: result.applied, conflicts: [] });
      }
      // Recovery backups and local version adoption must finish before any
      // acknowledgement removes the durable queue rows.
      await clearEntries(coveredIds);
      if (pending.entries.length > queue.length) this.notifyWrite();
    } catch (e) {
      if (this.isOffline()) {
        this.setStatus('offline');
      } else {
        this.setStatus('error');
        this.emit({ type: 'error', message: String(e) });
      }
    } finally {
      this.pushing = false;
    }
  }

  // ─── Pull ───

  private async pull(): Promise<void> {
    if (this.pulling || this.destroyed) return;
    this.pulling = true;
    const prevStatus = this.status;
    this.setStatus('pulling');

    try {
      // Read this project's sync metadata (keyed per project — see the Dexie v8
      // migration). `getSyncMeta()` resolves both the server binding and the
      // last-pulled watermark from the correct row.
      const projectId = getActiveProjectId();
      const meta = await getSyncMeta(projectId);
      const serverStoryId = meta?.serverStoryId ?? null;

      // Multi-project safety: only pull for a project that is bound to a server
      // story. An UNBOUND project must not pull, because the server falls back
      // to "the user's most recent story" when no storyId is given — adopting
      // that would silently overwrite the active project's blob + chapters with
      // an unrelated story. The binding (serverStoryId) is created on the first
      // push; until then there is nothing on the server for this project to pull.
      if (!serverStoryId) {
        this.setStatus(prevStatus === 'conflict' ? 'conflict' : 'idle');
        return;
      }

      // Honor the incremental watermark so periodic pulls only fetch changes
      // since the last successful pull (not the entire dataset every cycle).
      const since = meta?.lastPulledAt ?? null;

      const params = new URLSearchParams();
      if (since) params.set('since', since);
      params.set('storyId', serverStoryId);

      if (this.destroyed) return;
      const res = await fetch(`/api/sync/pull?${params.toString()}`);

      if (!res.ok) {
        if (res.status === 401) {
          this.setStatus('error');
          this.emit({ type: 'error', message: 'Authentication expired' });
          return;
        }
        throw new Error(`Pull failed: ${res.status}`);
      }

      const data = await res.json() as { data: PullResponse };
      const result = data.data;

      // Apply pulled data to Dexie (scoped to the active/bound project).
      if (this.destroyed) return;
      const counts = await this.applyPulledData(result, projectId);


      // The pull only wrote to Dexie; the current tab's in-memory store would
      // clobber it with stale state on the next edit unless it re-hydrates.
      if (getActiveProjectId() === projectId && Object.values(counts).some(n => n > 0)) {
        this.broadcastStateUpdated();
      }

      this.setStatus(result.storyDeletedAt ? 'error' : prevStatus === 'conflict' ? 'conflict' : 'idle');
      if (result.storyDeletedAt) this.emit({ type: 'error', message: 'Cloud project was deleted. Your local writing and recovery snapshot are retained.' });
      this.emit({ type: 'pull-complete', counts });
    } catch (e) {
      if (this.isOffline()) {
        this.setStatus('offline');
      } else {
        this.setStatus(prevStatus);
        this.emit({ type: 'error', message: String(e) });
      }
    } finally {
      this.pulling = false;
    }
  }

  // ─── Apply pulled data to Dexie ───

  private async applyPulledData(data: PullResponse, projectId: string): Promise<Record<string, number>> {
    return applyCloudData(data, projectId);
  }

  // ─── Conflict resolution ───

  /**
   * When the server rejects a chapter push due to version conflict,
   * apply the server's version locally (server-authoritative).
   */
  private async applyConflictResolutions(conflicts: ConflictRecord[], projectId: string): Promise<void> {
    // Chapters are stored per project; without projectId the row is dropped from
    // getAllChapterContents(projectId) and its content silently vanishes from the
    // active project. Scope the overwrite to the active project like applyPulledData.
    for (const c of conflicts) {
      if (c.entityType !== 'story' && c.serverPayload === null) {
        const recovery = capturePendingRecovery(projectId);
        await dexieDb.transaction('rw', deletionTables(), async () => {
          await preservePendingRecovery(projectId, recovery);
          await applyDeletionReceipts([{ entityType: c.entityType as Exclude<SyncEntityType, 'story'>, entityId: c.entityId, deletedAt: c.serverUpdatedAt }], projectId);
        });
        recovery.forEach(capture => capture.committed());
      } else if (c.entityType === 'chapter' && c.serverPayload) {
        const sp = c.serverPayload;
        // C3: preserve the losing local edit before adopting the server copy so a
        // reconnect conflict never silently discards offline work. The current
        // local content is snapshotted into chapterVersions, recoverable from the
        // manuscript versions UI.
        await this.backupLosingChapterEdit(sp.id as string, (sp.content as string) ?? '', projectId);
        await dexieDb.chapters.put({
          id: sp.id as string,
          projectId,
          title: (sp.title as string) ?? '',
          content: (sp.content as string) ?? '',
          summary: (sp.summary as string) ?? '',
          canonStatus: sp.canonStatus as string | undefined,
          source: sp.source as string | undefined,
          updatedAt: sp.updatedAt
            ? new Date(sp.updatedAt as string).getTime()
            : Date.now(),
          // Adopting the server's version alongside its content is what breaks
          // the conflict loop — the next push sends a version the server accepts.
          version: typeof sp.version === 'number' ? sp.version : undefined,
        });
      } else if (c.entityType === 'story' && c.serverPayload) {
        await this.resolveStoryConflict(c, projectId);
      }
    }
  }

  /**
   * C3 — snapshot the current local chapter content as a recovery version before
   * a conflict overwrites it with the server's copy. Recovery must succeed
   * before conflict resolution can replace local writing. No-op when local content matches the server
   * or the chapter isn't present locally.
   */
  private async backupLosingChapterEdit(
    chapterId: string,
    serverContent: string,
    projectId: string,
  ): Promise<void> {
    {
      const local = await dexieDb.chapters.get(chapterId);
      if (!local || !local.content || local.content === serverContent) return;
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      // Shape matches ChapterVersion so it renders in the versions UI.
      const recovery = {
        id,
        chapterId,
        label: 'Conflict backup (local edit)',
        content: local.content,
        createdAt,
        isCanonical: false,
        source: 'auto-snapshot',
        wordCount: wordCount(local.content),
      };
      await dexieDb.chapterVersions.put({
        id,
        projectId,
        chapterId,
        createdAt,
        data: JSON.stringify(recovery),
      });
    }
  }

  /**
   * C1 — resolve a story-blob conflict without destroying local data. The server
   * rejected our push because its blob advanced past our base version. Preserve
   * the losing local story and manuscript in the Versions page, then
   * adopt the server state and track its version so the next push is based on it.
   */
  private async resolveStoryConflict(c: ConflictRecord, projectId: string): Promise<void> {
    const sp = (c.serverPayload ?? {}) as Record<string, unknown>;
    const { version: serverVersion, ...serverState } = sp;

    // Persist a user-visible recovery snapshot before replacing the story.
    // If storage is full, stop and retain both the local manuscript and queue.
    const existingStory = await dexieDb.stories.get(projectId);
    if (existingStory?.data) {
      const localState = JSON.parse(existingStory.data) as Record<string, unknown>;
      const chapters = Array.isArray(localState.chapters) ? localState.chapters as Record<string, unknown>[] : [];
      const recoveredChapters = [];
      for (const chapter of chapters) {
        const row = await dexieDb.chapters.get(chapter.id as string);
        recoveredChapters.push({ ...chapter, content: row?.content ?? chapter.content ?? '' });
      }
      const payload = { ...localState, chapters: recoveredChapters };
      const id = crypto.randomUUID();
      await dexieDb.storySnapshots.put({
        id, storyId: projectId, name: 'Sync conflict backup (local edit)',
        description: 'Local story and manuscript preserved before adopting the cloud version.',
        createdAt: Date.now(), chapterCount: recoveredChapters.length,
        wordCount: recoveredChapters.reduce((sum, chapter) => sum + wordCount(chapter.content as string), 0),
        data: JSON.stringify(payload),
      });
    }
    const stateChapters = serverState.chapters as unknown[] | undefined;
    await dexieDb.stories.put({
      id: projectId, data: JSON.stringify(serverState),
      title: typeof serverState.title === 'string' ? serverState.title : existingStory?.title ?? 'Untitled Project',
      chapterCount: Array.isArray(stateChapters) ? stateChapters.length : existingStory?.chapterCount ?? 0,
      wordCount: existingStory?.wordCount ?? 0, status: existingStory?.status ?? 'draft',
      createdAt: existingStory?.createdAt ?? Date.now(), updatedAt: Date.now(),
    });

    // 3. Track the server version so the next push doesn't immediately re-conflict.
    if (typeof serverVersion === 'number') {
      await updateSyncMeta({ serverStoryVersion: serverVersion }, projectId);
    }
  }

  /**
   * Persist each successfully pushed chapter's new server version so the next
   * push round-trips it. On success the server increments to clientVersion+1;
   * an explicit map in the response wins when present. A payload pushed WITHOUT
   * a version lands at server version 1 for a new row; a legacy local row whose
   * server counterpart is ahead conflicts instead and self-heals through
   * applyConflictResolutions.
   */
  private async adoptPushedChapterVersions(
    deltas: SyncDelta[],
    result: PushResponse,
  ): Promise<void> {
    const conflicted = new Set(
      result.conflicts.filter(c => c.entityType === 'chapter').map(c => c.entityId),
    );
    for (const delta of deltas) {
      if (delta.entityType !== 'chapter' || delta.op !== 'upsert') continue;
      if (conflicted.has(delta.entityId)) continue;
      const pushed = typeof delta.payload?.version === 'number' ? delta.payload.version : null;
      const version = result.chapterVersions?.[delta.entityId] ?? (pushed !== null ? pushed + 1 : 1);
      try {
        await dexieDb.chapters.update(delta.entityId, { version });
      } catch {
        // Non-fatal — worst case the next push conflicts once and self-heals
      }
    }
  }

  // ─── Helpers ───

  private setStatus(status: SyncStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.emit({ type: 'status-change', status });
    }
  }

  private emit(event: SyncEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* listener errors are non-fatal */ }
    }
  }

  private isOffline(): boolean {
    return typeof navigator !== 'undefined' && !navigator.onLine;
  }

  /**
   * Post the store's cross-tab message so StoryProvider re-hydrates from Dexie.
   * BroadcastChannel delivers to every other channel instance with the same
   * name — including the store's instance in THIS tab — so a fresh channel here
   * reaches the local store without tripping its echo guard (which is keyed on
   * the applied state snapshot, not a sender id). Shape must match lib/store.tsx.
   */
  private broadcastStateUpdated(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      const channel = new BroadcastChannel('zagafy_sync');
      channel.postMessage({ type: 'state-updated', at: Date.now() });
      channel.close();
    } catch {
      // BroadcastChannel post failures are non-fatal
    }
  }

  private handleBeforeUnload = (): void => {
    // Best-effort flush using sendBeacon isn't practical for large payloads.
    // The sync queue persists in Dexie and will be flushed on next load.
  };
}

// ─── Payload resolvers ───

/**
 * Read the current entity data from Dexie for inclusion in a push delta.
 * Returns null if the entity doesn't exist (deleted between queue and push).
 */
async function resolvePayload(
  entityType: SyncEntityType,
  entityId: string,
  projectId: string,
): Promise<Record<string, unknown> | null> {
  switch (entityType) {
    case 'story': {
      const row = await dexieDb.stories.get(projectId);
      if (!row) return null;
      try {
        return JSON.parse(row.data) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    case 'chapter': {
      const row = await dexieDb.chapters.get(entityId);
      if (!row) return null;
      return {
        id: row.id,
        title: row.title,
        content: row.content,
        summary: row.summary,
        canonStatus: row.canonStatus,
        source: row.source,
        updatedAt: row.updatedAt,
        // Optimistic-concurrency version. Omitted (undefined → stripped by
        // JSON.stringify) on legacy rows — the server treats missing as 1.
        version: row.version,
      };
    }
    case 'chapterVersion': {
      const row = await dexieDb.chapterVersions.get(entityId);
      if (!row) return null;
      try {
        return { ...JSON.parse(row.data), id: row.id, chapterId: row.chapterId, createdAt: row.createdAt };
      } catch {
        return { id: row.id, chapterId: row.chapterId, createdAt: row.createdAt, data: row.data };
      }
    }
    case 'storySnapshot': {
      const row = await dexieDb.storySnapshots.get(entityId);
      if (!row) return null;
      return {
        id: row.id,
        storyId: row.storyId,
        name: row.name,
        description: row.description,
        createdAt: row.createdAt,
        wordCount: row.wordCount,
        chapterCount: row.chapterCount,
        data: row.data,
      };
    }
    case 'session': {
      const row = await dexieDb.sessions.get(entityId);
      if (!row) return null;
      try {
        return JSON.parse(row.data) as Record<string, unknown>;
      } catch {
        return { id: row.id, startedAt: row.startedAt, endedAt: row.endedAt };
      }
    }
    case 'chatMessage': {
      const row = await dexieDb.chatMessages.get(entityId);
      if (!row) return null;
      return {
        id: row.id,
        role: row.role,
        content: row.content,
        timestamp: row.timestamp,
        chapterId: row.chapterId,
      };
    }
    case 'writerInsight': {
      const row = await dexieDb.writerInsights.get(entityId);
      if (!row) return null;
      return {
        id: row.id,
        category: row.category,
        observation: row.observation,
        evidenceCount: row.evidenceCount,
        lastObservedAt: row.lastObservedAt,
        confidence: Math.round(Math.min(1, Math.max(0, row.confidence > 1 ? row.confidence / 100 : row.confidence)) * 100),
        pinned: row.pinned,
      };
    }
    case 'comment': {
      // The whole ManuscriptComment is the payload (offsets, quote, replies…).
      const row = await dexieDb.comments.get(entityId);
      if (!row) return null;
      return row as unknown as Record<string, unknown>;
    }
    default:
      return null;
  }
}

/** Read the story title from Dexie for the push request. */
async function getStoryTitle(projectId: string): Promise<string> {
  try {
    const row = await dexieDb.stories.get(projectId);
    if (!row) return 'Untitled';
    const state = JSON.parse(row.data);
    return (state?.title as string) || 'Untitled';
  } catch {
    return 'Untitled';
  }
}
