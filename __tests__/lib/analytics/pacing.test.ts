import { describe, it, expect } from 'vitest';
import {
  READING_SPEEDS,
  readingTimeMinutes,
  readingTimeLabel,
  pacingVariance,
  pacingHealthStatus,
} from '@/lib/analytics/pacing';

describe('readingTimeMinutes', () => {
  it('returns 1 minute for short content (rounds up, never below 1 for non-empty)', () => {
    expect(readingTimeMinutes(50)).toBe(1);
    expect(readingTimeMinutes(250)).toBe(1);
  });

  it('uses average wpm by default', () => {
    expect(readingTimeMinutes(2500)).toBe(10);
  });

  it('honors a slow / fast wpm', () => {
    expect(readingTimeMinutes(700, READING_SPEEDS.slow)).toBe(4);
    expect(readingTimeMinutes(700, READING_SPEEDS.fast)).toBe(2);
  });

  it('returns 0 for non-positive input', () => {
    expect(readingTimeMinutes(0)).toBe(0);
    expect(readingTimeMinutes(-10)).toBe(0);
    expect(readingTimeMinutes(NaN)).toBe(0);
    expect(readingTimeMinutes(100, 0)).toBe(0);
  });
});

describe('readingTimeLabel', () => {
  it('formats short content as "~N min read"', () => {
    expect(readingTimeLabel(2500)).toBe('~10 min read');
  });

  it('formats long content as hours + minutes', () => {
    // 100k words at 250 wpm = 400 min = 6h 40m
    expect(readingTimeLabel(100_000)).toBe('~6h 40m read');
  });

  it('omits minutes when the result is whole hours', () => {
    // 60_000 words at 250 wpm = 240 min = exactly 4h
    expect(readingTimeLabel(60_000)).toBe('~4h read');
  });

  it('returns "~0 min read" for empty input', () => {
    expect(readingTimeLabel(0)).toBe('~0 min read');
  });
});

describe('pacingVariance', () => {
  it('returns zeros for an empty manuscript', () => {
    const v = pacingVariance([]);
    expect(v).toEqual({ mean: 0, stdDev: 0, coefficientOfVariation: 0, count: 0 });
  });

  it('returns the single value for a one-chapter manuscript', () => {
    const v = pacingVariance([{ wordCount: 1000 }]);
    expect(v.mean).toBe(1000);
    expect(v.stdDev).toBe(0);
    expect(v.coefficientOfVariation).toBe(0);
    expect(v.count).toBe(1);
  });

  it('computes mean and population stdDev', () => {
    const v = pacingVariance([
      { wordCount: 1000 },
      { wordCount: 1000 },
      { wordCount: 1000 },
    ]);
    expect(v.mean).toBe(1000);
    expect(v.stdDev).toBe(0);
    expect(v.coefficientOfVariation).toBe(0);
  });

  it('produces a positive coefficient of variation for uneven chapters', () => {
    const v = pacingVariance([
      { wordCount: 500 },
      { wordCount: 5000 },
      { wordCount: 1500 },
    ]);
    expect(v.mean).toBeCloseTo(2333.33, 1);
    expect(v.stdDev).toBeGreaterThan(0);
    expect(v.coefficientOfVariation).toBeGreaterThan(0);
  });

  it('ignores non-finite or negative chapter counts', () => {
    const v = pacingVariance([
      { wordCount: 1000 },
      { wordCount: NaN },
      { wordCount: -100 },
      { wordCount: 1000 },
    ]);
    expect(v.count).toBe(2);
    expect(v.mean).toBe(1000);
  });

  it('returns zeroed stats when every count is zero', () => {
    const v = pacingVariance([{ wordCount: 0 }, { wordCount: 0 }]);
    expect(v.mean).toBe(0);
    expect(v.stdDev).toBe(0);
    expect(v.coefficientOfVariation).toBe(0);
  });
});

describe('pacingHealthStatus', () => {
  it.each([
    [0, 'consistent'],
    [0.29, 'consistent'],
    [0.3, 'varied'],
    [0.45, 'varied'],
    [0.6, 'varied'],
    [0.61, 'erratic'],
    [1.5, 'erratic'],
  ])('cv=%s → %s', (cv, expected) => {
    expect(pacingHealthStatus(cv)).toBe(expected);
  });
});
