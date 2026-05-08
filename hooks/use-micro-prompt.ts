'use client';

import { useState, useRef, useCallback } from 'react';
import type { MicroPromptStoryContext } from '@/lib/prompts/micro-prompt';
import type { Heteronym } from '@/lib/types/heteronym';
import { getLocalMicroPrompt } from '@/lib/prompts/micro-prompt-bank';
import { topWriterInsights, formatInsightsForPrompt } from '@/lib/writer-memory';

interface MicroPromptOptions {
  recentText: string;
  storyContext?: MicroPromptStoryContext;
  genre?: string;
  protagonistName?: string;
  blockType?: string | null;
  heteronym?: Heteronym | null;
}

interface UseMicroPromptReturn {
  prompt: string | null;
  isLoading: boolean;
  fetchPrompt: (options: MicroPromptOptions) => void;
  clearPrompt: () => void;
}

export function useMicroPrompt(): UseMicroPromptReturn {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPrompt = useCallback(
    async (options: MicroPromptOptions) => {
      // Abort any in-flight request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setIsLoading(true);

      const controller = abortRef.current;

      // MP-11/MP-12: pull top writer insights for personalization. Best-effort
      // — never block the prompt fetch on a memory read failure.
      let writerInsightsPrompt: string | undefined;
      try {
        const top = await topWriterInsights();
        const formatted = formatInsightsForPrompt(top);
        if (formatted) writerInsightsPrompt = formatted;
      } catch {
        // ignore
      }

      fetch('/api/micro-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...options, writerInsightsPrompt }),
        signal: controller.signal,
      })
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch prompt');
          return res.json();
        })
        .then(data => {
          if (controller.signal.aborted) return;
          // CB-12: when the server flags `degraded` (rate-limited / safety
          // blocked / empty-or-invalid), substitute a local-bank prompt so the
          // writer is never left without a nudge.
          if (data?.degraded === true) {
            setPrompt(getLocalMicroPrompt(options.blockType));
            return;
          }
          setPrompt(data.prompt || null);
        })
        .catch(err => {
          // Ignore aborted requests — can manifest as DOMException, Event, or other types
          if (controller.signal.aborted) return;
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error('Micro-prompt fetch error:', err);
          // Fallback to local prompt bank instead of showing nothing
          setPrompt(getLocalMicroPrompt(options.blockType));
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });
    },
    []
  );

  const clearPrompt = useCallback(() => {
    abortRef.current?.abort();
    setPrompt(null);
    setIsLoading(false);
  }, []);

  return { prompt, isLoading, fetchPrompt, clearPrompt };
}
