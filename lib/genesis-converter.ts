import type { StoryState, Character, Conflict, WorldRule } from '@/lib/store';
import type { GenesisData } from '@/lib/types/genesis';

/**
 * Converts completed Genesis wizard data into a partial StoryState
 * that can be merged into the store via setState.
 */
export function convertGenesisToStory(data: GenesisData): Partial<StoryState> {
  const characters: Character[] = [];
  const conflicts: Conflict[] = [];
  const worldRules: WorldRule[] = [];

  // Protagonist
  characters.push({
    id: crypto.randomUUID(),
    name: data.protagonist.name,
    role: 'Protagonist',
    description: data.protagonist.description || '',
    relationships: '',
    currentState: {
      emotionalState: 'Determined',
      visibleGoal: data.protagonist.goal || '',
      hiddenNeed: '',
      currentFear: data.protagonist.fear || '',
      dominantBelief: '',
      emotionalWound: '',
      pressureLevel: 'Low',
      currentKnowledge: '',
      indicator: 'stable',
    },
    canonStatus: 'draft',
    source: 'user-entered',
  });

  // Antagonist — only create a Character if type is 'character'
  if (data.antagonist.type === 'character') {
    characters.push({
      id: crypto.randomUUID(),
      name: data.antagonist.name,
      role: 'Antagonist',
      description: data.antagonist.description || '',
      relationships: '',
      currentState: {
        emotionalState: 'Resolute',
        visibleGoal: data.antagonist.motivation || '',
        hiddenNeed: '',
        currentFear: '',
        dominantBelief: '',
        emotionalWound: '',
        pressureLevel: 'Low',
        currentKnowledge: '',
        indicator: 'stable',
      },
      canonStatus: 'draft',
      source: 'user-entered',
    });
  }

  // For all antagonist types, create a conflict
  const conflictTitle =
    data.antagonist.type === 'character'
      ? `${data.protagonist.name} vs ${data.antagonist.name}`
      : data.antagonist.type === 'force'
        ? `${data.protagonist.name} vs ${data.antagonist.name}`
        : `${data.protagonist.name}'s inner conflict: ${data.antagonist.name}`;

  conflicts.push({
    id: crypto.randomUUID(),
    title: conflictTitle,
    description: data.antagonist.description || data.antagonist.motivation || '',
    status: 'active',
    canonStatus: 'draft',
    source: 'user-entered',
  });

  // World rules
  for (const rule of data.world.rules) {
    if (rule.trim()) {
      worldRules.push({
        id: crypto.randomUUID(),
        category: 'World',
        rule: rule.trim(),
        canonStatus: 'draft',
        source: 'user-entered',
      });
    }
  }

  // Setting as a world rule
  if (data.world.setting.trim()) {
    worldRules.push({
      id: crypto.randomUUID(),
      category: 'Setting',
      rule: data.world.setting.trim(),
      canonStatus: 'draft',
      source: 'user-entered',
    });
  }

  // Time period as a world rule
  if (data.world.timePeriod.trim()) {
    worldRules.push({
      id: crypto.randomUUID(),
      category: 'Time Period',
      rule: data.world.timePeriod.trim(),
      canonStatus: 'draft',
      source: 'user-entered',
    });
  }

  // Tones are collected by the wizard (and gate the genre-tone step) but were
  // previously discarded on create. Fold them into the style profile so they
  // reach StoryState and inform the AI's voice.
  const style_profile = (data.tones ?? []).map(t => t.trim()).filter(Boolean).join(', ');

  return {
    title: data.projectName.trim(),
    genre: data.genres,
    synopsis: data.logline.trim(),
    characters,
    active_conflicts: conflicts,
    world_rules: worldRules,
    ...(style_profile ? { style_profile } : {}),
  };
}
