import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let activeId = 'projA';
vi.mock('@/lib/projects/active-project', () => ({
  getActiveProjectId: () => activeId,
}));

import {
  readHeteronyms,
  addHeteronym,
  setActiveHeteronymId,
  getActiveHeteronymId,
  type Heteronym,
} from '@/lib/types/heteronym';

function makeHet(id: string, name: string): Heteronym {
  return {
    id, name, bio: '', styleNote: '', avatarColor: '#000', avatarEmoji: '✍️',
    createdAt: '2026-01-01T00:00:00Z', isDefault: false,
  };
}

describe('heteronyms — per-project scoping', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    activeId = 'projA';
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { store = {}; },
      get length() { return Object.keys(store).length; },
      key: (i: number) => Object.keys(store)[i] ?? null,
    } as Storage);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('isolates heteronyms and active voice between projects', () => {
    addHeteronym(makeHet('a1', 'Alice'));
    setActiveHeteronymId('a1');
    expect(readHeteronyms().map(h => h.name)).toEqual(['Alice']);
    expect(getActiveHeteronymId()).toBe('a1');

    // Switch project — Project B sees none of A's personas.
    activeId = 'projB';
    expect(readHeteronyms()).toHaveLength(0);
    expect(getActiveHeteronymId()).toBeNull();

    addHeteronym(makeHet('b1', 'Bob'));
    expect(readHeteronyms().map(h => h.name)).toEqual(['Bob']);

    // Back to A — unchanged.
    activeId = 'projA';
    expect(readHeteronyms().map(h => h.name)).toEqual(['Alice']);
  });

  it('migrates legacy global heteronyms onto the active project once', () => {
    store['zagafy_heteronyms'] = JSON.stringify([makeHet('g1', 'Ghost')]);
    store['zagafy_active_heteronym'] = 'g1';

    // First read on Project A adopts the legacy personas...
    expect(readHeteronyms().map(h => h.name)).toEqual(['Ghost']);
    expect(getActiveHeteronymId()).toBe('g1');
    // ...and the legacy global keys are cleared so other projects start fresh.
    expect(store['zagafy_heteronyms']).toBeUndefined();

    activeId = 'projB';
    expect(readHeteronyms()).toHaveLength(0);
  });
});
