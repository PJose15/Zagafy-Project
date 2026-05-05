'use client';

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useStory } from '@/lib/store';
import {
  addSession,
  getProjectId,
  saveWipSession,
  readWipSession,
  clearWipSession,
} from '@/lib/types/writing-session';
import type { WritingSession, FlowScore } from '@/lib/types/writing-session';
import { getActiveHeteronymId, readHeteronyms } from '@/lib/types/heteronym';
import type { MetricsCollector } from '@/lib/flow-metrics';
import { readGamification, writeGamification } from '@/lib/types/gamification';
import { awardXP, XP_RATES } from '@/lib/gamification/xp';

const MIN_WORDS_TO_START = 10;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
const MIN_SESSION_WORDS = 5; // minimum words added to count as a session
const MIN_FLOW_SCORE_MINUTES = 3; // minimum session length to show flow score modal

interface SessionTrackerOptions {
  metricsCollectorRef?: React.RefObject<MetricsCollector | null>;
}

interface SessionTrackerState {
  pendingFlowScore: { sessionId: string } | null;
  dismissFlowScore: () => void;
}

export function useSessionTracker(options?: SessionTrackerOptions): SessionTrackerState {
  const metricsRef = options?.metricsCollectorRef;
  const { state } = useStory();
  const pathname = usePathname();

  const [pendingFlowScore, setPendingFlowScore] = useState<{ sessionId: string } | null>(null);

  // Compute total word count across all chapters
   
  const totalWordCount = useMemo(() => {
    return state.chapters.reduce((sum, ch) => {
      const words = ch.content.trim().split(/\s+/).filter(Boolean).length;
      return sum + words;
    }, 0);
  }, [state.chapters]);

  // Refs for session tracking
  const isActiveRef = useRef(false);
  const sessionStartRef = useRef<string | null>(null);
  const wordsAtStartRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const projectNameRef = useRef('');
  const heteronymIdRef = useRef<string | null>(null);
  const heteronymNameRef = useRef<string | null>(null);
  const baselineWordCountRef = useRef<number | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastWordCountRef = useRef(totalWordCount);
  const pathnameRef = useRef(pathname);

  // endSession reads stable refs and module-level helpers, so manual memoization
  // is intentional — it must keep a stable identity to feed useEffect deps below
  // without re-firing them on every render. The React Compiler heuristic can't
  // infer that, so we suppress its hint for this one callback.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const endSession = useCallback(() => {
    if (!isActiveRef.current || !sessionIdRef.current || !sessionStartRef.current) return;

    const wordsEnd = lastWordCountRef.current;
    const wordsAdded = wordsEnd - wordsAtStartRef.current;

    isActiveRef.current = false;

    // Clear timers
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }

    clearWipSession();

    // Only save if meaningful writing occurred
    if (wordsAdded < MIN_SESSION_WORDS) {
      sessionIdRef.current = null;
      sessionStartRef.current = null;
      return;
    }

    const endedAt = new Date().toISOString();
    const durationMs = new Date(endedAt).getTime() - new Date(sessionStartRef.current).getTime();
    const durationMinutes = durationMs / 60_000;

    // Capture keystroke metrics if collector is available
    const collector = metricsRef?.current ?? null;
    const keystrokeMetrics = collector ? collector.getSnapshot() : null;
    const autoFlowScore = collector ? collector.computeAutoFlowScore() : null;
    const flowMoments = collector ? collector.detectFlowMoments() : null;

    const session: WritingSession = {
      id: sessionIdRef.current,
      projectId: getProjectId(),
      projectName: projectNameRef.current,
      startedAt: sessionStartRef.current,
      endedAt,
      wordsStart: wordsAtStartRef.current,
      wordsEnd,
      wordsAdded,
      flowScore: null,
      heteronymId: heteronymIdRef.current,
      heteronymName: heteronymNameRef.current,
      keystrokeMetrics,
      autoFlowScore,
      flowMoments: flowMoments && flowMoments.length > 0 ? flowMoments : null,
    };

    addSession(session).catch(() => { /* best effort */ });

    // Award gamification XP for words and session completion
    try {
      let gam = readGamification();
      // XP for words: +10 per 100 words
      const wordXP = Math.floor(wordsAdded / 100) * XP_RATES.WORDS_100;
      if (wordXP > 0) {
        gam = { ...gam, xp: awardXP(gam.xp, 'words', wordXP, `${wordsAdded} words written`) };
      }
      // XP for session completion (≥10 min)
      if (durationMinutes >= 10) {
        gam = { ...gam, xp: awardXP(gam.xp, 'session', XP_RATES.SESSION_COMPLETE, `${Math.round(durationMinutes)}min session`) };
      }
      writeGamification(gam);
    } catch {
      // Best effort — gamification XP should not block session tracking
    }

    // Only show flow score modal for sessions longer than 3 minutes
    if (durationMinutes > MIN_FLOW_SCORE_MINUTES) {
      setPendingFlowScore({ sessionId: session.id });
    }

    sessionIdRef.current = null;
    sessionStartRef.current = null;
  }, [metricsRef]);

  const startSession = useCallback((wordsAtStart: number) => {
    if (isActiveRef.current) return;

    isActiveRef.current = true;
    sessionIdRef.current = crypto.randomUUID();
    sessionStartRef.current = new Date().toISOString();
    wordsAtStartRef.current = wordsAtStart;
    projectNameRef.current = state.title || 'Untitled Project';

    // Capture active heteronym
    const activeId = getActiveHeteronymId();
    const heteronyms = readHeteronyms();
    const active = activeId ? heteronyms.find(h => h.id === activeId) : null;
    heteronymIdRef.current = active?.id ?? null;
    heteronymNameRef.current = active?.name ?? null;

    // Start heartbeat
    heartbeatTimerRef.current = setInterval(() => {
      if (sessionIdRef.current && sessionStartRef.current) {
        saveWipSession({
          id: sessionIdRef.current,
          projectId: getProjectId(),
          projectName: projectNameRef.current,
          startedAt: sessionStartRef.current,
          wordsStart: wordsAtStartRef.current,
          currentWords: lastWordCountRef.current,
          heteronymId: heteronymIdRef.current,
          heteronymName: heteronymNameRef.current,
        });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }, [state.title]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      endSession();
    }, IDLE_TIMEOUT_MS);
  }, [endSession]);

  // Watch totalWordCount changes — auto-start and idle detection
  useEffect(() => {
    const delta = totalWordCount - lastWordCountRef.current;
    lastWordCountRef.current = totalWordCount;

    if (delta > 0) {
      if (!isActiveRef.current) {
        // Initialize baseline on first observation
        if (baselineWordCountRef.current === null) {
          baselineWordCountRef.current = totalWordCount;
          return;
        }

        const sinceBaseline = totalWordCount - baselineWordCountRef.current;
        if (sinceBaseline >= MIN_WORDS_TO_START) {
          startSession(baselineWordCountRef.current);
          resetIdleTimer();
        }
      } else {
        // Already active — reset idle timer on new words
        resetIdleTimer();
      }
    }
  }, [totalWordCount, startSession, resetIdleTimer]);

  // End session on pathname change (navigation)
  useEffect(() => {
    if (pathname !== pathnameRef.current) {
      pathnameRef.current = pathname;
      if (isActiveRef.current) {
        endSession();
      }
      // Reset baseline for new page context
      baselineWordCountRef.current = null;
    }
  }, [pathname, endSession]);

  // WIP recovery on mount
  useEffect(() => {
    const wip = readWipSession();
    if (wip) {
      const wordsAdded = wip.currentWords - wip.wordsStart;
      if (wordsAdded >= MIN_SESSION_WORDS) {
        const recovered: WritingSession = {
          id: wip.id,
          projectId: wip.projectId,
          projectName: wip.projectName,
          startedAt: wip.startedAt,
          endedAt: new Date().toISOString(),
          wordsStart: wip.wordsStart,
          wordsEnd: wip.currentWords,
          wordsAdded,
          flowScore: null,
          heteronymId: wip.heteronymId ?? null,
          heteronymName: wip.heteronymName ?? null,
          keystrokeMetrics: null,
          autoFlowScore: null,
          flowMoments: null,
        };
        addSession(recovered).catch(() => { /* best effort */ });
      }
      clearWipSession();
    }
     
  }, []);

  // beforeunload — save WIP
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isActiveRef.current && sessionIdRef.current && sessionStartRef.current) {
        saveWipSession({
          id: sessionIdRef.current,
          projectId: getProjectId(),
          projectName: projectNameRef.current,
          startedAt: sessionStartRef.current,
          wordsStart: wordsAtStartRef.current,
          currentWords: lastWordCountRef.current,
          heteronymId: heteronymIdRef.current,
          heteronymName: heteronymNameRef.current,
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Cleanup timers on unmount
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, []);

  const dismissFlowScore = useCallback(() => {
    setPendingFlowScore(null);
  }, []);

  return { pendingFlowScore, dismissFlowScore };
}
