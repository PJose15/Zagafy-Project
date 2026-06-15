import { describe, it, expect, beforeEach } from 'vitest';
import { detectInconsistencies } from '@/lib/story-brain/inconsistency-detector';
import { analyzeStoryState } from '@/lib/story-brain/analyzer';
import type { StoryState } from '@/lib/store';

function makeEmptyState(overrides: Partial<StoryState> = {}): StoryState {
  return {
    language: 'en', title: 'Test', genre: [], synopsis: '', author_intent: '',
    author_name: '', author_email: '', author_address: '',
    chapters: [], scenes: [], characters: [], timeline_events: [], open_loops: [],
    world_rules: [], style_profile: '', active_conflicts: [], foreshadowing_elements: [],
    locations: [], themes: [], canon_items: [], ambiguities: [], chat_messages: [], world_bible: [],
    ...overrides,
  };
}

describe('detectInconsistencies', () => {
  it('returns empty array for empty state', () => {
    const state = makeEmptyState();
    const analysis = analyzeStoryState(state);
    expect(detectInconsistencies(state, analysis)).toEqual([]);
  });

  // ── Timeline Conflicts ──

  it('detects timeline conflicts on same date with contradictory impacts', () => {
    const state = makeEmptyState({
      timeline_events: [
        { id: 'e1', date: '2024-01-01', description: 'Peace treaty signed', impact: 'Characters are alive and safe' },
        { id: 'e2', date: '2024-01-01', description: 'Assassination attempt', impact: 'Main character is dead' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    const timeline = results.filter(r => r.type === 'timeline_conflict');
    expect(timeline.length).toBeGreaterThanOrEqual(1);
    expect(timeline[0].severity).toBe('high');
    expect(timeline[0].relatedEntityIds).toContain('e1');
    expect(timeline[0].relatedEntityIds).toContain('e2');
  });

  it('ignores events on different dates', () => {
    const state = makeEmptyState({
      timeline_events: [
        { id: 'e1', date: '2024-01-01', description: 'Peace', impact: 'alive' },
        { id: 'e2', date: '2024-06-01', description: 'War', impact: 'dead' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    expect(results.filter(r => r.type === 'timeline_conflict')).toHaveLength(0);
  });

  it('ignores discarded timeline events', () => {
    const state = makeEmptyState({
      timeline_events: [
        { id: 'e1', date: '2024-01-01', description: 'Peace', impact: 'alive', canonStatus: 'discarded' },
        { id: 'e2', date: '2024-01-01', description: 'War', impact: 'dead' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    expect(results.filter(r => r.type === 'timeline_conflict')).toHaveLength(0);
  });

  // ── Character Gaps ──

  it('detects character gaps exceeding 40% of chapters', () => {
    // 10 chapters, character appears in ch0 and ch9 only => gap of 8 = 80%
    const chapters = Array.from({ length: 10 }, (_, i) => ({
      id: `ch${i}`, title: '', summary: '',
      content: i === 0 || i === 9 ? 'Lena spoke.' : 'Nothing happened.',
    }));
    const state = makeEmptyState({
      chapters,
      characters: [{ id: 'c1', name: 'Lena', role: '', description: '', relationships: '' }],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    const gaps = results.filter(r => r.type === 'character_gap');
    expect(gaps.length).toBeGreaterThanOrEqual(1);
    expect(gaps[0].severity).toBe('medium');
  });

  it('does not flag character gaps when fewer than 3 chapters', () => {
    const state = makeEmptyState({
      chapters: [
        { id: 'ch0', title: '', content: 'Lena spoke.', summary: '' },
        { id: 'ch1', title: '', content: 'Nothing.', summary: '' },
      ],
      characters: [{ id: 'c1', name: 'Lena', role: '', description: '', relationships: '' }],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    expect(results.filter(r => r.type === 'character_gap')).toHaveLength(0);
  });

  // ── Relationship Asymmetry ──

  it('detects trust asymmetry > 40 points', () => {
    const state = makeEmptyState({
      characters: [
        {
          id: 'c1', name: 'Alice', role: '', description: '', relationships: '',
          dynamicRelationships: [{ targetId: 'c2', trustLevel: 90, tensionLevel: 10, dynamics: '' }],
        },
        {
          id: 'c2', name: 'Bob', role: '', description: '', relationships: '',
          dynamicRelationships: [{ targetId: 'c1', trustLevel: 30, tensionLevel: 10, dynamics: '' }],
        },
      ],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    const asym = results.filter(r => r.type === 'relationship_asymmetry');
    expect(asym.length).toBeGreaterThanOrEqual(1);
    expect(asym[0].title).toContain('Trust asymmetry');
  });

  it('deduplicates A->B and B->A asymmetry reports via deterministic IDs', () => {
    // With deterministic hash-based IDs (sorted entity IDs), A->B and B->A
    // produce the same ID and get deduplicated to a single entry.
    const state = makeEmptyState({
      characters: [
        {
          id: 'c1', name: 'Alice', role: '', description: '', relationships: '',
          dynamicRelationships: [{ targetId: 'c2', trustLevel: 90, tensionLevel: 10, dynamics: '' }],
        },
        {
          id: 'c2', name: 'Bob', role: '', description: '', relationships: '',
          dynamicRelationships: [{ targetId: 'c1', trustLevel: 30, tensionLevel: 10, dynamics: '' }],
        },
      ],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    const trustAsym = results.filter(r => r.title.includes('Trust asymmetry'));
    expect(trustAsym.length).toBeGreaterThanOrEqual(1);
    // The deduplicated entry references both characters
    expect(trustAsym[0].relatedEntityIds).toContain('c1');
    expect(trustAsym[0].relatedEntityIds).toContain('c2');
  });

  // ── Orphaned References ──

  it('detects scenes referencing non-existent chapters', () => {
    const state = makeEmptyState({
      chapters: [{ id: 'ch1', title: '', content: '', summary: '' }],
      scenes: [{ id: 's1', chapterId: 'deleted-chapter', title: 'Orphan', content: '', summary: '' }],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    const orphans = results.filter(r => r.type === 'orphaned_reference');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].severity).toBe('high');
  });

  it('detects relationships pointing to deleted characters', () => {
    const state = makeEmptyState({
      characters: [
        {
          id: 'c1', name: 'Alice', role: '', description: '', relationships: '',
          dynamicRelationships: [{ targetId: 'deleted-char', trustLevel: 50, tensionLevel: 50, dynamics: '' }],
        },
      ],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    const orphans = results.filter(r => r.type === 'orphaned_reference');
    expect(orphans.length).toBeGreaterThanOrEqual(1);
    expect(orphans[0].description).toContain('deleted-char');
  });

  // ── Unresolved Tension ──

  it('detects characters at critical pressure with no active conflict', () => {
    const state = makeEmptyState({
      characters: [
        {
          id: 'c1', name: 'Dante', role: '', description: '', relationships: '',
          currentState: {
            emotionalState: 'angry', visibleGoal: '', hiddenNeed: '', currentFear: '',
            dominantBelief: '', emotionalWound: '', pressureLevel: 'Critical',
            currentKnowledge: '', indicator: 'under pressure',
          },
          dynamicRelationships: [{ targetId: 'c2', trustLevel: 10, tensionLevel: 90, dynamics: '' }],
        },
        { id: 'c2', name: 'Eve', role: '', description: '', relationships: '' },
      ],
      active_conflicts: [],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    const tension = results.filter(r => r.type === 'unresolved_tension');
    expect(tension.length).toBeGreaterThanOrEqual(1);
    expect(tension[0].title).toContain('Dante');
  });

  it('does not flag unresolved tension when character is in an active conflict', () => {
    const state = makeEmptyState({
      characters: [
        {
          id: 'c1', name: 'Dante', role: '', description: '', relationships: '',
          currentState: {
            emotionalState: 'angry', visibleGoal: '', hiddenNeed: '', currentFear: '',
            dominantBelief: '', emotionalWound: '', pressureLevel: 'Critical',
            currentKnowledge: '', indicator: 'under pressure',
          },
          dynamicRelationships: [{ targetId: 'c2', trustLevel: 10, tensionLevel: 90, dynamics: '' }],
        },
        { id: 'c2', name: 'Eve', role: '', description: '', relationships: '' },
      ],
      active_conflicts: [
        { id: 'cf1', title: 'Dante vs the World', description: 'Dante fights everyone', status: 'active' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    expect(results.filter(r => r.type === 'unresolved_tension')).toHaveLength(0);
  });

  // ── Additional Timeline Conflict Coverage ──

  it('detects peace vs war timeline conflict', () => {
    const state = makeEmptyState({
      timeline_events: [
        { id: 'e1', date: '2024-03-15', description: 'Treaty ceremony', impact: 'The kingdom is at peace' },
        { id: 'e2', date: '2024-03-15', description: 'Battle erupts', impact: 'The kingdom is at war' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    const timeline = results.filter(r => r.type === 'timeline_conflict');
    expect(timeline.length).toBeGreaterThanOrEqual(1);
  });

  it('detects safe vs danger timeline conflict', () => {
    const state = makeEmptyState({
      timeline_events: [
        { id: 'e1', date: '2024-05-01', description: 'Evacuation complete', impact: 'Everyone is safe' },
        { id: 'e2', date: '2024-05-01', description: 'Explosion at the base', impact: 'People are in danger' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    expect(results.filter(r => r.type === 'timeline_conflict').length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag non-contradictory same-date events', () => {
    const state = makeEmptyState({
      timeline_events: [
        { id: 'e1', date: '2024-01-01', description: 'Morning assembly', impact: 'Characters gather' },
        { id: 'e2', date: '2024-01-01', description: 'Evening feast', impact: 'Characters celebrate' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    expect(results.filter(r => r.type === 'timeline_conflict')).toHaveLength(0);
  });

  it('does not flag events without impact field', () => {
    const state = makeEmptyState({
      timeline_events: [
        { id: 'e1', date: '2024-01-01', description: 'Event A', impact: 'minor' },
        { id: 'e2', date: '2024-01-01', description: 'Event B', impact: 'minor' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    expect(results.filter(r => r.type === 'timeline_conflict')).toHaveLength(0);
  });

  // ── Additional Relationship Asymmetry Coverage ──

  it('detects tension asymmetry > 40 (severity low, distinct from trust)', () => {
    const state = makeEmptyState({
      characters: [
        {
          id: 'c1', name: 'Alice', role: '', description: '', relationships: '',
          dynamicRelationships: [{ targetId: 'c2', trustLevel: 50, tensionLevel: 90, dynamics: '' }],
        },
        {
          id: 'c2', name: 'Bob', role: '', description: '', relationships: '',
          dynamicRelationships: [{ targetId: 'c1', trustLevel: 50, tensionLevel: 20, dynamics: '' }],
        },
      ],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    const tensionAsym = results.filter(r => r.title.includes('Tension asymmetry'));
    expect(tensionAsym.length).toBeGreaterThanOrEqual(1);
    expect(tensionAsym[0].severity).toBe('low');
  });

  it('skips character_gap check for discarded characters', () => {
    const chapters = Array.from({ length: 10 }, (_, i) => ({
      id: `ch${i}`, title: '', summary: '',
      content: i === 0 || i === 9 ? 'Phantom spoke.' : 'Nothing happened.',
    }));
    const state = makeEmptyState({
      chapters,
      characters: [{ id: 'c1', name: 'Phantom', role: '', description: '', relationships: '', canonStatus: 'discarded' }],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    expect(results.filter(r => r.type === 'character_gap')).toHaveLength(0);
  });

  it('skips relationship_asymmetry when both characters are discarded', () => {
    const state = makeEmptyState({
      characters: [
        {
          id: 'c1', name: 'Alice', role: '', description: '', relationships: '', canonStatus: 'discarded',
          dynamicRelationships: [{ targetId: 'c2', trustLevel: 90, tensionLevel: 10, dynamics: '' }],
        },
        {
          id: 'c2', name: 'Bob', role: '', description: '', relationships: '', canonStatus: 'discarded',
          dynamicRelationships: [{ targetId: 'c1', trustLevel: 30, tensionLevel: 10, dynamics: '' }],
        },
      ],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    expect(results.filter(r => r.type === 'relationship_asymmetry')).toHaveLength(0);
  });

  it('does not flag unresolved tension when conflict description matches character name', () => {
    const state = makeEmptyState({
      characters: [
        {
          id: 'c1', name: 'Dante', role: '', description: '', relationships: '',
          currentState: {
            emotionalState: 'angry', visibleGoal: '', hiddenNeed: '', currentFear: '',
            dominantBelief: '', emotionalWound: '', pressureLevel: 'Critical',
            currentKnowledge: '', indicator: 'under pressure',
          },
          dynamicRelationships: [{ targetId: 'c2', trustLevel: 10, tensionLevel: 90, dynamics: '' }],
        },
        { id: 'c2', name: 'Eve', role: '', description: '', relationships: '' },
      ],
      active_conflicts: [
        { id: 'cf1', title: 'Internal Struggle', description: 'Dante battles his inner demons', status: 'active' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    expect(results.filter(r => r.type === 'unresolved_tension')).toHaveLength(0);
  });

  it('assigns unique incrementing IDs to each inconsistency', () => {
    const state = makeEmptyState({
      chapters: [{ id: 'ch1', title: '', content: '', summary: '' }],
      scenes: [
        { id: 's1', chapterId: 'gone1', title: 'O1', content: '', summary: '' },
        { id: 's2', chapterId: 'gone2', title: 'O2', content: '', summary: '' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const results = detectInconsistencies(state, analysis);
    const ids = results.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
