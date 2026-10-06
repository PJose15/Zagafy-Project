'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { FinishingEngineState } from '@/lib/types/gamification';
import type { NovelCompletionStats } from '@/lib/gamification/finishing-engine';
import { checkNovelCompletion, generateNovelStats } from '@/lib/gamification/finishing-engine';
import { readSessions } from '@/lib/types/writing-session';
import { useStory } from '@/lib/store';

const COMPLETED_KEY = 'zagafy_novel_completed';
const STATS_KEY = 'zagafy_completion_stats';

interface UseNovelCompletionReturn {
  novelJustCompleted: boolean;
  completionStats: NovelCompletionStats | null;
  dismissCompletion: () => void;
}

export function useNovelCompletion(
  finishing: FinishingEngineState,
  isLoaded: boolean,
): UseNovelCompletionReturn {
  const { state } = useStory();
  const prevFinishingRef = useRef<FinishingEngineState | null>(null);
  const [novelJustCompleted, setNovelJustCompleted] = useState(false);
  const [completionStats, setCompletionStats] = useState<NovelCompletionStats | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    // Already dismissed permanently
    try {
      if (localStorage.getItem(COMPLETED_KEY) === 'true') return;
    } catch { /* ignore */ }

    const previous = prevFinishingRef.current;
    prevFinishingRef.current = finishing;

    if (checkNovelCompletion(finishing, previous)) {
      readSessions().then(sessions => {
        const stats = generateNovelStats(sessions, state.chapters, state.title);

        // Persist stats
        try {
          localStorage.setItem(STATS_KEY, JSON.stringify(stats));
        } catch { /* ignore */ }

        setCompletionStats(stats);
        setNovelJustCompleted(true);
      }).catch(() => { /* Wait for readable session history before publishing stats. */ });
    }
  }, [finishing, isLoaded, state.chapters, state.title]);

  const dismissCompletion = useCallback(() => {
    try {
      localStorage.setItem(COMPLETED_KEY, 'true');
    } catch { /* ignore */ }
    setNovelJustCompleted(false);
  }, []);

  return { novelJustCompleted, completionStats, dismissCompletion };
}
