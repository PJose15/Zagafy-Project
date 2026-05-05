import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isSceneChangeState,
  readSceneChangeState,
  writeSceneChangeState,
  clearSceneChangeState,
  readSceneChangeReturn,
  writeSceneChangeReturn,
  clearSceneChangeReturn,
} from '@/lib/types/scene-change';
import type { SceneChangeState, SceneChangeReturn } from '@/lib/types/scene-change';

const SCENE_CHANGE_KEY = 'zagafy_scene_change_state';
const SCENE_CHANGE_RETURN_KEY = 'zagafy_scene_change_return';

function makeState(overrides: Partial<SceneChangeState> = {}): SceneChangeState {
  return {
    active: true,
    originalChapterId: 'ch-1',
    originalChapterTitle: 'Chapter One',
    originalCursorPosition: 42,
    wordCountAtDeparture: 500,
    alternateChapterId: 'ch-2',
    wordCountAtArrivalAlternate: 300,
    departureTimestamp: '2026-03-10T10:00:00Z',
    returnAt: '2026-03-10T10:15:00Z',
    extraTimeGranted: 0,
    ...overrides,
  };
}

describe('scene-change types', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};

    const localStorageMock: Storage = {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete storage[key];
      }),
      clear: vi.fn(() => {
        storage = {};
      }),
      get length() {
        return Object.keys(storage).length;
      },
      key: vi.fn((index: number) => Object.keys(storage)[index] ?? null),
    };

    vi.stubGlobal('localStorage', localStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isSceneChangeState', () => {
    it('returns true for a valid state', () => {
      expect(isSceneChangeState(makeState())).toBe(true);
    });

    it('returns false for null', () => {
      expect(isSceneChangeState(null)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(isSceneChangeState('string')).toBe(false);
    });

    it('returns false when active is not boolean', () => {
      expect(isSceneChangeState({ ...makeState(), active: 'yes' })).toBe(false);
    });

    it('returns false when originalChapterId is missing', () => {
      const s = makeState();

      delete (s as any).originalChapterId;
      expect(isSceneChangeState(s)).toBe(false);
    });

    it('returns false when extraTimeGranted is not a number', () => {
      expect(isSceneChangeState({ ...makeState(), extraTimeGranted: '0' })).toBe(false);
    });
  });

  describe('readSceneChangeState', () => {
    it('returns null when no data', () => {
      expect(readSceneChangeState()).toBeNull();
    });

    it('returns valid state from storage', () => {
      const state = makeState();
      storage[SCENE_CHANGE_KEY] = JSON.stringify(state);
      expect(readSceneChangeState()).toEqual(state);
    });

    it('returns null for corrupt JSON', () => {
      storage[SCENE_CHANGE_KEY] = 'not-json{{{';
      expect(readSceneChangeState()).toBeNull();
    });

    it('returns null for invalid data shape', () => {
      storage[SCENE_CHANGE_KEY] = JSON.stringify({ foo: 'bar' });
      expect(readSceneChangeState()).toBeNull();
    });
  });

  describe('writeSceneChangeState', () => {
    it('writes state to localStorage', () => {
      const state = makeState();
      writeSceneChangeState(state);
      expect(storage[SCENE_CHANGE_KEY]).toBe(JSON.stringify(state));
    });

    it('handles quota exceeded gracefully', () => {
      vi.stubGlobal('localStorage', {
        ...localStorage,
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => {
          throw new DOMException('QuotaExceededError');
        }),
      });
      expect(() => writeSceneChangeState(makeState())).not.toThrow();
    });
  });

  describe('clearSceneChangeState', () => {
    it('removes state from localStorage', () => {
      storage[SCENE_CHANGE_KEY] = JSON.stringify(makeState());
      clearSceneChangeState();
      expect(storage[SCENE_CHANGE_KEY]).toBeUndefined();
    });
  });

  describe('SceneChangeReturn CRUD', () => {
    const ret: SceneChangeReturn = { cursorPosition: 42, wordsWritten: 15 };

    it('returns null when no return data', () => {
      expect(readSceneChangeReturn()).toBeNull();
    });

    it('writes and reads return data', () => {
      writeSceneChangeReturn(ret);
      expect(readSceneChangeReturn()).toEqual(ret);
    });

    it('returns null for corrupt JSON', () => {
      storage[SCENE_CHANGE_RETURN_KEY] = 'bad-json';
      expect(readSceneChangeReturn()).toBeNull();
    });

    it('returns null for invalid shape', () => {
      storage[SCENE_CHANGE_RETURN_KEY] = JSON.stringify({ bad: true });
      expect(readSceneChangeReturn()).toBeNull();
    });

    it('clears return data', () => {
      writeSceneChangeReturn(ret);
      clearSceneChangeReturn();
      expect(readSceneChangeReturn()).toBeNull();
    });
  });
});
