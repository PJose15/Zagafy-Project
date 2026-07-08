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
