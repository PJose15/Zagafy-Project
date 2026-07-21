import { describe, it, expect } from 'vitest';
import {
  isQualifyingSession,
  updateStreak,
  getStreakWarning,
  getStreakWarningInfo,
  isStreakMilestone,
  STREAK_MILESTONES,
} from '@/lib/gamification/writing-streak';
import type { WritingStreakState } from '@/lib/types/gamification';
import type { WritingSession } from '@/lib/types/writing-session';

function makeSession(startedAt: string, endedAt: string): WritingSession {
  return {
    id: 'test',
    projectId: 'p1',
    projectName: 'Test',
    startedAt,
    endedAt,
    wordsStart: 0,
    wordsEnd: 100,
    wordsAdded: 100,
    flowScore: null,
    heteronymId: null,
    heteronymName: null,
    keystrokeMetrics: null,
    autoFlowScore: null,
    flowMoments: null,
  };
}

function makeSessionOnDate(dateStr: string, durationMinutes: number): WritingSession {
  const start = new Date(`${dateStr}T10:00:00`);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return makeSession(start.toISOString(), end.toISOString());
}

const emptyStreak: WritingStreakState = {
  currentStreak: 0,
  longestStreak: 0,
  lastQualifyingDate: '',
  todayQualified: false,
  streakHistory: [],
};

describe('isQualifyingSession', () => {
  it('returns true for session >= 10 minutes', () => {
    const session = makeSession('2025-01-01T10:00:00Z', '2025-01-01T10:10:00Z');
    expect(isQualifyingSession(session)).toBe(true);
  });

  it('returns false for session < 10 minutes', () => {
    const session = makeSession('2025-01-01T10:00:00Z', '2025-01-01T10:09:59Z');
    expect(isQualifyingSession(session)).toBe(false);
  });

  it('returns true for exactly 10 minutes', () => {
    const session = makeSession('2025-01-01T10:00:00Z', '2025-01-01T10:10:00Z');
    expect(isQualifyingSession(session)).toBe(true);
  });

  it('returns false for invalid dates', () => {
    const session = makeSession('invalid', 'invalid');
    expect(isQualifyingSession(session)).toBe(false);
  });

  it('returns true for long session', () => {
    const session = makeSession('2025-01-01T10:00:00Z', '2025-01-01T12:00:00Z');
    expect(isQualifyingSession(session)).toBe(true);
  });
});

describe('updateStreak', () => {
  it('returns 0 streak with no sessions', () => {
    const result = updateStreak(emptyStreak, [], new Date('2025-01-15'));
    expect(result.currentStreak).toBe(0);
    expect(result.todayQualified).toBe(false);
  });

  it('returns streak of 1 for qualifying session today', () => {
    const today = new Date('2025-01-15T14:00:00');
    const sessions = [makeSessionOnDate('2025-01-15', 15)];
    const result = updateStreak(emptyStreak, sessions, today);
    expect(result.currentStreak).toBe(1);
    expect(result.todayQualified).toBe(true);
  });

  it('returns streak of 3 for consecutive days', () => {
    const today = new Date('2025-01-15T14:00:00');
    const sessions = [
      makeSessionOnDate('2025-01-13', 15),
      makeSessionOnDate('2025-01-14', 12),
      makeSessionOnDate('2025-01-15', 20),
    ];
    const result = updateStreak(emptyStreak, sessions, today);
    expect(result.currentStreak).toBe(3);
    expect(result.todayQualified).toBe(true);
  });

  it('breaks streak on gap day', () => {
    const today = new Date('2025-01-15T14:00:00');
    const sessions = [
      makeSessionOnDate('2025-01-12', 15),
      // gap on Jan 13
      makeSessionOnDate('2025-01-14', 12),
      makeSessionOnDate('2025-01-15', 20),
    ];
    const result = updateStreak(emptyStreak, sessions, today);
    expect(result.currentStreak).toBe(2);
  });

  it('counts streak from yesterday if today not qualified', () => {
    const today = new Date('2025-01-15T14:00:00');
    const sessions = [
      makeSessionOnDate('2025-01-13', 15),
      makeSessionOnDate('2025-01-14', 12),
    ];
    const result = updateStreak(emptyStreak, sessions, today);
    expect(result.currentStreak).toBe(2);
    expect(result.todayQualified).toBe(false);
  });

  it('ignores non-qualifying sessions', () => {
    const today = new Date('2025-01-15T14:00:00');
    const sessions = [
      makeSessionOnDate('2025-01-15', 5), // too short
    ];
    const result = updateStreak(emptyStreak, sessions, today);
    expect(result.currentStreak).toBe(0);
    expect(result.todayQualified).toBe(false);
  });

  it('updates longestStreak', () => {
    const existing: WritingStreakState = { ...emptyStreak, longestStreak: 2 };
    const today = new Date('2025-01-15T14:00:00');
    const sessions = [
      makeSessionOnDate('2025-01-12', 15),
      makeSessionOnDate('2025-01-13', 15),
      makeSessionOnDate('2025-01-14', 15),
      makeSessionOnDate('2025-01-15', 15),
    ];
    const result = updateStreak(existing, sessions, today);
    expect(result.currentStreak).toBe(4);
    expect(result.longestStreak).toBe(4);
  });

  it('preserves longestStreak when current is smaller', () => {
    const existing: WritingStreakState = { ...emptyStreak, longestStreak: 10 };
    const today = new Date('2025-01-15T14:00:00');
    const sessions = [makeSessionOnDate('2025-01-15', 15)];
    const result = updateStreak(existing, sessions, today);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(10);
  });

  it('generates streakHistory with 90 entries', () => {
    const today = new Date('2025-01-15T14:00:00');
    const result = updateStreak(emptyStreak, [], today);
    expect(result.streakHistory).toHaveLength(90);
  });

  it('marks qualifying days in streakHistory', () => {
    const today = new Date('2025-01-15T14:00:00');
    const sessions = [makeSessionOnDate('2025-01-15', 15)];
    const result = updateStreak(emptyStreak, sessions, today);
    const todayEntry = result.streakHistory.find((d) => d.dateKey === '2025-01-15');
    expect(todayEntry?.qualified).toBe(true);
  });

  it('handles streak correctly when yesterday was qualifying but today is not yet', () => {
    const today = new Date('2025-01-15T08:00:00');
    const sessions = [
      makeSessionOnDate('2025-01-14', 15),
    ];
    const result = updateStreak(emptyStreak, sessions, today);
    expect(result.currentStreak).toBe(1);
    expect(result.todayQualified).toBe(false);
  });
});

describe('getStreakWarning', () => {
  it('returns null if today is qualified', () => {
    const state: WritingStreakState = { ...emptyStreak, currentStreak: 5, todayQualified: true };
    expect(getStreakWarning(state, 21)).toBeNull();
  });

  it('returns null if no active streak', () => {
    const state: WritingStreakState = { ...emptyStreak, currentStreak: 0, todayQualified: false };
    expect(getStreakWarning(state, 21)).toBeNull();
  });

  it('returns warning after 8pm', () => {
    const state: WritingStreakState = { ...emptyStreak, currentStreak: 5, todayQualified: false };
    const warning = getStreakWarning(state, 20);
    expect(warning).toContain('expires at midnight');
    expect(warning).toContain('5-day');
  });

  it('returns softer warning after 6pm', () => {
    const state: WritingStreakState = { ...emptyStreak, currentStreak: 3, todayQualified: false };
    const warning = getStreakWarning(state, 18);
    expect(warning).toContain('maintain');
    expect(warning).toContain('3-day');
  });

  it('returns null before 6pm', () => {
    const state: WritingStreakState = { ...emptyStreak, currentStreak: 5, todayQualified: false };
    expect(getStreakWarning(state, 17)).toBeNull();
  });
});

describe('getStreakWarningInfo (i18n codes)', () => {
  it('returns atRisk code with days after 8pm', () => {
    const state: WritingStreakState = { ...emptyStreak, currentStreak: 5, todayQualified: false };
    expect(getStreakWarningInfo(state, 20)).toEqual({
      key: 'streakWarning.atRisk',
      params: { days: 5 },
    });
  });

  it('returns reminder code with days after 6pm', () => {
    const state: WritingStreakState = { ...emptyStreak, currentStreak: 3, todayQualified: false };
    expect(getStreakWarningInfo(state, 18)).toEqual({
      key: 'streakWarning.reminder',
      params: { days: 3 },
    });
  });

  it('returns null when qualified, streak-less, or too early', () => {
    expect(getStreakWarningInfo({ ...emptyStreak, currentStreak: 5, todayQualified: true }, 21)).toBeNull();
    expect(getStreakWarningInfo({ ...emptyStreak, currentStreak: 0, todayQualified: false }, 21)).toBeNull();
    expect(getStreakWarningInfo({ ...emptyStreak, currentStreak: 5, todayQualified: false }, 17)).toBeNull();
  });
});

describe('isStreakMilestone', () => {
  it('returns true for 7, 30, 100', () => {
    expect(isStreakMilestone(7)).toBe(true);
    expect(isStreakMilestone(30)).toBe(true);
    expect(isStreakMilestone(100)).toBe(true);
  });

  it('returns false for other values', () => {
    expect(isStreakMilestone(1)).toBe(false);
    expect(isStreakMilestone(10)).toBe(false);
    expect(isStreakMilestone(50)).toBe(false);
  });
});

describe('STREAK_MILESTONES', () => {
  it('contains expected milestones', () => {
    expect(STREAK_MILESTONES).toEqual([7, 30, 100]);
  });
});
