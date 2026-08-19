'use client';

import React, { useState, useCallback, useEffect, useRef, createContext, useContext } from 'react';
import { useStory } from '@/lib/store';
import {
  readGamification,
  writeGamification,
  defaultGamificationState,
} from '@/lib/types/gamification';
import type { GamificationState, SprintTheme } from '@/lib/types/gamification';
import { isGamificationState } from '@/lib/types/gamification';
// L17: Removed unused calculateLevel import
import { awardXP, xpToNextLevel } from '@/lib/gamification/xp';
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
  refreshFromStorage: () => void;
  persistError: boolean;
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

      const updated: GamificationState = {
        ...stored,
        streak: updatedStreak,
        quests: updatedQuests,
        finishing: updatedFinishing,
      };

      setGamification(updated);
      writeGamification(updated);
      setIsLoaded(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [persistError, setPersistError] = useState(false);

  // Persist on every mutation, capturing quota failures so they aren't silent.
  const persist = useCallback((next: GamificationState) => {
    setGamification(next);
    const ok = writeGamification(next);
    setPersistError(!ok);
  }, []);

  // Race-safe read-modify-write: read the latest state from storage (not the
  // possibly-stale React snapshot) before applying the mutation, so a concurrent
  // write from another tab isn't clobbered. Surfaces quota failures via persist.
  const mutate = useCallback((fn: (current: GamificationState) => GamificationState) => {
    persist(fn(readGamification()));
  }, [persist]);

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
    mutate((prev) => ({ ...prev, xp: awardXP(prev.xp, type, amount, metadata) }));
  }, [mutate]);

  const xpProgress = xpToNextLevel(gamification.xp.totalXP);

  // ─── Streak ───
  const streak = gamification.streak;
  const streakWarning = getStreakWarning(streak, new Date().getHours());

  // ─── Quests ───
  const quests = gamification.quests.quests;

  const completeQuest = useCallback((questId: string) => {
    mutate((prev) => {
      const quest = prev.quests.quests.find((q) => q.id === questId);
      if (!quest || quest.status !== 'active') return prev;
      const updatedQuests = completeQuestFn(prev.quests, questId);
      const updatedXP = awardXP(prev.xp, 'quest', quest.xpReward, quest.title);
      return { ...prev, quests: updatedQuests, xp: updatedXP };
    });
  }, [mutate]);

  // ─── Sprints ───
  const activeSprint = gamification.sprints.activeSprint;

  const startSprint = useCallback((theme: SprintTheme, wordsStart: number) => {
    mutate((prev) => ({ ...prev, sprints: startSprintFn(prev.sprints, theme, wordsStart) }));
  }, [mutate]);

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
    mutate((prev) => ({ ...prev, sprints: abandonSprintFn(prev.sprints) }));
  }, [mutate]);

  // ─── Finishing Engine ───
  const finishing = gamification.finishing;

  const refreshFinishing = useCallback(() => {
    mutate((prev) => ({ ...prev, finishing: analyzeStory(storyState, prev.finishing.milestones) }));
  }, [mutate, storyState]);

  // Re-read gamification state from storage on demand. Used after code paths that
  // write XP directly to localStorage outside this provider (e.g. session-tracker
  // end-of-session awards), so the UI reflects them without waiting for a tab blur.
  const refreshFromStorage = useCallback(() => {
    setGamification(readGamification());
  }, []);

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
    refreshFromStorage,
    persistError,
  };
}

// ─── Provider ───

export function GamificationProvider({ children }: { children: React.ReactNode }) {
  const api = useGamificationInternal();
  const banner = api.persistError
    ? React.createElement(
        'div',
        {
          role: 'alert',
          'aria-live': 'polite',
          className:
            'fixed bottom-0 left-0 right-0 z-[100] bg-amber-900/90 text-amber-100 text-xs text-center px-4 py-1.5 backdrop-blur',
        },
        'Progress (XP, streaks, quests) could not be saved — your storage may be full.'
      )
    : null;
  return React.createElement(GamificationContext.Provider, { value: api }, banner, children);
}

// ─── Public hook ───

export function useGamification(): GamificationAPI {
  const ctx = useContext(GamificationContext);
  if (!ctx) {
    throw new Error('useGamification must be used within a GamificationProvider');
  }
  return ctx;
}
