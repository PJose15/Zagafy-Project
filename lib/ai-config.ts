import { HarmCategory, HarmBlockThreshold } from '@google/genai';

export const AI_MODEL = 'gemini-2.5-flash';

// Creative writing requires full freedom — horror, thrillers, dark fiction,
// violence, emotional distress, and mature themes are all legitimate fiction.
// Only the absolute worst content gets blocked.
export const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// Anthropic configuration — Claude model used for character chat and polish.
// Override the model via the ANTHROPIC_MODEL env var when needed (e.g. to upgrade
// to a newer Sonnet without code changes). See .env.example.
export const anthropicConfig = {
  model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929',
  defaultMaxTokens: 4096,
  temperatures: {
    characterChat: 0.6,
    characterInsight: 0.3,
    polish: 1,
  },
  timeouts: {
    characterChat: 30_000,
    polish: 30_000,
    insight: 15_000,
  },
} as const;

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
  worldBible: {
    temperature: 0.1,       // Precise extraction
    maxOutputTokens: 8192,
  },
} as const;
