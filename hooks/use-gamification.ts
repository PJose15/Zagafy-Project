'use client';

import React, { useState, useCallback, useEffect, useRef, createContext, useContext } from 'react';
import { useStory } from '@/lib/store';
import {
  readGamification,
  writeGamification,
  defaultGamificationState,
  defaultAwardsState,
} from '@/lib/types/gamification';
import type { GamificationState, SprintTheme } from '@/lib/types/gamification';
import { isGamificationState } from '@/lib/types/gamification';
import { awardXP, xpToNextLevel, XP_RATES } from '@/lib/gamification/xp';
import { evaluateChapterAward, evaluateStreakMilestone } from '@/lib/gamification/awards';
import { updateStreak, getStreakWarning } from '@/lib/gamification/writing-streak';
import { refreshQuests, completeQuest as completeQuestFn } from '@/lib/gamification/daily-quests';
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
  streakWarning: string | null;
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

  // Read from localStorage on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const stored = readGamification();

    // readSessions is async (Dexie-backed)
    readSessions().then(sessions => {
      const now = new Date();
      const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const updatedStreak = updateStreak(stored.streak, sessions);
      const updatedQuests = refreshQuests(stored.quests, storyState, todayKey);
      const updatedFinishing = analyzeStory(storyState, stored.finishing.milestones);

      // S5-G1: award STREAK_MILESTONE (7/30/100 days) once per streak run.
      // The marker persists in `awards` and resets when the streak breaks, so
      // reloads never double-award and a rebuilt streak can earn it again.
      const awards = stored.awards ?? defaultAwardsState();
      const streakResult = evaluateStreakMilestone(
        updatedStreak.currentStreak,
        awards.streakMilestoneAwarded,
      );
      const updatedXP = streakResult.milestone
        ? awardXP(stored.xp, 'streak', XP_RATES.STREAK_MILESTONE, `${streakResult.milestone}-day streak`)
        : stored.xp;

      const updated: GamificationState = {
        ...stored,
        xp: updatedXP,
        streak: updatedStreak,
        quests: updatedQuests,
        finishing: updatedFinishing,
        awards: { ...awards, streakMilestoneAwarded: streakResult.marker },
      };

      setGamification(updated);
      writeGamification(updated);
      setIsLoaded(true);
    });
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

  // Re-read from localStorage when tab regains focus (same-tab writes)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setGamification(readGamification());
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // ─── XP ───
  const doAwardXP = useCallback((type: string, amount: number, metadata?: string) => {
    setGamification((prev) => {
      const next = { ...prev, xp: awardXP(prev.xp, type, amount, metadata) };
      writeGamification(next);
      return next;
    });
  }, []);

  const xpProgress = xpToNextLevel(gamification.xp.totalXP);

  // ─── Streak ───
  const streak = gamification.streak;
  const streakWarning = getStreakWarning(streak, new Date().getHours());

  // ─── Quests ───
  const quests = gamification.quests.quests;

  const completeQuest = useCallback((questId: string) => {
    setGamification((prev) => {
      const quest = prev.quests.quests.find((q) => q.id === questId);
      if (!quest || quest.status !== 'active') return prev;

      const updatedQuests = completeQuestFn(prev.quests, questId);
      const updatedXP = awardXP(prev.xp, 'quest', quest.xpReward, quest.title);
      const next = { ...prev, quests: updatedQuests, xp: updatedXP };
      writeGamification(next);
      return next;
    });
  }, []);

  // ─── Sprints ───
  const activeSprint = gamification.sprints.activeSprint;

  const startSprint = useCallback((theme: SprintTheme, wordsStart: number) => {
    setGamification((prev) => {
      const next = { ...prev, sprints: startSprintFn(prev.sprints, theme, wordsStart) };
      writeGamification(next);
      return next;
    });
  }, []);

  const endSprint = useCallback((wordsEnd: number): SprintResult | null => {
    // Read current state from localStorage for race-free computation
    const current = readGamification();
    const { newState, result } = endSprintFn(current.sprints, wordsEnd);
    if (!result) return null;
    // H9: Scale XP by completion — full XP if target met, proportional otherwise
    const xpAmount = result.targetMet ? 75 : Math.max(5, Math.round(75 * (result.percentOfTarget / 100)));
    const updatedXP = awardXP(current.xp, 'sprint', xpAmount, `Sprint: ${result.wordsWritten} words`);
    const next = { ...current, sprints: newState, xp: updatedXP };
    persist(next);
    return result;
  }, [persist]);

  const abandonSprint = useCallback(() => {
    setGamification((prev) => {
      const next = { ...prev, sprints: abandonSprintFn(prev.sprints) };
      writeGamification(next);
      return next;
    });
  }, []);

  // ─── Finishing Engine ───
  const finishing = gamification.finishing;

  const refreshFinishing = useCallback(() => {
    setGamification((prev) => {
      const next = { ...prev, finishing: analyzeStory(storyState, prev.finishing.milestones) };
      writeGamification(next);
      return next;
    });
  }, [storyState]);

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
    setGamification((prev) => {
      const awards = prev.awards ?? defaultAwardsState();
      const result = evaluateChapterAward(storyState.chapters ?? [], awards.chapterHighWater);
      if (result.newlyFinished === 0 && result.newHighWater === awards.chapterHighWater) return prev;
      const next: GamificationState = {
        ...prev,
        xp: result.newlyFinished > 0
          ? awardXP(
              prev.xp,
              'chapter',
              result.newlyFinished * XP_RATES.CHAPTER_FINISHED,
              result.newlyFinished === 1 ? 'Chapter finished' : `${result.newlyFinished} chapters finished`,
            )
          : prev.xp,
        awards: { ...awards, chapterHighWater: result.newHighWater },
      };
      writeGamification(next);
      return next;
    });
  }, [isLoaded, storyState.chapters]);

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
