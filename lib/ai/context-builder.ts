import type { StoryState } from '@/lib/store';
import type { KnownEntities } from '@/lib/ai/chat-validation';
import { getPlainText } from '@/lib/editor/serialization';

interface ContextResult {
  context: string;
  knownEntities: KnownEntities;
}

interface BuildContextOptions {
  userInput: string;
  isBlockedMode: boolean;
  writerBlockType?: string | null;
  maxLength?: number;
}

/**
 * Build grounded AI context from story state with keyword-based relevance scoring.
 * Returns both the context string and a list of known entities for validation.
 */
export function buildContext(state: StoryState, options: BuildContextOptions): ContextResult {
  const { userInput, isBlockedMode, writerBlockType, maxLength = 500000 } = options;
  const inputLower = userInput.toLowerCase();

  const notDiscarded = <T extends { canonStatus?: string }>(items: T[]) =>
    items.filter(i => i.canonStatus !== 'discarded');

  const activeCharacters = notDiscarded(state.characters);
  const activeChapters = notDiscarded(state.chapters);
  const activeScenes = notDiscarded(state.scenes);
  const activeTimeline = notDiscarded(state.timeline_events);
  const activeConflicts = notDiscarded(state.active_conflicts);
  const activeRules = notDiscarded(state.world_rules);
  const activeForeshadowing = notDiscarded(state.foreshadowing_elements);
  const activeLocations = notDiscarded(state.locations);
  const activeThemes = notDiscarded(state.themes);
  const activeOpenLoops = notDiscarded(state.open_loops);

  // Build known entities for validation
  const knownEntities: KnownEntities = {
    characters: activeCharacters.map(c => c.name),
    chapters: activeChapters.map(c => c.title),
    locations: activeLocations.map(l => l.name),
  };

  // Source provenance tag
  const sourceTag = (item: { source?: string }) =>
    item.source === 'ai-inferred' ? ' [AI-inferred]' : item.source === 'user-entered' ? ' [User-entered]' : '';

  // Track data integrity issues
  const integrityNotes: string[] = [];

  // ── Relevance scoring ──
  // Boost characters mentioned by name in user input
  const mentionedCharIds = new Set<string>();
  for (const c of activeCharacters) {
    if (inputLower.includes(c.name.toLowerCase())) {
      mentionedCharIds.add(c.id);
      // Also boost relationship targets
      for (const rel of c.dynamicRelationships || []) {
        mentionedCharIds.add(rel.targetId);
      }
    }
  }

  // Boost chapters mentioned by title
  const mentionedChapterIds = new Set<string>();
  for (const ch of activeChapters) {
    if (inputLower.includes(ch.title.toLowerCase())) {
      mentionedChapterIds.add(ch.id);
    }
  }

  // ── Format helpers ──
  const formatCharacter = (c: typeof state.characters[0]) => {
    const parts = [`[Character] ${c.name} (${c.role}): ${c.description}${sourceTag(c)}`];
    if (c.coreIdentity) parts.push(`  Core Identity: ${c.coreIdentity}`);
    if (c.currentState) {
      const s = c.currentState;
      parts.push(`  State: ${s.emotionalState || 'Unknown'} | Goal: ${s.visibleGoal || '?'} | Fear: ${s.currentFear || '?'} | Pressure: ${s.pressureLevel}`);
      if (s.hiddenNeed) parts.push(`  Hidden Need: ${s.hiddenNeed}`);
      if (s.currentKnowledge) parts.push(`  Knows: ${s.currentKnowledge}`);
    }
    if (c.dynamicRelationships?.length) {
      const resolvedRels = c.dynamicRelationships.map(r => {
        // Strict ID match only — name fallback was unsafe (could match a
        // character whose name happened to equal another character's id).
        const target = state.characters.find(ch => ch.id === r.targetId);
        if (!target) {
          integrityNotes.push(`Orphaned relationship on "${c.name}": targetId "${r.targetId}" does not match any character`);
          return null;
        }
        return `${target.name} (Trust:${r.trustLevel}% Tension:${r.tensionLevel}%): ${r.dynamics}`;
      }).filter(Boolean);
      if (resolvedRels.length) {
        parts.push(`  Relationships: ${resolvedRels.join('; ')}`);
      }
    }
    return parts.join('\n');
  };

  const getByStatus = <T extends { canonStatus?: string }>(items: T[], status: string) =>
    items.filter(i => (i.canonStatus || 'draft') === status);

  const buildCanonBlock = (status: string) => {
    const items: string[] = [
      ...getByStatus(activeCharacters, status).map(formatCharacter),
      ...getByStatus(activeChapters, status).map(c => {
        const scenes = activeScenes.filter(s => s.chapterId === c.id);
        const sceneLine = scenes.length ? `\n  Scenes: ${scenes.map(s => `${s.title}: ${s.summary}`).join(' | ')}` : '';
        return `[Chapter] ${c.title}: ${c.summary}${sceneLine}${sourceTag(c)}`;
      }),
      ...getByStatus(activeTimeline, status)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .map((t, i, arr) => {
          const prev = i > 0 ? ` [after: ${arr[i - 1].date}]` : ' [earliest]';
          return `[Timeline] ${t.date}${prev}: ${t.description}${t.impact ? ' -> ' + t.impact : ''}${sourceTag(t)}`;
        }),
      ...getByStatus(activeConflicts, status).map(c => `[Conflict] ${c.title} (${c.status}): ${c.description}${sourceTag(c)}`),
      ...getByStatus(activeRules, status).map(r => `[World Rule] ${r.category}: ${r.rule}${sourceTag(r)}`),
      ...getByStatus(activeForeshadowing, status).map(f => `[Foreshadowing] ${f.clue}${f.payoff ? ' -> ' + f.payoff : ' (unresolved)'}${sourceTag(f)}`),
      ...getByStatus(activeLocations, status).map(l => `[Location] ${l.name}: ${l.description}${sourceTag(l)}`),
      ...getByStatus(activeThemes, status).map(t => `[Theme] ${t.theme}: ${t.evidence.join(', ')}${sourceTag(t)}`),
    ];
    return items;
  };

  // Check for orphaned scenes
  const chapterIds = new Set(activeChapters.map(c => c.id));
  const orphanedScenes = activeScenes.filter(s => s.chapterId && !chapterIds.has(s.chapterId));
  if (orphanedScenes.length) {
    integrityNotes.push(`${orphanedScenes.length} scene(s) reference non-existent chapters`);
  }

  // ── Build context ──
  const confirmedItems = buildCanonBlock('confirmed');
  const flexibleItems = buildCanonBlock('flexible');
  const draftItems = buildCanonBlock('draft');

  const latestChapter = activeChapters.length > 0 ? activeChapters[activeChapters.length - 1] : null;

  // Chapter summaries — boost mentioned chapters to top
  const sortedChapters = [...activeChapters].sort((a, b) => {
    const aBoost = mentionedChapterIds.has(a.id) ? -1 : 0;
    const bBoost = mentionedChapterIds.has(b.id) ? -1 : 0;
    return aBoost - bBoost;
  });
  const chapterSummaries = sortedChapters.map((c, i) =>
    `  ${i + 1}. ${c.title}: ${c.summary}`
  ).join('\n');

  // Open loops and ambiguities
  const openLoops = activeOpenLoops.filter(l => l.status === 'open').map(l => `- ${l.description}${sourceTag(l)}`);
  const canonItems = state.canon_items.map(c => `- [${c.category}] ${c.description} (${c.status})`);
  const ambiguities = state.ambiguities.map(a => `- ${a.issue} (affects: ${a.affectedSection}, confidence: ${a.confidence})`);

  // Writer state block
  const writerStateBlock = writerBlockType
    ? `WRITER STATE: ${writerBlockType.toUpperCase()}\nAdapt your tone and approach to this emotional state as described in your system prompt.\n\n`
    : '';

  // Context inventory
  const inventory = `${writerStateBlock}CONTEXT INVENTORY:
- Characters (${activeCharacters.length}): ${activeCharacters.map(c => c.name).join(', ') || 'None'}
- Chapters (${activeChapters.length}): ${activeChapters.map(c => c.title).join(', ') || 'None'}
- Scenes: ${activeScenes.length}
- Timeline Events: ${activeTimeline.length}
- Active Conflicts (${activeConflicts.length}): ${activeConflicts.map(c => c.title).join(', ') || 'None'}
- World Rules: ${activeRules.length}
- Locations (${activeLocations.length}): ${activeLocations.map(l => l.name).join(', ') || 'None'}
- Themes (${activeThemes.length}): ${activeThemes.map(t => t.theme).join(', ') || 'None'}
- Foreshadowing Elements: ${activeForeshadowing.length}
- Open Loops: ${activeOpenLoops.filter(l => l.status === 'open').length}
- Canon Items: ${state.canon_items.length}
- Ambiguities: ${state.ambiguities.length}

IMPORTANT: The above counts are the COMPLETE data available. If you cannot find information about something, it is NOT in the data — do not guess or invent it.
${integrityNotes.length ? `\nDATA INTEGRITY NOTES:\n${integrityNotes.map(n => `- ${n}`).join('\n')}\n` : ''}`;

  // Latest chapter content — limit to 4K for focused questions, 8K for blocked mode
  const latestChapterContentLimit = isBlockedMode ? 16000 : 8000;

  const header = `${inventory}
STORY BIBLE:
Title: ${state.title}
Synopsis: ${state.synopsis}
Style Profile: ${state.style_profile}
${state.author_intent ? `\nCURRENT AUTHOR INTENT:\n${state.author_intent}\n` : ''}
ALL CHAPTER SUMMARIES:
${chapterSummaries || 'None'}

LATEST CHAPTER:
${latestChapter ? `Title: ${latestChapter.title}\nSummary: ${latestChapter.summary}\nContent (last ${latestChapterContentLimit} chars): ${getPlainText(latestChapter.content).slice(-latestChapterContentLimit)}` : 'None'}

CANON LOCK STATUS:
You must respect the following certainty levels:

1. CONFIRMED CANON (LOCKED - DO NOT CONTRADICT):
${confirmedItems.length ? confirmedItems.join('\n') : 'None'}`;

  // Sections in priority order — blocked mode boosts conflicts, open loops, foreshadowing
  const sections = isBlockedMode
    ? [
        { label: 'OPEN LOOPS (Unresolved narrative threads)', content: openLoops },
        { label: 'ACTIVE CONFLICTS', content: activeConflicts.map(c => `- ${c.title} (${c.status}): ${c.description}`) },
        { label: 'FORESHADOWING', content: activeForeshadowing.map(f => `- ${f.clue}${f.payoff ? ' -> ' + f.payoff : ' (unresolved)'}`) },
        { label: 'CANON ITEMS', content: canonItems },
        { label: '2. FLEXIBLE CANON (Build around carefully)', content: flexibleItems },
        { label: 'AMBIGUITIES (Uncertain elements needing review)', content: ambiguities },
        { label: '3. DRAFT IDEAS (Exploratory, not final)', content: draftItems },
      ]
    : [
        { label: 'OPEN LOOPS (Unresolved narrative threads)', content: openLoops },
        { label: 'CANON ITEMS', content: canonItems },
        { label: '2. FLEXIBLE CANON (Build around carefully)', content: flexibleItems },
        { label: 'AMBIGUITIES (Uncertain elements needing review)', content: ambiguities },
        { label: '3. DRAFT IDEAS (Exploratory, not final)', content: draftItems },
      ];

  let context = header;
  const droppedSections: { label: string; totalItems: number; includedItems: number }[] = [];

  for (const section of sections) {
    const block = `\n\n${section.label}:\n${section.content.length ? section.content.join('\n') : 'None'}`;
    if (context.length + block.length > maxLength) {
      const remaining = maxLength - context.length - 500;
      if (remaining > 200) {
        const partialItems: string[] = [];
        let partialLen = section.label.length + 4;
        for (const item of section.content) {
          if (partialLen + item.length + 1 > remaining) break;
          partialItems.push(item);
          partialLen += item.length + 1;
        }
        if (partialItems.length > 0) {
          context += `\n\n${section.label}:\n${partialItems.join('\n')}`;
        }
        droppedSections.push({ label: section.label, totalItems: section.content.length, includedItems: partialItems.length });
      } else {
        droppedSections.push({ label: section.label, totalItems: section.content.length, includedItems: 0 });
      }
      continue;
    }
    context += block;
  }

  if (droppedSections.length > 0) {
    const manifest = droppedSections.map(d => {
      const omitted = d.totalItems - d.includedItems;
      if (omitted === 0) return null;
      return `- ${d.label}: ${omitted} of ${d.totalItems} items omitted`;
    }).filter(Boolean).join('\n');

    if (manifest) {
      const manifestBlock = `\n\nCONTEXT TRUNCATION MANIFEST (read this FIRST):
The following sections were partially or fully omitted due to context size limits:
${manifest}
IMPORTANT: If the user asks about something in the omitted sections, tell them you don't have that information loaded and suggest they ask specifically.`;
      // Insert after header, before section content
      context = header + manifestBlock + context.slice(header.length);
    }
  }

  return { context, knownEntities };
}
