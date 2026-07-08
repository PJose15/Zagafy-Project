import { describe, it, expect } from 'vitest';
import {
  CHAPTER_FINISHED_MIN_WORDS,
  countFinishedChapters,
  evaluateChapterAward,
  evaluateStreakMilestone,
} from '@/lib/gamification/awards';

function chapterWithWords(n: number): { content: string } {
  return { content: Array.from({ length: n }, (_, i) => `word${i}`).join(' ') };
}

describe('countFinishedChapters', () => {
  it('counts only chapters at or above the finished bar', () => {
    const chapters = [
      chapterWithWords(CHAPTER_FINISHED_MIN_WORDS),      // exactly at bar → counts
      chapterWithWords(CHAPTER_FINISHED_MIN_WORDS - 1),  // one under → no
      chapterWithWords(CHAPTER_FINISHED_MIN_WORDS * 3),  // well over → counts
      { content: '' },
      {},
    ];
    expect(countFinishedChapters(chapters)).toBe(2);
  });

  it('handles empty/invalid input', () => {
    expect(countFinishedChapters([])).toBe(0);
    expect(countFinishedChapters(undefined as unknown as [])).toBe(0);
  });

  it('decodes Lexical JSON content (CB-07)', () => {
    const words = Array.from({ length: CHAPTER_FINISHED_MIN_WORDS }, (_, i) => `w${i}`).join(' ');
    const lexical = JSON.stringify({
      root: {
        type: 'root', version: 1, format: '', indent: 0, direction: null,
        children: [{
          type: 'paragraph', version: 1, format: '', indent: 0, direction: null,
          children: [{ type: 'text', version: 1, text: words, format: 0, style: '', mode: 'normal', detail: 0 }],
        }],
      },
    });
    expect(countFinishedChapters([{ content: lexical }])).toBe(1);
  });
});

describe('evaluateChapterAward', () => {
  it('awards newly finished chapters beyond the high-water', () => {
    const chapters = [chapterWithWords(600), chapterWithWords(700)];
    expect(evaluateChapterAward(chapters, 0)).toEqual({ newlyFinished: 2, newHighWater: 2 });
    expect(evaluateChapterAward(chapters, 1)).toEqual({ newlyFinished: 1, newHighWater: 2 });
  });

  it('is idempotent: nothing new at or below the high-water', () => {
    const chapters = [chapterWithWords(600), chapterWithWords(700)];
    expect(evaluateChapterAward(chapters, 2)).toEqual({ newlyFinished: 0, newHighWater: 2 });
  });

  it('blocks delete/re-add farming: high-water never decreases', () => {
    // Writer had 3 finished chapters awarded, deleted one (now 2) …
    const afterDelete = evaluateChapterAward([chapterWithWords(600), chapterWithWords(700)], 3);
    expect(afterDelete).toEqual({ newlyFinished: 0, newHighWater: 3 });
    // … then re-added it (back to 3): still nothing new.
    const afterReAdd = evaluateChapterAward(
      [chapterWithWords(600), chapterWithWords(700), chapterWithWords(800)],
      3,
    );
    expect(afterReAdd).toEqual({ newlyFinished: 0, newHighWater: 3 });
  });

  it('sanitizes a corrupt high-water', () => {
    expect(evaluateChapterAward([chapterWithWords(600)], NaN)).toEqual({ newlyFinished: 1, newHighWater: 1 });
    expect(evaluateChapterAward([chapterWithWords(600)], -5)).toEqual({ newlyFinished: 1, newHighWater: 1 });
  });
});

describe('evaluateStreakMilestone', () => {
  it('awards nothing below the first milestone', () => {
    expect(evaluateStreakMilestone(6, 0)).toEqual({ milestone: null, marker: 0 });
  });

  it('awards 7 exactly at 7 days and marks it', () => {
    expect(evaluateStreakMilestone(7, 0)).toEqual({ milestone: 7, marker: 7 });
  });

  it('is idempotent within a run: day 8..29 award nothing after 7', () => {
    expect(evaluateStreakMilestone(8, 7)).toEqual({ milestone: null, marker: 7 });
    expect(evaluateStreakMilestone(29, 7)).toEqual({ milestone: null, marker: 7 });
  });

  it('awards the next milestone at 30 and 100', () => {
    expect(evaluateStreakMilestone(30, 7)).toEqual({ milestone: 30, marker: 30 });
    expect(evaluateStreakMilestone(100, 30)).toEqual({ milestone: 100, marker: 100 });
  });

  it('awards only the highest milestone on a jump (backfilled sessions)', () => {
    expect(evaluateStreakMilestone(35, 0)).toEqual({ milestone: 30, marker: 30 });
  });

  it('re-arms after a streak break so a rebuilt streak awards again', () => {
    // Streak broke: marker drops to what the current streak still covers (0).
    expect(evaluateStreakMilestone(0, 30)).toEqual({ milestone: null, marker: 0 });
    // Rebuilt to 7 → awards 7 again.
    expect(evaluateStreakMilestone(7, 0)).toEqual({ milestone: 7, marker: 7 });
  });

  it('partial shrink keeps covered milestones un-re-awardable', () => {
    // Streak recomputed down to 10 while marker was 30: marker drops to 7,
    // so 7 is NOT re-awarded for a streak that never fully broke.
    expect(evaluateStreakMilestone(10, 30)).toEqual({ milestone: null, marker: 7 });
  });

  it('sanitizes garbage input', () => {
    expect(evaluateStreakMilestone(NaN, NaN)).toEqual({ milestone: null, marker: 0 });
  });
});
