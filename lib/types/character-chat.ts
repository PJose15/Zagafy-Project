import type { CharacterState } from '@/lib/store';

export type ChatMode = 'exploration' | 'scene' | 'confrontation';

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
    Array.isArray(o.messages) &&
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

// localStorage CRUD
const CHATS_KEY = 'zagafy_character_chats';
const INSIGHTS_KEY = 'zagafy_character_insights';
const MAX_CHAT_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 200;

export function readChatSessions(): CharacterChatSession[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChatSession);
  } catch {
    return [];
  }
}

export function writeChatSessions(sessions: CharacterChatSession[]): void {
  try {
    const trimmed = sessions.slice(-MAX_CHAT_SESSIONS);
    localStorage.setItem(CHATS_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage quota exceeded
  }
}

export function addChatSession(session: CharacterChatSession): boolean {
  const sessions = readChatSessions();
  sessions.push(session);
  // writeChatSessions keeps only the newest MAX_CHAT_SESSIONS, so at the cap the
  // OLDEST session is evicted rather than the new one being silently dropped.
  // (Previously this returned false without persisting, yet callers still set the
  // session in React state — so the 51st character's messages/insights never
  // persisted and later updateChatSession() calls no-op'd.)
  writeChatSessions(sessions);
  return true;
}

export function updateChatSession(id: string, updates: Partial<CharacterChatSession>): void {
  const sessions = readChatSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx === -1) return;
  const updated = { ...sessions[idx], ...updates };
  // Enforce message limit
  if (updated.messages.length > MAX_MESSAGES_PER_SESSION) {
    updated.messages = updated.messages.slice(-MAX_MESSAGES_PER_SESSION);
  }
  sessions[idx] = updated;
  writeChatSessions(sessions);
}

export function readInsights(): CharacterInsight[] {
  try {
    const raw = localStorage.getItem(INSIGHTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCharacterInsight);
  } catch {
    return [];
  }
}

export function writeInsights(insights: CharacterInsight[]): void {
  try {
    localStorage.setItem(INSIGHTS_KEY, JSON.stringify(insights));
  } catch {
    // Storage quota exceeded
  }
}

export function addInsight(insight: CharacterInsight): void {
  const insights = readInsights();
  insights.push(insight);
  writeInsights(insights);
}

export function markInsightAsCanon(id: string): void {
  const insights = readInsights();
  const idx = insights.findIndex(i => i.id === id);
  if (idx === -1) return;
  insights[idx] = { ...insights[idx], savedAsCanon: true };
  writeInsights(insights);
}

export { MAX_CHAT_SESSIONS, MAX_MESSAGES_PER_SESSION };
