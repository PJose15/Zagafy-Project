import { db, type DexieStorySnapshot } from '@/lib/storage/dexie-db';
import type { StoryState } from '@/lib/store';
import { getPlainText } from '@/lib/editor/serialization';

/**
 * Phase 4.7 / MP-03 — manuscript-wide story snapshots.
 *
 * A snapshot is a frozen copy of the entire StoryState at a point in time
 * (chapters with content, world bible, characters, conflicts, etc.).
 * Writers can name snapshots, browse them, and restore one atomically.
 *
 * Tier-aware caps land in Phase 5 with billing — for now we cap at the
 * Writer-tier value of 30 and prune the oldest entries first.
 */

export const DEFAULT_SNAPSHOT_CAP = 30;
export const DEFAULT_STORY_ID = 'current';

export interface StorySnapshot {
  id: string;
  storyId: string;
  name: string;
  description: string;
  createdAt: number;
  wordCount: number;
  chapterCount: number;
  payload: StoryState;
}

export interface SnapshotMetadata {
  id: string;
  storyId: string;
  name: string;
  description: string;
  createdAt: number;
  wordCount: number;
  chapterCount: number;
}

function rowToMetadata(row: DexieStorySnapshot): SnapshotMetadata {
  return {
    id: row.id,
    storyId: row.storyId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    wordCount: row.wordCount,
    chapterCount: row.chapterCount,
  };
}

function rowToFull(row: DexieStorySnapshot): StorySnapshot | null {
  try {
    const payload = JSON.parse(row.data) as StoryState;
    return { ...rowToMetadata(row), payload };
  } catch {
    return null;
  }
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function totalWordCount(state: StoryState): number {
  return state.chapters.reduce((sum, c) => sum + countWords(getPlainText(c.content)), 0);
}

function chapterCount(state: StoryState): number {
  return state.chapters.filter(c => c.canonStatus !== 'discarded').length;
}

/**
 * Persist a new snapshot for the given story. Trims to `cap` entries by
 * pruning the oldest snapshots. Returns the persisted metadata.
 */
export async function createSnapshot(
  state: StoryState,
  options: {
    name: string;
    description?: string;
    storyId?: string;
    cap?: number;
  },
): Promise<SnapshotMetadata> {
  const storyId = options.storyId ?? DEFAULT_STORY_ID;
  const cap = options.cap ?? DEFAULT_SNAPSHOT_CAP;
  const trimmedName = options.name.trim() || `Snapshot ${new Date().toLocaleString()}`;
  const row: DexieStorySnapshot = {
    id: crypto.randomUUID(),
    storyId,
    name: trimmedName,
    description: (options.description ?? '').trim(),
    createdAt: Date.now(),
    wordCount: totalWordCount(state),
    chapterCount: chapterCount(state),
    data: JSON.stringify(state),
  };

  await db.transaction('rw', db.storySnapshots, async () => {
    await db.storySnapshots.put(row);
    const all = await db.storySnapshots
      .where('storyId')
      .equals(storyId)
      .sortBy('createdAt');
    if (all.length > cap) {
      const excess = all.length - cap;
      const oldestIds = all.slice(0, excess).map(r => r.id);
      await db.storySnapshots.bulkDelete(oldestIds);
    }
  });

  return rowToMetadata(row);
}

/** Newest-first list of snapshot metadata for the given story. */
export async function listSnapshots(
  storyId: string = DEFAULT_STORY_ID,
): Promise<SnapshotMetadata[]> {
  const rows = await db.storySnapshots.where('storyId').equals(storyId).toArray();
  return rows
    .map(rowToMetadata)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Retrieve a full snapshot (including payload) by ID, or null if not found. */
export async function getSnapshot(id: string): Promise<StorySnapshot | null> {
  const row = await db.storySnapshots.get(id);
  if (!row) return null;
  return rowToFull(row);
}

/** Delete a snapshot by ID from the local database. */
export async function deleteSnapshot(id: string): Promise<void> {
  await db.storySnapshots.delete(id);
}

export interface SnapshotDelta {
  chapterDelta: number;
  wordDelta: number;
  characterDelta: number;
  worldBibleDelta: number;
}

/** Compute the difference in chapters, words, characters, and world bible entries between a snapshot and the current state. */
export function computeDelta(
  snapshot: SnapshotMetadata & { payload?: StoryState },
  current: StoryState,
): SnapshotDelta {
  const currentChapters = current.chapters.filter(c => c.canonStatus !== 'discarded').length;
  const currentWords = totalWordCount(current);
  return {
    chapterDelta: currentChapters - snapshot.chapterCount,
    wordDelta: currentWords - snapshot.wordCount,
    characterDelta: snapshot.payload
      ? current.characters.length - snapshot.payload.characters.length
      : 0,
    worldBibleDelta: snapshot.payload
      ? current.world_bible.length - snapshot.payload.world_bible.length
      : 0,
  };
}
