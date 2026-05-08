'use client';

import { useState, useRef, useCallback } from 'react';
import type { MicroPromptStoryContext } from '@/lib/prompts/micro-prompt';
import type { Heteronym } from '@/lib/types/heteronym';
import { getLocalMicroPrompt } from '@/lib/prompts/micro-prompt-bank';

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
    (options: MicroPromptOptions) => {
      // Abort any in-flight request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setIsLoading(true);

      const controller = abortRef.current;

      fetch('/api/micro-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
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
