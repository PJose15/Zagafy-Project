'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSpeechRecognition } from './use-speech-recognition';
import type { UseSpeechRecognitionReturn } from './use-speech-recognition';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm-dialog';
import {
  readBraindumps,
  addBraindump,
  updateBraindump,
  deleteBraindump,
  clearBraindumpTemp,
} from '@/lib/types/braindump';
import type { BraindumpEntry } from '@/lib/types/braindump';
import { getProjectId } from '@/lib/types/writing-session';

const POLISH_MESSAGES = [
  'Polishing your words...',
  'Cleaning up the transcript...',
  'Smoothing rough edges...',
  'Making it shine...',
  'Almost there...',
];

interface UseBraindumpOptions {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  content: string;
  setContent: (content: string) => void;
  scheduleAutosave: (content: string) => void;
  projectName: string;
}

export interface UseBraindumpReturn {
  panelOpen: boolean;
  historyOpen: boolean;
  speech: UseSpeechRecognitionReturn;
  isStopped: boolean;
  isPolishing: boolean;
  polishError: string | null;
  polishProgress: string;
  openPanel(): void;
  closePanel(): void;
  openHistory(): void;
  closeHistory(): void;
  insertAsIs(): void;
  polishAndInsert(): Promise<void>;
  reRecord(): void;
  reInsertFromHistory(entryId: string): void;
  rePolishFromHistory(entryId: string): Promise<void>;
  deleteHistoryEntry(entryId: string): void;
  history: BraindumpEntry[];
}

export function useBraindump({
  textareaRef,
  content,
  setContent,
  scheduleAutosave,
  projectName,
}: UseBraindumpOptions): UseBraindumpReturn {
  const speech = useSpeechRecognition();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [panelOpen, setPanelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);
  const [polishProgress, setPolishProgress] = useState(POLISH_MESSAGES[0]);
  const [history, setHistory] = useState<BraindumpEntry[]>(() => readBraindumps());

  const autosavePausedRef = useRef(false);
  const polishMessageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentRef = useRef(content);
  const isPolishingRef = useRef(false);
  const polishAbortRef = useRef<AbortController | null>(null);

  useEffect(() => { contentRef.current = content; }, [content]);

  // Determine if recording is stopped (has transcript but not actively recording)
  const isStopped = !speech.isRecording && speech.finalTranscript.length > 0 && panelOpen;

  const refreshHistory = useCallback(() => {
    setHistory(readBraindumps());
  }, []);

  const insertTextAtCursor = useCallback((text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      // No textarea — just append
      const newContent = contentRef.current + (contentRef.current ? '\n\n' : '') + text;
      setContent(newContent);
      scheduleAutosave(newContent);
      return;
    }

    const cursorPos = textarea.selectionStart;
    const before = contentRef.current.slice(0, cursorPos);
    const after = contentRef.current.slice(cursorPos);
    const separator = before && !before.endsWith('\n') ? '\n\n' : '';
    const newContent = before + separator + text + after;
    setContent(newContent);
    scheduleAutosave(newContent);

    // Move cursor to end of inserted text
    requestAnimationFrame(() => {
      if (textarea) {
        const newPos = cursorPos + separator.length + text.length;
        textarea.selectionStart = newPos;
        textarea.selectionEnd = newPos;
        textarea.focus();
      }
    });
  }, [textareaRef, setContent, scheduleAutosave]);

  const saveToHistory = useCallback((rawTranscript: string, polishedText: string | null, durationSeconds: number, language: string) => {
    const entry: BraindumpEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      durationSeconds,
      language,
      projectId: getProjectId(),
      projectName,
      rawTranscript,
      polishedText,
      wasPolished: polishedText !== null,
      wordCount: rawTranscript.trim().split(/\s+/).filter(Boolean).length,
    };
    addBraindump(entry);
    refreshHistory();
    return entry;
  }, [projectName, refreshHistory]);

  const openPanel = useCallback(async () => {
    if (!speech.isSupported) return;
    setPanelOpen(true);
    setPolishError(null);
    autosavePausedRef.current = true;

    await speech.start();
  }, [speech]);

  const closePanel = useCallback(async () => {
    if (speech.isRecording) {
      const hasWords = speech.finalTranscript.trim().split(/\s+/).filter(Boolean).length > 0;
      if (hasWords) {
        const confirmed = await confirm({
          title: 'Stop Recording?',
          message: 'You have an active recording. Stopping will discard the current transcript.',
          confirmLabel: 'Stop & discard',
          variant: 'danger',
        });
        if (!confirmed) return;
      }
      speech.stop();
    }

    speech.reset();
    setPanelOpen(false);
    setPolishError(null);
    autosavePausedRef.current = false;
    clearBraindumpTemp();

    if (polishMessageTimerRef.current) {
      clearInterval(polishMessageTimerRef.current);
      polishMessageTimerRef.current = null;
    }
  }, [speech, confirm]);

  const openHistory = useCallback(() => {
    refreshHistory();
    setHistoryOpen(true);
  }, [refreshHistory]);

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
  }, []);

  const insertAsIs = useCallback(() => {
    const text = speech.finalTranscript.trim();
    if (!text) return;

    insertTextAtCursor(text);
    saveToHistory(text, null, speech.elapsedSeconds, speech.language);
    speech.reset();
    setPanelOpen(false);
    autosavePausedRef.current = false;
    clearBraindumpTemp();
    toast('Voice transcript inserted!', 'success');
  }, [speech, insertTextAtCursor, saveToHistory, toast]);

  const startPolishMessages = useCallback(() => {
    let idx = 0;
    setPolishProgress(POLISH_MESSAGES[0]);
    polishMessageTimerRef.current = setInterval(() => {
      idx = (idx + 1) % POLISH_MESSAGES.length;
      setPolishProgress(POLISH_MESSAGES[idx]);
    }, 3000);
  }, []);

  const stopPolishMessages = useCallback(() => {
    if (polishMessageTimerRef.current) {
      clearInterval(polishMessageTimerRef.current);
      polishMessageTimerRef.current = null;
    }
  }, []);

  const polishAndInsert = useCallback(async () => {
    const rawText = speech.finalTranscript.trim();
    if (!rawText || isPolishingRef.current) return;

    // Cancel any previous in-flight request
    polishAbortRef.current?.abort();
    const abortController = new AbortController();
    polishAbortRef.current = abortController;

    setIsPolishing(true);
    isPolishingRef.current = true;
    setPolishError(null);
    startPolishMessages();

    try {
      const res = await fetch('/api/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: rawText }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Network error' }));
        throw new Error(data.error || `Failed to polish (${res.status})`);
      }

      const { polishedText } = await res.json();
      if (!polishedText) throw new Error('No polished text returned');

      insertTextAtCursor(polishedText);
      saveToHistory(rawText, polishedText, speech.elapsedSeconds, speech.language);
      speech.reset();
      setPanelOpen(false);
      autosavePausedRef.current = false;
      clearBraindumpTemp();
      toast('Polished text inserted!', 'success');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return; // cancelled
      const message = err instanceof Error ? err.message : 'Failed to polish transcript';
      setPolishError(message);
    } finally {
      setIsPolishing(false);
      isPolishingRef.current = false;
      polishAbortRef.current = null;
      stopPolishMessages();
    }
  }, [speech, insertTextAtCursor, saveToHistory, toast, startPolishMessages, stopPolishMessages]);

  const reRecord = useCallback(() => {
    speech.reset();
    setPolishError(null);
    speech.start();
  }, [speech]);

  const reInsertFromHistory = useCallback((entryId: string) => {
    const entry = history.find(e => e.id === entryId);
    if (!entry) return;
    const text = entry.polishedText || entry.rawTranscript;
    insertTextAtCursor(text);
    toast('Text re-inserted from history!', 'success');
  }, [history, insertTextAtCursor, toast]);

  const rePolishFromHistory = useCallback(async (entryId: string) => {
    const entry = history.find(e => e.id === entryId);
    if (!entry || isPolishingRef.current) return;

    // Own an AbortController (cancel any previous in-flight request) so an
    // unmount or a concurrent re-polish can't leave the spinner stuck or the
    // shared message-timer interval running.
    polishAbortRef.current?.abort();
    const abortController = new AbortController();
    polishAbortRef.current = abortController;

    setIsPolishing(true);
    isPolishingRef.current = true;
    setPolishError(null);
    startPolishMessages();

    try {
      const res = await fetch('/api/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: entry.rawTranscript }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Network error' }));
        throw new Error(data.error || `Failed to polish (${res.status})`);
      }

      const { polishedText } = await res.json();
      if (!polishedText) throw new Error('No polished text returned');

      updateBraindump(entryId, { polishedText, wasPolished: true });
      refreshHistory();
      toast('History entry polished!', 'success');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return; // cancelled/unmounted
      const message = err instanceof Error ? err.message : 'Failed to polish';
      toast(message, 'error');
    } finally {
      // Only the latest request clears shared state — a superseded request
      // must not stop the newer one's spinner/timer.
      if (polishAbortRef.current === abortController) {
        setIsPolishing(false);
        isPolishingRef.current = false;
        polishAbortRef.current = null;
        stopPolishMessages();
      }
    }
  }, [history, refreshHistory, toast, startPolishMessages, stopPolishMessages]);

  const deleteHistoryEntry = useCallback((entryId: string) => {
    deleteBraindump(entryId);
    refreshHistory();
    toast('Entry deleted', 'info');
  }, [refreshHistory, toast]);

  // beforeunload guard when recording with substantial text
  useEffect(() => {
    if (!panelOpen || !speech.isRecording) return;

    const wordCount = speech.finalTranscript.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 20) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [panelOpen, speech.isRecording, speech.finalTranscript]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopPolishMessages();
      polishAbortRef.current?.abort();
    };
  }, [stopPolishMessages]);

  // Clear temp on mount (no recovery in MVP)
  useEffect(() => {
    clearBraindumpTemp();
  }, []);

  return {
    panelOpen,
    historyOpen,
    speech,
    isStopped,
    isPolishing,
    polishError,
    polishProgress,
    openPanel,
    closePanel,
    openHistory,
    closeHistory,
    insertAsIs,
    polishAndInsert,
    reRecord,
    reInsertFromHistory,
    rePolishFromHistory,
    deleteHistoryEntry,
    history,
  };
}
