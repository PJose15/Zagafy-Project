'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { saveBraindumpTemp } from '@/lib/types/braindump';

const AUTO_SAVE_INTERVAL = 10000; // 10 seconds

export interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  permissionState: 'prompt' | 'granted' | 'denied' | 'unknown';
  isRecording: boolean;
  isPaused: boolean;
  finalTranscript: string;
  interimTranscript: string;
  elapsedSeconds: number;
  language: string;
  error: string | null;
  start(): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  setLanguage(lang: string): void;
  reset(): void;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

/**
 * Returns true when the current environment exposes the Web Speech API
 * SpeechRecognition interface (Chrome / Edge / Safari).
 */
export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null;
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  // i18n: errors are translated at the source (hooks-use-useTranslations
  // pattern) so consumers can render `error` directly in the active locale.
  const t = useTranslations('flow.speechErrors');
  const [isSupported] = useState(() => getSpeechRecognition() !== null);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [language, setLanguageState] = useState('en-US');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalTranscriptRef = useRef('');
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const elapsedSecondsRef = useRef(0);

  // Keep refs in sync
  useEffect(() => { finalTranscriptRef.current = finalTranscript; }, [finalTranscript]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { elapsedSecondsRef.current = elapsedSeconds; }, [elapsedSeconds]);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoSaveRef.current) {
      clearInterval(autoSaveRef.current);
      autoSaveRef.current = null;
    }
  }, []);

  const startTimers = useCallback(() => {
    clearTimers();
    timerRef.current = setInterval(() => {
      if (!isPausedRef.current) {
        elapsedSecondsRef.current += 1;
        setElapsedSeconds(elapsedSecondsRef.current);
      }
    }, 1000);
    autoSaveRef.current = setInterval(() => {
      if (finalTranscriptRef.current) {
        saveBraindumpTemp({
          transcript: finalTranscriptRef.current,
          language,
          elapsedSeconds: elapsedSecondsRef.current,
          savedAt: new Date().toISOString(),
        });
      }
    }, AUTO_SAVE_INTERVAL);
  }, [clearTimers, language]);

  const createRecognition = useCallback((lang: string): SpeechRecognition | null => {
    const SpeechRecognitionClass = getSpeechRecognition();
    if (!SpeechRecognitionClass) return null;

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalChunk += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (finalChunk) {
        setFinalTranscript(prev => {
          const separator = prev && !prev.endsWith(' ') ? ' ' : '';
          return prev + separator + finalChunk.trim();
        });
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        setPermissionState('denied');
        setError(t('micDenied'));
        setIsRecording(false);
        setIsPaused(false);
        recognitionRef.current = null;
        clearTimers();
      } else if (event.error === 'no-speech') {
        // Not fatal — keep going
        setError(t('noSpeech'));
      } else if (event.error !== 'aborted') {
        setError(t('generic', { error: event.error }));
      }
    };

    recognition.onend = () => {
      // Auto-restart if still recording (browser can stop recognition)
      if (isRecordingRef.current && !isPausedRef.current) {
        try {
          recognition.start();
        } catch {
          // Already started or other issue
        }
      }
    };

    return recognition;
  }, [clearTimers, t]);

  const start = useCallback(async () => {
    if (!isSupported) {
      setError(t('unsupported'));
      return;
    }

    setError(null);

    // Request microphone permission
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setPermissionState('granted');
    } catch {
      setPermissionState('denied');
      setError(t('micDenied'));
      return;
    }

    const recognition = createRecognition(language);
    if (!recognition) return;

    recognitionRef.current = recognition;
    setIsRecording(true);
    setIsPaused(false);
    startTimers();

    try {
      recognition.start();
    } catch {
      setError(t('startFailed'));
      setIsRecording(false);
      clearTimers();
    }
  }, [isSupported, language, createRecognition, startTimers, clearTimers, t]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* already stopped */ }
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
    setInterimTranscript('');
    clearTimers();
  }, [clearTimers]);

  const pause = useCallback(() => {
    if (!isRecording || isPaused) return;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ok */ }
    }
    setIsPaused(true);
    setInterimTranscript('');
  }, [isRecording, isPaused]);

  const resume = useCallback(() => {
    if (!isRecording || !isPaused) return;
    setIsPaused(false);
    setError(null);

    const recognition = createRecognition(language);
    if (!recognition) return;
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setError(t('resumeFailed'));
    }
  }, [isRecording, isPaused, language, createRecognition, t]);

  const setLanguage = useCallback((lang: string) => {
    setLanguageState(lang);
    if (isRecordingRef.current && !isPausedRef.current) {
      // Restart with new language
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ok */ }
      }
      const recognition = createRecognition(lang);
      if (!recognition) return;
      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        // fail silently
      }
    }
  }, [createRecognition]);

  const reset = useCallback(() => {
    stop();
    setFinalTranscript('');
    setInterimTranscript('');
    elapsedSecondsRef.current = 0;
    setElapsedSeconds(0);
    setError(null);
  }, [stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ok */ }
      }
      clearTimers();
    };
  }, [clearTimers]);

  return {
    isSupported,
    permissionState,
    isRecording,
    isPaused,
    finalTranscript,
    interimTranscript,
    elapsedSeconds,
    language,
    error,
    start,
    stop,
    pause,
    resume,
    setLanguage,
    reset,
  };
}
