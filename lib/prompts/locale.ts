/**
 * Locale-specific prompt directives for AI system prompts.
 * Phase 7.4 (MP-13).
 */

const LOCALE_DIRECTIVES: Record<string, string> = {
  English: 'Respond entirely in English. Use natural English idioms and examples.',
  Spanish: 'Responde completamente en español. Usa modismos y ejemplos naturales en español. Adapta el registro al contexto narrativo.',
  French: 'Réponds entièrement en français. Utilise des expressions et exemples naturels en français. Adapte le registre au contexte narratif.',
  Portuguese: 'Responda completamente em português. Use expressões e exemplos naturais em português. Adapte o registro ao contexto narrativo.',
  German: 'Antworte vollständig auf Deutsch. Verwende natürliche deutsche Redewendungen und Beispiele. Passe das Register an den narrativen Kontext an.',
  Italian: 'Rispondi interamente in italiano. Usa espressioni e esempi naturali in italiano. Adatta il registro al contesto narrativo.',
};

const LANGUAGE_DETECTION_PATTERNS: Record<string, RegExp> = {
  Spanish: /\b(el|la|los|las|de|en|que|por|con|para|una?|del|al|es|se|su|más|pero|como|ya|este|esta|todo|puede|hasta|desde|sin|sobre|también|otro|fue|ser|ha|yo|muy|así|nos|entre|cuando|hay|porque|cada|bien|estos|ella)\b/i,
  French: /\b(le|la|les|de|des|du|un|une|en|et|est|que|pour|dans|qui|sur|pas|par|ce|au|avec|son|mais|plus|tout|cette|bien|sans|peut|être|fait|comme|même|aussi|nous|eux|elle|où|ont|ses|très|autre|peu|entre)\b/i,
  Portuguese: /\b(o|a|os|as|de|do|da|em|que|para|com|por|uma?|no|na|se|ao|dos|das|é|são|foi|mais|mas|como|já|seu|sua|também|pode|sobre|entre|até|depois|outro|ela|bem|nos|muito|cada|esse|essa|ter|há)\b/i,
  German: /\b(der|die|das|und|ist|ein|eine|in|zu|den|mit|von|für|auf|nicht|sich|des|dem|es|er|sie|auch|aber|nach|noch|wie|kann|hat|ich|aus|an|bei|nur|über|oder|so|als|was|sehr|wird|da|schon|wenn)\b/i,
  Italian: /\b(il|lo|la|le|di|del|della|in|che|è|un|una|per|con|non|si|da|al|sono|come|più|ma|suo|sua|anche|questo|questa|ha|tutto|ogni|tra|fra|dopo|altro|altra|molto|può|qui|dove|quando|già|poi|bene)\b/i,
};

/**
 * Detect the most likely language of a text sample.
 * Falls back to the user's configured language if detection is inconclusive.
 */
export function detectLanguage(text: string, fallback: string = 'English'): string {
  if (!text || text.length < 20) return fallback;

  const sample = text.slice(0, 2000).toLowerCase();
  const scores: Record<string, number> = {};

  for (const [lang, pattern] of Object.entries(LANGUAGE_DETECTION_PATTERNS)) {
    // eslint-disable-next-line security/detect-non-literal-regexp -- patterns are hardcoded constants, not user input
    const matches = sample.match(new RegExp(pattern, 'gi'));
    scores[lang] = matches ? matches.length : 0;
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  // Require a minimum match threshold to override fallback
  if (best && best[1] >= 5) return best[0];
  return fallback;
}

/**
 * Get the locale directive for a given language.
 * Used by all AI prompt builders to inject language-specific instructions.
 */
export function getLocaleDirective(language: string): string {
  return LOCALE_DIRECTIVES[language] || `Respond in ${language}. Adapt examples and idioms appropriately.`;
}

/**
 * Build a complete locale block for system prompts.
 * Includes both the directive and a reminder about cultural adaptation.
 */
export function buildLocaleBlock(language: string): string {
  const directive = getLocaleDirective(language);
  if (language === 'English') return directive;
  return `${directive}\n\nIMPORTANT: All output — analysis, suggestions, prose, dialogue, field labels — MUST be in ${language}. Do not mix languages unless quoting the user's original text.`;
}
