import type { StoryState } from '@/lib/store';
import { getPlainText } from '@/lib/editor/serialization';
import type { StoryBrainAnalysis } from './types';
import type { PlotHole, PlotHoleType } from './plot-hole-types';
import { PLOT_HOLE_SEVERITY } from './plot-hole-types';

/** Generate a deterministic ID from plot hole type + entity IDs + title */
function deterministicPlotHoleId(phType: string, entityIds: string[], title: string): string {
  const raw = `${phType}:${entityIds.sort().join(',')}:${title}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `ph_${(hash >>> 0).toString(36)}`;
}

/**
 * Detect plot holes in the narrative by analyzing story structure.
 * Extends the Story Brain inconsistency system with narrative-specific rules.
 */
export function detectPlotHoles(
  state: StoryState,
  analysis: StoryBrainAnalysis
): PlotHole[] {
  const results: PlotHole[] = [];
  const totalChapters = state.chapters.length;

  if (totalChapters < 2) return results;

  results.push(...detectCharacterDisappearance(state, analysis, totalChapters));
  results.push(...detectUnresolvedConflicts(state, totalChapters));
  results.push(...detectLateIntroductions(analysis, totalChapters));
  results.push(...detectUnfulfilledForeshadowing(state, totalChapters));
  results.push(...detectStaleOpenLoops(state, totalChapters));

  return results;
}

// ─── Character Disappearance ───

function detectCharacterDisappearance(
  state: StoryState,
  analysis: StoryBrainAnalysis,
  totalChapters: number
): PlotHole[] {
  const results: PlotHole[] = [];
  const threshold = 0.4; // Absent for >40% of chapters after appearing

  // H3: Build once, reuse for all characters
  const chapterTexts = state.chapters.map(ch =>
    `${ch.title} ${getPlainText(ch.content)} ${ch.summary}`.toLowerCase()
  );

  for (const entity of analysis.entities) {
    if (entity.type !== 'character') continue;
    if (entity.firstAppearanceChapter === -1) continue;

    const char = state.characters.find(c => c.id === entity.id);
    if (!char || char.canonStatus === 'discarded') continue;

    const nameLower = entity.name.toLowerCase();

    let chaptersPresent = 0;
    const chaptersAfterIntro = totalChapters - entity.firstAppearanceChapter;
    for (let i = entity.firstAppearanceChapter; i < totalChapters; i++) {
      if (chapterTexts[i]?.includes(nameLower)) chaptersPresent++;
    }

    if (chaptersAfterIntro <= 0) continue;
    const absentRatio = 1 - (chaptersPresent / chaptersAfterIntro);

    if (absentRatio > threshold && chaptersAfterIntro > 2) {
      // Impact: more important characters have higher impact
      const impact = Math.min(100, Math.round(absentRatio * 100 * (entity.mentionCount > 5 ? 1.5 : 1)));

      results.push(makePlotHole(
        'character_disappearance',
        `${entity.name} disappears after introduction`,
        `${entity.name} appears in only ${chaptersPresent} of ${chaptersAfterIntro} chapters after their introduction (absent ${Math.round(absentRatio * 100)}% of the time).`,
        [entity.id],
        [],
        entity.lastAppearanceChapter < totalChapters - 1 ? entity.lastAppearanceChapter + 1 : null,
        impact
      ));
    }
  }

  return results;
}

// ─── Unresolved Conflicts ───

function detectUnresolvedConflicts(
  state: StoryState,
  totalChapters: number
): PlotHole[] {
  const results: PlotHole[] = [];
  const midpoint = Math.floor(totalChapters / 2);

  for (const conflict of state.active_conflicts) {
    if (conflict.status !== 'active' || conflict.canonStatus === 'discarded') continue;

    // Check if this conflict was introduced in the first half
    const titleLower = conflict.title.toLowerCase();
    const firstMention = state.chapters.findIndex(ch =>
      `${ch.title} ${getPlainText(ch.content)} ${ch.summary}`.toLowerCase().includes(titleLower)
    );

    if (firstMention !== -1 && firstMention <= midpoint) {
      results.push(makePlotHole(
        'conflict_unresolved',
        `Unresolved conflict: "${conflict.title}"`,
        `"${conflict.title}" was introduced in the first half (chapter ${firstMention + 1}) and remains unresolved.`,
        [conflict.id],
        [],
        totalChapters - 1,
        80
      ));
    }
  }

  return results;
}

// ─── Late Introduction ───

function detectLateIntroductions(
  analysis: StoryBrainAnalysis,
  totalChapters: number
): PlotHole[] {
  const results: PlotHole[] = [];
  const lateThreshold = Math.floor(totalChapters * 0.6);

  for (const entity of analysis.entities) {
    if (entity.type !== 'character') continue;
    if (entity.firstAppearanceChapter === -1) continue;

    // "Major" character: mentioned 5+ times
    if (entity.mentionCount < 5) continue;

    if (entity.firstAppearanceChapter >= lateThreshold) {
      results.push(makePlotHole(
        'late_introduction',
        `${entity.name} introduced late (chapter ${entity.firstAppearanceChapter + 1})`,
        `${entity.name} is a frequently mentioned character (${entity.mentionCount} mentions) but first appears at the ${Math.round((entity.firstAppearanceChapter / totalChapters) * 100)}% mark.`,
        [entity.id],
        [],
        entity.firstAppearanceChapter,
        60
      ));
    }
  }

  return results;
}

// ─── Unfulfilled Foreshadowing ───

function detectUnfulfilledForeshadowing(
  state: StoryState,
  totalChapters: number
): PlotHole[] {
  const results: PlotHole[] = [];

  for (const fs of state.foreshadowing_elements) {
    if (fs.canonStatus === 'discarded') continue;

    // No payoff text means it's unfulfilled
    if (!fs.payoff || fs.payoff.trim() === '') {
      results.push(makePlotHole(
        'foreshadowing_unfulfilled',
        `Unfulfilled foreshadowing: "${fs.clue.slice(0, 50)}"`,
        `The clue "${fs.clue}" has no recorded payoff. Consider resolving it or removing it from the narrative.`,
        [fs.id],
        [],
        totalChapters - 1,
        70
      ));
    }
  }

  return results;
}

// ─── Stale Open Loops ───

function detectStaleOpenLoops(
  state: StoryState,
  totalChapters: number
): PlotHole[] {
  const results: PlotHole[] = [];

  for (const loop of state.open_loops) {
    if (loop.status !== 'open' || loop.canonStatus === 'discarded') continue;

    // Check if the loop's description appears in any recent chapters
    const descLower = loop.description.toLowerCase().slice(0, 40);
    if (!descLower || descLower.length < 5) continue;

    const recentThreshold = Math.max(0, totalChapters - 3);
    const mentionedRecently = state.chapters.slice(recentThreshold).some(ch =>
      `${getPlainText(ch.content)} ${ch.summary}`.toLowerCase().includes(descLower)
    );

    if (!mentionedRecently && totalChapters > 3) {
      results.push(makePlotHole(
        'stale_open_loop',
        `Stale thread: "${loop.description.slice(0, 50)}"`,
        `This open loop hasn't been referenced in the last ${totalChapters - recentThreshold} chapters. Consider progressing or closing it.`,
        [loop.id],
        [],
        null,
        40
      ));
    }
  }

  return results;
}

// ─── Helper ───

function makePlotHole(
  plotHoleType: PlotHoleType,
  title: string,
  description: string,
  relatedEntityIds: string[],
  chapterIds: string[],
  suggestedChapterIndex: number | null,
  narrativeImpact: number
): PlotHole {
  return {
    id: deterministicPlotHoleId(plotHoleType, relatedEntityIds, title),
    type: 'plot_hole' as const, // H5: Distinct type for plot holes
    severity: PLOT_HOLE_SEVERITY[plotHoleType],
    title,
    description,
    relatedEntityIds,
    chapterIds,
    plotHoleType,
    suggestedChapterIndex,
    narrativeImpact,
  };
}
