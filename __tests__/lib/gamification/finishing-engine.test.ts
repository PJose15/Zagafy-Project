import { describe, it, expect } from 'vitest';
import { analyzeStory, totalWords, phaseFromProgress, MILESTONE_DEFINITIONS, PHASE_ORDER } from '@/lib/gamification/finishing-engine';
import type { StoryState } from '@/lib/store';

function makeStory(overrides: Partial<StoryState> = {}): StoryState {
  return {
    language: 'en',
    title: 'Test',
    genre: [],
    synopsis: '',
    author_intent: '',
    chapters: [],
    scenes: [],
    characters: [],
    timeline_events: [],
    open_loops: [],
    world_rules: [],
    style_profile: '',
    active_conflicts: [],
    foreshadowing_elements: [],
    locations: [],
    themes: [],
    canon_items: [],
    ambiguities: [],
    chat_messages: [],
    world_bible: [],
    ...overrides,
  } as StoryState;
}

function makeChapter(wordCount: number, id?: string) {
  const words = Array.from({ length: wordCount }, (_, i) => `word${i}`).join(' ');
  return { id: id ?? 'ch-1', title: 'Chapter', content: words, summary: '' };
}

describe('totalWords', () => {
  it('returns 0 for empty story', () => {
    expect(totalWords(makeStory())).toBe(0);
  });

  it('counts words across chapters', () => {
    const story = makeStory({
      chapters: [makeChapter(100, 'ch-1'), makeChapter(200, 'ch-2')],
    });
    expect(totalWords(story)).toBe(300);
  });
});

describe('phaseFromProgress', () => {
  it('returns setup for 0%', () => {
    expect(phaseFromProgress(0)).toBe('setup');
  });

  it('returns rising-action for 15%', () => {
    expect(phaseFromProgress(15)).toBe('rising-action');
  });

  it('returns midpoint for 35%', () => {
    expect(phaseFromProgress(35)).toBe('midpoint');
  });

  it('returns climax for 55%', () => {
    expect(phaseFromProgress(55)).toBe('climax');
  });

  it('returns falling-action for 75%', () => {
    expect(phaseFromProgress(75)).toBe('falling-action');
  });

  it('returns resolution for 90%', () => {
    expect(phaseFromProgress(90)).toBe('resolution');
  });

  it('returns resolution for 100%', () => {
    expect(phaseFromProgress(100)).toBe('resolution');
  });
});

describe('MILESTONE_DEFINITIONS', () => {
  it('has 10 milestones', () => {
    expect(MILESTONE_DEFINITIONS).toHaveLength(10);
  });

  it('all milestones have required fields', () => {
    for (const m of MILESTONE_DEFINITIONS) {
      expect(m.id).toBeTruthy();
      expect(m.phase).toBeTruthy();
      expect(m.description).toBeTruthy();
      expect(m.weight).toBeGreaterThan(0);
      expect(typeof m.check).toBe('function');
    }
  });

  it('total weight sums to 100', () => {
    const total = MILESTONE_DEFINITIONS.reduce((s, m) => s + m.weight, 0);
    expect(total).toBe(100);
  });
});

describe('PHASE_ORDER', () => {
  it('has 6 phases in correct order', () => {
    expect(PHASE_ORDER).toEqual([
      'setup', 'rising-action', 'midpoint', 'climax', 'falling-action', 'resolution',
    ]);
  });
});

describe('analyzeStory', () => {
  it('returns 0% for empty story', () => {
    const result = analyzeStory(makeStory());
    expect(result.overallProgress).toBe(0);
    expect(result.currentPhase).toBe('setup');
    expect(result.milestones).toHaveLength(10);
    expect(result.milestones.every((m) => !m.completed)).toBe(true);
  });

  it('detects synopsis written', () => {
    const story = makeStory({ synopsis: 'A story about adventure' });
    const result = analyzeStory(story);
    const milestone = result.milestones.find((m) => m.id === 'synopsis-written');
    expect(milestone?.completed).toBe(true);
  });

  it('detects 3+ characters', () => {
    const story = makeStory({
      characters: [
        { id: '1', name: 'A', role: '', description: '', relationships: '' },
        { id: '2', name: 'B', role: '', description: '', relationships: '' },
        { id: '3', name: 'C', role: '', description: '', relationships: '' },
      ] as any,
    });
    const result = analyzeStory(story);
    const milestone = result.milestones.find((m) => m.id === 'three-characters');
    expect(milestone?.completed).toBe(true);
  });

  it('detects first chapter with 500+ words', () => {
    const story = makeStory({ chapters: [makeChapter(500)] });
    const result = analyzeStory(story);
    const milestone = result.milestones.find((m) => m.id === 'first-chapter');
    expect(milestone?.completed).toBe(true);
  });

  it('does not mark first-chapter with < 500 words', () => {
    const story = makeStory({ chapters: [makeChapter(100)] });
    const result = analyzeStory(story);
    const milestone = result.milestones.find((m) => m.id === 'first-chapter');
    expect(milestone?.completed).toBe(false);
  });

  it('detects active conflict', () => {
    const story = makeStory({
      active_conflicts: [{ id: '1', title: 'War', description: '', status: 'active' }] as any,
    });
    const result = analyzeStory(story);
    const milestone = result.milestones.find((m) => m.id === 'active-conflict');
    expect(milestone?.completed).toBe(true);
  });

  it('detects 5 chapters', () => {
    const story = makeStory({
      chapters: Array.from({ length: 5 }, (_, i) => makeChapter(100, `ch-${i}`)),
    });
    const result = analyzeStory(story);
    const milestone = result.milestones.find((m) => m.id === 'five-chapters');
    expect(milestone?.completed).toBe(true);
  });

  it('detects 3+ open loops', () => {
    const story = makeStory({
      open_loops: [
        { id: '1', description: 'a', status: 'open' },
        { id: '2', description: 'b', status: 'open' },
        { id: '3', description: 'c', status: 'open' },
      ] as any,
    });
    const result = analyzeStory(story);
    const milestone = result.milestones.find((m) => m.id === 'three-open-loops');
    expect(milestone?.completed).toBe(true);
  });

  it('detects foreshadowing', () => {
    const story = makeStory({
      foreshadowing_elements: [{ id: '1', clue: 'x', payoff: 'y' }] as any,
    });
    const result = analyzeStory(story);
    const milestone = result.milestones.find((m) => m.id === 'foreshadowing-planted');
    expect(milestone?.completed).toBe(true);
  });

  it('calculates correct progress percentage', () => {
    // Complete setup: synopsis(8) + 3 chars(10) + first chapter 500w(12) = 30/100 = 30%
    const story = makeStory({
      synopsis: 'Story synopsis',
      characters: [
        { id: '1', name: 'A', role: '', description: '', relationships: '' },
        { id: '2', name: 'B', role: '', description: '', relationships: '' },
        { id: '3', name: 'C', role: '', description: '', relationships: '' },
      ] as any,
      chapters: [makeChapter(500)],
    });
    const result = analyzeStory(story);
    expect(result.overallProgress).toBe(30);
  });

  it('suggests next action for incomplete milestone', () => {
    const result = analyzeStory(makeStory());
    expect(result.nextSuggestion).toBe('Write a synopsis for your story');
    // i18n: the stable milestone id travels alongside the English fallback
    expect(result.nextSuggestionId).toBe('synopsis-written');
  });

  it('suggests completion when all milestones done', () => {
    const story = makeStory({
      synopsis: 'Story',
      characters: Array.from({ length: 3 }, (_, i) => ({ id: `${i}`, name: `C${i}`, role: '', description: '', relationships: '' })) as any,
      chapters: Array.from({ length: 5 }, (_, i) => makeChapter(4100, `ch-${i}`)), // 5 chapters × 4100 = 20500 words
      active_conflicts: [
        { id: '1', title: 'War', description: '', status: 'resolved' },
        { id: '2', title: 'Love', description: '', status: 'resolved' },
        { id: '3', title: 'Power', description: '', status: 'active' },
      ] as any,
      open_loops: [
        { id: '1', description: 'a', status: 'closed' },
        { id: '2', description: 'b', status: 'closed' },
        { id: '3', description: 'c', status: 'closed' },
        { id: '4', description: 'd', status: 'open' },
        { id: '5', description: 'e', status: 'open' },
        { id: '6', description: 'f', status: 'open' },
      ] as any,
      foreshadowing_elements: [{ id: '1', clue: 'x', payoff: 'y' }] as any,
    });
    const result = analyzeStory(story);
    expect(result.overallProgress).toBe(100);
    expect(result.nextSuggestion).toContain('complete');
    // i18n: null id = story complete (renderer shows milestoneDesc.complete)
    expect(result.nextSuggestionId).toBeNull();
  });
});

describe('phaseFromProgress edge cases', () => {
  it('handles NaN → setup', () => expect(phaseFromProgress(NaN)).toBe('setup'));
  it('handles Infinity → setup (non-finite clamps to 0)', () => expect(phaseFromProgress(Infinity)).toBe('setup'));
  it('handles -Infinity → setup', () => expect(phaseFromProgress(-Infinity)).toBe('setup'));
  it('handles negative → setup', () => expect(phaseFromProgress(-10)).toBe('setup'));
  it('handles 14 → setup (boundary)', () => expect(phaseFromProgress(14)).toBe('setup'));
  it('handles 34 → rising-action (boundary)', () => expect(phaseFromProgress(34)).toBe('rising-action'));
  it('handles 54 → midpoint (boundary)', () => expect(phaseFromProgress(54)).toBe('midpoint'));
  it('handles 74 → climax (boundary)', () => expect(phaseFromProgress(74)).toBe('climax'));
  it('handles 89 → falling-action (boundary)', () => expect(phaseFromProgress(89)).toBe('falling-action'));
  it('handles >100 → resolution (clamp)', () => expect(phaseFromProgress(200)).toBe('resolution'));
});

describe('totalWords edge cases', () => {
  it('returns 0 when chapters is not an array', () => {
    expect(totalWords(makeStory({ chapters: null as any }))).toBe(0);
  });
  it('returns 0 for chapters with empty content', () => {
    expect(totalWords(makeStory({ chapters: [{ id: '1', title: '', content: '', summary: '' }] }))).toBe(0);
  });
  it('handles undefined content', () => {
    expect(totalWords(makeStory({ chapters: [{ id: '1', title: '', content: undefined as any, summary: '' }] }))).toBe(0);
  });
});

describe('analyzeStory milestone edge cases', () => {
  it('preserves previously completed milestones', () => {
    const emptyStory = makeStory();
    const prevMilestones = [{ id: 'synopsis-written', phase: 'setup', description: 'x', weight: 8, completed: true }];
    const result = analyzeStory(emptyStory, prevMilestones as any);
    expect(result.milestones.find(m => m.id === 'synopsis-written')?.completed).toBe(true);
  });

  it('retains previously completed milestone when condition no longer met', () => {
    // First analyze with synopsis present
    const storyWithSynopsis = makeStory({ synopsis: 'A great adventure' });
    const firstResult = analyzeStory(storyWithSynopsis);
    expect(firstResult.milestones.find(m => m.id === 'synopsis-written')?.completed).toBe(true);

    // Now analyze without synopsis but pass previous milestones
    const storyWithout = makeStory({ synopsis: '' });
    const result = analyzeStory(storyWithout, firstResult.milestones);
    expect(result.milestones.find(m => m.id === 'synopsis-written')?.completed).toBe(true);
  });

  it('handles null active_conflicts for conflict milestone', () => {
    const story = makeStory({ active_conflicts: null as any });
    const result = analyzeStory(story);
    expect(result.milestones.find(m => m.id === 'active-conflict')?.completed).toBe(false);
  });

  it('handles null open_loops for loop milestone', () => {
    const story = makeStory({ open_loops: null as any });
    const result = analyzeStory(story);
    expect(result.milestones.find(m => m.id === 'three-open-loops')?.completed).toBe(false);
  });

  it('handles null foreshadowing_elements', () => {
    const story = makeStory({ foreshadowing_elements: null as any });
    const result = analyzeStory(story);
    expect(result.milestones.find(m => m.id === 'foreshadowing-planted')?.completed).toBe(false);
  });

  it('conflict resolution requires ≥50%', () => {
    const story = makeStory({
      active_conflicts: [
        { id: '1', title: 'A', status: 'resolved' },
        { id: '2', title: 'B', status: 'active' },
        { id: '3', title: 'C', status: 'active' },
      ] as any,
    });
    const result = analyzeStory(story);
    expect(result.milestones.find(m => m.id === 'half-conflicts-resolved')?.completed).toBe(false);
  });

  it('loop closure requires ≥50%', () => {
    const story = makeStory({
      open_loops: [
        { id: '1', description: 'a', status: 'closed' },
        { id: '2', description: 'b', status: 'open' },
        { id: '3', description: 'c', status: 'open' },
      ] as any,
    });
    const result = analyzeStory(story);
    expect(result.milestones.find(m => m.id === 'half-loops-closed')?.completed).toBe(false);
  });
});
