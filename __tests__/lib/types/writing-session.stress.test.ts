import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveWipSession, readWipSession, clearWipSession } from '@/lib/types/writing-session';
const WIP_KEY = 'zagafy_session_wip';
describe('writing-session STRESS', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    const localStorageMock: Storage = {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
      clear: vi.fn(() => { storage = {}; }),
      get length() { return Object.keys(storage).length; },
      key: vi.fn((index: number) => Object.keys(storage)[index] ?? null),
    };
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'test-uuid-1234') });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  describe('WIP session stress', () => {
    it('handles WIP with heteronym fields', () => {
      saveWipSession({
        id: 'wip-1', projectId: 'p', projectName: 'n',
        startedAt: '2026-01-01T00:00:00Z', wordsStart: 0, currentWords: 100,
        heteronymId: 'het-1', heteronymName: 'Dark Poet',
      });
      const result = readWipSession();
      expect(result?.heteronymId).toBe('het-1');
      expect(result?.heteronymName).toBe('Dark Poet');
    });

    it('normalizes WIP without heteronym fields to null', () => {
      const legacy = {
        id: 'wip-1', projectId: 'p', projectName: 'n',
        startedAt: '2026-01-01T00:00:00Z', wordsStart: 0, currentWords: 100,
      };
      storage[WIP_KEY] = JSON.stringify(legacy);
      const result = readWipSession();
      expect(result).not.toBeNull();
      expect(result!.heteronymId).toBeNull();
      expect(result!.heteronymName).toBeNull();
    });

    it('rejects WIP missing required fields', () => {
      storage[WIP_KEY] = JSON.stringify({ id: 'wip-1' });
      expect(readWipSession()).toBeNull();
    });

    it('rejects WIP with non-numeric currentWords', () => {
      storage[WIP_KEY] = JSON.stringify({
        id: 'x', projectId: 'p', projectName: 'n',
        startedAt: '2026-01-01T00:00:00Z', wordsStart: 0, currentWords: 'many',
      });
      expect(readWipSession()).toBeNull();
    });

    it('handles WIP with currentWords < wordsStart', () => {
      saveWipSession({
        id: 'wip-1', projectId: 'p', projectName: 'n',
        startedAt: '2026-01-01T00:00:00Z', wordsStart: 100, currentWords: 50,
        heteronymId: null, heteronymName: null,
      });
      const result = readWipSession();
      expect(result!.currentWords).toBe(50);
      expect(result!.wordsStart).toBe(100);
    });

    it('clearWipSession then readWipSession returns null', () => {
      saveWipSession({
        id: 'wip-1', projectId: 'p', projectName: 'n',
        startedAt: '2026-01-01T00:00:00Z', wordsStart: 0, currentWords: 100,
        heteronymId: null, heteronymName: null,
      });
      clearWipSession();
      expect(readWipSession()).toBeNull();
    });
  });
});
