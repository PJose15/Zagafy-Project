import type { StoryState, Character } from '@/lib/store';
import { getPlainText } from '@/lib/editor/serialization';
import type {
  StoryBrainAnalysis,
  EntityCatalogEntry,
  RelationshipPair,
  EntityType,
} from './types';

/**
 * Pure-function analysis of existing StoryState data.
 * Builds entity catalog, mention counts, and relationship map.
 */
export function analyzeStoryState(state: StoryState): StoryBrainAnalysis {
  const entities: EntityCatalogEntry[] = [];
  const relationships: RelationshipPair[] = [];

  // Index all chapter content for mention counting (decode Lexical JSON → prose)
  const chapterTexts = state.chapters.map(ch =>
    `${ch.title} ${getPlainText(ch.content)} ${ch.summary}`.toLowerCase()
  );

  // ─── Characters ───
  for (const char of state.characters) {
    const nameLower = char.name.toLowerCase();
    const mentions = countMentions(chapterTexts, nameLower);
    const appearances = findAppearances(chapterTexts, nameLower);
    const sceneIds = findEntityScenes(char.name, state);

    entities.push({
      id: char.id,
      name: char.name,
      type: 'character',
      mentionCount: mentions,
      firstAppearanceChapter: appearances.first,
      lastAppearanceChapter: appearances.last,
      sceneIds,
      canonStatus: char.canonStatus,
      source: char.source,
      relationshipCount: char.dynamicRelationships?.length ?? 0,
    });
  }

  // ─── Locations ───
  for (const loc of state.locations) {
    const nameLower = loc.name.toLowerCase();
    const mentions = countMentions(chapterTexts, nameLower);
    const appearances = findAppearances(chapterTexts, nameLower);
    const sceneIds = findEntityScenes(loc.name, state);

    entities.push({
      id: loc.id,
      name: loc.name,
      type: 'location',
      mentionCount: mentions,
      firstAppearanceChapter: appearances.first,
      lastAppearanceChapter: appearances.last,
      sceneIds,
      canonStatus: loc.canonStatus,
      source: loc.source,
      relationshipCount: 0,
    });
  }

  // ─── Timeline Events → "event" entities ───
  for (const evt of state.timeline_events) {
    const descLower = evt.description.toLowerCase();
    const mentions = countMentions(chapterTexts, descLower.slice(0, 40));
    const appearances = findAppearances(chapterTexts, descLower.slice(0, 40));

    entities.push({
      id: evt.id,
      name: evt.description.slice(0, 60),
      type: 'event',
      mentionCount: mentions,
      firstAppearanceChapter: appearances.first,
      lastAppearanceChapter: appearances.last,
      sceneIds: [],
      canonStatus: evt.canonStatus,
      source: evt.source,
      relationshipCount: 0,
    });
  }

  // ─── Conflicts ───
  for (const conflict of state.active_conflicts) {
    const titleLower = conflict.title.toLowerCase();
    const mentions = countMentions(chapterTexts, titleLower);
    const appearances = findAppearances(chapterTexts, titleLower);

    entities.push({
      id: conflict.id,
      name: conflict.title,
      type: 'conflict',
      mentionCount: mentions,
      firstAppearanceChapter: appearances.first,
      lastAppearanceChapter: appearances.last,
      sceneIds: [],
      canonStatus: conflict.canonStatus,
      source: conflict.source,
      relationshipCount: 0,
    });
  }

  // ─── Relationships ───
  for (const char of state.characters) {
    if (!char.dynamicRelationships) continue;
    for (const rel of char.dynamicRelationships) {
      const target = state.characters.find(c => c.id === rel.targetId);
      if (!target) continue;

      // Avoid duplicate pairs (A→B and B→A)
      const alreadyMapped = relationships.some(
        r => (r.sourceId === rel.targetId && r.targetId === char.id)
      );
      if (alreadyMapped) continue;

      relationships.push({
        sourceId: char.id,
        sourceName: char.name,
        targetId: rel.targetId,
        targetName: target.name,
        trustLevel: rel.trustLevel,
        tensionLevel: rel.tensionLevel,
        dynamics: rel.dynamics,
      });
    }
  }

  // ─── Entity counts ───
  const entityCountByType: Record<EntityType, number> = {
    character: 0,
    location: 0,
    event: 0,
    conflict: 0,
  };
  for (const entity of entities) {
    entityCountByType[entity.type]++;
  }

  return {
    entities,
    relationships,
    totalMentions: entities.reduce((sum, e) => sum + e.mentionCount, 0),
    entityCountByType,
  };
}

// ─── Helpers ───

// Escape regex metacharacters so searchTerm is matched literally.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-boundary matcher shared by every mention/appearance check so they all
 * agree. Rejects matches flanked by letters/digits so "Al"/"An" aren't counted
 * inside "always"/"another", while allowing names ending in punctuation.
 * Dynamic by design: searchTerm is escaped via escapeRegExp.
 */
function wordBoundaryRegExp(searchTerm: string): RegExp {
  // eslint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(searchTerm)}(?![\\p{L}\\p{N}])`,
    'giu'
  );
}

function countMentions(chapterTexts: string[], searchTerm: string): number {
  if (!searchTerm || searchTerm.length < 2) return 0;
  const re = wordBoundaryRegExp(searchTerm);
  let count = 0;
  for (const text of chapterTexts) {
    const matches = text.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

function findAppearances(
  chapterTexts: string[],
  searchTerm: string
): { first: number; last: number } {
  if (!searchTerm || searchTerm.length < 2) return { first: -1, last: -1 };
  // Word-boundary match (same as countMentions) — substring includes() would
  // count "Al" as present in any chapter containing "always", skewing gap and
  // disappearance detection.
  const re = wordBoundaryRegExp(searchTerm);
  let first = -1;
  let last = -1;
  for (let i = 0; i < chapterTexts.length; i++) {
    if (chapterTexts[i].match(re)) {
      if (first === -1) first = i;
      last = i;
    }
  }
  return { first, last };
}

function findEntityScenes(entityName: string, state: StoryState): string[] {
  const nameLower = entityName.toLowerCase();
  if (nameLower.length < 2) return [];
  const re = wordBoundaryRegExp(nameLower);
  return state.scenes
    .filter(s => {
      const text = `${s.title} ${s.content} ${s.summary}`.toLowerCase();
      return text.match(re) !== null;
    })
    .map(s => s.id);
}

/**
 * Get a character from state by ID. Exported for use in other modules.
 */
export function getCharacterById(state: StoryState, id: string): Character | undefined {
  return state.characters.find(c => c.id === id);
}
