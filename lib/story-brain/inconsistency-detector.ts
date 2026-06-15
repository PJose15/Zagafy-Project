import type { StoryState } from '@/lib/store';
import { getPlainText } from '@/lib/editor/serialization';
import type { StoryBrainAnalysis, Inconsistency, InconsistencyType, InconsistencySeverity } from './types';

/** Generate a deterministic ID from type + entity IDs + title to avoid collisions */
function deterministicId(type: string, entityIds: string[], title: string): string {
  const raw = `${type}:${entityIds.sort().join(',')}:${title}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `inc_${(hash >>> 0).toString(36)}`;
}

/**
 * Detect narrative inconsistencies by analyzing story state against the brain analysis.
 */
export function detectInconsistencies(
  state: StoryState,
  analysis: StoryBrainAnalysis
): Inconsistency[] {
  const results: Inconsistency[] = [];

  results.push(...detectTimelineConflicts(state));
  results.push(...detectCharacterGaps(state, analysis));
  results.push(...detectRelationshipAsymmetry(state));
  results.push(...detectOrphanedReferences(state));
  results.push(...detectUnresolvedTension(state));

  return results;
}

// ─── Timeline Conflicts ───

function detectTimelineConflicts(state: StoryState): Inconsistency[] {
  const results: Inconsistency[] = [];
  const events = state.timeline_events.filter(e => e.canonStatus !== 'discarded');

  // Check for duplicate dates with conflicting events
  const byDate = new Map<string, typeof events>();
  for (const evt of events) {
    if (!evt.date) continue;
    const existing = byDate.get(evt.date) || [];
    existing.push(evt);
    byDate.set(evt.date, existing);
  }

  for (const [date, evts] of byDate) {
    if (evts.length < 2) continue;
    // Check if any pair has contradictory impacts
    for (let i = 0; i < evts.length; i++) {
      for (let j = i + 1; j < evts.length; j++) {
        const a = evts[i];
        const b = evts[j];
        if (a.impact && b.impact && eventsContradict(a.impact, b.impact)) {
          results.push(makeInconsistency(
            'timeline_conflict',
            'high',
            `Timeline conflict on ${date}`,
            `"${a.description}" and "${b.description}" occur on the same date with potentially contradictory impacts.`,
            [a.id, b.id],
            []
          ));
        }
      }
    }
  }

  return results;
}

function eventsContradict(impactA: string, impactB: string): boolean {
  const a = impactA.toLowerCase();
  const b = impactB.toLowerCase();
  // Simple heuristic: opposing terms
  const opposites = [
    ['alive', 'dead'], ['together', 'apart'], ['trust', 'betray'],
    ['peace', 'war'], ['safe', 'danger'], ['free', 'captured'],
  ];
  for (const [word1, word2] of opposites) {
    if ((a.includes(word1) && b.includes(word2)) || (a.includes(word2) && b.includes(word1))) {
      return true;
    }
  }
  return false;
}

// ─── Character Gaps ───

function detectCharacterGaps(
  state: StoryState,
  analysis: StoryBrainAnalysis
): Inconsistency[] {
  const results: Inconsistency[] = [];
  const totalChapters = state.chapters.length;
  if (totalChapters < 3) return results;

  // H3: Build once, reuse for all characters
  const chapterTexts = state.chapters.map(ch =>
    `${ch.title} ${getPlainText(ch.content)} ${ch.summary}`.toLowerCase()
  );

  for (const entity of analysis.entities) {
    if (entity.type !== 'character') continue;
    if (entity.firstAppearanceChapter === -1) continue;

    // Check for long gaps in appearance
    const char = state.characters.find(c => c.id === entity.id);
    if (!char || char.canonStatus === 'discarded') continue;

    const nameLower = entity.name.toLowerCase();

    let maxGap = 0;
    let gapStart = -1;
    let lastSeen = entity.firstAppearanceChapter;

    for (let i = entity.firstAppearanceChapter + 1; i <= entity.lastAppearanceChapter; i++) {
      if (chapterTexts[i]?.includes(nameLower)) {
        const gap = i - lastSeen;
        if (gap > maxGap) {
          maxGap = gap;
          gapStart = lastSeen;
        }
        lastSeen = i;
      }
    }

    // Flag if gap is > 40% of total chapters
    if (maxGap > 0 && maxGap / totalChapters > 0.4) {
      results.push(makeInconsistency(
        'character_gap',
        'medium',
        `${entity.name} disappears for ${maxGap} chapters`,
        `${entity.name} is absent from chapters ${gapStart + 2} through ${gapStart + maxGap} (${maxGap} chapters, ${Math.round((maxGap / totalChapters) * 100)}% of the story).`,
        [entity.id],
        state.chapters.slice(gapStart + 1, gapStart + maxGap).map(ch => ch.id)
      ));
    }
  }

  return results;
}

// ─── Relationship Asymmetry ───

function detectRelationshipAsymmetry(state: StoryState): Inconsistency[] {
  const results: Inconsistency[] = [];

  for (const charA of state.characters) {
    if (!charA.dynamicRelationships || charA.canonStatus === 'discarded') continue;

    for (const relA of charA.dynamicRelationships) {
      const charB = state.characters.find(c => c.id === relA.targetId);
      if (!charB || !charB.dynamicRelationships) continue;

      const relB = charB.dynamicRelationships.find(r => r.targetId === charA.id);
      if (!relB) continue;

      // Check for large asymmetry (>40 points difference)
      const trustDiff = Math.abs(relA.trustLevel - relB.trustLevel);
      const tensionDiff = Math.abs(relA.tensionLevel - relB.tensionLevel);

      if (trustDiff > 40) {
        results.push(makeInconsistency(
          'relationship_asymmetry',
          'medium',
          `Trust asymmetry: ${charA.name} ↔ ${charB.name}`,
          `${charA.name} trusts ${charB.name} at ${relA.trustLevel}% but ${charB.name} trusts ${charA.name} at ${relB.trustLevel}% (${trustDiff} point gap).`,
          [charA.id, charB.id],
          []
        ));
      }

      if (tensionDiff > 40) {
        results.push(makeInconsistency(
          'relationship_asymmetry',
          'low',
          `Tension asymmetry: ${charA.name} ↔ ${charB.name}`,
          `${charA.name} has ${relA.tensionLevel}% tension with ${charB.name}, but ${charB.name} only has ${relB.tensionLevel}% tension back (${tensionDiff} point gap).`,
          [charA.id, charB.id],
          []
        ));
      }
    }
  }

  // Deduplicate (A→B and B→A produce the same alert)
  const seen = new Set<string>();
  return results.filter(r => {
    const key = [...r.relatedEntityIds].sort().join(':') + r.type;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Orphaned References ───

function detectOrphanedReferences(state: StoryState): Inconsistency[] {
  const results: Inconsistency[] = [];

  // Scenes referencing non-existent chapters
  const chapterIds = new Set(state.chapters.map(ch => ch.id));
  for (const scene of state.scenes) {
    if (!chapterIds.has(scene.chapterId)) {
      results.push(makeInconsistency(
        'orphaned_reference',
        'high',
        `Orphaned scene: "${scene.title}"`,
        `Scene "${scene.title}" references chapter ${scene.chapterId} which no longer exists.`,
        [scene.id],
        [scene.chapterId]
      ));
    }
  }

  // Character relationships referencing non-existent characters
  const charIds = new Set(state.characters.map(c => c.id));
  for (const char of state.characters) {
    if (!char.dynamicRelationships) continue;
    for (const rel of char.dynamicRelationships) {
      if (!charIds.has(rel.targetId)) {
        results.push(makeInconsistency(
          'orphaned_reference',
          'high',
          `${char.name} has relationship with deleted character`,
          `${char.name} has a relationship targeting character ID ${rel.targetId} which no longer exists.`,
          [char.id, rel.targetId],
          []
        ));
      }
    }
  }

  return results;
}

// ─── Unresolved Tension ───

function detectUnresolvedTension(state: StoryState): Inconsistency[] {
  const results: Inconsistency[] = [];

  // Characters with critical pressure and high tension but no active conflict referencing them
  for (const char of state.characters) {
    if (char.canonStatus === 'discarded') continue;
    if (!char.currentState || char.currentState.pressureLevel !== 'Critical') continue;

    const hasHighTension = char.dynamicRelationships?.some(r => r.tensionLevel > 70);
    if (!hasHighTension) continue;

    const nameLower = char.name.toLowerCase();
    const referencedInConflict = state.active_conflicts.some(
      c => c.status === 'active' && (
        c.title.toLowerCase().includes(nameLower) ||
        c.description.toLowerCase().includes(nameLower)
      )
    );

    if (!referencedInConflict) {
      results.push(makeInconsistency(
        'unresolved_tension',
        'medium',
        `${char.name} at critical pressure with no active conflict`,
        `${char.name} is at Critical pressure with high tension relationships but has no associated active conflict to drive the narrative.`,
        [char.id],
        []
      ));
    }
  }

  return results;
}

// ─── Helper ───

function makeInconsistency(
  type: InconsistencyType,
  severity: InconsistencySeverity,
  title: string,
  description: string,
  relatedEntityIds: string[],
  chapterIds: string[]
): Inconsistency {
  return {
    id: deterministicId(type, relatedEntityIds, title),
    type,
    severity,
    title,
    description,
    relatedEntityIds,
    chapterIds,
  };
}
