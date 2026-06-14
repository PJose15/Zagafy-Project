import { describe, it, expect } from 'vitest';
import { analyzeStoryState, getCharacterById } from '@/lib/story-brain/analyzer';
import type { StoryState } from '@/lib/store';

function makeEmptyState(overrides: Partial<StoryState> = {}): StoryState {
  return {
    language: 'en',
    title: 'Test Story',
    genre: ['fantasy'],
    synopsis: '',
    author_intent: '',
    author_name: '',
    author_email: '',
    author_address: '',
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
  };
}

describe('analyzeStoryState', () => {
  it('returns empty analysis for empty state', () => {
    const result = analyzeStoryState(makeEmptyState());
    expect(result.entities).toEqual([]);
    expect(result.relationships).toEqual([]);
    expect(result.totalMentions).toBe(0);
    expect(result.entityCountByType).toEqual({
      character: 0,
      location: 0,
      event: 0,
      conflict: 0,
    });
  });

  it('catalogs characters with mention counts', () => {
    const state = makeEmptyState({
      chapters: [
        { id: 'ch1', title: 'Chapter 1', content: 'Alice went to the market. Alice bought apples.', summary: '' },
      ],
      characters: [
        { id: 'c1', name: 'Alice', role: 'protagonist', description: '', relationships: '' },
      ],
    });

    const result = analyzeStoryState(state);
    expect(result.entities).toHaveLength(1);
    const alice = result.entities[0];
    expect(alice.name).toBe('Alice');
    expect(alice.type).toBe('character');
    expect(alice.mentionCount).toBe(2);
    expect(alice.firstAppearanceChapter).toBe(0);
    expect(alice.lastAppearanceChapter).toBe(0);
  });

  it('tracks first and last appearance across chapters', () => {
    const state = makeEmptyState({
      chapters: [
        { id: 'ch1', title: '', content: 'Bob arrives.', summary: '' },
        { id: 'ch2', title: '', content: 'No one is here.', summary: '' },
        { id: 'ch3', title: '', content: 'Bob returns.', summary: '' },
      ],
      characters: [
        { id: 'c1', name: 'Bob', role: 'hero', description: '', relationships: '' },
      ],
    });

    const result = analyzeStoryState(state);
    const bob = result.entities[0];
    expect(bob.firstAppearanceChapter).toBe(0);
    expect(bob.lastAppearanceChapter).toBe(2);
  });

  it('returns -1 for characters with no mentions', () => {
    const state = makeEmptyState({
      chapters: [{ id: 'ch1', title: '', content: 'Nothing here', summary: '' }],
      characters: [
        { id: 'c1', name: 'Ghost', role: 'side', description: '', relationships: '' },
      ],
    });

    const result = analyzeStoryState(state);
    expect(result.entities[0].firstAppearanceChapter).toBe(-1);
    expect(result.entities[0].lastAppearanceChapter).toBe(-1);
  });

  it('catalogs locations with mention counts', () => {
    const state = makeEmptyState({
      chapters: [
        { id: 'ch1', title: '', content: 'They reached the castle.', summary: '' },
        { id: 'ch2', title: '', content: 'The castle was dark.', summary: '' },
      ],
      locations: [
        { id: 'l1', name: 'Castle', description: '', importance: 'high', associatedRules: [] },
      ],
    });

    const result = analyzeStoryState(state);
    const castle = result.entities.find(e => e.name === 'Castle');
    expect(castle).toBeDefined();
    expect(castle!.type).toBe('location');
    expect(castle!.mentionCount).toBe(2);
    expect(castle!.relationshipCount).toBe(0);
  });

  it('catalogs timeline events as event entities', () => {
    // The analyzer uses descLower.slice(0, 40) as the search term for events.
    // Keep description short (under 40 chars) so the full description is the search term
    // and ensure the chapter content contains it verbatim.
    const state = makeEmptyState({
      chapters: [{ id: 'ch1', title: '', content: 'The great fire spread through town today and many fled.', summary: '' }],
      timeline_events: [
        { id: 'te1', date: '1666-09-02', description: 'the great fire spread through town', impact: 'Destroyed half the city' },
      ],
    });

    const result = analyzeStoryState(state);
    const event = result.entities.find(e => e.type === 'event');
    expect(event).toBeDefined();
    expect(event!.mentionCount).toBeGreaterThanOrEqual(1);
  });

  it('catalogs active conflicts', () => {
    const state = makeEmptyState({
      chapters: [{ id: 'ch1', title: '', content: 'The war of shadows raged on.', summary: '' }],
      active_conflicts: [
        { id: 'cf1', title: 'War of Shadows', description: 'An ongoing conflict', status: 'active' },
      ],
    });

    const result = analyzeStoryState(state);
    const conflict = result.entities.find(e => e.type === 'conflict');
    expect(conflict).toBeDefined();
    expect(conflict!.name).toBe('War of Shadows');
    expect(result.entityCountByType.conflict).toBe(1);
  });

  it('builds relationship pairs without duplicates', () => {
    const state = makeEmptyState({
      characters: [
        {
          id: 'c1', name: 'Alice', role: '', description: '', relationships: '',
          dynamicRelationships: [{ targetId: 'c2', trustLevel: 80, tensionLevel: 20, dynamics: 'friends' }],
        },
        {
          id: 'c2', name: 'Bob', role: '', description: '', relationships: '',
          dynamicRelationships: [{ targetId: 'c1', trustLevel: 70, tensionLevel: 30, dynamics: 'friends' }],
        },
      ],
    });

    const result = analyzeStoryState(state);
    // Should only have one pair, not two
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0].sourceName).toBe('Alice');
    expect(result.relationships[0].targetName).toBe('Bob');
  });

  it('finds entity scenes from scene content', () => {
    const state = makeEmptyState({
      chapters: [{ id: 'ch1', title: '', content: 'Dana appears.', summary: '' }],
      scenes: [
        { id: 's1', chapterId: 'ch1', title: 'Arrival', content: 'Dana walked in.', summary: '' },
        { id: 's2', chapterId: 'ch1', title: 'Departure', content: 'Others left.', summary: '' },
      ],
      characters: [
        { id: 'c1', name: 'Dana', role: '', description: '', relationships: '' },
      ],
    });

    const result = analyzeStoryState(state);
    const dana = result.entities[0];
    expect(dana.sceneIds).toContain('s1');
    expect(dana.sceneIds).not.toContain('s2');
  });

  it('computes totalMentions as sum of all entity mentions', () => {
    const state = makeEmptyState({
      chapters: [{ id: 'ch1', title: '', content: 'Alice met Bob at the castle.', summary: '' }],
      characters: [
        { id: 'c1', name: 'Alice', role: '', description: '', relationships: '' },
        { id: 'c2', name: 'Bob', role: '', description: '', relationships: '' },
      ],
      locations: [
        { id: 'l1', name: 'Castle', description: '', importance: '', associatedRules: [] },
      ],
    });

    const result = analyzeStoryState(state);
    const sum = result.entities.reduce((s, e) => s + e.mentionCount, 0);
    expect(result.totalMentions).toBe(sum);
    expect(result.totalMentions).toBeGreaterThanOrEqual(3);
  });

  it('computes entityCountByType correctly', () => {
    const state = makeEmptyState({
      characters: [
        { id: 'c1', name: 'A', role: '', description: '', relationships: '' },
        { id: 'c2', name: 'B', role: '', description: '', relationships: '' },
      ],
      locations: [{ id: 'l1', name: 'L', description: '', importance: '', associatedRules: [] }],
      timeline_events: [{ id: 'te1', date: '', description: 'Event one happened', impact: '' }],
      active_conflicts: [{ id: 'cf1', title: 'Conflict', description: '', status: 'active' }],
    });

    const result = analyzeStoryState(state);
    expect(result.entityCountByType.character).toBe(2);
    expect(result.entityCountByType.location).toBe(1);
    expect(result.entityCountByType.event).toBe(1);
    expect(result.entityCountByType.conflict).toBe(1);
  });

  it('is case-insensitive for mention counting', () => {
    const state = makeEmptyState({
      chapters: [{ id: 'ch1', title: 'ALICE', content: 'alice went home. Alice slept.', summary: '' }],
      characters: [{ id: 'c1', name: 'Alice', role: '', description: '', relationships: '' }],
    });

    const result = analyzeStoryState(state);
    // title has "ALICE", content has "alice" and "Alice" = 3 mentions
    expect(result.entities[0].mentionCount).toBe(3);
  });

  it('does not count substring matches (word-boundary enforcement)', () => {
    // "Alex" should NOT be counted inside "Alexandria".
    const state = makeEmptyState({
      chapters: [
        { id: 'ch1', title: '', content: 'Alexandria is a city. Alexander ruled it. Alex arrived late.', summary: '' },
      ],
      characters: [{ id: 'c1', name: 'Alex', role: '', description: '', relationships: '' }],
    });
    const result = analyzeStoryState(state);
    // Only the standalone "Alex" should count — not "Alexandria" or "Alexander"
    expect(result.entities[0].mentionCount).toBe(1);
  });

  it('escapes regex metacharacters in character names', () => {
    // A name containing a regex metachar must not explode or over-match.
    const state = makeEmptyState({
      chapters: [{ id: 'ch1', title: '', content: 'D.J. arrived. DXJ did not.', summary: '' }],
      characters: [{ id: 'c1', name: 'D.J.', role: '', description: '', relationships: '' }],
    });
    const result = analyzeStoryState(state);
    // Only literal "D.J." should match, not "DXJ" (which would match if `.` was a regex wildcard).
    expect(result.entities[0].mentionCount).toBe(1);
  });

  it('handles very short names (< 2 chars) by returning 0 mentions', () => {
    const state = makeEmptyState({
      chapters: [{ id: 'ch1', title: '', content: 'I am here.', summary: '' }],
      characters: [{ id: 'c1', name: 'I', role: '', description: '', relationships: '' }],
    });

    const result = analyzeStoryState(state);
    expect(result.entities[0].mentionCount).toBe(0);
    expect(result.entities[0].firstAppearanceChapter).toBe(-1);
  });

  it('preserves canonStatus and source on entities', () => {
    const state = makeEmptyState({
      characters: [
        { id: 'c1', name: 'Zara', role: '', description: '', relationships: '', canonStatus: 'confirmed', source: 'manuscript' },
      ],
    });

    const result = analyzeStoryState(state);
    expect(result.entities[0].canonStatus).toBe('confirmed');
    expect(result.entities[0].source).toBe('manuscript');
  });

  it('findEntityScenes matches via scene title alone', () => {
    const state = makeEmptyState({
      chapters: [{ id: 'ch1', title: '', content: 'No mention here.', summary: '' }],
      scenes: [
        { id: 's1', chapterId: 'ch1', title: 'Elena Arrives', content: 'The room was empty.', summary: '' },
      ],
      characters: [
        { id: 'c1', name: 'Elena', role: '', description: '', relationships: '' },
      ],
    });
    const result = analyzeStoryState(state);
    const elena = result.entities[0];
    expect(elena.sceneIds).toContain('s1');
  });

  it('findEntityScenes matches via scene summary alone', () => {
    const state = makeEmptyState({
      chapters: [{ id: 'ch1', title: '', content: 'No mention here.', summary: '' }],
      scenes: [
        { id: 's1', chapterId: 'ch1', title: 'Unknown', content: 'Empty.', summary: 'Marco enters the room.' },
      ],
      characters: [
        { id: 'c1', name: 'Marco', role: '', description: '', relationships: '' },
      ],
    });
    const result = analyzeStoryState(state);
    expect(result.entities[0].sceneIds).toContain('s1');
  });

  it('dynamicRelationship with nonexistent target is skipped silently', () => {
    const state = makeEmptyState({
      characters: [
        {
          id: 'c1', name: 'Alice', role: '', description: '', relationships: '',
          dynamicRelationships: [{ targetId: 'nonexistent', trustLevel: 50, tensionLevel: 50, dynamics: 'friends' }],
        },
      ],
    });
    const result = analyzeStoryState(state);
    expect(result.relationships).toHaveLength(0);
  });

  it('event name is truncated at 60 chars', () => {
    const longDesc = 'A'.repeat(100);
    const state = makeEmptyState({
      timeline_events: [{ id: 'te1', date: '2025-01-01', description: longDesc, impact: '' }],
    });
    const result = analyzeStoryState(state);
    const event = result.entities.find(e => e.type === 'event');
    expect(event).toBeDefined();
    expect(event!.name).toHaveLength(60);
  });
});  // end analyzeStoryState

describe('getCharacterById', () => {
  it('returns the character when found', () => {
    const state = makeEmptyState({
      characters: [
        { id: 'c1', name: 'Alice', role: '', description: '', relationships: '' },
        { id: 'c2', name: 'Bob', role: '', description: '', relationships: '' },
      ],
    });
    expect(getCharacterById(state, 'c2')?.name).toBe('Bob');
  });

  it('returns undefined for non-existent ID', () => {
    const state = makeEmptyState();
    expect(getCharacterById(state, 'missing')).toBeUndefined();
  });
});
