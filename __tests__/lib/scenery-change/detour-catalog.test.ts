import { describe, it, expect } from 'vitest';
import { getDetourSuggestions, getAllDetourTypes } from '@/lib/scenery-change/detour-catalog';
import type { BlockSignal, DetourSuggestion } from '@/lib/scenery-change/types';

function makeSignal(indicators: BlockSignal['indicators'] = ['idle']): BlockSignal {
  return {
    severity: indicators.length >= 3 ? 'severe' : indicators.length === 2 ? 'moderate' : 'mild',
    indicators,
    metrics: { wpm: 5, deletionRatio: 0.1, pauseCount: 2, idleSeconds: 50 },
    detectedAt: Date.now(),
  };
}

describe('getDetourSuggestions', () => {
  it('returns exactly 3 suggestions', () => {
    const suggestions = getDetourSuggestions(makeSignal(), {});
    expect(suggestions).toHaveLength(3);
  });

  it('each suggestion has type, title, prompt, and durationMinutes', () => {
    const suggestions = getDetourSuggestions(makeSignal(), {});
    for (const s of suggestions) {
      expect(typeof s.type).toBe('string');
      expect(typeof s.title).toBe('string');
      expect(typeof s.prompt).toBe('string');
      expect(s.prompt.length).toBeGreaterThan(0);
      expect(typeof s.durationMinutes).toBe('number');
      expect(s.durationMinutes).toBeGreaterThan(0);
    }
  });

  it('sorts shorter detours first when idle indicator is present', () => {
    const suggestions = getDetourSuggestions(makeSignal(['idle']), {});
    // Shortest durations should come first (5-minute detours before 7-minute)
    expect(suggestions[0].durationMinutes).toBeLessThanOrEqual(suggestions[1].durationMinutes);
    expect(suggestions[1].durationMinutes).toBeLessThanOrEqual(suggestions[2].durationMinutes);
  });

  it('prioritizes creative reframing detours for high_deletion', () => {
    const suggestions = getDetourSuggestions(makeSignal(['high_deletion']), {});
    const preferred = ['alternate_pov', 'sensory_snapshot', 'flash_forward'];
    // First suggestion should be one of the preferred types
    expect(preferred).toContain(suggestions[0].type);
  });

  it('puts dialogue_sprint first for low_wpm', () => {
    const suggestions = getDetourSuggestions(makeSignal(['low_wpm']), {});
    expect(suggestions[0].type).toBe('dialogue_sprint');
  });

  it('uses character names from context in prompts', () => {
    const suggestions = getDetourSuggestions(makeSignal(['low_wpm']), {
      characterNames: ['Alice', 'Bob'],
    });
    // dialogue_sprint uses characterNames[0]
    const dialogueSprint = suggestions.find(s => s.type === 'dialogue_sprint');
    expect(dialogueSprint).toBeDefined();
    expect(dialogueSprint!.prompt).toContain('Alice');
  });

  it('uses fallback names when no character names provided', () => {
    const suggestions = getDetourSuggestions(makeSignal(['low_wpm']), {});
    const dialogueSprint = suggestions.find(s => s.type === 'dialogue_sprint');
    expect(dialogueSprint!.prompt).toContain('your protagonist');
  });

  it('uses chapter title in sensory snapshot prompt', () => {
    const signal = makeSignal(['high_deletion']);
    const suggestions = getDetourSuggestions(signal, {
      currentChapterTitle: 'The Dark Forest',
    });
    const sensory = suggestions.find(s => s.type === 'sensory_snapshot');
    if (sensory) {
      expect(sensory.prompt).toContain('The Dark Forest');
    }
  });

  it('uses genre in villain diary prompt', () => {
    const signal = makeSignal(['idle']);
    const suggestions = getDetourSuggestions(signal, { genre: 'sci-fi' });
    const villain = suggestions.find(s => s.type === 'villains_diary');
    if (villain) {
      expect(villain.prompt).toContain('sci-fi');
    }
  });

  it('alternate_pov falls back to characterNames[0] with only 1 character', () => {
    const signal = makeSignal(['high_deletion']);
    const suggestions = getDetourSuggestions(signal, {
      characterNames: ['Solo'],
    });
    const altPov = suggestions.find(s => s.type === 'alternate_pov');
    expect(altPov).toBeDefined();
    // With only 1 character, should use characterNames[0] as fallback
    expect(altPov!.prompt).toContain('Solo');
  });

  it('both idle+high_deletion: reframing sort dominates', () => {
    const suggestions = getDetourSuggestions(makeSignal(['idle', 'high_deletion']), {});
    // high_deletion prioritizes creative reframing types
    const preferred = ['alternate_pov', 'sensory_snapshot', 'flash_forward'];
    expect(preferred).toContain(suggestions[0].type);
  });

  it('uses second character name for alternate_pov when available', () => {
    const signal = makeSignal(['high_deletion']);
    const suggestions = getDetourSuggestions(signal, {
      characterNames: ['Alice', 'Bob'],
    });
    const altPov = suggestions.find(s => s.type === 'alternate_pov');
    expect(altPov).toBeDefined();
    expect(altPov!.prompt).toContain('Bob');
  });

  it('exposes the raw promptParam for i18n rendering (value or null)', () => {
    const withData = getDetourSuggestions(makeSignal(['low_wpm']), {
      characterNames: ['Alice'],
    });
    const dialogueSprint = withData.find(s => s.type === 'dialogue_sprint');
    expect(dialogueSprint!.promptParam).toBe('Alice');

    const withoutData = getDetourSuggestions(makeSignal(['low_wpm']), {});
    for (const s of withoutData) {
      // No story data → null so the renderer substitutes a translated default
      expect(s.promptParam).toBeNull();
    }
  });

  it('returns unique detour types (no duplicates)', () => {
    const suggestions = getDetourSuggestions(makeSignal(['low_wpm', 'high_deletion', 'idle']), {});
    const types = suggestions.map(s => s.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('all returned types are valid DetourType values', () => {
    const allTypes = getAllDetourTypes();
    const suggestions = getDetourSuggestions(makeSignal(), {});
    for (const s of suggestions) {
      expect(allTypes).toContain(s.type);
    }
  });
});

describe('getAllDetourTypes', () => {
  it('returns all 6 detour types', () => {
    const types = getAllDetourTypes();
    expect(types).toHaveLength(6);
  });

  it('includes expected detour types', () => {
    const types = getAllDetourTypes();
    expect(types).toContain('dialogue_sprint');
    expect(types).toContain('alternate_pov');
    expect(types).toContain('sensory_snapshot');
    expect(types).toContain('villains_diary');
    expect(types).toContain('flash_forward');
    expect(types).toContain('character_interview');
  });
});
