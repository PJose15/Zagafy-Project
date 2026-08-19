'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useStory } from '@/lib/store';

export function useFlowAutosave(chapterId: string | null) {
  const { state, setState } = useStory();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<string>('');

  const save = useCallback(() => {
    if (!chapterId) return;
    const content = contentRef.current;
    setState(prev => ({
      ...prev,
      chapters: prev.chapters.map(ch =>
        ch.id === chapterId ? { ...ch, content } : ch
      ),
    }));
  }, [chapterId, setState]);

  const scheduleAutosave = useCallback(
    (content: string) => {
      contentRef.current = content;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        save();
      }, 5000);
    },
    [save]
  );

  // Flush the latest typed content to the store immediately (used on tab
  // hide / navigation so the newest prose isn't lost in the autosave window).
  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    save();
  }, [save]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        // Final save
        save();
      }
    };
  }, [save]);

  const saveNow = useCallback(
    (content: string) => {
      contentRef.current = content;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      save();
    },
    [save]
  );

  // Get initial content
  const initialContent = chapterId
    ? state.chapters.find(ch => ch.id === chapterId)?.content || ''
    : '';

  return { scheduleAutosave, saveNow, flush, initialContent };
}
