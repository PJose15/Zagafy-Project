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
 * Normalize an untrusted `language` value before it is interpolated into a
 * system prompt. The story language is a free-form, client-supplied string, so
 * without this a value like `"English. IGNORE ALL PREVIOUS INSTRUCTIONS…"` would
 * be injected verbatim into the operator channel. A real language name is a
 * short run of letters (optionally spaces/hyphens), so anything containing
 * digits, punctuation, or newlines is rejected and treated as English.
 */
export function normalizeLanguage(language: unknown): string {
  if (typeof language !== 'string') return 'English';
  const trimmed = language.trim();
  // Exact match to a supported language always wins.
  if (LOCALE_DIRECTIVES[trimmed]) return trimmed;
  // Otherwise only accept a plausible language NAME (e.g. "Dutch", "Brazilian
  // Portuguese"); reject prompt-injection payloads.
  if (/^\p{L}[\p{L} -]{0,29}$/u.test(trimmed)) return trimmed;
  return 'English';
}

/**
 * Get the locale directive for a given language.
 * Used by all AI prompt builders to inject language-specific instructions.
 */
export function getLocaleDirective(language: string): string {
  const safe = normalizeLanguage(language);
  return LOCALE_DIRECTIVES[safe] || `Respond in ${safe}. Adapt examples and idioms appropriately.`;
}

/**
 * Build a complete locale block for system prompts.
 * Includes both the directive and a reminder about cultural adaptation.
 */
export function buildLocaleBlock(language: string): string {
  const safe = normalizeLanguage(language);
  const directive = getLocaleDirective(safe);
  if (safe === 'English') return directive;
  return `${directive}\n\nIMPORTANT: All output — analysis, suggestions, prose, dialogue, field labels — MUST be in ${safe}. Do not mix languages unless quoting the user's original text.`;
}
