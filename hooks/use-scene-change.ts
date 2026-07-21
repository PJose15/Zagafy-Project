'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Chapter } from '@/lib/store';
import {
  readSceneChangeState,
  writeSceneChangeState,
  clearSceneChangeState,
  writeSceneChangeReturn,
} from '@/lib/types/scene-change';
import type { SceneChangeState, SceneChangeReturn } from '@/lib/types/scene-change';
import { addVersion, readVersions } from '@/lib/types/chapter-version';
// Aliased — depart() takes a numeric `wordCount` parameter that would shadow it.
import { wordCount as countWords } from '@/lib/editor/serialization';

const DEFAULT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const EXTENSION_MS = 10 * 60 * 1000; // 10 minutes
const MAX_EXTENSIONS = 3;

export interface UseSceneChangeReturn {
  isActive: boolean;
  canActivate: boolean;
  sceneState: SceneChangeState | null;
  remainingSeconds: number;
  isExpired: boolean;
  extensionsLeft: number;
  depart(
    chapterId: string,
    chapterTitle: string,
    cursorPosition: number,
    wordCount: number,
    chapters: Chapter[]
  ): string | null;
  grantExtension(): void;
  returnToOriginal(currentWordCount: number, alternateContent?: string): SceneChangeReturn;
  cancelSceneChange(): void;
}

function pickAlternateChapter(chapters: Chapter[], currentId: string): Chapter | null {
  const eligible = chapters.filter(
    ch => ch.id !== currentId && ch.canonStatus !== 'discarded'
  );
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

function computeRemainingSeconds(returnAt: string): number {
  const diff = new Date(returnAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 1000));
}

export function useSceneChange(nonDiscardedChapterCount: number): UseSceneChangeReturn {
  const [sceneState, setSceneState] = useState<SceneChangeState | null>(() => {
    if (typeof window === 'undefined') return null;
    return readSceneChangeState();
  });
  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const state = readSceneChangeState();
    return state ? computeRemainingSeconds(state.returnAt) : 0;
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = sceneState?.active ?? false;
  const isExpired = isActive && remainingSeconds <= 0;
  const canActivate = !isActive && nonDiscardedChapterCount >= 2;
  const extensionsLeft = isActive ? MAX_EXTENSIONS - (sceneState?.extraTimeGranted ?? 0) : 0;

  // Countdown timer
  useEffect(() => {
    if (!isActive || !sceneState) return;

    const tick = () => {
      const secs = computeRemainingSeconds(sceneState.returnAt);
      setRemainingSeconds(secs);
      if (secs <= 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, sceneState]);

  const depart = useCallback(
    (
      chapterId: string,
      chapterTitle: string,
      cursorPosition: number,
      wordCount: number,
      chapters: Chapter[]
    ): string | null => {
      const alternate = pickAlternateChapter(chapters, chapterId);
      if (!alternate) return null;

      const now = new Date();
      const returnAt = new Date(now.getTime() + DEFAULT_DURATION_MS);

      // CB-07: chapter.content is Lexical JSON — decode before counting
      const alternateWordCount = countWords(alternate.content);

      const state: SceneChangeState = {
        active: true,
        originalChapterId: chapterId,
        originalChapterTitle: chapterTitle,
        originalCursorPosition: cursorPosition,
        wordCountAtDeparture: wordCount,
        alternateChapterId: alternate.id,
        wordCountAtArrivalAlternate: alternateWordCount,
        departureTimestamp: now.toISOString(),
        returnAt: returnAt.toISOString(),
        extraTimeGranted: 0,
      };

      writeSceneChangeState(state);
      setSceneState(state);
      setRemainingSeconds(computeRemainingSeconds(state.returnAt));

      return alternate.id;
    },
    []
  );

  const grantExtension = useCallback(() => {
    if (!sceneState || sceneState.extraTimeGranted >= MAX_EXTENSIONS) return;

    const currentReturnAt = new Date(sceneState.returnAt);
    const newReturnAt = new Date(currentReturnAt.getTime() + EXTENSION_MS);

    const updated: SceneChangeState = {
      ...sceneState,
      returnAt: newReturnAt.toISOString(),
      extraTimeGranted: sceneState.extraTimeGranted + 1,
    };

    writeSceneChangeState(updated);
    setSceneState(updated);
    setRemainingSeconds(computeRemainingSeconds(updated.returnAt));
  }, [sceneState]);

  const returnToOriginal = useCallback(
    (currentWordCount: number, alternateContent?: string): SceneChangeReturn => {
      const wordsWritten = Math.max(
        0,
        currentWordCount - (sceneState?.wordCountAtArrivalAlternate ?? 0)
      );

      // Auto-snapshot alternate chapter content as a version (async, best-effort)
      if (alternateContent && sceneState?.alternateChapterId && wordsWritten > 0) {
        const altId = sceneState.alternateChapterId;
        readVersions(altId).then(existing => {
          if (existing.length > 0) {
            const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            addVersion(altId, alternateContent, `Scene Change — ${dateStr}`, 'scene-change', false);
          }
        });
      }

      const ret: SceneChangeReturn = {
        cursorPosition: sceneState?.originalCursorPosition ?? 0,
        wordsWritten,
      };

      writeSceneChangeReturn(ret);
      clearSceneChangeState();
      setSceneState(null);
      setRemainingSeconds(0);

      return ret;
    },
    [sceneState]
  );

  const cancelSceneChange = useCallback(() => {
    clearSceneChangeState();
    setSceneState(null);
    setRemainingSeconds(0);
  }, []);

  return {
    isActive,
    canActivate,
    sceneState,
    remainingSeconds,
    isExpired,
    extensionsLeft,
    depart,
    grantExtension,
    returnToOriginal,
    cancelSceneChange,
  };
}
