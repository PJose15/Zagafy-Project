import { db, putStory, putChapterContent } from './dexie-db';
import type { StoryState } from '@/lib/store';
import { wordCount } from '@/lib/editor/serialization';

/** Commit a manuscript, its chapter contents and sync mutations together.
 * A quota/storage error rolls back all three, leaving the last saved copy intact.
 * The project is supplied by the caller before any asynchronous work starts.
 */
export async function persistProjectState(state: StoryState, projectId: string): Promise<void> {
  await db.transaction('rw', [db.stories, db.chapters, db.syncQueue], async () => {
    const oldChapters = await db.chapters.where('projectId').equals(projectId).toArray();
    const currentIds = new Set(state.chapters.map(chapter => chapter.id));
    if (currentIds.size !== state.chapters.length) throw new Error('Duplicate chapter IDs in manuscript');
    const removed = oldChapters.filter(chapter => !currentIds.has(chapter.id));
    await db.chapters.bulkDelete(removed.map(chapter => chapter.id));
    await putStory({ ...state, chapters: state.chapters.map(chapter => ({ ...chapter, content: '' })) }, {
      projectId, wordCount: state.chapters.reduce((sum, chapter) => sum + wordCount(chapter.content), 0),
    });
    for (const chapter of state.chapters) {
      const existing = await db.chapters.get(chapter.id);
      if (existing?.projectId && existing.projectId !== projectId) throw new Error('Chapter belongs to another project');
      await putChapterContent(chapter.id, chapter.content, chapter.title, chapter.summary, chapter.canonStatus, chapter.source, projectId);
    }
    const timestamp = Date.now();
    const deltas = [
      { entityType: 'story', entityId: projectId, op: 'upsert' as const },
      ...state.chapters.map(chapter => ({ entityType: 'chapter', entityId: chapter.id, op: 'upsert' as const })),
      ...removed.map(chapter => ({ entityType: 'chapter', entityId: chapter.id, op: 'delete' as const })),
    ];
    await db.syncQueue.bulkPut(deltas.map(delta => ({ ...delta, id: crypto.randomUUID(), projectId, timestamp })));
  });
}
