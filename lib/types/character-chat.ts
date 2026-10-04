import { readCharacterRecords, mutateCharacterRecord, mergeCharacterSession } from '@/lib/storage/character-history';
import { getActiveProjectId } from '@/lib/projects/active-project';
import type { CharacterState } from '@/lib/store';

export type ChatMode = 'exploration' | 'scene' | 'confrontation';

// ─── Runtime normalization for AI-written state fields ───
// pressureLevel/indicator are enum-typed, but the values are written by AI
// analysis and have been observed as free prose (e.g. Spanish "Extremo: su
// vida está en juego"). The UI uses them as i18n keys and config-map indexes,
// so unrecognized values crash. Normalize at every read boundary.

export const PRESSURE_LEVELS = ['Low', 'Medium', 'High', 'Critical'] as const;
export const STATE_INDICATORS = [
  'stable',
  'shifting',
  'under pressure',
  'emotionally conflicted',
  'at risk of contradiction',
] as const;

const PRESSURE_SYNONYMS: Record<string, CharacterState['pressureLevel']> = {
  low: 'Low', bajo: 'Low', baja: 'Low',
  medium: 'Medium', medio: 'Medium', media: 'Medium', moderado: 'Medium', moderada: 'Medium',
  high: 'High', alto: 'High', alta: 'High', elevado: 'High', elevada: 'High',
  critical: 'Critical', crítico: 'Critical', critico: 'Critical', crítica: 'Critical',
  critica: 'Critical', extremo: 'Critical', extrema: 'Critical', extreme: 'Critical',
};

/** Map an AI-written pressure value to the enum; null when absent/unrecognized. */
export function normalizePressureLevel(value: unknown): CharacterState['pressureLevel'] | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const exact = PRESSURE_LEVELS.find(l => l === value);
  if (exact) return exact;
  // Prose like "Extremo: su vida está en juego" — match the leading word.
  const head = value.trim().toLowerCase().split(/[\s:,.;(]+/)[0];
  return PRESSURE_SYNONYMS[head] ?? null;
}

/** Map an AI-written indicator value to the enum; null when absent/unrecognized. */
export function normalizeStateIndicator(value: unknown): CharacterState['indicator'] | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim().toLowerCase();
  return STATE_INDICATORS.find(i => i === v) ?? null;
}

/**
 * The conversation-local, evolving slice of a character's state. Updated after
 * each exchange so the character visibly reacts and escalates *within* a chat,
 * without mutating the authored character baseline.
 */
export interface EvolvedState {
  emotionalState: string;
  pressureLevel: CharacterState['pressureLevel'];
  indicator: CharacterState['indicator'];
}

/**
 * Story grounding sent with a chat request so the character answers from the
 * actual manuscript and stays consistent with established canon — not as a
 * generic persona. Built client-side from the store; capped server-side.
 */
export interface StoryContext {
  /** Title + synopsis — the overall premise the character lives inside. */
  premise?: string;
  /** Established canon facts (immutable truth the character must not contradict). */
  canon?: string[];
  /** What has happened so far — chapter summaries, or excerpts mentioning them. */
  storySoFar?: string;
}

/**
 * A detected conflict between a character's reply and an established canon fact.
 * Surfaced in the chat so the writer catches the character "breaking canon"
 * (the Story-Brain consistency idea, applied live to dialogue).
 */
export interface ContradictionFlag {
  /** The canon fact the reply contradicts. */
  fact: string;
  /** One-sentence explanation of how the reply conflicts with it. */
  explanation: string;
}

export interface CharacterChatMessage {
  id: string;
  role: 'user' | 'character';
  content: string;
  timestamp: string;
  mode: ChatMode;
}

export interface CharacterChatSession {
  clearedAt?: string;
  id: string;
  characterId: string;
  characterName: string;
  messages: CharacterChatMessage[];
  mode: ChatMode;
  createdAt: string;
  updatedAt: string;
  /** Conversation-local evolving emotional state (see EvolvedState). */
  evolvedState?: EvolvedState;
  /**
   * Durable cross-session memory — a concise running summary of what the
   * character has learned/revealed across conversations. Survives a session
   * clear and is fed back into the prompt so the character recalls past chats.
   */
  memory?: string;
}

export interface CharacterInsight {
  id: string;
  characterId: string;
  sessionId: string;
  content: string;
  savedAsCanon: boolean;
  createdAt: string;
}

// Type guards
export function isChatMessage(v: unknown): v is CharacterChatMessage {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    (o.role === 'user' || o.role === 'character') &&
    typeof o.content === 'string' &&
    typeof o.timestamp === 'string' &&
    (o.mode === 'exploration' || o.mode === 'scene' || o.mode === 'confrontation')
  );
}

export function isChatSession(v: unknown): v is CharacterChatSession {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.characterId === 'string' &&
    typeof o.characterName === 'string' &&
    Array.isArray(o.messages) && o.messages.every(isChatMessage) &&
    (o.mode === 'exploration' || o.mode === 'scene' || o.mode === 'confrontation') &&
    typeof o.createdAt === 'string' &&
    typeof o.updatedAt === 'string'
  );
}

export function isCharacterInsight(v: unknown): v is CharacterInsight {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.characterId === 'string' &&
    typeof o.sessionId === 'string' &&
    typeof o.content === 'string' &&
    typeof o.savedAsCanon === 'boolean' &&
    typeof o.createdAt === 'string'
  );
}

// Atomic, project-scoped conversation records. Caps are presentation limits only.
const MAX_CHAT_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 200;
export async function readChatSessions(projectId = getActiveProjectId()): Promise<CharacterChatSession[]> {
  return await readCharacterRecords('character-session', projectId) as CharacterChatSession[];
}
export async function addChatSession(session: CharacterChatSession, projectId = getActiveProjectId()): Promise<boolean> {
  await mutateCharacterRecord(session.id,'character-session',old => old ?? session,projectId); return true;
}
export async function writeChatSessions(sessions: CharacterChatSession[], projectId = getActiveProjectId()): Promise<void> {
  for (const session of sessions) await addChatSession(session,projectId);
}
export async function updateChatSession(id: string, updates: Partial<CharacterChatSession>, projectId = getActiveProjectId()): Promise<void> {
  await mutateCharacterRecord(id,'character-session',old => {
    if (!isChatSession(old)) throw new Error('Character session no longer exists');
    return mergeCharacterSession(old, { ...old, ...updates, id });
  },projectId);
}
export async function readInsights(projectId = getActiveProjectId()): Promise<CharacterInsight[]> {
  return await readCharacterRecords('character-insight',projectId) as CharacterInsight[];
}
export async function addInsight(insight: CharacterInsight, projectId = getActiveProjectId()): Promise<void> {
  await mutateCharacterRecord(insight.id,'character-insight',old=>old??insight,projectId);
}
export async function writeInsights(insights: CharacterInsight[], projectId = getActiveProjectId()): Promise<void> {
  for (const insight of insights) await addInsight(insight,projectId);
}
export async function markInsightAsCanon(id: string, projectId = getActiveProjectId()): Promise<void> {
  await mutateCharacterRecord(id,'character-insight',old=>{
    if (!isCharacterInsight(old)) throw new Error('Insight no longer exists');
    return { ...old, savedAsCanon: true };
  },projectId);
}
export { MAX_CHAT_SESSIONS, MAX_MESSAGES_PER_SESSION };
