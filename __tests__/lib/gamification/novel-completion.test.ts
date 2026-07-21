import { describe, it, expect } from 'vitest';
import {
  checkNovelCompletion,
  generateNovelStats,
} from '@/lib/gamification/finishing-engine';
import type { NovelCompletionStats } from '@/lib/gamification/finishing-engine';
import type { FinishingEngineState } from '@/lib/types/gamification';
import type { Chapter } from '@/lib/store';
import type { WritingSession } from '@/lib/types/writing-session';

// ─── Helpers ───

function makeFinishingState(progress: number): FinishingEngineState {
  return {
    currentPhase: 'resolution',
    overallProgress: progress,
    milestones: [],
    nextSuggestion: '',
  };
}

function makeChapter(wordCount: number, id?: string): Chapter {
  const words = Array.from({ length: wordCount }, (_, i) => `word${i}`).join(' ');
  return { id: id ?? `ch-${Math.random()}`, title: 'Chapter', content: words, summary: '' };
}

function makeSession(overrides: Partial<WritingSession> = {}): WritingSession {
  return {
    id: `s-${Math.random()}`,
    projectId: 'proj-1',
    projectName: 'Test',
    startedAt: '2025-01-10T10:00:00Z',
    endedAt: '2025-01-10T11:30:00Z',
    wordsStart: 0,
    wordsEnd: 500,
    wordsAdded: 500,
    flowScore: 3,
    heteronymId: null,
    heteronymName: null,
    keystrokeMetrics: null,
    autoFlowScore: null,
    flowMoments: null,
    ...overrides,
  };
}

// ─── checkNovelCompletion ───

describe('checkNovelCompletion', () => {
  it('returns true on transition from <100 to 100', () => {
    const prev = makeFinishingState(90);
    const curr = makeFinishingState(100);
    expect(checkNovelCompletion(curr, prev)).toBe(true);
  });

  it('returns false if current is not 100', () => {
    const prev = makeFinishingState(80);
    const curr = makeFinishingState(95);
    expect(checkNovelCompletion(curr, prev)).toBe(false);
  });

  it('returns false if both are 100 (no transition)', () => {
    const prev = makeFinishingState(100);
    const curr = makeFinishingState(100);
    expect(checkNovelCompletion(curr, prev)).toBe(false);
  });

  it('returns true when previous is null and current is 100', () => {
    const curr = makeFinishingState(100);
    expect(checkNovelCompletion(curr, null)).toBe(true);
  });

  it('returns false when previous is null and current is not 100', () => {
    const curr = makeFinishingState(50);
    expect(checkNovelCompletion(curr, null)).toBe(false);
  });

  it('detects transition from 99 to 100', () => {
    expect(checkNovelCompletion(makeFinishingState(100), makeFinishingState(99))).toBe(true);
  });
});

// ─── generateNovelStats ───

describe('generateNovelStats', () => {
  it('computes total word count across chapters', () => {
    const chapters = [makeChapter(100), makeChapter(200), makeChapter(50)];
    const stats = generateNovelStats([], chapters, 'My Book');
    expect(stats.totalWords).toBe(350);
    expect(stats.totalChapters).toBe(3);
  });

  it('returns 0 words for empty chapters', () => {
    const stats = generateNovelStats([], [], 'Test');
    expect(stats.totalWords).toBe(0);
    expect(stats.totalChapters).toBe(0);
  });

  it('counts unique days from sessions', () => {
    const sessions = [
      makeSession({ startedAt: '2025-01-10T10:00:00Z', endedAt: '2025-01-10T11:00:00Z' }),
      makeSession({ startedAt: '2025-01-10T14:00:00Z', endedAt: '2025-01-10T15:00:00Z' }),
      makeSession({ startedAt: '2025-01-12T10:00:00Z', endedAt: '2025-01-12T11:00:00Z' }),
    ];
    const stats = generateNovelStats(sessions, [], 'Test');
    expect(stats.totalDays).toBe(2); // Jan 10 and Jan 12
  });

  it('counts total sessions', () => {
    const sessions = [makeSession(), makeSession(), makeSession()];
    const stats = generateNovelStats(sessions, [], 'Test');
    expect(stats.totalSessions).toBe(3);
  });

  it('computes total hours writing', () => {
    const sessions = [
      makeSession({ startedAt: '2025-01-10T10:00:00Z', endedAt: '2025-01-10T12:00:00Z' }), // 2h
      makeSession({ startedAt: '2025-01-11T10:00:00Z', endedAt: '2025-01-11T11:30:00Z' }), // 1.5h
    ];
    const stats = generateNovelStats(sessions, [], 'Test');
    expect(stats.totalHoursWriting).toBe(3.5);
  });

  it('uses title from argument', () => {
    const stats = generateNovelStats([], [], 'La Sombra del Viento');
    expect(stats.title).toBe('La Sombra del Viento');
  });

  // i18n: no baked-in default — the renderer resolves an empty title via the
  // `novelCompletion.defaultTitle` catalog key in the active locale.
  it('returns empty string for empty title (renderer localizes the default)', () => {
    const stats = generateNovelStats([], [], '');
    expect(stats.title).toBe('');
  });

  it('trims whitespace-only titles to empty string', () => {
    const stats = generateNovelStats([], [], '   ');
    expect(stats.title).toBe('');
  });

  it('handles invalid session dates gracefully', () => {
    const sessions = [
      makeSession({ startedAt: 'not-a-date', endedAt: 'also-not' }),
      makeSession({ startedAt: '2025-01-10T10:00:00Z', endedAt: '2025-01-10T11:00:00Z' }),
    ];
    const stats = generateNovelStats(sessions, [], 'Test');
    // Invalid session should be skipped; valid one counted
    expect(stats.totalDays).toBe(1);
    expect(stats.totalHoursWriting).toBe(1);
    expect(stats.totalSessions).toBe(2); // total sessions still counts both
  });

  it('sets completedAt to a valid ISO string', () => {
    const stats = generateNovelStats([], [], 'Test');
    expect(new Date(stats.completedAt).toISOString()).toBe(stats.completedAt);
  });

  it('handles chapters with empty content', () => {
    const chapters: Chapter[] = [
      { id: 'c1', title: 'Empty', content: '', summary: '' },
      { id: 'c2', title: 'With words', content: 'hello world', summary: '' },
    ];
    const stats = generateNovelStats([], chapters, 'Test');
    expect(stats.totalWords).toBe(2);
    expect(stats.totalChapters).toBe(2);
  });
});
