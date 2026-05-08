/**
 * Phase 4.6 / MP-08 — reading time and pacing analytics.
 *
 * Existing lib/reader-utils.ts had a single 200 wpm reading-time helper.
 * This module formalizes the reading-speed spectrum, exposes a pacing
 * variance calculation, and classifies a manuscript's chapter-length
 * health into a 3-bucket status.
 */

export const READING_SPEEDS = {
  slow: 200,
  average: 250,
  fast: 350,
} as const;

export type ReadingSpeedKey = keyof typeof READING_SPEEDS;

/** Whole-minute reading-time estimate at the requested wpm (default: average). */
export function readingTimeMinutes(
  wordCount: number,
  wpm: number = READING_SPEEDS.average,
): number {
  if (!Number.isFinite(wordCount) || wordCount <= 0) return 0;
  if (!Number.isFinite(wpm) || wpm <= 0) return 0;
  return Math.max(1, Math.ceil(wordCount / wpm));
}

/** Display string like "~12 min read" or "~1h 14m read". */
export function readingTimeLabel(
  wordCount: number,
  wpm: number = READING_SPEEDS.average,
): string {
  const m = readingTimeMinutes(wordCount, wpm);
  if (m === 0) return '~0 min read';
  if (m < 60) return `~${m} min read`;
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  return mins === 0 ? `~${hours}h read` : `~${hours}h ${mins}m read`;
}

export interface PacingVariance {
  mean: number;
  stdDev: number;
  /** stdDev / mean — dimensionless. Undefined when mean is 0. */
  coefficientOfVariation: number;
  count: number;
}

/**
 * Population standard deviation across chapter word counts. Returns zeroed
 * stats when there are fewer than 2 chapters or when every chapter is
 * empty (mean = 0).
 */
export function pacingVariance(chapters: { wordCount: number }[]): PacingVariance {
  const counts = chapters
    .map(c => c.wordCount)
    .filter(n => Number.isFinite(n) && n >= 0);
  const n = counts.length;
  if (n < 2) {
    return { mean: counts[0] ?? 0, stdDev: 0, coefficientOfVariation: 0, count: n };
  }
  const mean = counts.reduce((s, x) => s + x, 0) / n;
  if (mean === 0) {
    return { mean: 0, stdDev: 0, coefficientOfVariation: 0, count: n };
  }
  const variance = counts.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  return {
    mean,
    stdDev,
    coefficientOfVariation: stdDev / mean,
    count: n,
  };
}

export type PacingHealthStatus = 'consistent' | 'varied' | 'erratic';

/**
 * Bucket the coefficient of variation into a human label. Thresholds match
 * the build-plan spec: < 0.3 = consistent, 0.3–0.6 = varied, > 0.6 = erratic.
 */
export function pacingHealthStatus(cv: number): PacingHealthStatus {
  if (!Number.isFinite(cv) || cv < 0.3) return 'consistent';
  if (cv <= 0.6) return 'varied';
  return 'erratic';
}
