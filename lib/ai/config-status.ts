/**
 * AI configuration status — a cheap, boolean-only view of whether the runtime
 * has the keys/mode the AI features need. Used to surface a clear banner/inline
 * message instead of letting routes fail with silent 500s.
 *
 * This NEVER returns key values — only presence booleans — so it is safe to
 * expose to the client.
 */

import { isAuthEnabled } from '@/lib/auth';

export interface AiConfigStatus {
  /** Gemini powers chat, assistant, coach, micro-prompt, publishing, ingest. */
  geminiConfigured: boolean;
  /** Anthropic/Claude powers Character Chat only. */
  anthropicConfigured: boolean;
  /** When true, signed-out users are 401'd on every AI route + redirected to sign-in. */
  authEnabled: boolean;
}

export function getAiConfigStatus(): AiConfigStatus {
  return {
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    authEnabled: isAuthEnabled(),
  };
}
