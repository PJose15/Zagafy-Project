'use client';

import React, { useState, useCallback, useEffect, useRef, createContext, useContext } from 'react';
import { useStory } from '@/lib/store';
import {
  readGamification,
  writeGamification,
  defaultGamificationState,
  defaultAwardsState,
  GAMIFICATION_UPDATED_EVENT,
} from '@/lib/types/gamification';
import type { GamificationState, SprintTheme } from '@/lib/types/gamification';
import { isGamificationState } from '@/lib/types/gamification';
import { awardXP, xpToNextLevel, XP_RATES } from '@/lib/gamification/xp';
import { evaluateChapterAward, evaluateStreakMilestone } from '@/lib/gamification/awards';
import { updateStreak, getStreakWarningInfo } from '@/lib/gamification/writing-streak';
import type { StreakWarning } from '@/lib/gamification/writing-streak';
import { refreshQuests, completeQuest as completeQuestFn, regeneratePlaceholderQuests } from '@/lib/gamification/daily-quests';
import { formatDateKey } from '@/lib/gamification/date-utils';
import { startSprint as startSprintFn, endSprint as endSprintFn, abandonSprint as abandonSprintFn } from '@/lib/gamification/sprints';
import type { SprintResult } from '@/lib/gamification/sprints';
import { analyzeStory } from '@/lib/gamification/finishing-engine';
import { readSessions } from '@/lib/types/writing-session';

// ─── Return type ───

interface GamificationAPI {
  gamification: GamificationState;
  isLoaded: boolean;
  xpProgress: { current: number; needed: number; progress: number };
  awardXP: (type: string, amount: number, metadata?: string) => void;
  streak: GamificationState['streak'];
  streakWarning: StreakWarning | null;
  quests: GamificationState['quests']['quests'];
  completeQuest: (questId: string) => void;
  activeSprint: GamificationState['sprints']['activeSprint'];
  startSprint: (theme: SprintTheme, wordsStart: number) => void;
  endSprint: (wordsEnd: number) => SprintResult | null;
  abandonSprint: () => void;
  finishing: GamificationState['finishing'];
  refreshFinishing: () => void;
}

// ─── Context ───

const GamificationContext = createContext<GamificationAPI | null>(null);

// ─── Internal hook (creates the actual state) ───

function useGamificationInternal(): GamificationAPI {
  const { state: storyState } = useStory();
  const [gamification, setGamification] = useState<GamificationState>(defaultGamificationState);
  const [isLoaded, setIsLoaded] = useState(false); // M15: track hydration
  const initializedRef = useRef(false);

  // Every provider mutation merges over a fresh localStorage read (the
  // endSprint pattern): the session tracker writes XP straight to
  // localStorage in the same tab, so mutating from React state alone would
  // clobber those awards. When `fn` returns its input unchanged we skip the
  // setState too — readGamification() always allocates a new object, and
  // churning identity would re-render on every story change.
  const mutate = useCallback((fn: (current: GamificationState) => GamificationState) => {
    const current = readGamification();
    const next = fn(current);
    if (next === current) return;
    writeGamification(next);
    setGamification(next);
  }, []);

  // Streak / quests / finishing / one-shot awards evaluation. Runs on mount,
  // when the session tracker signals a completed session (same-tab event),
  // and on day rollover — all merge over a fresh localStorage read.
  const evaluateDaily = useCallback(async () => {
    // readSessions is async (Dexie-backed); read the blob AFTER awaiting so
    // any direct write that landed in the meantime is merged, not clobbered.
    const sessions = await readSessions();
    const todayKey = formatDateKey(new Date());
    const current = readGamification();

    const updatedStreak = updateStreak(current.streak, sessions);
    const updatedQuests = regeneratePlaceholderQuests(
      refreshQuests(current.quests, storyState, todayKey),
      storyState,
    );
    const updatedFinishing = analyzeStory(storyState, current.finishing.milestones);

    // S5-G1: award STREAK_MILESTONE (7/30/100 days) once per streak run.
    // The marker persists in `awards` and resets when the streak breaks, so
    // reloads never double-award and a rebuilt streak can earn it again.
    const awards = current.awards ?? defaultAwardsState();
    const streakResult = evaluateStreakMilestone(
      updatedStreak.currentStreak,
      awards.streakMilestoneAwarded,
    );
    const updatedXP = streakResult.milestone
      ? awardXP(current.xp, 'streak', XP_RATES.STREAK_MILESTONE, `${streakResult.milestone}-day streak`)
      : current.xp;

    const updated: GamificationState = {
      ...current,
      xp: updatedXP,
      streak: updatedStreak,
      quests: updatedQuests,
      finishing: updatedFinishing,
      awards: { ...awards, streakMilestoneAwarded: streakResult.marker },
    };

    writeGamification(updated);
    setGamification(updated);
  }, [storyState]);

  // Read from localStorage on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    evaluateDaily().then(() => setIsLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every mutation
  const persist = useCallback((next: GamificationState) => {
    setGamification(next);
    writeGamification(next);
  }, []);

  // Sync state from cross-tab localStorage writes
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'zagafy_gamification' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (isGamificationState(parsed)) setGamification(parsed);
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Re-read from localStorage when tab regains focus (same-tab writes). If a
  // long-lived tab crossed midnight while hidden, the stored day key no longer
  // matches — run the full streak/quest evaluation (cheap date-key comparison
  // keeps the common no-rollover path light).
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const current = readGamification();
      setGamification(current);
      if (current.quests.currentDate !== formatDateKey(new Date())) {
        evaluateDaily();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [evaluateDaily]);

  // Same-tab writes from the session tracker (storage events are cross-tab
  // only): re-read the just-awarded XP and re-evaluate streak/quests so
  // todayQualified flips right after a qualifying session, not on next reload.
  useEffect(() => {
    const handleUpdated = () => { evaluateDaily(); };
    window.addEventListener(GAMIFICATION_UPDATED_EVENT, handleUpdated);
    return () => window.removeEventListener(GAMIFICATION_UPDATED_EVENT, handleUpdated);
  }, [evaluateDaily]);

  // ─── XP ───
  const doAwardXP = useCallback((type: string, amount: number, metadata?: string) => {
    mutate((current) => ({ ...current, xp: awardXP(current.xp, type, amount, metadata) }));
  }, [mutate]);

  const xpProgress = xpToNextLevel(gamification.xp.totalXP);

  // ─── Streak ───
  const streak = gamification.streak;
  const streakWarning = getStreakWarningInfo(streak, new Date().getHours());

  // ─── Quests ───
  const quests = gamification.quests.quests;

  const completeQuest = useCallback((questId: string) => {
    mutate((current) => {
      const quest = current.quests.quests.find((q) => q.id === questId);
      if (!quest || quest.status !== 'active') return current;

      const updatedQuests = completeQuestFn(current.quests, questId);
      const updatedXP = awardXP(current.xp, 'quest', quest.xpReward, quest.title);
      return { ...current, quests: updatedQuests, xp: updatedXP };
    });
  }, [mutate]);

  // ─── Sprints ───
  const activeSprint = gamification.sprints.activeSprint;

  const startSprint = useCallback((theme: SprintTheme, wordsStart: number) => {
    mutate((current) => ({ ...current, sprints: startSprintFn(current.sprints, theme, wordsStart) }));
  }, [mutate]);

  const endSprint = useCallback((wordsEnd: number): SprintResult | null => {
    // Read current state from localStorage for race-free computation
    const current = readGamification();
    const { newState, result } = endSprintFn(current.sprints, wordsEnd);
    if (!result) return null;
    // H9: Scale XP by completion — full XP if target met, proportional otherwise
    const xpAmount = result.targetMet
      ? XP_RATES.SPRINT_COMPLETE
      : Math.max(5, Math.round(XP_RATES.SPRINT_COMPLETE * (result.percentOfTarget / 100)));
    const updatedXP = awardXP(current.xp, 'sprint', xpAmount, `Sprint: ${result.wordsWritten} words`);
    const next = { ...current, sprints: newState, xp: updatedXP };
    persist(next);
    return result;
  }, [persist]);

  const abandonSprint = useCallback(() => {
    mutate((current) => ({ ...current, sprints: abandonSprintFn(current.sprints) }));
  }, [mutate]);

  // ─── Finishing Engine ───
  const finishing = gamification.finishing;

  const refreshFinishing = useCallback(() => {
    mutate((current) => ({ ...current, finishing: analyzeStory(storyState, current.finishing.milestones) }));
  }, [mutate, storyState]);

  // REG-7: keep the finishing analysis in sync with the story. The mount effect
  // seeds `finishing` once, but milestone progress and novel-completion detection
  // must advance live as the writer adds chapters/characters/words — and must also
  // recover when the story hydrates from Dexie *after* this provider mounts
  // (otherwise it analyzes an empty story and stays stale). `refreshFinishing` is
  // memoized on `storyState`, so this re-runs whenever the story changes. It only
  // mutates gamification state (never the story), so there is no update loop.
  useEffect(() => {
    if (!isLoaded) return;
    refreshFinishing();
  }, [isLoaded, refreshFinishing]);

  // S5-G1: award CHAPTER_FINISHED as chapters cross the finished bar (500+
  // words, matching the finishing engine). The persisted high-water mark makes
  // this idempotent across reloads and blocks delete/re-add farming; running on
  // story changes (not just mount) awards live as the writer works and after a
  // late Dexie hydration.
  useEffect(() => {
    if (!isLoaded) return;
    mutate((current) => {
      const awards = current.awards ?? defaultAwardsState();
      const result = evaluateChapterAward(storyState.chapters ?? [], awards.chapterHighWater);
      if (result.newlyFinished === 0 && result.newHighWater === awards.chapterHighWater) return current;
      return {
        ...current,
        xp: result.newlyFinished > 0
          ? awardXP(
              current.xp,
              'chapter',
              result.newlyFinished * XP_RATES.CHAPTER_FINISHED,
              result.newlyFinished === 1 ? 'Chapter finished' : `${result.newlyFinished} chapters finished`,
            )
          : current.xp,
        awards: { ...awards, chapterHighWater: result.newHighWater },
      };
    });
  }, [isLoaded, storyState.chapters, mutate]);

  // Fix 3: if today's quests were generated before the story hydrated (generic
  // placeholder context), regenerate them once real story data arrives.
  useEffect(() => {
    if (!isLoaded) return;
    mutate((current) => {
      const quests = regeneratePlaceholderQuests(current.quests, storyState);
      return quests === current.quests ? current : { ...current, quests };
    });
  }, [isLoaded, storyState, mutate]);

  return {
    gamification,
    isLoaded,
    // XP
    xpProgress,
    awardXP: doAwardXP,
    // Streak
    streak,
    streakWarning,
    // Quests
    quests,
    completeQuest,
    // Sprints
    activeSprint,
    startSprint,
    endSprint,
    abandonSprint,
    // Finishing
    finishing,
    refreshFinishing,
  };
}

// ─── Provider ───

export function GamificationProvider({ children }: { children: React.ReactNode }) {
  const api = useGamificationInternal();
  return React.createElement(GamificationContext.Provider, { value: api }, children);
}

// ─── Public hook ───

export function useGamification(): GamificationAPI {
  const ctx = useContext(GamificationContext);
  if (!ctx) {
    throw new Error('useGamification must be used within a GamificationProvider');
  }
  return ctx;
}
