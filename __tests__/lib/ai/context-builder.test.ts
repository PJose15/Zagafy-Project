import { describe, it, expect } from 'vitest';
import { buildContext } from '@/lib/ai/context-builder';
import { defaultState, type StoryState } from '@/lib/store';

function makeState(overrides: Partial<StoryState> = {}): StoryState {
  return {
    ...defaultState,
    title: 'Test Story',
    synopsis: 'A test story about Elena.',
    language: 'English',
    characters: [
      {
        id: 'c1',
        name: 'Elena',
        role: 'Protagonist',
        description: 'A young archaeologist.',
        relationships: 'Sister of Marco',
        canonStatus: 'confirmed',
      },
      {
        id: 'c2',
        name: 'Marco',
        role: 'Supporting',
        description: 'Elena\'s older brother.',
        relationships: 'Brother of Elena',
        canonStatus: 'confirmed',
      },
    ],
    chapters: [
      { id: 'ch1', title: 'The Discovery', content: 'Elena finds an ancient artifact...', summary: 'Elena discovers an artifact in the ruins.', canonStatus: 'confirmed' },
      { id: 'ch2', title: 'The Letter', content: 'A mysterious letter arrives...', summary: 'A letter reveals a family secret.', canonStatus: 'flexible' },
    ],
    scenes: [],
    locations: [
      { id: 'l1', name: 'The Ruins', description: 'Ancient ruins outside the city.', importance: 'Major setting', associatedRules: [], canonStatus: 'confirmed' },
    ],
    active_conflicts: [
      { id: 'conf1', title: 'Family Secret', description: 'Elena must decide whether to reveal the truth.', status: 'active', canonStatus: 'confirmed' },
    ],
    open_loops: [
      { id: 'ol1', description: 'Who sent the letter?', status: 'open', canonStatus: 'confirmed' },
    ],
    ...overrides,
  };
}

describe('buildContext', () => {
  it('returns context string and known entities', () => {
    const state = makeState();
    const result = buildContext(state, { userInput: 'What happens next?', isBlockedMode: false });

    expect(typeof result.context).toBe('string');
    expect(result.context.length).toBeGreaterThan(0);
    expect(result.knownEntities.characters).toContain('Elena');
    expect(result.knownEntities.characters).toContain('Marco');
    expect(result.knownEntities.chapters).toContain('The Discovery');
    expect(result.knownEntities.locations).toContain('The Ruins');
  });

  it('includes story title and synopsis', () => {
    const state = makeState();
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });

    expect(context).toContain('Test Story');
    expect(context).toContain('A test story about Elena.');
  });

  it('includes context inventory with correct counts', () => {
    const state = makeState();
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });

    expect(context).toContain('Characters (2)');
    expect(context).toContain('Chapters (2)');
    expect(context).toContain('Locations (1)');
    expect(context).toContain('Active Conflicts (1)');
  });

  it('includes entity names in context inventory', () => {
    const state = makeState();
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });

    // Character names
    expect(context).toContain('Characters (2): Elena, Marco');
    // Chapter titles
    expect(context).toContain('Chapters (2): The Discovery, The Letter');
    // Location names
    expect(context).toContain('Locations (1): The Ruins');
    // Conflict titles
    expect(context).toContain('Active Conflicts (1): Family Secret');
  });

  it('includes confirmed canon items', () => {
    const state = makeState();
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });

    expect(context).toContain('CONFIRMED CANON');
    expect(context).toContain('Elena');
    expect(context).toContain('The Discovery');
  });

  it('excludes discarded items', () => {
    const state = makeState({
      characters: [
        ...makeState().characters,
        { id: 'c3', name: 'Removed Character', role: 'Villain', description: 'Gone', relationships: '', canonStatus: 'discarded' },
      ],
    });
    const { context, knownEntities } = buildContext(state, { userInput: 'test', isBlockedMode: false });

    expect(context).not.toContain('Removed Character');
    expect(knownEntities.characters).not.toContain('Removed Character');
  });

  it('respects maxLength limit', () => {
    const state = makeState();
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false, maxLength: 2000 });

    // The header alone takes space, but optional sections should be truncated to stay near limit
    expect(context.length).toBeLessThanOrEqual(2500); // header + truncation manifest buffer
  });

  it('includes writer block type when provided', () => {
    const state = makeState();
    const { context } = buildContext(state, {
      userInput: 'test',
      isBlockedMode: false,
      writerBlockType: 'fear',
    });

    expect(context).toContain('WRITER STATE: FEAR');
  });

  it('includes open loops section', () => {
    const state = makeState();
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });

    expect(context).toContain('Who sent the letter?');
  });

  it('handles empty story state gracefully', () => {
    const { context, knownEntities } = buildContext(defaultState, { userInput: 'test', isBlockedMode: false });

    expect(context).toContain('CONTEXT INVENTORY');
    expect(context).toContain('Characters (0): None');
    expect(knownEntities.characters).toHaveLength(0);
  });

  it('in blocked mode, uses larger content limit and includes conflicts', () => {
    const state = makeState();
    const { context: normalCtx } = buildContext(state, { userInput: 'test', isBlockedMode: false });
    const { context: blockedCtx } = buildContext(state, { userInput: 'test', isBlockedMode: true });

    // Blocked mode should include conflicts section explicitly
    expect(blockedCtx).toContain('ACTIVE CONFLICTS');
    expect(blockedCtx).toContain('Family Secret');
    // Both should include the conflict in confirmed canon at least
    expect(normalCtx).toContain('Family Secret');
  });

  it('places truncation manifest before story sections when truncation occurs', () => {
    const state = makeState();
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false, maxLength: 2000 });

    const manifestIdx = context.indexOf('CONTEXT TRUNCATION MANIFEST');
    if (manifestIdx !== -1) {
      // Manifest should appear before optional sections like OPEN LOOPS
      const openLoopsIdx = context.indexOf('OPEN LOOPS');
      if (openLoopsIdx !== -1) {
        expect(manifestIdx).toBeLessThan(openLoopsIdx);
      }
      // Manifest should appear after the header (STORY BIBLE)
      const storyBibleIdx = context.indexOf('STORY BIBLE');
      expect(manifestIdx).toBeGreaterThan(storyBibleIdx);
      // Should contain the "read this FIRST" marker
      expect(context).toContain('read this FIRST');
    }
  });

  it('includes timeline temporal ordering markers', () => {
    const state = makeState({
      timeline_events: [
        { id: 't1', date: '2024-03-01', description: 'Event B happens', impact: 'moderate', canonStatus: 'confirmed' },
        { id: 't2', date: '2024-01-15', description: 'Event A happens', impact: 'major', canonStatus: 'confirmed' },
        { id: 't3', date: '2024-06-20', description: 'Event C happens', impact: 'minor', canonStatus: 'confirmed' },
      ],
    });
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });

    // Should contain ordering markers
    expect(context).toContain('[earliest]');
    expect(context).toContain('[after:');
    // First event chronologically should be marked [earliest]
    expect(context).toContain('2024-01-15 [earliest]');
    // Later events should reference the previous date
    expect(context).toContain('[after: 2024-01-15]');
  });

  it('detects orphaned scenes', () => {
    const state = makeState({
      scenes: [
        { id: 's1', chapterId: 'nonexistent', title: 'Orphan Scene', content: '', summary: 'An orphaned scene', canonStatus: 'draft' },
      ],
    });
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });

    expect(context).toContain('DATA INTEGRITY NOTES');
    expect(context).toContain('non-existent chapters');
  });
});

// ── Additional branch coverage tests ──

describe('buildContext — source provenance tags', () => {
  it('appends [AI-inferred] tag for ai-inferred source', () => {
    const state = makeState({
      locations: [
        { id: 'l1', name: 'Forest', description: 'Dark', source: 'ai-inferred', canonStatus: 'confirmed', importance: '', associatedRules: [] },
      ],
    });
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });
    expect(context).toContain('[AI-inferred]');
  });

  it('appends [User-entered] tag for user-entered source', () => {
    const state = makeState({
      locations: [
        { id: 'l1', name: 'Lake', description: 'Blue', source: 'user-entered', canonStatus: 'confirmed', importance: '', associatedRules: [] },
      ],
    });
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });
    expect(context).toContain('[User-entered]');
  });

  it('no tag for items without source field', () => {
    const state = makeState({
      locations: [
        { id: 'l1', name: 'River', description: 'Flowing', canonStatus: 'confirmed', importance: '', associatedRules: [] },
      ],
    });
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });
    const riverLine = context.split('\n').find(l => l.includes('[Location] River'));
    expect(riverLine).toBeDefined();
    expect(riverLine).not.toContain('[AI-inferred]');
    expect(riverLine).not.toContain('[User-entered]');
  });
});

describe('buildContext — relevance boosting', () => {
  it('boosts chapters mentioned by title in user input', () => {
    const state = makeState({
      chapters: [
        { id: 'ch1', title: 'The Discovery', content: 'text', summary: 'Summary A', canonStatus: 'confirmed' },
        { id: 'ch2', title: 'The Letter', content: 'text', summary: 'Summary B', canonStatus: 'confirmed' },
      ],
    });
    const { context } = buildContext(state, { userInput: 'Tell me about The Letter', isBlockedMode: false });
    // "The Letter" should come first in chapter summaries
    const summaries = context.substring(context.indexOf('ALL CHAPTER SUMMARIES'));
    const letterIdx = summaries.indexOf('The Letter');
    const discoveryIdx = summaries.indexOf('The Discovery');
    expect(letterIdx).toBeLessThan(discoveryIdx);
  });

  it('boosts relationship targets when character is mentioned', () => {
    const state = makeState({
      characters: [
        {
          id: 'c1', name: 'Elena', role: 'Protagonist', description: 'Hero',
          relationships: '', canonStatus: 'confirmed',
          dynamicRelationships: [{ targetId: 'c2', trustLevel: 90, tensionLevel: 10, dynamics: 'sibling bond' }],
        },
        { id: 'c2', name: 'Marco', role: 'Supporting', description: 'Brother', relationships: '', canonStatus: 'confirmed' },
      ],
    });
    const { context } = buildContext(state, { userInput: 'Tell me about Elena', isBlockedMode: false });
    expect(context).toContain('Marco (Trust:90% Tension:10%): sibling bond');
  });
});

describe('buildContext — orphaned relationships', () => {
  it('reports orphaned relationship when targetId does not match any character', () => {
    const state = makeState({
      characters: [
        {
          id: 'c1', name: 'Elena', role: 'Protagonist', description: 'Hero',
          relationships: '', canonStatus: 'confirmed',
          dynamicRelationships: [{ targetId: 'ghost', trustLevel: 50, tensionLevel: 50, dynamics: 'mystery' }],
        },
      ],
    });
    const { context } = buildContext(state, { userInput: 'Elena', isBlockedMode: false });
    expect(context).toContain('DATA INTEGRITY NOTES');
    expect(context).toContain('Orphaned relationship');
    expect(context).toContain('targetId "ghost"');
  });
});

describe('buildContext — character detail formatting', () => {
  it('includes coreIdentity, currentState, hiddenNeed, currentKnowledge', () => {
    const state = makeState({
      characters: [
        {
          id: 'c1', name: 'Elena', role: 'Protagonist', description: 'A brave hero',
          relationships: '', canonStatus: 'confirmed',
          coreIdentity: 'Fearless leader',
          currentState: {
            emotionalState: 'Anxious',
            visibleGoal: 'Find truth',
            currentFear: 'Betrayal',
            pressureLevel: 'High',
            hiddenNeed: 'Acceptance',
            currentKnowledge: 'The artifact is cursed',
            dominantBelief: 'Trust no one',
            emotionalWound: 'Abandoned as a child',
            indicator: 'under pressure',
          },
        },
      ],
    });
    const { context } = buildContext(state, { userInput: 'Elena', isBlockedMode: false });
    expect(context).toContain('Core Identity: Fearless leader');
    expect(context).toContain('State: Anxious');
    expect(context).toContain('Goal: Find truth');
    expect(context).toContain('Fear: Betrayal');
    expect(context).toContain('Hidden Need: Acceptance');
    expect(context).toContain('Knows: The artifact is cursed');
  });
});

describe('buildContext — author_intent', () => {
  it('includes author_intent block when non-empty', () => {
    const state = makeState();
    state.author_intent = 'Explore themes of forgiveness';
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });
    expect(context).toContain('CURRENT AUTHOR INTENT');
    expect(context).toContain('Explore themes of forgiveness');
  });

  it('omits author_intent block when empty', () => {
    const state = makeState();
    state.author_intent = '';
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });
    expect(context).not.toContain('CURRENT AUTHOR INTENT');
  });
});

describe('buildContext — blocked mode section ordering', () => {
  it('includes ACTIVE CONFLICTS and FORESHADOWING sections in blocked mode', () => {
    const state = makeState({
      foreshadowing_elements: [
        { id: 'f1', clue: 'Dark omen appears', payoff: '', canonStatus: 'confirmed' },
      ],
    });
    const { context } = buildContext(state, { userInput: 'stuck', isBlockedMode: true });
    expect(context).toContain('ACTIVE CONFLICTS');
    expect(context).toContain('FORESHADOWING');
    expect(context).toContain('Dark omen appears');
  });

  it('foreshadowing shows payoff when present, (unresolved) when absent', () => {
    const state = makeState({
      foreshadowing_elements: [
        { id: 'f1', clue: 'Shadow moves', payoff: 'The villain arrives', canonStatus: 'confirmed' },
        { id: 'f2', clue: 'Clock strikes', payoff: '', canonStatus: 'confirmed' },
      ],
    });
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: true });
    expect(context).toContain('Shadow moves -> The villain arrives');
    expect(context).toContain('Clock strikes (unresolved)');
  });
});

describe('buildContext — context truncation manifest', () => {
  it('produces manifest with specific omission counts', () => {
    // Create heavy canon_items and open_loops to force truncation
    const heavyItems = Array.from({ length: 40 }, (_, i) => ({
      id: `ci${i}`, category: 'plot', description: `Canon item ${i}: ${'X'.repeat(100)}`, status: 'confirmed',
    }));
    const heavyLoops = Array.from({ length: 40 }, (_, i) => ({
      id: `ol${i}`, description: `Loop ${i}: ${'Y'.repeat(100)}`, status: 'open', canonStatus: 'confirmed',
    }));

    const state = makeState({
      canon_items: heavyItems as typeof defaultState.canon_items,
      open_loops: heavyLoops as typeof defaultState.open_loops,
    });

    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false, maxLength: 3000 });
    expect(context).toContain('CONTEXT TRUNCATION MANIFEST');
    expect(context).toContain('items omitted');
  });

  it('does not produce manifest when everything fits', () => {
    const state = makeState();
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false, maxLength: 500000 });
    expect(context).not.toContain('CONTEXT TRUNCATION MANIFEST');
  });
});

describe('buildContext — scenes under chapters', () => {
  it('includes scenes in chapter block', () => {
    const state = makeState({
      chapters: [{ id: 'ch1', title: 'The Discovery', content: 'text', summary: 'start', canonStatus: 'confirmed' }],
      scenes: [{ id: 's1', chapterId: 'ch1', title: 'Opening', content: '', summary: 'The door opens', canonStatus: 'confirmed' }],
    });
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });
    expect(context).toContain('Scenes: Opening: The door opens');
  });
});

describe('buildContext — themes and world rules', () => {
  it('includes themes with evidence', () => {
    const state = makeState({
      themes: [
        { id: 'th1', theme: 'Redemption', evidence: ['Chapter 1 arc', 'Marco subplot'], canonStatus: 'confirmed' },
      ],
    });
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });
    expect(context).toContain('[Theme] Redemption: Chapter 1 arc, Marco subplot');
  });

  it('includes world rules by category', () => {
    const state = makeState({
      world_rules: [
        { id: 'wr1', category: 'Magic', rule: 'Magic costs lifeforce', canonStatus: 'confirmed' },
      ],
    });
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });
    expect(context).toContain('[World Rule] Magic: Magic costs lifeforce');
  });
});

describe('buildContext — ambiguities and canon_items', () => {
  it('includes ambiguities with affected section and confidence', () => {
    const state = makeState({
      ambiguities: [
        { id: 'a1', issue: 'Timeline conflict', affectedSection: 'Chapter 2', confidence: '0.3', recommendedReview: '' },
      ],
    });
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });
    expect(context).toContain('Timeline conflict (affects: Chapter 2, confidence: 0.3)');
  });

  it('includes canon_items with category and status', () => {
    const state = makeState({
      canon_items: [
        { id: 'ci1', category: 'plot', description: 'Elena finds the map', status: 'confirmed', sourceReference: '' },
      ],
    });
    const { context } = buildContext(state, { userInput: 'test', isBlockedMode: false });
    expect(context).toContain('[plot] Elena finds the map (confirmed)');
  });
});
