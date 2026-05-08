'use client';

import { useState, useCallback, useRef } from 'react';
import type { CoachingInsight, CoachingSession, CoachingLens } from '@/lib/story-coach/types';
import {
  observe,
  topWriterInsights,
  formatInsightsForPrompt,
  type WriterInsightCategory,
} from '@/lib/writer-memory';

// Map the coach's per-chapter lens onto the broader writer-memory category
// space. Some lenses fold together (foreshadowing/tension/motivation are all
// plot-shaped signals; sensory observations are descriptions).
const LENS_TO_CATEGORY: Record<CoachingLens, WriterInsightCategory> = {
  pacing: 'pacing',
  dialogue: 'dialogue',
  sensory: 'description',
  tension: 'plot',
  foreshadowing: 'plot',
  motivation: 'voice',
};

interface UseStoryCoachReturn {
  insights: CoachingInsight[];
  isLoading: boolean;
  error: string | null;
  refresh: (chapterId: string, options?: { focusLens?: string; chapterContent?: string; chapterTitle?: string; storyContext?: string; heteronymVoice?: unknown }) => void;
  dismissInsight: (insightId: string) => void;
}

// Per-chapter cache with LRU eviction (max 10 entries)
const MAX_CACHE_SIZE = 10;
const sessionCache = new Map<string, CoachingSession>();
function cacheSet(key: string, value: CoachingSession) {
  if (sessionCache.size >= MAX_CACHE_SIZE) {
    const oldest = sessionCache.keys().next().value;
    if (oldest !== undefined) sessionCache.delete(oldest);
  }
  sessionCache.set(key, value);
}

export function useStoryCoach(): UseStoryCoachReturn {
  const [insights, setInsights] = useState<CoachingInsight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async (
    chapterId: string,
    options?: {
      focusLens?: string;
      chapterContent?: string;
      chapterTitle?: string;
      storyContext?: string;
      heteronymVoice?: unknown;
    }
  ) => {
    // Check cache (unless explicit refresh with different options)
    const cached = sessionCache.get(chapterId);
    if (cached && !options?.focusLens) {
      const filtered = cached.insights.filter(i => !dismissedRef.current.has(i.id));
      setInsights(filtered);
      setError(null);
      return;
    }

    // Abort previous request
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const controller = abortRef.current;

    setIsLoading(true);
    setError(null);

    // MP-11: pull top writer insights for personalization (best-effort).
    let writerInsightsPrompt: string | undefined;
    try {
      const top = await topWriterInsights();
      const formatted = formatInsightsForPrompt(top);
      if (formatted) writerInsightsPrompt = formatted;
    } catch {
      // ignore
    }

    fetch('/api/story-coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapterId,
        chapterContent: options?.chapterContent || '',
        chapterTitle: options?.chapterTitle,
        storyContext: options?.storyContext,
        focusLens: options?.focusLens,
        heteronymVoice: options?.heteronymVoice,
        writerInsightsPrompt,
      }),
      signal: controller.signal,
    })
      .then(res => {
        if (!res.ok) throw new Error(`Coach API error: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (controller.signal.aborted) return;

        const parsed: CoachingInsight[] = Array.isArray(data.insights) ? data.insights : [];

        // Cache the session
        const session: CoachingSession = {
          chapterId,
          insights: parsed,
          fetchedAt: new Date().toISOString(),
        };
        cacheSet(chapterId, session);

        // MP-11: fold each coach observation into the long-term writer
        // memory. observe() is idempotent on duplicate observations and
        // just bumps evidenceCount.
        for (const ins of parsed) {
          const category = LENS_TO_CATEGORY[ins.lens];
          if (!category) continue;
          observe({ category, observation: ins.observation }).catch(() => {
            // best-effort — never block the coach UI on memory failures.
          });
        }

        // Filter dismissed
        const filtered = parsed.filter(i => !dismissedRef.current.has(i.id));
        setInsights(filtered);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Story coach error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch coaching insights');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });
  }, []);

  const dismissInsight = useCallback((insightId: string) => {
    dismissedRef.current.add(insightId);
    setInsights(prev => prev.filter(i => i.id !== insightId));
  }, []);

  return {
    insights,
    isLoading,
    error,
    refresh,
    dismissInsight,
  };
}
