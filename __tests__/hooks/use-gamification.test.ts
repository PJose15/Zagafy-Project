import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// Mock localStorage
const store: Record<string, string> = {};
beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  });
  vi.stubGlobal('crypto', { randomUUID: () => `uuid-${Date.now()}-${Math.random()}` });
});

// Mock useStory
const mockStoryState = {
  title: 'Test Story',
  synopsis: 'A test',
  chapters: [],
  characters: [],
  active_conflicts: [],
  foreshadowing_elements: [],
  open_loops: [],
  locations: [],
  scenes: [],
  timeline_events: [],
  world_rules: [],
  themes: [],
  canon_items: [],
  ambiguities: [],
  chat_messages: [],
  world_bible: [],
  genre: [],
  author_intent: '',
  style_profile: '',
  language: 'en',
};

vi.mock('@/lib/store', () => ({
  useStory: () => ({
    state: mockStoryState,
    setState: vi.fn(),
    updateField: vi.fn(),
  }),
  StoryProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

// Mutable so individual tests can seed sessions (e.g. to build a streak).
const mockSessions: unknown[] = [];
vi.mock('@/lib/types/writing-session', () => ({
  readSessions: () => Promise.resolve(mockSessions),
}));

import { useGamification, GamificationProvider } from '@/hooks/use-gamification';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(GamificationProvider, null, children);

describe('useGamification', () => {
  it('initializes with default state', () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    expect(result.current.gamification.xp.totalXP).toBe(0);
    expect(result.current.gamification.xp.level).toBe(1);
    expect(result.current.streak.currentStreak).toBe(0);
  });

  it('exposes xpProgress', () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    expect(result.current.xpProgress).toHaveProperty('current');
    expect(result.current.xpProgress).toHaveProperty('needed');
    expect(result.current.xpProgress).toHaveProperty('progress');
  });

  it('awards XP', () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    act(() => {
      result.current.awardXP('test', 50);
    });
    expect(result.current.gamification.xp.totalXP).toBe(50);
  });

  it('generates daily quests on mount', async () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    await waitFor(() => {
      expect(result.current.quests).toHaveLength(3);
    });
  });

  it('completes a quest and awards XP', () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    const questId = result.current.quests[0]?.id;
    if (questId) {
      act(() => {
        result.current.completeQuest(questId);
      });
      const quest = result.current.quests.find((q) => q.id === questId);
      expect(quest?.status).toBe('completed');
      expect(result.current.gamification.xp.totalXP).toBe(50);
    }
  });

  it('starts and abandons a sprint', () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    act(() => {
      result.current.startSprint('quick-focus', 1000);
    });
    expect(result.current.activeSprint).not.toBeNull();
    expect(result.current.activeSprint?.theme).toBe('quick-focus');
    act(() => {
      result.current.abandonSprint();
    });
    expect(result.current.activeSprint).toBeNull();
  });

  it('exposes finishing engine state', () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    expect(result.current.finishing).toHaveProperty('currentPhase');
    expect(result.current.finishing).toHaveProperty('overallProgress');
    expect(result.current.finishing).toHaveProperty('milestones');
  });

  it('persists state to localStorage', () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    act(() => {
      result.current.awardXP('test', 100);
    });
    const stored = JSON.parse(store['zagafy_gamification']);
    expect(stored.xp.totalXP).toBe(100);
  });

  // ── Branch coverage: completeQuest edge cases ──

  it('completeQuest ignores already-completed quest', async () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    await waitFor(() => {
      expect(result.current.quests).toHaveLength(3);
    });

    const questId = result.current.quests[0].id;
    act(() => { result.current.completeQuest(questId); });
    expect(result.current.gamification.xp.totalXP).toBe(50);

    // Complete same quest again — should be no-op
    act(() => { result.current.completeQuest(questId); });
    expect(result.current.gamification.xp.totalXP).toBe(50);
  });

  it('completeQuest ignores nonexistent quest ID', async () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    await waitFor(() => {
      expect(result.current.quests).toHaveLength(3);
    });

    act(() => { result.current.completeQuest('nonexistent-id'); });
    expect(result.current.gamification.xp.totalXP).toBe(0);
  });

  // ── Branch coverage: sprint lifecycle ──

  it('endSprint returns result with XP and clears active sprint', async () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    act(() => { result.current.startSprint('quick-focus', 1000); });
    expect(result.current.activeSprint).not.toBeNull();

    let sprintResult: ReturnType<typeof result.current.endSprint>;
    act(() => { sprintResult = result.current.endSprint(1500); });

    expect(result.current.activeSprint).toBeNull();
    if (sprintResult!) {
      expect(sprintResult.wordsWritten).toBe(500);
    }
  });

  it('endSprint returns null when no active sprint', async () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    // No sprint started — endSprint should return null
    let sprintResult: ReturnType<typeof result.current.endSprint>;
    act(() => { sprintResult = result.current.endSprint(1500); });
    expect(sprintResult!).toBeNull();
  });

  // ── Branch coverage: refreshFinishing ──

  it('refreshFinishing updates finishing state from story', async () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    const initialProgress = result.current.finishing.overallProgress;
    act(() => { result.current.refreshFinishing(); });
    // With empty story state, progress should stay at 0
    expect(result.current.finishing.overallProgress).toBe(initialProgress);
    expect(result.current.finishing).toHaveProperty('currentPhase');
  });

  // ── Branch coverage: streakWarning ──

  it('exposes streakWarning (null for fresh state)', () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    // With default (no streak), warning should be null or an i18n code object
    const w = result.current.streakWarning;
    expect(w === null || (typeof w === 'object' && typeof w.key === 'string')).toBe(true);
  });

  // ── Branch coverage: cross-tab storage sync ──

  it('syncs state from cross-tab storage event with valid JSON', async () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    // Simulate cross-tab storage event with XP=999
    const fakeState = {
      version: 1,
      xp: { totalXP: 999, level: 10, events: [] },
      streak: { currentStreak: 0, longestStreak: 0, lastWritingDate: null, history: [], todayQualified: false, streakHistory: [] },
      quests: { currentDate: '', quests: [], questHistory: [] },
      sprints: { activeSprint: null, sprintHistory: [] },
      finishing: { currentPhase: 'setup', overallProgress: 0, milestones: [], nextSuggestion: '' },
    };

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'zagafy_gamification',
        newValue: JSON.stringify(fakeState),
      }));
    });

    expect(result.current.gamification.xp.totalXP).toBe(999);
  });

  it('ignores cross-tab storage event with invalid JSON', async () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    const xpBefore = result.current.gamification.xp.totalXP;

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'zagafy_gamification',
        newValue: 'not-valid-json{{{',
      }));
    });

    expect(result.current.gamification.xp.totalXP).toBe(xpBefore);
  });

  it('ignores cross-tab storage event for wrong key', async () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    const xpBefore = result.current.gamification.xp.totalXP;

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'some_other_key',
        newValue: '{"xp":{"totalXP":999}}',
      }));
    });

    expect(result.current.gamification.xp.totalXP).toBe(xpBefore);
  });

  it('ignores cross-tab storage event with null newValue', async () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    const xpBefore = result.current.gamification.xp.totalXP;

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'zagafy_gamification',
        newValue: null,
      }));
    });

    expect(result.current.gamification.xp.totalXP).toBe(xpBefore);
  });

  // ── Branch coverage: visibility change ──

  it('re-reads from localStorage on tab visibility change', async () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    // Manually write updated state to localStorage
    const updatedState = {
      version: 1,
      xp: { totalXP: 500, level: 5, events: [] },
      streak: { currentStreak: 0, longestStreak: 0, lastWritingDate: null, history: [], todayQualified: false, streakHistory: [] },
      quests: { currentDate: '', quests: [], questHistory: [] },
      sprints: { activeSprint: null, sprintHistory: [] },
      finishing: { currentPhase: 'setup', overallProgress: 0, milestones: [], nextSuggestion: '' },
    };
    store['zagafy_gamification'] = JSON.stringify(updatedState);

    // Simulate tab becoming visible
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.gamification.xp.totalXP).toBe(500);
  });

  // ── Branch coverage: useGamification outside provider ──

  it('throws when used outside GamificationProvider', () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      renderHook(() => useGamification());
    }).toThrow('useGamification must be used within a GamificationProvider');
    spy.mockRestore();
  });

  // ── Fix 1: same-tab lost-update race (session tracker direct writes) ──

  it('merges provider mutations over same-tab direct localStorage writes (no clobber)', async () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    // Simulate the session tracker awarding XP with a direct write the
    // provider's React state has NOT seen.
    const blob = JSON.parse(store['zagafy_gamification']);
    blob.xp.totalXP = 120;
    store['zagafy_gamification'] = JSON.stringify(blob);

    // The worst offender pre-fix: refreshFinishing wrote from stale React
    // state and clobbered the just-awarded XP.
    act(() => { result.current.refreshFinishing(); });
    expect(JSON.parse(store['zagafy_gamification']).xp.totalXP).toBe(120);

    // Every other mutation must merge too.
    act(() => { result.current.awardXP('test', 5); });
    expect(JSON.parse(store['zagafy_gamification']).xp.totalXP).toBe(125);
  });

  it('re-reads state and re-evaluates streak on the same-tab update event', async () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.streak.todayQualified).toBe(false);

    try {
      // A qualifying (30-min) session lands in the ledger, then the session
      // tracker signals the same-tab event after its direct XP write.
      const start = new Date();
      start.setHours(10, 0, 0, 0);
      const end = new Date(start.getTime() + 30 * 60_000);
      mockSessions.push({
        id: 's-today',
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
        wordsAdded: 300,
      });
      const blob = JSON.parse(store['zagafy_gamification']);
      blob.xp.totalXP = 40;
      store['zagafy_gamification'] = JSON.stringify(blob);

      act(() => {
        window.dispatchEvent(new Event('zagafy:gamification-updated'));
      });

      // Streak flips without a reload AND the direct XP write survives.
      await waitFor(() => expect(result.current.streak.todayQualified).toBe(true));
      expect(result.current.streak.currentStreak).toBe(1);
      expect(result.current.gamification.xp.totalXP).toBe(40);
    } finally {
      mockSessions.length = 0;
    }
  });

  // ── Fix 2: day rollover in a long-lived tab ──

  it('re-runs the daily evaluation on visibilitychange after a day rollover', async () => {
    const { result } = renderHook(() => useGamification(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = fmt(yesterday);
    const todayKey = fmt(new Date());

    // Rewind the stored day key to yesterday, as if the tab slept past midnight.
    const blob = JSON.parse(store['zagafy_gamification']);
    blob.quests.currentDate = yKey;
    blob.quests.quests = blob.quests.quests.map((q: { dateKey: string }) => ({ ...q, dateKey: yKey }));
    store['zagafy_gamification'] = JSON.stringify(blob);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(result.current.gamification.quests.currentDate).toBe(todayKey);
    });
    expect(result.current.quests).toHaveLength(3);
    expect(result.current.quests.every((q) => q.dateKey === todayKey)).toBe(true);
  });

  // ── S5-G1: one-shot CHAPTER_FINISHED / STREAK_MILESTONE awards ──

  describe('one-shot awards (S5-G1)', () => {
    afterEach(() => {
      (mockStoryState.chapters as unknown[]).length = 0;
      mockSessions.length = 0;
    });

    it('awards CHAPTER_FINISHED once per finished chapter, idempotent across remounts', async () => {
      const words = Array.from({ length: 520 }, (_, i) => `w${i}`).join(' ');
      (mockStoryState.chapters as unknown[]).push({ id: 'ch1', title: 'One', content: words, summary: '' });

      const first = renderHook(() => useGamification(), { wrapper });
      await waitFor(() => expect(first.result.current.isLoaded).toBe(true));
      await waitFor(() => expect(first.result.current.gamification.xp.totalXP).toBe(100));
      expect(first.result.current.gamification.xp.events.some((e) => e.type === 'chapter')).toBe(true);
      expect(first.result.current.gamification.awards?.chapterHighWater).toBe(1);
      first.unmount();

      // Same localStorage, fresh mount — the high-water blocks a double award.
      const second = renderHook(() => useGamification(), { wrapper });
      await waitFor(() => expect(second.result.current.isLoaded).toBe(true));
      await waitFor(() => expect(second.result.current.gamification.awards?.chapterHighWater).toBe(1));
      expect(second.result.current.gamification.xp.totalXP).toBe(100);
      second.unmount();
    });

    it('does not award for chapters under the finished bar', async () => {
      const words = Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ');
      (mockStoryState.chapters as unknown[]).push({ id: 'ch1', title: 'Stub', content: words, summary: '' });

      const { result, unmount } = renderHook(() => useGamification(), { wrapper });
      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      expect(result.current.gamification.xp.totalXP).toBe(0);
      unmount();
    });

    it('awards STREAK_MILESTONE once when the streak reaches 7 days', async () => {
      // Seed 7 consecutive local days of qualifying (30-min) sessions.
      for (let i = 0; i < 7; i++) {
        const start = new Date();
        start.setDate(start.getDate() - i);
        start.setHours(10, 0, 0, 0);
        const end = new Date(start.getTime() + 30 * 60_000);
        mockSessions.push({
          id: `s-${i}`,
          startedAt: start.toISOString(),
          endedAt: end.toISOString(),
          wordsAdded: 200,
        });
      }

      const first = renderHook(() => useGamification(), { wrapper });
      await waitFor(() => expect(first.result.current.isLoaded).toBe(true));
      expect(first.result.current.streak.currentStreak).toBe(7);
      expect(first.result.current.gamification.xp.totalXP).toBe(200);
      expect(first.result.current.gamification.xp.events.some((e) => e.type === 'streak')).toBe(true);
      expect(first.result.current.gamification.awards?.streakMilestoneAwarded).toBe(7);
      first.unmount();

      // Remount same day — the marker blocks a double award.
      const second = renderHook(() => useGamification(), { wrapper });
      await waitFor(() => expect(second.result.current.isLoaded).toBe(true));
      expect(second.result.current.gamification.xp.totalXP).toBe(200);
      second.unmount();
    });
  });
});
