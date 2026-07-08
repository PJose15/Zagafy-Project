// L6: Export for test usage
export const STORAGE_KEY = 'zagafy_gamification';
const STATE_VERSION = 1;

// ─── XP Types ───

export interface XPEvent {
  id: string;
  type: string;
  amount: number;
  metadata?: string;
  timestamp: string; // ISO 8601
}

export interface XPState {
  totalXP: number;
  level: number;
  events: XPEvent[];
}

// ─── Writing Streak Types ───

export interface StreakDay {
  dateKey: string; // YYYY-MM-DD
  qualified: boolean;
}

export interface WritingStreakState {
  currentStreak: number;
  longestStreak: number;
  lastQualifyingDate: string; // YYYY-MM-DD or ''
  todayQualified: boolean;
  streakHistory: StreakDay[];
}

// ─── Quest Types ───

export type QuestType = 'dialogue' | 'character' | 'story';
export type QuestStatus = 'active' | 'completed' | 'expired';

export interface DailyQuest {
  id: string;
  type: QuestType;
  title: string;
  description: string;
  xpReward: number;
  status: QuestStatus;
  dateKey: string; // YYYY-MM-DD
}

export interface QuestsState {
  currentDate: string; // YYYY-MM-DD
  quests: DailyQuest[];
  questHistory: DailyQuest[];
}

// ─── Sprint Types ───

export type SprintTheme = 'quick-focus' | 'deep-dive' | 'marathon-push' | 'dialogue-sprint' | 'conflict-burst';
export type SprintStatus = 'active' | 'completed' | 'abandoned';

export interface WritingSprint {
  id: string;
  theme: SprintTheme;
  prompt: string;
  durationMinutes: number;
  startTime: string;  // ISO 8601
  endTime: string | null;
  wordsStart: number;
  wordsEnd: number | null;
  wordsWritten: number | null;
  status: SprintStatus;
  targetWords: number;
}

export interface SprintsState {
  activeSprint: WritingSprint | null;
  sprintHistory: WritingSprint[];
}

// ─── Finishing Engine Types ───

export type NarrativePhase = 'setup' | 'rising-action' | 'midpoint' | 'climax' | 'falling-action' | 'resolution';

export interface Milestone {
  id: string;
  phase: NarrativePhase;
  description: string;
  weight: number;
  completed: boolean;
}

export interface FinishingEngineState {
  currentPhase: NarrativePhase;
  overallProgress: number; // 0-100
  milestones: Milestone[];
  nextSuggestion: string;
}

// ─── One-time Award Markers (S5-G1) ───

/**
 * Idempotency markers for the one-shot XP awards (CHAPTER_FINISHED,
 * STREAK_MILESTONE). Optional on the interface so blobs written before this
 * field existed stay valid — readGamification() deep-merges the defaults in,
 * and no version bump is needed (a bump would destructively reset progress).
 */
export interface AwardsState {
  /**
   * Highest streak milestone (7/30/100) already awarded within the CURRENT
   * streak run. Resets when the streak breaks, so a rebuilt streak can earn
   * its milestones again.
   */
  streakMilestoneAwarded: number;
  /**
   * High-water mark of finished chapters (>= CHAPTER_FINISHED_MIN_WORDS) that
   * have already been awarded XP. Prevents re-awarding on reload and blocks
   * delete/re-add farming (count must exceed the high-water to award again).
   */
  chapterHighWater: number;
}

// ─── Root State ───

export interface GamificationState {
  version: number;
  xp: XPState;
  streak: WritingStreakState;
  quests: QuestsState;
  sprints: SprintsState;
  finishing: FinishingEngineState;
  awards?: AwardsState;
}

// ─── Defaults ───

export function defaultXPState(): XPState {
  return { totalXP: 0, level: 1, events: [] };
}

export function defaultStreakState(): WritingStreakState {
  return {
    currentStreak: 0,
    longestStreak: 0,
    lastQualifyingDate: '',
    todayQualified: false,
    streakHistory: [],
  };
}

export function defaultQuestsState(): QuestsState {
  return { currentDate: '', quests: [], questHistory: [] };
}

export function defaultSprintsState(): SprintsState {
  return { activeSprint: null, sprintHistory: [] };
}

export function defaultFinishingState(): FinishingEngineState {
  return {
    currentPhase: 'setup',
    overallProgress: 0,
    milestones: [],
    nextSuggestion: '',
  };
}

export function defaultAwardsState(): AwardsState {
  return { streakMilestoneAwarded: 0, chapterHighWater: 0 };
}

export function defaultGamificationState(): GamificationState {
  return {
    version: STATE_VERSION,
    xp: defaultXPState(),
    streak: defaultStreakState(),
    quests: defaultQuestsState(),
    sprints: defaultSprintsState(),
    finishing: defaultFinishingState(),
    awards: defaultAwardsState(),
  };
}

// ─── Type Guard ───

export function isGamificationState(v: unknown): v is GamificationState {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.version !== 'number') return false;
  if (typeof o.xp !== 'object' || o.xp === null) return false;
  if (typeof o.streak !== 'object' || o.streak === null) return false;
  if (typeof o.quests !== 'object' || o.quests === null) return false;
  if (typeof o.sprints !== 'object' || o.sprints === null) return false;
  if (typeof o.finishing !== 'object' || o.finishing === null) return false;

  const xp = o.xp as Record<string, unknown>;
  if (typeof xp.totalXP !== 'number' || !Number.isFinite(xp.totalXP)) return false;
  if (typeof xp.level !== 'number' || !Number.isFinite(xp.level)) return false;
  if (!Array.isArray(xp.events)) return false;
  // M10: Shallow-validate first XP event element
  if (xp.events.length > 0) {
    const e = xp.events[0] as Record<string, unknown>;
    if (typeof e?.id !== 'string' || typeof e?.type !== 'string' || typeof e?.amount !== 'number') return false;
  }

  const streak = o.streak as Record<string, unknown>;
  if (typeof streak.currentStreak !== 'number' || !Number.isFinite(streak.currentStreak)) return false;
  if (typeof streak.longestStreak !== 'number' || !Number.isFinite(streak.longestStreak)) return false;
  // L15: Validate todayQualified is boolean
  if (typeof streak.todayQualified !== 'boolean') return false;
  // M10: Shallow-validate first streakHistory element
  if (Array.isArray(streak.streakHistory) && streak.streakHistory.length > 0) {
    const sh = streak.streakHistory[0] as Record<string, unknown>;
    if (typeof sh?.date !== 'string' && typeof sh?.dateKey !== 'string') return false;
    if (typeof sh?.qualified !== 'boolean') return false;
  }

  const quests = o.quests as Record<string, unknown>;
  if (!Array.isArray(quests.quests)) return false;
  // L16: Validate currentDate is string
  if (typeof quests.currentDate !== 'string') return false;
  // M10: Shallow-validate first quest element
  if (quests.quests.length > 0) {
    const q = quests.quests[0] as Record<string, unknown>;
    if (typeof q?.id !== 'string' || typeof q?.title !== 'string' || typeof q?.status !== 'string') return false;
  }

  const sprints = o.sprints as Record<string, unknown>;
  if (!Array.isArray(sprints.sprintHistory)) return false;

  const finishing = o.finishing as Record<string, unknown>;
  if (typeof finishing.overallProgress !== 'number' || !Number.isFinite(finishing.overallProgress)) return false;
  // M19: Validate currentPhase is a known value
  const validPhases = ['setup', 'rising-action', 'midpoint', 'climax', 'falling-action', 'resolution'];
  if (typeof finishing.currentPhase !== 'string' || !validPhases.includes(finishing.currentPhase)) return false;
  // M19: Validate milestones is an array
  if (!Array.isArray(finishing.milestones)) return false;

  return true;
}

// ─── LocalStorage CRUD ───

export function readGamification(): GamificationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultGamificationState();
    const parsed = JSON.parse(raw);
    if (!isGamificationState(parsed)) return defaultGamificationState();
    // M10: Version check — reset on incompatible version changes
    if (parsed.version !== STATE_VERSION) return defaultGamificationState();
    // Deep-merge each sub-object for forward compatibility
    return {
      ...defaultGamificationState(),
      ...parsed,
      xp: { ...defaultXPState(), ...(parsed.xp || {}) },
      streak: { ...defaultStreakState(), ...(parsed.streak || {}) },
      quests: { ...defaultQuestsState(), ...(parsed.quests || {}) },
      sprints: { ...defaultSprintsState(), ...(parsed.sprints || {}) },
      finishing: { ...defaultFinishingState(), ...(parsed.finishing || {}) },
      awards: { ...defaultAwardsState(), ...(parsed.awards || {}) },
    };
  } catch {
    return defaultGamificationState();
  }
}

export function writeGamification(state: GamificationState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
