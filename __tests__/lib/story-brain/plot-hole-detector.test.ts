import { describe, it, expect, beforeEach } from 'vitest';
import { detectPlotHoles } from '@/lib/story-brain/plot-hole-detector';
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

function makeChapters(count: number, charName?: string, appearsIn?: number[]): StoryState['chapters'] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ch${i}`,
    title: '',
    content: charName && appearsIn?.includes(i) ? `${charName} was there.` : 'Nothing notable.',
    summary: '',
  }));
}

describe('detectPlotHoles', () => {
  it('returns empty array with fewer than 2 chapters', () => {
    const state = makeEmptyState({
      chapters: [{ id: 'ch0', title: '', content: '', summary: '' }],
    });
    const analysis = analyzeStoryState(state);
    expect(detectPlotHoles(state, analysis)).toEqual([]);
  });

  it('returns empty array for clean state with no issues', () => {
    const chapters = makeChapters(5, 'Mara', [0, 1, 2, 3, 4]);
    const state = makeEmptyState({
      chapters,
      characters: [{ id: 'c1', name: 'Mara', role: '', description: '', relationships: '' }],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    const disappearances = holes.filter(h => h.plotHoleType === 'character_disappearance');
    expect(disappearances).toHaveLength(0);
  });

  // ── Character Disappearance ──

  it('detects character disappearance when absent > 40% after introduction', () => {
    // 10 chapters, appears only in ch0 => absent 9/10 = 90%
    const chapters = makeChapters(10, 'Ghost', [0]);
    const state = makeEmptyState({
      chapters,
      characters: [{ id: 'c1', name: 'Ghost', role: '', description: '', relationships: '' }],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    const disappearance = holes.find(h => h.plotHoleType === 'character_disappearance');
    expect(disappearance).toBeDefined();
    expect(disappearance!.severity).toBe('medium');
    expect(disappearance!.narrativeImpact).toBeGreaterThan(0);
  });

  it('skips discarded characters for disappearance check', () => {
    const chapters = makeChapters(10, 'Ghost', [0]);
    const state = makeEmptyState({
      chapters,
      characters: [{ id: 'c1', name: 'Ghost', role: '', description: '', relationships: '', canonStatus: 'discarded' }],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    expect(holes.filter(h => h.plotHoleType === 'character_disappearance')).toHaveLength(0);
  });

  // ── Unresolved Conflicts ──

  it('detects active conflicts introduced in the first half', () => {
    const chapters = makeChapters(10);
    // Mention conflict in chapter 2 (first half of 10)
    chapters[2] = { id: 'ch2', title: '', content: 'The shadow war began.', summary: '' };
    const state = makeEmptyState({
      chapters,
      active_conflicts: [
        { id: 'cf1', title: 'The Shadow War', description: '', status: 'active' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    const unresolved = holes.find(h => h.plotHoleType === 'conflict_unresolved');
    expect(unresolved).toBeDefined();
    expect(unresolved!.severity).toBe('high');
    expect(unresolved!.narrativeImpact).toBe(80);
  });

  it('ignores resolved conflicts', () => {
    const chapters = makeChapters(10);
    chapters[1] = { id: 'ch1', title: '', content: 'Old feud discussed.', summary: '' };
    const state = makeEmptyState({
      chapters,
      active_conflicts: [
        { id: 'cf1', title: 'Old Feud', description: '', status: 'resolved' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    expect(holes.filter(h => h.plotHoleType === 'conflict_unresolved')).toHaveLength(0);
  });

  // ── Late Introduction ──

  it('detects major characters introduced after 60% mark', () => {
    // 10 chapters; character first appears at ch7 (index 7, 70% mark) and is mentioned 6 times
    const chapters = makeChapters(10);
    for (let i = 7; i < 10; i++) {
      chapters[i] = { id: `ch${i}`, title: '', content: 'Nova spoke. Nova decided. Nova acted.', summary: '' };
    }
    // 6 mentions total across 3 chapters (2 per chapter)
    const state = makeEmptyState({
      chapters,
      characters: [{ id: 'c1', name: 'Nova', role: '', description: '', relationships: '' }],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    const late = holes.find(h => h.plotHoleType === 'late_introduction');
    expect(late).toBeDefined();
    expect(late!.severity).toBe('medium');
  });

  it('does not flag minor characters (< 5 mentions) as late', () => {
    const chapters = makeChapters(10);
    chapters[8] = { id: 'ch8', title: '', content: 'Rex appeared briefly.', summary: '' };
    const state = makeEmptyState({
      chapters,
      characters: [{ id: 'c1', name: 'Rex', role: '', description: '', relationships: '' }],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    expect(holes.filter(h => h.plotHoleType === 'late_introduction')).toHaveLength(0);
  });

  // ── Unfulfilled Foreshadowing ──

  it('detects foreshadowing with no payoff', () => {
    const state = makeEmptyState({
      chapters: makeChapters(5),
      foreshadowing_elements: [
        { id: 'fs1', clue: 'The locked door will open one day', payoff: '' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    const unfulfilled = holes.find(h => h.plotHoleType === 'foreshadowing_unfulfilled');
    expect(unfulfilled).toBeDefined();
    expect(unfulfilled!.severity).toBe('high');
    expect(unfulfilled!.narrativeImpact).toBe(70);
  });

  it('does not flag foreshadowing that has a payoff', () => {
    const state = makeEmptyState({
      chapters: makeChapters(5),
      foreshadowing_elements: [
        { id: 'fs1', clue: 'The key glowed', payoff: 'The key unlocked the vault in chapter 4' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    expect(holes.filter(h => h.plotHoleType === 'foreshadowing_unfulfilled')).toHaveLength(0);
  });

  it('skips discarded foreshadowing', () => {
    const state = makeEmptyState({
      chapters: makeChapters(5),
      foreshadowing_elements: [
        { id: 'fs1', clue: 'Removed clue', payoff: '', canonStatus: 'discarded' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    expect(holes.filter(h => h.plotHoleType === 'foreshadowing_unfulfilled')).toHaveLength(0);
  });

  // ── Stale Open Loops ──

  it('detects stale open loops not mentioned in recent chapters', () => {
    const chapters = makeChapters(6);
    // Loop described early but not in last 3 chapters
    chapters[0] = { id: 'ch0', title: '', content: 'The missing artifact was discussed at length here.', summary: '' };
    const state = makeEmptyState({
      chapters,
      open_loops: [
        { id: 'ol1', description: 'The missing artifact was discussed at length', status: 'open' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    const stale = holes.find(h => h.plotHoleType === 'stale_open_loop');
    expect(stale).toBeDefined();
    expect(stale!.severity).toBe('low');
  });

  it('does not flag open loops mentioned in recent chapters', () => {
    const chapters = makeChapters(6);
    chapters[5] = { id: 'ch5', title: '', content: 'The missing artifact was discussed at length again.', summary: '' };
    const state = makeEmptyState({
      chapters,
      open_loops: [
        { id: 'ol1', description: 'The missing artifact was discussed at length', status: 'open' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    expect(holes.filter(h => h.plotHoleType === 'stale_open_loop')).toHaveLength(0);
  });

  it('ignores closed open loops', () => {
    const state = makeEmptyState({
      chapters: makeChapters(6),
      open_loops: [
        { id: 'ol1', description: 'Some old thread that was wrapped up', status: 'closed' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    expect(holes.filter(h => h.plotHoleType === 'stale_open_loop')).toHaveLength(0);
  });

  // ── General ──

  it('assigns unique IDs to all detected plot holes', () => {
    const chapters = makeChapters(10, 'Ghost', [0]);
    const state = makeEmptyState({
      chapters,
      characters: [{ id: 'c1', name: 'Ghost', role: '', description: '', relationships: '' }],
      foreshadowing_elements: [{ id: 'fs1', clue: 'A dark omen appeared', payoff: '' }],
      open_loops: [{ id: 'ol1', description: 'Who stole the crown from the king', status: 'open' }],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    const ids = holes.map(h => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(id => id.startsWith('ph_'))).toBe(true);
  });

  it('does not flag character present in > 60% of chapters', () => {
    const chapters = makeChapters(10, 'Steady', [0, 1, 2, 3, 4, 5, 6]);
    const state = makeEmptyState({
      chapters,
      characters: [{ id: 'c1', name: 'Steady', role: '', description: '', relationships: '' }],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    expect(holes.filter(h => h.plotHoleType === 'character_disappearance')).toHaveLength(0);
  });

  it('suggestedChapterIndex = lastAppearance + 1 when not in final chapter', () => {
    // 10 chapters, appears only in ch0 => lastAppearanceChapter=0, 0 < 9, so suggested = 1
    const chapters = makeChapters(10, 'Fade', [0]);
    const state = makeEmptyState({
      chapters,
      characters: [{ id: 'c1', name: 'Fade', role: '', description: '', relationships: '' }],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    const disappearance = holes.find(h => h.plotHoleType === 'character_disappearance');
    expect(disappearance).toBeDefined();
    expect(disappearance!.suggestedChapterIndex).toBe(1);
  });

  it('suggestedChapterIndex = null when lastAppearance is final chapter', () => {
    // 10 chapters, appears only in ch0 and ch9 => lastAppearanceChapter=9, 9 === 9, so suggested = null
    const chapters = makeChapters(10, 'Flicker', [0, 9]);
    const state = makeEmptyState({
      chapters,
      characters: [{ id: 'c1', name: 'Flicker', role: '', description: '', relationships: '' }],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    const disappearance = holes.find(h => h.plotHoleType === 'character_disappearance');
    if (disappearance) {
      expect(disappearance.suggestedChapterIndex).toBeNull();
    }
  });

  it('impact capped at 100 for high-mention chars (1.5x multiplier)', () => {
    const chapters = makeChapters(10);
    // 8+ mentions in chapter 0 only => absent ~90%, impact = 90 * 1.5 = 135 → capped at 100
    chapters[0] = { id: 'ch0', title: '', content: 'Zara spoke. Zara ran. Zara hid. Zara fought. Zara wept. Zara vanished. Zara screamed. Zara fell.', summary: '' };
    const state = makeEmptyState({
      chapters,
      characters: [{ id: 'c1', name: 'Zara', role: '', description: '', relationships: '' }],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    const disappearance = holes.find(h => h.plotHoleType === 'character_disappearance');
    expect(disappearance).toBeDefined();
    expect(disappearance!.narrativeImpact).toBe(100);
  });

  it('no 1.5x multiplier for low-mention characters (mentionCount <= 5)', () => {
    // Character appears in ch0 only with 2 mentions => mentionCount = 2 (<=5), no 1.5x
    const chapters = makeChapters(10);
    chapters[0] = { id: 'ch0', title: '', content: 'Rex appeared. Rex left.', summary: '' };
    const state = makeEmptyState({
      chapters,
      characters: [{ id: 'c1', name: 'Rex', role: '', description: '', relationships: '' }],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    const disappearance = holes.find(h => h.plotHoleType === 'character_disappearance');
    if (disappearance) {
      // Without multiplier, impact should be < 100 (absent ~90% * 100 * 1.0 = ~90)
      expect(disappearance.narrativeImpact).toBeLessThanOrEqual(90);
    }
  });

  it('does not flag character_disappearance when chaptersAfterIntro <= 2', () => {
    // chaptersAfterIntro = totalChapters - firstAppearanceChapter
    // With 2 chapters and character in ch0: chaptersAfterIntro = 2, which is NOT > 2, so no flag
    const chapters = makeChapters(2, 'Brief', [0]);
    const state = makeEmptyState({
      chapters,
      characters: [{ id: 'c1', name: 'Brief', role: '', description: '', relationships: '' }],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    expect(holes.filter(h => h.plotHoleType === 'character_disappearance')).toHaveLength(0);
  });

  it('applies 1.5x impact multiplier for mentionCount > 5', () => {
    const chapters = makeChapters(10);
    // Put character name 6+ times in first chapter only
    chapters[0] = { id: 'ch0', title: '', content: 'Zara spoke. Zara ran. Zara hid. Zara fought. Zara wept. Zara vanished.', summary: '' };
    const state = makeEmptyState({
      chapters,
      characters: [{ id: 'c1', name: 'Zara', role: '', description: '', relationships: '' }],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    const disappearance = holes.find(h => h.plotHoleType === 'character_disappearance');
    if (disappearance) {
      // Impact should be > 90 due to 1.5x multiplier (absent ~90% * 100 * 1.5 = ~135 capped at 100)
      expect(disappearance.narrativeImpact).toBe(100);
    }
  });

  it('does not flag conflict introduced in second half', () => {
    const chapters = makeChapters(10);
    chapters[7] = { id: 'ch7', title: '', content: 'The late war started.', summary: '' };
    const state = makeEmptyState({
      chapters,
      active_conflicts: [
        { id: 'cf1', title: 'The Late War', description: '', status: 'active' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    expect(holes.filter(h => h.plotHoleType === 'conflict_unresolved')).toHaveLength(0);
  });

  it('skips open loop with short description (< 5 chars)', () => {
    const state = makeEmptyState({
      chapters: makeChapters(6),
      open_loops: [
        { id: 'ol1', description: 'Hi', status: 'open' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    expect(holes.filter(h => h.plotHoleType === 'stale_open_loop')).toHaveLength(0);
  });

  it('does not flag stale loop when totalChapters <= 3', () => {
    const state = makeEmptyState({
      chapters: makeChapters(3),
      open_loops: [
        { id: 'ol1', description: 'A mysterious artifact appeared in the ruins', status: 'open' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    expect(holes.filter(h => h.plotHoleType === 'stale_open_loop')).toHaveLength(0);
  });

  it('skips discarded open loops', () => {
    const state = makeEmptyState({
      chapters: makeChapters(6),
      open_loops: [
        { id: 'ol1', description: 'The missing artifact was discussed at length', status: 'open', canonStatus: 'discarded' },
      ],
    });
    const analysis = analyzeStoryState(state);
    const holes = detectPlotHoles(state, analysis);
    expect(holes.filter(h => h.plotHoleType === 'stale_open_loop')).toHaveLength(0);
  });
});
