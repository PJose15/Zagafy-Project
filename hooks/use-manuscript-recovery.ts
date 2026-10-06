'use client';

import { useEffect } from 'react';
import type { Chapter, StoryState } from '@/lib/store';
import { registerPendingRecovery } from '@/lib/storage/pending-recovery';

/** Manuscript drafts live outside the story store until Save. Include that
 * buffer in the same checkpoint protocol used by Flow and cloud recovery. */
export function useManuscriptRecovery(
  projectId: string,
  state: StoryState,
  editingId: string | null,
  draft: Partial<Chapter>,
) {
  useEffect(() => {
    if (!editingId) return;
    return registerPendingRecovery({
      projectId,
      priority: 1,
      capture: () => {
        const saved = state.chapters.find(ch => ch.id === editingId);
        const chapter: Chapter = {
          title: '', content: '', summary: '', ...saved, ...draft, id: editingId,
        };
        if (saved && Object.entries(chapter).every(([key, value]) => saved[key as keyof Chapter] === value)) return null;
        const chapters = saved
          ? state.chapters.map(ch => ch.id === editingId ? chapter : ch)
          : [...state.chapters, chapter];
        return {
          state: { ...state, chapters },
          // A checkpoint preserves the draft; only Save/Cancel dismisses the
          // form. Keeping it also protects typing made during a remote update.
          committed: () => {},
        };
      },
    });
  }, [projectId, state, editingId, draft]);
}
