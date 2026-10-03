import { db } from './dexie-db';
import { wordCount } from '@/lib/editor/serialization';
import type { StoryState } from '@/lib/store';

type Capture = { state: StoryState; committed: () => void };
type Source = { projectId: string; priority: number; capture: () => Capture | null };
const sources = new Set<Source>();
/** Providers capture immutable snapshots; editors run last to overlay their
 * newer text. Captures are discarded only after recovery commits successfully. */
export function registerPendingRecovery(source: Source): () => void {
  sources.add(source);
  return () => { sources.delete(source); };
}
export function capturePendingRecovery(projectId: string): Capture[] {
  return [...sources].filter(s => s.projectId === projectId).sort((a,b) => a.priority-b.priority)
    .flatMap(s => { const value = s.capture(); return value ? [value] : []; });
}
export async function preservePendingRecovery(projectId: string, captures: Capture[]): Promise<void> {
  if (!captures.length) return;
  const state = captures[captures.length-1].state;
  await db.storySnapshots.put({ id: crypto.randomUUID(), storyId: projectId, name: 'Unsaved text recovery (local only)',
    description: 'Editor text preserved before a cloud update or deletion.', createdAt: Date.now(),
    chapterCount: state.chapters.length, wordCount: state.chapters.reduce((sum,ch) => sum+wordCount(ch.content),0), data: JSON.stringify(state) });
}
/** Used by cross-tab hydration after remote writes have already committed. */
export async function checkpointPendingRecovery(projectId: string): Promise<void> {
  const captures = capturePendingRecovery(projectId);
  if (!captures.length) return;
  await db.transaction('rw', db.storySnapshots, () => preservePendingRecovery(projectId, captures));
  captures.forEach(capture => capture.committed());
}
