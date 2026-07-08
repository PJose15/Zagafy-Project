/**
 * S5-G1 — one-shot XP awards: CHAPTER_FINISHED and STREAK_MILESTONE.
 *
 * Both rates existed in XP_RATES since the gamification engine shipped but had
 * no award site. These pure evaluators compute WHAT to award against the
 * persisted idempotency markers in `GamificationState.awards`, so awards never
 * re-fire on reload:
 *
 * - Chapters use a high-water mark of finished chapters (>= 500 words — the
 *   same bar as the finishing engine's "Write your first chapter (500+ words)"
 *   milestone). Deleting and re-adding a chapter can't farm XP: the count must
 *   EXCEED the previous high-water before anything new is awarded.
 * - Streak milestones (7/30/100) award once per streak run. When the streak
 *   breaks, the marker resets so a rebuilt streak earns its milestones again.
 */

import { STREAK_MILESTONES } from './writing-streak';
import { wordCount } from '@/lib/editor/serialization';

/** A chapter counts as "finished" at 500+ words (matches the finishing engine). */
export const CHAPTER_FINISHED_MIN_WORDS = 500;

/** Count chapters whose prose (Lexical-aware) meets the finished bar. */
export function countFinishedChapters(chapters: Array<{ content?: string }>): number {
  if (!Array.isArray(chapters)) return 0;
  let count = 0;
  for (const ch of chapters) {
    if (ch?.content && wordCount(ch.content) >= CHAPTER_FINISHED_MIN_WORDS) count++;
  }
  return count;
}

export interface ChapterAwardResult {
  /** Chapters newly crossing the finished bar beyond the high-water (0 = nothing to award). */
  newlyFinished: number;
  /** Marker to persist. Never decreases — deletions don't claw back or re-arm awards. */
  newHighWater: number;
}

export function evaluateChapterAward(
  chapters: Array<{ content?: string }>,
  highWater: number,
): ChapterAwardResult {
  const safeHighWater = Number.isFinite(highWater) && highWater > 0 ? Math.floor(highWater) : 0;
  const finished = countFinishedChapters(chapters);
  if (finished <= safeHighWater) {
    return { newlyFinished: 0, newHighWater: safeHighWater };
  }
  return { newlyFinished: finished - safeHighWater, newHighWater: finished };
}

export interface StreakMilestoneResult {
  /** The milestone to award now (highest newly-reached), or null. */
  milestone: number | null;
  /** Marker to persist as `awards.streakMilestoneAwarded`. */
  marker: number;
}

export function evaluateStreakMilestone(
  currentStreak: number,
  alreadyAwarded: number,
): StreakMilestoneResult {
  const safeStreak = Number.isFinite(currentStreak) && currentStreak > 0 ? Math.floor(currentStreak) : 0;
  const safeAwarded = Number.isFinite(alreadyAwarded) && alreadyAwarded > 0 ? Math.floor(alreadyAwarded) : 0;

  // Streak broke (or shrank below the awarded milestone): re-arm by dropping
  // the marker to the highest milestone still covered by the current streak.
  // A full break (streak 0/1) resets to 0, so a rebuilt streak awards again.
  if (safeStreak < safeAwarded) {
    const covered = STREAK_MILESTONES.filter((m) => m <= safeStreak);
    return { milestone: null, marker: covered.length ? Math.max(...covered) : 0 };
  }

  // Highest milestone reached that hasn't been awarded this run. Awards a
  // single STREAK_MILESTONE even if the streak jumped past several (only
  // possible via imported/backfilled sessions).
  const reached = STREAK_MILESTONES.filter((m) => m <= safeStreak && m > safeAwarded);
  if (reached.length === 0) return { milestone: null, marker: safeAwarded };
  const milestone = Math.max(...reached);
  return { milestone, marker: milestone };
}
