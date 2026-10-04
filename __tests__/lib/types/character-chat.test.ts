import 'fake-indexeddb/auto';
import { db } from '@/lib/storage/dexie-db';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  isChatMessage,
  isChatSession,
  isCharacterInsight,
  readChatSessions,
  writeChatSessions,
  addChatSession,
  updateChatSession,
  readInsights,
  addInsight,
  markInsightAsCanon,
  normalizePressureLevel,
  normalizeStateIndicator,
  MAX_CHAT_SESSIONS,
  CharacterChatSession,
  CharacterChatMessage,
  CharacterInsight,
} from '@/lib/types/character-chat';

function makeMessage(overrides: Partial<CharacterChatMessage> = {}): CharacterChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'Hello',
    timestamp: '2025-01-01T00:00:00Z',
    mode: 'exploration',
    ...overrides,
  };
}

function makeSession(overrides: Partial<CharacterChatSession> = {}): CharacterChatSession {
  return {
    id: 'sess-1',
    characterId: 'char-1',
    characterName: 'Alice',
    messages: [],
    mode: 'exploration',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeInsight(overrides: Partial<CharacterInsight> = {}): CharacterInsight {
  return {
    id: 'ins-1',
    characterId: 'char-1',
    sessionId: 'sess-1',
    content: 'They secretly fear abandonment.',
    savedAsCanon: false,
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(async () => {
  localStorage.clear();localStorage.setItem('zagafy_active_project','project');
  await db.chatMessages.clear();await db.syncQueue.clear();await db.meta.clear();await db.stories.clear();await db.syncMeta.clear();
  await db.stories.put({id:'project',data:JSON.stringify({characters:[{id:'char-1'}]}),updatedAt:0});
});

// --- Type Guards ---

describe('isChatMessage', () => {
  it('returns true for valid message', () => {
    expect(isChatMessage(makeMessage())).toBe(true);
  });

  it('returns true for character role', () => {
    expect(isChatMessage(makeMessage({ role: 'character' }))).toBe(true);
  });

  it('returns false for null', () => {
    expect(isChatMessage(null)).toBe(false);
  });

  it('returns false for missing fields', () => {
    expect(isChatMessage({ id: 'x' })).toBe(false);
  });

  it('returns false for invalid role', () => {
    expect(isChatMessage(makeMessage({ role: 'system' as 'user' }))).toBe(false);
  });

  it('returns false for invalid mode', () => {
    expect(isChatMessage(makeMessage({ mode: 'debate' as 'exploration' }))).toBe(false);
  });
});

describe('isChatSession', () => {
  it('returns true for valid session', () => {
    expect(isChatSession(makeSession())).toBe(true);
  });

  it('returns false for missing characterId', () => {
    const s = makeSession();
    delete (s as unknown as Record<string, unknown>).characterId;
    expect(isChatSession(s)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isChatSession('string')).toBe(false);
  });
});

describe('isCharacterInsight', () => {
  it('returns true for valid insight', () => {
    expect(isCharacterInsight(makeInsight())).toBe(true);
  });

  it('returns false for missing savedAsCanon', () => {
    const i = makeInsight();
    delete (i as unknown as Record<string, unknown>).savedAsCanon;
    expect(isCharacterInsight(i)).toBe(false);
  });
});

// --- localStorage CRUD ---

describe('Scoped durable character history', () => {
  it('starts empty',async()=>{ expect(await readChatSessions()).toEqual([]);expect(await readInsights()).toEqual([]); });
  it('adds and patches sessions with a durable queue',async()=>{await addChatSession(makeSession());await updateChatSession('sess-1',{mode:'confrontation'});expect((await readChatSessions())[0].mode).toBe('confrontation');expect(await db.syncQueue.count()).toBe(2);});
  it('retains every session beyond presentation caps',async()=>{await writeChatSessions(Array.from({length:MAX_CHAT_SESSIONS+1},(_,i)=>makeSession({id:`session-${i}`})));expect(await readChatSessions()).toHaveLength(MAX_CHAT_SESSIONS+1);});
  it('reports missing sessions',async()=>{await expect(updateChatSession('missing',{})).rejects.toThrow('no longer exists');});
  it('adds insights and marks canon durably',async()=>{await addInsight(makeInsight());await markInsightAsCanon('ins-1');expect((await readInsights())[0].savedAsCanon).toBe(true);});
  it('keeps corrupt legacy bytes for recovery',async()=>{localStorage.setItem('zagafy_character_chats','broken');await expect(readChatSessions()).rejects.toThrow();expect(localStorage.getItem('zagafy_character_chats')).toBe('broken');});
  it('imports legacy records only for an unambiguous character owner',async()=>{localStorage.setItem('zagafy_character_chats',JSON.stringify([makeSession()]));expect(await readChatSessions()).toHaveLength(1);expect(localStorage.getItem('zagafy_character_chats')).not.toBeNull();});
});

describe('normalizePressureLevel', () => {
  it('passes through exact enum values', () => {
    expect(normalizePressureLevel('Low')).toBe('Low');
    expect(normalizePressureLevel('Critical')).toBe('Critical');
  });

  it('matches case-insensitive and Spanish synonyms', () => {
    expect(normalizePressureLevel('high')).toBe('High');
    expect(normalizePressureLevel('alto')).toBe('High');
    expect(normalizePressureLevel('crítico')).toBe('Critical');
  });

  it('salvages AI prose by its leading word (the observed production bug)', () => {
    expect(normalizePressureLevel('Extremo: su vida y la de su padre están en juego.')).toBe('Critical');
    expect(normalizePressureLevel('High — everything is at stake')).toBe('High');
  });

  it('returns null for absent or unrecognizable values', () => {
    expect(normalizePressureLevel(undefined)).toBeNull();
    expect(normalizePressureLevel('')).toBeNull();
    expect(normalizePressureLevel('the character feels tension')).toBeNull();
    expect(normalizePressureLevel(42)).toBeNull();
  });
});

describe('normalizeStateIndicator', () => {
  it('passes through exact enum values', () => {
    expect(normalizeStateIndicator('stable')).toBe('stable');
    expect(normalizeStateIndicator('at risk of contradiction')).toBe('at risk of contradiction');
  });

  it('is case/whitespace tolerant', () => {
    expect(normalizeStateIndicator(' Under Pressure ')).toBe('under pressure');
  });

  it('returns null for absent or unrecognizable values', () => {
    expect(normalizeStateIndicator(undefined)).toBeNull();
    expect(normalizeStateIndicator('nervioso y en conflicto')).toBeNull();
    expect(normalizeStateIndicator(7)).toBeNull();
  });
});
