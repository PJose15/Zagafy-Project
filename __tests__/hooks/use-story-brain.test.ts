import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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

let mockState = makeEmptyState();

vi.mock('@/lib/store', () => ({
  useStory: () => ({
    state: mockState,
    setState: vi.fn(),
    updateField: vi.fn(),
  }),
}));

// Must import AFTER mock setup
const { useStoryBrain } = await import('@/hooks/use-story-brain');

describe('useStoryBrain', () => {
  beforeEach(() => {
    mockState = makeEmptyState();
    localStorage.clear();
  });

  it('returns analysis with empty entities for empty state', () => {
    const { result } = renderHook(() => useStoryBrain());
    expect(result.current.analysis.entities).toEqual([]);
    expect(result.current.analysis.relationships).toEqual([]);
    expect(result.current.analysis.totalMentions).toBe(0);
  });

  it('returns inconsistencies array', () => {
    const { result } = renderHook(() => useStoryBrain());
    expect(Array.isArray(result.current.inconsistencies)).toBe(true);
  });

  it('returns plotHoles array', () => {
    const { result } = renderHook(() => useStoryBrain());
    expect(Array.isArray(result.current.plotHoles)).toBe(true);
  });

  it('returns resolutions from localStorage', () => {
    localStorage.setItem('zagafy_brain_resolutions', JSON.stringify([
      { inconsistencyId: 'inc_1', action: 'ignore', resolvedAt: '2024-01-01T00:00:00Z' },
    ]));

    const { result } = renderHook(() => useStoryBrain());
    expect(result.current.resolutions).toHaveLength(1);
  });

  it('unresolvedCount reflects inconsistencies minus resolved', () => {
    // Create orphaned scene to trigger an inconsistency
    mockState = makeEmptyState({
      chapters: [{ id: 'ch1', title: '', content: '', summary: '' }],
      scenes: [{ id: 's1', chapterId: 'missing-chapter', title: 'Orphan', content: '', summary: '' }],
    });

    const { result } = renderHook(() => useStoryBrain());
    const totalInconsistencies = result.current.inconsistencies.length;
    expect(totalInconsistencies).toBeGreaterThanOrEqual(1);
    expect(result.current.unresolvedCount).toBe(totalInconsistencies);
  });

  it('resolve adds a resolution and updates unresolvedCount', () => {
    mockState = makeEmptyState({
      chapters: [{ id: 'ch1', title: '', content: '', summary: '' }],
      scenes: [{ id: 's1', chapterId: 'gone', title: 'O', content: '', summary: '' }],
    });

    const { result } = renderHook(() => useStoryBrain());
    const incId = result.current.inconsistencies[0]?.id;
    if (!incId) return; // guard

    const beforeCount = result.current.unresolvedCount;

    act(() => {
      result.current.resolve(incId, 'ignore');
    });

    expect(result.current.resolutions.some(r => r.inconsistencyId === incId)).toBe(true);
    expect(result.current.unresolvedCount).toBe(beforeCount - 1);
  });

  it('unresolve removes a resolution', () => {
    mockState = makeEmptyState({
      chapters: [{ id: 'ch1', title: '', content: '', summary: '' }],
      scenes: [{ id: 's1', chapterId: 'gone', title: 'O', content: '', summary: '' }],
    });

    const { result } = renderHook(() => useStoryBrain());
    const incId = result.current.inconsistencies[0]?.id;
    if (!incId) return;

    act(() => {
      result.current.resolve(incId, 'intentional');
    });

    expect(result.current.resolutions).toHaveLength(1);

    act(() => {
      result.current.unresolve(incId);
    });

    expect(result.current.resolutions).toHaveLength(0);
  });

  it('unresolvedPlotHoleCount excludes resolved plot holes', () => {
    mockState = makeEmptyState({
      chapters: Array.from({ length: 5 }, (_, i) => ({
        id: `ch${i}`, title: '', content: 'Nothing.', summary: '',
      })),
      foreshadowing_elements: [
        { id: 'fs1', clue: 'A mysterious sign appeared above', payoff: '' },
      ],
    });

    const { result } = renderHook(() => useStoryBrain());
    const phCount = result.current.plotHoles.length;
    if (phCount === 0) return;

    expect(result.current.unresolvedPlotHoleCount).toBe(phCount);

    act(() => {
      result.current.resolve(result.current.plotHoles[0].id, 'ignore');
    });

    expect(result.current.unresolvedPlotHoleCount).toBe(phCount - 1);
  });

  it('analysis populates entityCountByType from state data', () => {
    mockState = makeEmptyState({
      characters: [
        { id: 'c1', name: 'Alice', role: '', description: '', relationships: '' },
      ],
      locations: [
        { id: 'l1', name: 'Castle', description: '', importance: '', associatedRules: [] },
      ],
    });

    const { result } = renderHook(() => useStoryBrain());
    expect(result.current.analysis.entityCountByType.character).toBe(1);
    expect(result.current.analysis.entityCountByType.location).toBe(1);
  });

  it('resolve and unresolve are stable function references', () => {
    const { result, rerender } = renderHook(() => useStoryBrain());
    const resolve1 = result.current.resolve;
    const unresolve1 = result.current.unresolve;

    rerender();

    expect(result.current.resolve).toBe(resolve1);
    expect(result.current.unresolve).toBe(unresolve1);
  });
});
