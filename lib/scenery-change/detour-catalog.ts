import type { BlockSignal, DetourSuggestion, DetourType } from './types';

interface StoryContext {
  characterNames?: string[];
  currentChapterTitle?: string;
  genre?: string;
}

interface DetourTemplate {
  type: DetourType;
  title: string;
  buildPrompt: (ctx: StoryContext) => string;
  /**
   * The raw story value the template personalizes with (null when the story
   * has no matching data). Persisted so the renderer can translate the prompt
   * (`flow.detourCatalog.{type}.prompt`) with the value — or a translated
   * default — in the active locale.
   */
  getParam: (ctx: StoryContext) => string | null;
  durationMinutes: number;
}

const DETOUR_TEMPLATES: DetourTemplate[] = [
  {
    type: 'dialogue_sprint',
    title: 'Dialogue Sprint',
    buildPrompt: (ctx) => {
      const name = ctx.characterNames?.[0] || 'your protagonist';
      return `Write a rapid-fire dialogue between ${name} and someone who just told them something shocking. No action tags, no description — just raw dialogue. 5 minutes, as many lines as you can.`;
    },
    getParam: (ctx) => ctx.characterNames?.[0] || null,
    durationMinutes: 5,
  },
  {
    type: 'alternate_pov',
    title: 'Alternate POV',
    buildPrompt: (ctx) => {
      const name = ctx.characterNames?.[1] || ctx.characterNames?.[0] || 'a side character';
      return `Rewrite the current scene from ${name}'s perspective. What do they notice? What are they hiding? Write freely for 7 minutes.`;
    },
    getParam: (ctx) => ctx.characterNames?.[1] || ctx.characterNames?.[0] || null,
    durationMinutes: 7,
  },
  {
    type: 'sensory_snapshot',
    title: 'Sensory Snapshot',
    buildPrompt: (ctx) => {
      const chapter = ctx.currentChapterTitle || 'the current scene';
      return `Describe ${chapter} using ONLY the five senses — no thoughts, no emotions, no dialogue. What does the air taste like? What's the texture underfoot? 5 minutes.`;
    },
    getParam: (ctx) => ctx.currentChapterTitle || null,
    durationMinutes: 5,
  },
  {
    type: 'villains_diary',
    title: "Villain's Diary",
    buildPrompt: (ctx) => {
      const genre = ctx.genre || 'fiction';
      return `Write a private diary entry from the antagonist's perspective. What are they planning? What keeps them up at night? Channel the ${genre} genre. 7 minutes.`;
    },
    getParam: (ctx) => ctx.genre || null,
    durationMinutes: 7,
  },
  {
    type: 'flash_forward',
    title: 'Flash Forward',
    buildPrompt: (ctx) => {
      const name = ctx.characterNames?.[0] || 'your protagonist';
      return `Jump 10 years into the future. ${name} is looking back on this moment. What do they remember? What do they wish they'd said? 5 minutes, no editing.`;
    },
    getParam: (ctx) => ctx.characterNames?.[0] || null,
    durationMinutes: 5,
  },
  {
    type: 'character_interview',
    title: 'Character Interview',
    buildPrompt: (ctx) => {
      const name = ctx.characterNames?.[0] || 'your main character';
      return `You're a journalist interviewing ${name}. Ask them 3 questions they wouldn't want to answer. Write both the questions and their uncomfortable, revealing answers. 7 minutes.`;
    },
    getParam: (ctx) => ctx.characterNames?.[0] || null,
    durationMinutes: 7,
  },
];

/**
 * Get 2-3 contextually appropriate detour suggestions.
 */
export function getDetourSuggestions(
  signal: BlockSignal,
  context: StoryContext
): DetourSuggestion[] {
  // Filter/rank by relevance to block indicators
  let templates = [...DETOUR_TEMPLATES];

  const hasIdle = signal.indicators.includes('idle');
  const hasHighDeletion = signal.indicators.includes('high_deletion');

  if (hasIdle || hasHighDeletion) {
    const preferred: DetourType[] = ['alternate_pov', 'sensory_snapshot', 'flash_forward'];
    templates.sort((a, b) => {
      // High deletion: prefer creative reframing detours
      if (hasHighDeletion) {
        const aIdx = preferred.indexOf(a.type);
        const bIdx = preferred.indexOf(b.type);
        const prefDiff = (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
        if (prefDiff !== 0) return prefDiff;
      }
      // Idle: shorter detours first (tiebreaker when both present)
      if (hasIdle) {
        return a.durationMinutes - b.durationMinutes;
      }
      return 0;
    });
  }

  // If low WPM — dialogue sprint is great for getting words flowing
  if (signal.indicators.includes('low_wpm')) {
    const dialogueIdx = templates.findIndex(t => t.type === 'dialogue_sprint');
    if (dialogueIdx > 0) {
      const [dialogue] = templates.splice(dialogueIdx, 1);
      templates.unshift(dialogue);
    }
  }

  // Take top 3
  return templates.slice(0, 3).map(t => ({
    type: t.type,
    title: t.title,
    prompt: t.buildPrompt(context),
    promptParam: t.getParam(context),
    durationMinutes: t.durationMinutes,
  }));
}

/**
 * Get all available detour types (for testing / catalog display).
 */
export function getAllDetourTypes(): DetourType[] {
  return DETOUR_TEMPLATES.map(t => t.type);
}
