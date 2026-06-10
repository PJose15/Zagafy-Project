import type { ChatResponseNormal, ChatResponseBlocked } from '@/lib/types/chat-response';

export interface KnownEntities {
  characters: string[];
  chapters: string[];
  locations: string[];
}

/**
 * Validate a normal-mode AI response against known story entities.
 * Appends warnings to confidenceNotes for any flagged issues.
 */
export function validateNormalResponse(
  response: ChatResponseNormal,
  entities: KnownEntities
): ChatResponseNormal {
  const warnings: string[] = [];

  // Verify contextUsed references match known entities
  const allKnown = new Set([
    ...entities.characters.map(n => n.toLowerCase()),
    ...entities.chapters.map(n => n.toLowerCase()),
    ...entities.locations.map(n => n.toLowerCase()),
  ]);

  for (const ref of response.contextUsed) {
    const refLower = ref.toLowerCase();
    const matched = [...allKnown].some(known => refLower.includes(known) || known.includes(refLower));
    if (!matched && ref !== 'None') {
      warnings.push(`[Validation] Referenced "${ref}" not found in known story entities.`);
    }
  }

  // Scan recommendation for character names not in story data
  const unknownInRecommendation = findUnknownNames(response.recommendation, entities);
  for (const name of unknownInRecommendation) {
    warnings.push(`[Validation] Recommendation mentions "${name}" which is not a known character.`);
  }

  // Verify generatedText is empty when it shouldn't have been provided
  // (We can't perfectly detect this, but if generatedText is long and contextUsed is minimal, flag it)
  if (response.generatedText && response.generatedText.length > 200 && response.contextUsed.length === 0) {
    warnings.push('[Validation] Generated text was provided but no context was cited — may be ungrounded.');
  }

  // Positive grounding check: long recommendation with no context = likely ungrounded
  if (response.recommendation.length > 300 && response.contextUsed.length === 0) {
    warnings.push('[Validation] Long recommendation provided without citing any context — may be ungrounded.');
  }

  // Scan alternatives for unknown character names
  for (const alt of response.alternatives) {
    const unknownInAlt = findUnknownNames(alt, entities);
    for (const name of unknownInAlt) {
      warnings.push(`[Validation] Alternative mentions "${name}" which is not a known character.`);
    }
  }

  return {
    ...response,
    confidenceNotes: [...response.confidenceNotes, ...warnings],
  };
}

/**
 * Validate a blocked-mode AI response against known story entities.
 * Returns the response with any validation issues flagged.
 */
export function validateBlockedResponse(
  response: ChatResponseBlocked,
  entities: KnownEntities
): ChatResponseBlocked & { validationWarnings: string[] } {
  const warnings: string[] = [];

  // Check that diagnosis references real story elements
  const unknownInDiagnosis = findUnknownNames(response.diagnosis, entities);
  for (const name of unknownInDiagnosis) {
    warnings.push(`[Validation] Diagnosis mentions "${name}" which is not a known character.`);
  }

  // Check nextPaths reference real elements
  for (const path of response.nextPaths) {
    const unknownInPath = findUnknownNames(path.description, entities);
    for (const name of unknownInPath) {
      warnings.push(`[Validation] Path "${path.label}" mentions "${name}" which is not a known character.`);
    }
  }

  return { ...response, validationWarnings: warnings };
}

/**
 * Find character names referenced in text that aren't in known entities.
 * Uses a simple proper-noun heuristic: capitalized words that appear to be names.
 */
function findUnknownNames(text: string, entities: KnownEntities): string[] {
  if (!text || entities.characters.length === 0) return [];

  const knownLower = new Set(entities.characters.map(n => n.toLowerCase()));
  // Extract capitalized multi-word sequences that look like names (2+ chars, not start of sentence after period)
  // eslint-disable-next-line security/detect-unsafe-regex -- lookbehinds are fixed-length; no catastrophic backtracking risk with this input set (AI-generated text, not user-controlled regex)
  const namePattern = /(?<!\. )(?<!\.\n)\b([A-Z][a-z]{1,}(?:\s[A-Z][a-z]{1,})*)\b/g;
  const found = new Set<string>();
  let match;

  while ((match = namePattern.exec(text)) !== null) {
    const candidate = match[1];
    // Skip common English words that are capitalized
    if (COMMON_CAPITALIZED.has(candidate.toLowerCase())) continue;
    // Skip markdown headings
    if (text[match.index - 1] === '#') continue;
    // Check if any part matches a known character
    const isKnown = [...knownLower].some(known => {
      const candidateLower = candidate.toLowerCase();
      // Exact match
      if (candidateLower === known) return true;
      // Multi-word: check if all words of the known name appear as whole words in candidate
      const candidateWords = candidateLower.split(/\s+/);
      const knownWords = known.split(/\s+/);
      return knownWords.every(kw => candidateWords.includes(kw));
    });
    if (!isKnown) {
      found.add(candidate);
    }
  }

  return [...found];
}

const COMMON_CAPITALIZED = new Set([
  'the', 'this', 'that', 'these', 'those', 'here', 'there', 'where', 'when',
  'what', 'which', 'who', 'how', 'why', 'none', 'chapter', 'scene', 'act',
  'part', 'book', 'story', 'plot', 'character', 'conflict', 'theme',
  'safe', 'canon', 'draft', 'confirmed', 'flexible', 'discarded',
  'low', 'medium', 'high', 'critical', 'clear', 'warnings', 'contradictions',
  'based', 'according', 'however', 'therefore', 'meanwhile', 'furthermore',
  'additionally', 'currently', 'previously', 'specifically', 'essentially',
  'particularly', 'alternatively', 'recommendation', 'suggestion',
  'continuation', 'escalation', 'revelation', 'discovery',
  'but', 'yet', 'also', 'just', 'still', 'only', 'never', 'always', 'perhaps', 'maybe',
  'really', 'certainly', 'obviously', 'clearly', 'indeed', 'surely',
  'god', 'death', 'love', 'time', 'fate', 'truth', 'nature',
  'morning', 'evening', 'night', 'spring', 'summer', 'winter', 'autumn',
  'first', 'last', 'next', 'final', 'new', 'old', 'great', 'little',
  'everything', 'nothing', 'something', 'everyone', 'someone', 'anyone', 'nobody',
]);
