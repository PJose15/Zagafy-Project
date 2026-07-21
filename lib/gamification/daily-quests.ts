import type { DailyQuest, QuestsState, QuestType } from '@/lib/types/gamification';
import type { StoryState } from '@/lib/store';
import { formatDateKey } from './date-utils';

const MAX_HISTORY = 30;
const XP_REWARD = 50;

// ─── Seeded PRNG (mulberry32) ───

function seedFromString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rng: () => number): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

// ─── Quest Templates ───

interface QuestTemplate {
  type: QuestType;
  title: (ctx: QuestContext) => string;
  description: (ctx: QuestContext) => string;
}

interface QuestContext {
  characterName: string;
  conflictTitle: string;
  locationName: string;
  hasStoryData: boolean;
}

/** Whether the story carries any data quest templates can personalize with. */
export function storyHasQuestContext(story: StoryState | null): boolean {
  const chars = Array.isArray(story?.characters) ? story.characters : [];
  const conflicts = Array.isArray(story?.active_conflicts) ? story.active_conflicts : [];
  const locs = Array.isArray(story?.locations) ? story.locations : [];
  return chars.length > 0 || conflicts.length > 0 || locs.length > 0;
}

function getContext(story: StoryState | null, rng: () => number): QuestContext {
  // L4: Null-guard all arrays
  const chars = Array.isArray(story?.characters) ? story.characters : [];
  const conflicts = Array.isArray(story?.active_conflicts) ? story.active_conflicts : [];
  const locs = Array.isArray(story?.locations) ? story.locations : [];
  if (!story || (chars.length === 0 && conflicts.length === 0 && locs.length === 0)) {
    return { characterName: 'a character', conflictTitle: 'the central conflict', locationName: 'the main setting', hasStoryData: false };
  }
  const characterName = chars.length > 0 ? pick(chars, rng)!.name : 'a character';
  const conflictTitle = conflicts.length > 0 ? pick(conflicts, rng)!.title : 'the central conflict';
  const locationName = locs.length > 0 ? pick(locs, rng)!.name : 'the main setting';
  return { characterName, conflictTitle, locationName, hasStoryData: true };
}

const DIALOGUE_TEMPLATES: QuestTemplate[] = [
  { type: 'dialogue', title: (c) => `Voice of ${c.characterName}`, description: (c) => `Write a dialogue scene where ${c.characterName} reveals something they've been hiding.` },
  { type: 'dialogue', title: () => 'Subtext Duel', description: () => 'Write a conversation where two characters say one thing but mean another.' },
  { type: 'dialogue', title: () => 'The Awkward Silence', description: () => 'Write a scene where what is NOT said matters more than the words spoken.' },
  { type: 'dialogue', title: (c) => `${c.characterName}'s Confession`, description: (c) => `Write a scene where ${c.characterName} admits a vulnerability to someone they don't fully trust.` },
  { type: 'dialogue', title: () => 'Rapid Fire', description: () => 'Write a tense dialogue scene with short, punchy exchanges — no line longer than 10 words.' },
  { type: 'dialogue', title: () => 'Eavesdropped Truth', description: () => 'Write dialogue that reveals a secret, overheard by someone who shouldn\'t be listening.' },
  { type: 'dialogue', title: () => 'The Negotiation', description: (c) => `Write a scene where two characters negotiate, with ${c.conflictTitle} as the underlying tension.` },
  { type: 'dialogue', title: () => 'Farewell Words', description: (c) => `Write ${c.characterName}'s goodbye — something that could be permanent.` },
  { type: 'dialogue', title: () => 'Three-Way Tension', description: () => 'Write a scene with three characters where alliances shift mid-conversation.' },
  { type: 'dialogue', title: () => 'The Phone Call', description: () => 'Write a dialogue scene where we only hear one side of a conversation, but can infer the other.' },
];

const CHARACTER_TEMPLATES: QuestTemplate[] = [
  { type: 'character', title: (c) => `${c.characterName}'s Secret`, description: (c) => `Write a scene that reveals a hidden aspect of ${c.characterName}'s personality.` },
  { type: 'character', title: () => 'Mirror Moment', description: (c) => `Write a quiet scene where ${c.characterName} reflects on how they've changed.` },
  { type: 'character', title: () => 'Under Pressure', description: (c) => `Put ${c.characterName} in a situation where their deepest fear is triggered.` },
  { type: 'character', title: () => 'Unlikely Ally', description: () => 'Write a scene where two characters who distrust each other must cooperate.' },
  { type: 'character', title: () => 'The Habit', description: (c) => `Show ${c.characterName}'s daily routine — and the one detail that reveals their inner state.` },
  { type: 'character', title: () => 'Backstory Fragment', description: (c) => `Write a flashback scene (under 500 words) that explains why ${c.characterName} is the way they are.` },
  { type: 'character', title: () => 'Moral Dilemma', description: (c) => `Force ${c.characterName} to choose between two things they value — with no good option.` },
  { type: 'character', title: () => 'The Mask Slips', description: (c) => `Write a scene where ${c.characterName}'s public persona cracks under stress.` },
  { type: 'character', title: () => 'Comfort Object', description: (c) => `Write a scene centered on an object that ${c.characterName} carries — and what it means to them.` },
  { type: 'character', title: () => 'First Impression', description: () => 'Write a scene introducing a character through another character\'s eyes — biased and incomplete.' },
];

const STORY_TEMPLATES: QuestTemplate[] = [
  { type: 'story', title: () => 'Raise the Stakes', description: (c) => `Write a scene that escalates ${c.conflictTitle} — make the consequences feel more real.` },
  { type: 'story', title: () => 'Plant a Seed', description: () => 'Write a scene with a detail that seems insignificant now but will pay off later.' },
  { type: 'story', title: (c) => `Explore ${c.locationName}`, description: (c) => `Write a scene that uses ${c.locationName} as more than backdrop — let the setting shape the action.` },
  { type: 'story', title: () => 'Ticking Clock', description: () => 'Write a scene that introduces or emphasizes a deadline your characters are racing against.' },
  { type: 'story', title: () => 'The Twist', description: () => 'Write a scene where what the reader expects to happen does not — subvert one assumption.' },
  { type: 'story', title: () => 'Parallel Paths', description: () => 'Write two short scenes happening simultaneously that mirror or contrast each other.' },
  { type: 'story', title: () => 'World Detail', description: (c) => `Write a brief scene that reveals something about ${c.locationName} the reader didn't know.` },
  { type: 'story', title: () => 'Chapter Hook', description: () => 'Write the last 200 words of a chapter that makes the reader unable to stop.' },
  { type: 'story', title: () => 'Theme Echo', description: () => 'Write a scene where your story\'s central theme is reflected through a small, ordinary moment.' },
  { type: 'story', title: () => 'The Complication', description: (c) => `Write a scene that adds a new obstacle to ${c.conflictTitle} — something nobody saw coming.` },
];

const TEMPLATE_SETS: Record<QuestType, QuestTemplate[]> = {
  dialogue: DIALOGUE_TEMPLATES,
  character: CHARACTER_TEMPLATES,
  story: STORY_TEMPLATES,
};

// ─── Quest Generation ───

// M9: Validate YYYY-MM-DD format
const DATE_KEY_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

export function generateDailyQuests(dateKey: string, storyState: StoryState | null): DailyQuest[] {
  if (!DATE_KEY_RE.test(dateKey)) dateKey = '1970-01-01';
  const rng = mulberry32(seedFromString(dateKey));
  const ctx = getContext(storyState, rng);

  const types: QuestType[] = ['dialogue', 'character', 'story'];
  return types.map((type) => {
    const template = pick(TEMPLATE_SETS[type], rng)!;
    return {
      id: `quest-${dateKey}-${type}`,
      type,
      title: template.title(ctx),
      description: template.description(ctx),
      xpReward: XP_REWARD,
      status: 'active' as const,
      dateKey,
    };
  });
}

// ─── Refresh Quests ───

export function refreshQuests(state: QuestsState, storyState: StoryState | null, todayKey?: string): QuestsState {
  // L19: Reuse toDateKey-style formatting
  const today = todayKey ?? formatDateKey(new Date());

  if (state.currentDate === today) {
    return state;
  }

  // Expire old quests → move to history
  const expiredQuests = state.quests.map((q) =>
    q.status === 'active' ? { ...q, status: 'expired' as const } : q,
  );

  // L5: Named constant for quest history cap
  const MAX_QUEST_HISTORY = MAX_HISTORY * 3; // ~30 days × 3 quests
  const questHistory = [...state.questHistory, ...expiredQuests]
    .slice(-MAX_QUEST_HISTORY);

  const newQuests = generateDailyQuests(today, storyState);

  return {
    currentDate: today,
    quests: newQuests,
    questHistory,
    generatedWithoutStory: !storyHasQuestContext(storyState),
  };
}

// ─── Regenerate Placeholder Quests ───

/**
 * If today's quests were generated from an empty (pre-hydration) story state
 * and real story data has since arrived, regenerate them once with the real
 * context. Never touches quests once any of them is completed, so progress is
 * never wiped. Returns the same state object when nothing needs to change.
 */
export function regeneratePlaceholderQuests(state: QuestsState, storyState: StoryState | null): QuestsState {
  if (!state.generatedWithoutStory) return state;
  if (!storyHasQuestContext(storyState)) return state;
  if (state.quests.some((q) => q.status !== 'active')) return state;
  return {
    ...state,
    quests: generateDailyQuests(state.currentDate, storyState),
    generatedWithoutStory: false,
  };
}

// ─── Complete Quest ───

export function completeQuest(state: QuestsState, questId: string): QuestsState {
  const quests = state.quests.map((q) =>
    q.id === questId && q.status === 'active'
      ? { ...q, status: 'completed' as const }
      : q,
  );
  return { ...state, quests };
}
