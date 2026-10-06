'use client';

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useStory } from '@/lib/store';
import {
  saveCompletedSession,
  recoverSessions,
  getProjectId,
  saveWipSession,
  clearWipSession,
} from '@/lib/types/writing-session';
import type { WritingSession, FlowScore } from '@/lib/types/writing-session';
import { getActiveHeteronymId, readHeteronyms } from '@/lib/types/heteronym';
import type { MetricsCollector } from '@/lib/flow-metrics';
import { readGamification, writeGamification, GAMIFICATION_UPDATED_EVENT } from '@/lib/types/gamification';
import { awardXP, XP_RATES } from '@/lib/gamification/xp';
import { wordCount } from '@/lib/editor/serialization';

const MIN_WORDS_TO_START = 10;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
const MIN_SESSION_WORDS = 5; // minimum words added to count as a session
const MIN_FLOW_SCORE_MINUTES = 3; // minimum session length to show flow score modal

interface SessionTrackerOptions {
  metricsCollectorRef?: React.RefObject<MetricsCollector | null>;
}

interface SessionTrackerState {
  pendingFlowScore: { sessionId: string; projectId: string } | null;
  recoveryError: boolean;
  retryRecovery: () => void;
  dismissFlowScore: () => void;
}

export function useSessionTracker(options?: SessionTrackerOptions): SessionTrackerState {
  const metricsRef = options?.metricsCollectorRef;
  const { state } = useStory();
  const pathname = usePathname();

  const [storedFlowScore, setPendingFlowScore] = useState<{ sessionId: string; projectId: string } | null>(null);
  const [recoveryError, setRecoveryError] = useState(false);
  const failedSessionsRef = useRef(new Map<string, WritingSession>());
  const projectId = getProjectId();
  const sessionProjectRef = useRef(projectId);
  const pendingFlowScore = storedFlowScore?.projectId === projectId ? storedFlowScore : null;

  // Compute total word count across all chapters (CB-07: chapter.content is
  // Lexical JSON — wordCount() decodes it instead of splitting raw JSON)
  const totalWordCount = useMemo(() => {
    return state.chapters.reduce((sum, ch) => sum + wordCount(ch.content), 0);
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

    // Only save if meaningful writing occurred
    if (wordsAdded < MIN_SESSION_WORDS) {
      clearWipSession(sessionIdRef.current);
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
      projectId: sessionProjectRef.current,
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

    saveCompletedSession(session).then(() => {
      failedSessionsRef.current.delete(session.id);
      setRecoveryError(failedSessionsRef.current.size > 0);
    // Award gamification XP for words and session completion
    try {
      let gam = readGamification();
      // XP for words: +10 per 100 words, but only for words that push this
      // project's total past its high-water mark. Awarding on raw session
      // `wordsAdded` let a writer farm XP by deleting then re-typing the same
      // words (the baseline resets on navigation); gating on a persistent
      // per-project high-water blocks that while still rewarding real new words.
      const projectId = session.projectId;
      const awards = gam.awards ?? { streakMilestoneAwarded: 0, chapterHighWater: 0, wordHighWaterByProject: {} };
      const hwByProject = awards.wordHighWaterByProject ?? {};
      const highWater = hwByProject[projectId] ?? 0;
      const newWords = Math.max(0, wordsEnd - highWater);
      const awardedWords = Math.floor(newWords / 100) * 100;
      if (awardedWords > 0) {
        const wordXP = (awardedWords / 100) * XP_RATES.WORDS_100;
        gam = {
          ...gam,
          xp: awardXP(gam.xp, 'words', wordXP, `${awardedWords} words written`),
          awards: {
            ...awards,
            wordHighWaterByProject: { ...hwByProject, [projectId]: highWater + awardedWords },
          },
        };
      }
      // XP for session completion (≥10 min)
      if (durationMinutes >= 10) {
        gam = { ...gam, xp: awardXP(gam.xp, 'session', XP_RATES.SESSION_COMPLETE, `${Math.round(durationMinutes)}min session`) };
      }
      writeGamification(gam);
    } catch {
      // Best effort — gamification XP should not block session tracking
    }

      window.dispatchEvent(new Event(GAMIFICATION_UPDATED_EVENT));
      if (durationMinutes > MIN_FLOW_SCORE_MINUTES && getProjectId() === session.projectId) {
        setPendingFlowScore({ sessionId: session.id, projectId: session.projectId });
      }
    }).catch(() => { failedSessionsRef.current.set(session.id, session); setRecoveryError(true); });

    sessionIdRef.current = null;
    sessionStartRef.current = null;
  }, [metricsRef]);

  const startSession = useCallback((wordsAtStart: number) => {
    if (isActiveRef.current) return;

    isActiveRef.current = true;
    sessionProjectRef.current = getProjectId();
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

    if (!saveWipSession({ id: sessionIdRef.current, projectId: sessionProjectRef.current, projectName: projectNameRef.current,
      startedAt: sessionStartRef.current, wordsStart: wordsAtStartRef.current, currentWords: lastWordCountRef.current,
      heteronymId: heteronymIdRef.current, heteronymName: heteronymNameRef.current })) setRecoveryError(true);

    // Start heartbeat
    heartbeatTimerRef.current = setInterval(() => {
      if (sessionIdRef.current && sessionStartRef.current) {
        const checkpointed = saveWipSession({
          id: sessionIdRef.current,
          projectId: sessionProjectRef.current,
          projectName: projectNameRef.current,
          startedAt: sessionStartRef.current,
          wordsStart: wordsAtStartRef.current,
          currentWords: lastWordCountRef.current,
          heteronymId: heteronymIdRef.current,
          heteronymName: heteronymNameRef.current,
        });
        if (!checkpointed) setRecoveryError(true);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }, [state.title]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      endSession();
    }, IDLE_TIMEOUT_MS);
  }, [endSession]);

  // End the old session before the word-count effect observes a new project.
  useEffect(() => {
    if (sessionProjectRef.current !== projectId) {
      endSession();
      sessionProjectRef.current = projectId;
      lastWordCountRef.current = totalWordCount;
      baselineWordCountRef.current = null;
    }
  }, [projectId, totalWordCount, endSession]);

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

  const retryRecovery = useCallback(() => {
    // Retry rich in-memory records before disk WIP so a failed checkpoint write
    // does not force loss of metrics or the original completion time.
    void (async () => {
      try {
        for (const session of failedSessionsRef.current.values()) {
          await saveCompletedSession(session);
          failedSessionsRef.current.delete(session.id);
        }
        await recoverSessions();
        setRecoveryError(false);
      } catch { setRecoveryError(true); }
    })();
  }, []);

  useEffect(() => {
    retryRecovery();
    const retry = setInterval(retryRecovery, 60_000);
    return () => clearInterval(retry);
  }, [retryRecovery]);

  // beforeunload — save WIP
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isActiveRef.current && sessionIdRef.current && sessionStartRef.current) {
        saveWipSession({
          id: sessionIdRef.current,
          projectId: sessionProjectRef.current,
          projectName: projectNameRef.current,
          startedAt: sessionStartRef.current,
          wordsStart: wordsAtStartRef.current,
          currentWords: lastWordCountRef.current,
          heteronymId: heteronymIdRef.current,
          heteronymName: heteronymNameRef.current,
          abandoned: true,
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

  return { pendingFlowScore, dismissFlowScore, recoveryError, retryRecovery };
}
