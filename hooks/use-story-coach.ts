'use client';

import { useState, useCallback, useRef } from 'react';
import type { CoachingInsight, CoachingSession, CoachingLens } from '@/lib/story-coach/types';
import type { Heteronym } from '@/lib/types/heteronym';
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

// Same heteronym slice the flow editor sends (buildVoiceDirective reads
// name/voice/styleNote — a bare voice object would silently produce '').
export type CoachHeteronymVoice = Pick<Heteronym, 'name' | 'voice' | 'styleNote'>;

// Stable error codes — translated by the rendering component (storyCoach.errors.*).
export type StoryCoachError = 'apiError' | 'networkError';

interface StoryCoachRefreshOptions {
  focusLens?: string;
  chapterContent?: string;
  chapterTitle?: string;
  storyContext?: string;
  heteronymVoice?: CoachHeteronymVoice;
  language?: string;
  /** Bypass and replace the cached session (the panel's refresh button). */
  force?: boolean;
}

interface UseStoryCoachReturn {
  insights: CoachingInsight[];
  isLoading: boolean;
  error: StoryCoachError | null;
  refresh: (chapterId: string, options?: StoryCoachRefreshOptions) => void;
  dismissInsight: (insightId: string) => void;
}

// Per-chapter+lens cache with LRU eviction (max 10 entries). Keyed on the lens
// too so a lens-scoped result never poisons the general (all-lens) entry.
const MAX_CACHE_SIZE = 10;
const sessionCache = new Map<string, CoachingSession>();
function cacheSet(key: string, value: CoachingSession) {
  if (sessionCache.size >= MAX_CACHE_SIZE) {
    const oldest = sessionCache.keys().next().value;
    if (oldest !== undefined) sessionCache.delete(oldest);
  }
  sessionCache.set(key, value);
}

/** Test-only: the cache is module-level, so suites must reset it between tests. */
export function clearCoachSessionCache() {
  sessionCache.clear();
}

export function useStoryCoach(): UseStoryCoachReturn {
  const [insights, setInsights] = useState<CoachingInsight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<StoryCoachError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async (
    chapterId: string,
    options?: StoryCoachRefreshOptions
  ) => {
    const cacheKey = `${chapterId}::${options?.focusLens ?? 'all'}`;
    const cached = sessionCache.get(cacheKey);
    if (cached && !options?.force) {
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
        // Forward the story's language so coaching insights match the prose
        // language (the route defaults to English when this is absent).
        language: options?.language,
        writerInsightsPrompt,
      }),
      signal: controller.signal,
    })
      .then(res => {
        if (!res.ok) {
          const e = new Error(`Coach API error: ${res.status}`);
          e.name = 'CoachApiError';
          throw e;
        }
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
        cacheSet(cacheKey, session);

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
        setError(err instanceof Error && err.name === 'CoachApiError' ? 'apiError' : 'networkError');
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
