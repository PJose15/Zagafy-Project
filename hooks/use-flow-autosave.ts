'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useStory } from '@/lib/store';
import {
  getPlainText,
  buildLexicalStateFromText,
  isLexicalJson,
  hasFormatting,
} from '@/lib/editor/serialization';
import { addVersion } from '@/lib/types/chapter-version';

/**
 * CB-07 — Flow mode edits plain text in a <textarea>, but chapter content is
 * stored as Lexical JSON (shared with the Manuscript rich-text editor). This
 * hook bridges the two: it hands the textarea plain text on load and writes
 * Lexical JSON back on save. Before the first save of a session it snapshots
 * any pre-flow rich formatting so flattening it stays recoverable.
 */
export function useFlowAutosave(chapterId: string | null) {
  const { state, setState } = useStory();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<string>('');

  // Raw stored content (may be Lexical JSON) for the active chapter.
  const rawStored = chapterId
    ? state.chapters.find(ch => ch.id === chapterId)?.content ?? ''
    : '';

  // Capture the pre-flow content per chapter so we can snapshot it once before
  // flow flattens any formatting. Refreshed when the chapter switches (e.g. a
  // scene change swaps chapterId without remounting).
  const originalRawRef = useRef(rawStored);
  const snapshotDoneRef = useRef(false);
  useEffect(() => {
    originalRawRef.current = chapterId
      ? state.chapters.find(ch => ch.id === chapterId)?.content ?? ''
      : '';
    snapshotDoneRef.current = false;
    // Resync the pending-content buffer so a later flush can never write the
    // PREVIOUS chapter's text into this one (chapter swaps don't remount).
    contentRef.current = getPlainText(originalRawRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  const save = useCallback(() => {
    if (!chapterId) return;
    const plain = contentRef.current;
    // Serialize plain text to the same Lexical state shape the editor consumes.
    const json = JSON.stringify(buildLexicalStateFromText(plain));

    // One-time per session: preserve pre-flow formatting before it's lost.
    if (!snapshotDoneRef.current) {
      snapshotDoneRef.current = true;
      const orig = originalRawRef.current;
      if (isLexicalJson(orig) && hasFormatting(orig)) {
        addVersion(chapterId, orig, 'Before flow session', 'auto-snapshot').catch(() => {
          // Snapshot is best-effort — never block the save.
        });
      }
    }

    setState(prev => ({
      ...prev,
      chapters: prev.chapters.map(ch =>
        ch.id === chapterId ? { ...ch, content: json } : ch
      ),
    }));
  }, [chapterId, setState]);

  const scheduleAutosave = useCallback(
    (content: string) => {
      contentRef.current = content;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // Null before saving — a non-null ref means "flush pending on
        // cleanup", and a fired timer has nothing pending anymore.
        timerRef.current = null;
        save();
      }, 5000);
    },
    [save]
  );

  // Flush a pending save on unmount / chapter swap (the `save` identity
  // changes with chapterId, so this cleanup still holds the old chapter's
  // closure and writes to the chapter the content belongs to).
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
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

  // Plain text for the textarea — decodes stored Lexical JSON back to prose.
  const initialContent = getPlainText(rawStored);

  return { scheduleAutosave, saveNow, initialContent };
}
