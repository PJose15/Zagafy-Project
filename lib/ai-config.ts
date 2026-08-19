import { HarmCategory, HarmBlockThreshold } from '@google/genai';

export const AI_MODEL = 'gemini-2.5-flash';

// Anthropic (character-chat, polish) provider constants — centralized here so a
// model upgrade or version bump is a one-line change instead of a hunt across
// routes. Requires the ANTHROPIC_API_KEY env var in addition to GEMINI_API_KEY.
export const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';

// gemini-2.5-flash enables "thinking" by default, and those thinking tokens are
// drawn from the same maxOutputTokens budget as the answer. On short-output calls
// (micro-prompt, closing-question) thinking consumes the entire budget and the
// model returns empty text; on JSON calls it truncates the structured output.
// Disabling thinking sends the full budget to the response — the right trade-off
// for these grounded/creative-nudge tasks. Pass this as `thinkingConfig`.
export const THINKING_CONFIG = { thinkingBudget: 0 } as const;

// Default outbound timeout for Gemini calls. A hung provider connection would
// otherwise pin the serverless function until its maxDuration (up to 300s),
// burning execution time and cost. Kept comfortably under the shorter route
// budgets; long routes (ingest) pass their own value.
export const GEMINI_TIMEOUT_MS = 25_000;

// Creative writing requires full freedom — horror, thrillers, dark fiction,
// violence, emotional distress, and mature themes are all legitimate fiction.
// Only the absolute worst content gets blocked.
export const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// Per-endpoint temperature and token configuration
export const AI_CONFIG = {
  chat: {
    temperature: 0.3,       // Grounded, precise responses
    maxOutputTokens: 4096,
  },
  chatBlocked: {
    temperature: 0.5,       // Slightly more creative for unblocking
    maxOutputTokens: 4096,
  },
  audit: {
    temperature: 0.1,       // Analytical precision
    maxOutputTokens: 2048,
  },
  microPrompt: {
    temperature: 0.7,       // Creative nudges
    maxOutputTokens: 1024,
  },
  storyCoach: {
    temperature: 0.3,       // Analytical coaching
    maxOutputTokens: 4096,
  },
  characterChat: {
    temperature: 0.6,       // In-character creative responses
    maxOutputTokens: 2048,
  },
  characterAnalysis: {
    temperature: 0.3,       // Grounded character analysis
    maxOutputTokens: 2048,
  },
  closingQuestion: {
    temperature: 0.7,       // Warm, reflective single question
    maxOutputTokens: 256,
  },
  worldBible: {
    temperature: 0.1,       // Precise extraction
    maxOutputTokens: 8192,
  },
  ingest: {
    temperature: 0.1,       // Precise structured extraction
    maxOutputTokens: 8192,
  },
} as const;
