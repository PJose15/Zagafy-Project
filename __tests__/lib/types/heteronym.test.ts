import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  readHeteronyms,
  writeHeteronyms,
  addHeteronym,
  updateHeteronym,
  deleteHeteronym,
  initializeDefaultHeteronym,
  getActiveHeteronymId,
  setActiveHeteronymId,
  getGuestHeteronymId,
  setGuestHeteronymId,
  isAtLimit,
  getDefaultHeteronym,
} from '@/lib/types/heteronym';
import type { Heteronym } from '@/lib/types/heteronym';

// Heteronyms are scoped per active project; pin it so the scoped keys are stable.
vi.mock('@/lib/projects/active-project', () => ({
  getActiveProjectId: () => 'test-proj',
}));

const HETERONYMS_KEY = 'zagafy_heteronyms_test-proj';
const ACTIVE_KEY = 'zagafy_active_heteronym_test-proj';
const GUEST_KEY = 'zagafy_guest_heteronym_test-proj';

function makeHeteronym(overrides: Partial<Heteronym> = {}): Heteronym {
  return {
    id: 'het-1',
    name: 'Álvaro de Campos',
    bio: 'A naval engineer and futurist poet',
    styleNote: 'Ecstatic, verbose, modernist',
    avatarColor: '#E74C3C',
    avatarEmoji: '⚡',
    createdAt: '2026-03-10T10:00:00Z',
    isDefault: false,
    ...overrides,
  };
}

describe('heteronym', () => {
  let storage: Record<string, string>;
  let sessionStore: Record<string, string>;

  beforeEach(() => {
    storage = {};
    sessionStore = {};

    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
      clear: vi.fn(() => { storage = {}; }),
      get length() { return Object.keys(storage).length; },
      key: vi.fn((i: number) => Object.keys(storage)[i] ?? null),
    });

    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn((key: string) => sessionStore[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { sessionStore[key] = value; }),
      removeItem: vi.fn((key: string) => { delete sessionStore[key]; }),
      clear: vi.fn(() => { sessionStore = {}; }),
      get length() { return Object.keys(sessionStore).length; },
      key: vi.fn((i: number) => Object.keys(sessionStore)[i] ?? null),
    });

    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'test-uuid-1234') });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('readHeteronyms', () => {
    it('returns empty array when no data', () => {
      expect(readHeteronyms()).toEqual([]);
    });

    it('returns valid heteronyms', () => {
      const h = [makeHeteronym()];
      storage[HETERONYMS_KEY] = JSON.stringify(h);
      expect(readHeteronyms()).toEqual(h);
    });

    it('filters invalid entries', () => {
      const valid = makeHeteronym();
      const invalid = { id: 'bad', name: 123 };
      storage[HETERONYMS_KEY] = JSON.stringify([valid, invalid]);
      expect(readHeteronyms()).toEqual([valid]);
    });

    it('handles corrupt JSON', () => {
      storage[HETERONYMS_KEY] = 'not-json';
      expect(readHeteronyms()).toEqual([]);
    });
  });

  describe('writeHeteronyms', () => {
    it('writes to localStorage', () => {
      const h = [makeHeteronym()];
      writeHeteronyms(h);
      expect(storage[HETERONYMS_KEY]).toBe(JSON.stringify(h));
    });
  });

  describe('addHeteronym', () => {
    it('appends a heteronym', () => {
      const result = addHeteronym(makeHeteronym());
      expect(result).toBe(true);
      expect(JSON.parse(storage[HETERONYMS_KEY])).toHaveLength(1);
    });

    it('returns false when at limit (10)', () => {
      const ten = Array.from({ length: 10 }, (_, i) => makeHeteronym({ id: `h-${i}` }));
      storage[HETERONYMS_KEY] = JSON.stringify(ten);
      const result = addHeteronym(makeHeteronym({ id: 'h-11' }));
      expect(result).toBe(false);
    });
  });

  describe('updateHeteronym', () => {
    it('updates fields of existing heteronym', () => {
      storage[HETERONYMS_KEY] = JSON.stringify([makeHeteronym({ id: 'het-1' })]);
      updateHeteronym('het-1', { name: 'Ricardo Reis' });
      const result = JSON.parse(storage[HETERONYMS_KEY]);
      expect(result[0].name).toBe('Ricardo Reis');
    });

    it('does nothing if not found', () => {
      storage[HETERONYMS_KEY] = JSON.stringify([makeHeteronym()]);
      updateHeteronym('nonexistent', { name: 'New' });
      expect(JSON.parse(storage[HETERONYMS_KEY])[0].name).toBe('Álvaro de Campos');
    });
  });

  describe('deleteHeteronym', () => {
    it('removes a non-default heteronym', () => {
      const h = [
        makeHeteronym({ id: 'default', isDefault: true }),
        makeHeteronym({ id: 'het-1', isDefault: false }),
      ];
      storage[HETERONYMS_KEY] = JSON.stringify(h);
      deleteHeteronym('het-1');
      expect(JSON.parse(storage[HETERONYMS_KEY])).toHaveLength(1);
    });

    it('does not delete the default heteronym', () => {
      const h = [makeHeteronym({ id: 'default', isDefault: true })];
      storage[HETERONYMS_KEY] = JSON.stringify(h);
      deleteHeteronym('default');
      expect(JSON.parse(storage[HETERONYMS_KEY])).toHaveLength(1);
    });

    it('switches active ID to default when deleting active heteronym', () => {
      const h = [
        makeHeteronym({ id: 'default', isDefault: true }),
        makeHeteronym({ id: 'het-1', isDefault: false }),
      ];
      storage[HETERONYMS_KEY] = JSON.stringify(h);
      storage[ACTIVE_KEY] = 'het-1';
      deleteHeteronym('het-1');
      expect(storage[ACTIVE_KEY]).toBe('default');
    });
  });

  describe('initializeDefaultHeteronym', () => {
    it('creates default heteronym on first call', () => {
      const result = initializeDefaultHeteronym();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Myself');
      expect(result[0].isDefault).toBe(true);
      expect(result[0].avatarEmoji).toBe('✍️');
    });

    it('uses provided display name', () => {
      const result = initializeDefaultHeteronym('Fernando');
      expect(result[0].name).toBe('Fernando');
    });

    it('returns existing heteronyms if already initialized', () => {
      const existing = [makeHeteronym({ id: 'existing', isDefault: true })];
      storage[HETERONYMS_KEY] = JSON.stringify(existing);
      const result = initializeDefaultHeteronym();
      expect(result).toEqual(existing);
    });
  });

  describe('active heteronym', () => {
    it('gets and sets active heteronym ID', () => {
      setActiveHeteronymId('het-1');
      expect(getActiveHeteronymId()).toBe('het-1');
    });

    it('returns null when not set', () => {
      expect(getActiveHeteronymId()).toBeNull();
    });
  });

  describe('guest heteronym', () => {
    it('gets and sets guest heteronym ID via sessionStorage', () => {
      setGuestHeteronymId('guest-1');
      expect(getGuestHeteronymId()).toBe('guest-1');
    });

    it('clears guest heteronym', () => {
      setGuestHeteronymId('guest-1');
      setGuestHeteronymId(null);
      expect(getGuestHeteronymId()).toBeNull();
    });
  });

  describe('isAtLimit', () => {
    it('returns false when under limit', () => {
      storage[HETERONYMS_KEY] = JSON.stringify([makeHeteronym()]);
      expect(isAtLimit()).toBe(false);
    });

    it('returns true when at limit', () => {
      const ten = Array.from({ length: 10 }, (_, i) => makeHeteronym({ id: `h-${i}` }));
      storage[HETERONYMS_KEY] = JSON.stringify(ten);
      expect(isAtLimit()).toBe(true);
    });
  });

  describe('getDefaultHeteronym', () => {
    it('returns the default heteronym', () => {
      const h = [
        makeHeteronym({ id: 'h1', isDefault: false }),
        makeHeteronym({ id: 'h2', isDefault: true }),
      ];
      storage[HETERONYMS_KEY] = JSON.stringify(h);
      expect(getDefaultHeteronym()?.id).toBe('h2');
    });

    it('returns undefined when no heteronyms', () => {
      expect(getDefaultHeteronym()).toBeUndefined();
    });
  });
});
