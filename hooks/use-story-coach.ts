'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { CoachingInsight, CoachingSession } from '@/lib/story-coach/types';

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

// Cheap, stable content fingerprint (djb2). Combined with the chapterId, it keys
// the cache so that after editing a chapter the coach re-analyzes the new text
// instead of returning insights for the stale content.
function contentHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${h >>> 0}`;
}
function cacheKey(chapterId: string, content: string): string {
  return `${chapterId}:${contentHash(content)}`;
}

export function useStoryCoach(): UseStoryCoachReturn {
  const [insights, setInsights] = useState<CoachingInsight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());

  const refresh = useCallback((
    chapterId: string,
    options?: {
      focusLens?: string;
      chapterContent?: string;
      chapterTitle?: string;
      storyContext?: string;
      heteronymVoice?: unknown;
    }
  ) => {
    // Check cache (unless explicit refresh with different options). Keyed on
    // chapter id + content fingerprint so edited chapters aren't served stale.
    const key = cacheKey(chapterId, options?.chapterContent || '');
    const cached = sessionCache.get(key);
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
        cacheSet(key, session);

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

  // Abort any in-flight request on unmount so it can't call setState afterward.
  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    insights,
    isLoading,
    error,
    refresh,
    dismissInsight,
  };
}
