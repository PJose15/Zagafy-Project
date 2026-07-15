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
  writeInsights,
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

beforeEach(() => {
  localStorage.clear();
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

describe('readChatSessions / writeChatSessions', () => {
  it('returns empty array when nothing stored', () => {
    expect(readChatSessions()).toEqual([]);
  });

  it('writes and reads sessions', () => {
    const session = makeSession();
    writeChatSessions([session]);
    expect(readChatSessions()).toEqual([session]);
  });

  it('filters invalid entries', () => {
    localStorage.setItem('zagafy_character_chats', JSON.stringify([{ bad: true }, makeSession()]));
    expect(readChatSessions()).toHaveLength(1);
  });

  it('handles corrupted JSON', () => {
    localStorage.setItem('zagafy_character_chats', 'not-json');
    expect(readChatSessions()).toEqual([]);
  });
});

describe('addChatSession', () => {
  it('adds a session', () => {
    expect(addChatSession(makeSession())).toBe(true);
    expect(readChatSessions()).toHaveLength(1);
  });

  it('evicts the oldest session at the limit so the new one still persists', () => {
    const sessions = Array.from({ length: MAX_CHAT_SESSIONS }, (_, i) =>
      makeSession({ id: `sess-${i}` })
    );
    writeChatSessions(sessions);
    expect(addChatSession(makeSession({ id: 'overflow' }))).toBe(true);
    const stored = readChatSessions();
    expect(stored).toHaveLength(MAX_CHAT_SESSIONS);
    expect(stored.some(s => s.id === 'overflow')).toBe(true); // new session persisted
    expect(stored.some(s => s.id === 'sess-0')).toBe(false);  // oldest evicted
  });
});

describe('updateChatSession', () => {
  it('updates a session', () => {
    addChatSession(makeSession());
    updateChatSession('sess-1', { mode: 'confrontation' });
    expect(readChatSessions()[0].mode).toBe('confrontation');
  });

  it('does nothing for unknown id', () => {
    addChatSession(makeSession());
    updateChatSession('unknown', { mode: 'confrontation' });
    expect(readChatSessions()[0].mode).toBe('exploration');
  });
});

// --- Insights CRUD ---

describe('insights CRUD', () => {
  it('reads empty insights', () => {
    expect(readInsights()).toEqual([]);
  });

  it('adds and reads insight', () => {
    addInsight(makeInsight());
    expect(readInsights()).toHaveLength(1);
  });

  it('marks insight as canon', () => {
    addInsight(makeInsight());
    markInsightAsCanon('ins-1');
    expect(readInsights()[0].savedAsCanon).toBe(true);
  });

  it('handles corrupted insights JSON', () => {
    localStorage.setItem('zagafy_character_insights', 'broken');
    expect(readInsights()).toEqual([]);
  });
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
