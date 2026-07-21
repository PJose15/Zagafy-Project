'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { MetricsCollector, KeystrokeMetrics } from '@/lib/flow-metrics';
import { detectWritersBlock } from '@/lib/scenery-change/block-detector';
import { getDetourSuggestions } from '@/lib/scenery-change/detour-catalog';
import { saveDetourSession } from '@/lib/scenery-change/detour-history';
import type { BlockSignal, DetourSuggestion, DetourSession, DetourType } from '@/lib/scenery-change/types';

const CHECK_INTERVAL_MS = 15_000; // Check every 15 seconds
const COOLDOWN_MS = 600_000; // 10-minute cooldown after dismiss

interface StoryContext {
  characterNames?: string[];
  currentChapterTitle?: string;
  genre?: string;
}

interface UseBlockDetectorReturn {
  blockSignal: BlockSignal | null;
  suggestions: DetourSuggestion[];
  dismiss: () => void;
  startDetour: (suggestion: DetourSuggestion) => void;
  activeDetour: DetourSession | null;
  endDetour: (content: string) => void;
}

export function useBlockDetector(
  metricsCollectorRef: React.RefObject<MetricsCollector | null>,
  sessionStartTime: number,
  lastKeystrokeTimeRef: React.RefObject<number>,
  storyContext: StoryContext
): UseBlockDetectorReturn {
  const [blockSignal, setBlockSignal] = useState<BlockSignal | null>(null);
  const [suggestions, setSuggestions] = useState<DetourSuggestion[]>([]);
  const [activeDetour, setActiveDetour] = useState<DetourSession | null>(null);
  const cooldownUntilRef = useRef<number>(0);
  const blockSignalRef = useRef(blockSignal);
  const activeDetourRef = useRef(activeDetour);

  useEffect(() => {
    blockSignalRef.current = blockSignal;
  }, [blockSignal]);

  useEffect(() => {
    activeDetourRef.current = activeDetour;
  }, [activeDetour]);

  // Periodic check — uses refs to avoid re-creating interval on state changes
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() < cooldownUntilRef.current) return;
      if (blockSignalRef.current !== null) return;
      if (activeDetourRef.current !== null) return;

      const collector = metricsCollectorRef.current;
      if (!collector) return;

      const metrics: KeystrokeMetrics = collector.getSnapshot();
      const sessionDuration = Date.now() - sessionStartTime;
      const lastKeystrokeAge = Date.now() - (lastKeystrokeTimeRef.current || sessionStartTime);

      const signal = detectWritersBlock(metrics, sessionDuration, lastKeystrokeAge);
      if (signal) {
        setBlockSignal(signal);
        setSuggestions(getDetourSuggestions(signal, storyContext));
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [metricsCollectorRef, sessionStartTime, lastKeystrokeTimeRef, storyContext]);

  const dismiss = useCallback(() => {
    setBlockSignal(null);
    setSuggestions([]);
    cooldownUntilRef.current = Date.now() + COOLDOWN_MS;
  }, []);

  const startDetour = useCallback((suggestion: DetourSuggestion) => {
    const session: DetourSession = {
      id: crypto.randomUUID(),
      type: suggestion.type,
      startedAt: new Date().toISOString(),
      endedAt: null,
      prompt: suggestion.prompt,
      // i18n: carry the raw story value so the editor can translate the
      // prompt template in the active locale (null = translated default).
      promptParam: suggestion.promptParam ?? null,
      content: '',
      wordCount: 0,
    };
    setActiveDetour(session);
    setBlockSignal(null);
    setSuggestions([]);
  }, []);

  const endDetour = useCallback((content: string) => {
    if (!activeDetour) return;

    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
    const completed: DetourSession = {
      ...activeDetour,
      endedAt: new Date().toISOString(),
      content,
      wordCount,
    };

    saveDetourSession(completed);
    setActiveDetour(null);
    cooldownUntilRef.current = Date.now() + COOLDOWN_MS;
  }, [activeDetour]);

  return {
    blockSignal,
    suggestions,
    dismiss,
    startDetour,
    activeDetour,
    endDetour,
  };
}
