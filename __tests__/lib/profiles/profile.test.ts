import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getProfile,
  saveProfile,
  updatePreferences,
  defaultProfile,
  PROFILE_CHANGED_EVENT,
} from '@/lib/profiles/profile';

describe('local profile', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => { storage[k] = v; },
      removeItem: (k: string) => { delete storage[k]; },
      clear: () => { storage = {}; },
      get length() { return Object.keys(storage).length; },
      key: (i: number) => Object.keys(storage)[i] ?? null,
    } as Storage);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('creates and persists a default profile on first read', () => {
    const p = getProfile();
    expect(p.displayName).toBe('Writer');
    expect(p.preferences.uiLocale).toBe('en');
    expect(p.preferences.reducedMotion).toBe(false);
    expect(storage['zagafy_profile']).toBeTruthy();
    // Stable across reads
    expect(getProfile().id).toBe(p.id);
  });

  it('saveProfile merges top-level fields and bumps updatedAt', () => {
    const before = getProfile();
    const next = saveProfile({ displayName: 'Ada', avatarEmoji: '🦉' });
    expect(next.displayName).toBe('Ada');
    expect(next.avatarEmoji).toBe('🦉');
    expect(next.id).toBe(before.id);
    expect(getProfile().displayName).toBe('Ada');
  });

  it('updatePreferences merges only preference fields', () => {
    saveProfile({ displayName: 'Ada' });
    const next = updatePreferences({ reducedMotion: true });
    expect(next.preferences.reducedMotion).toBe(true);
    expect(next.preferences.uiLocale).toBe('en');
    expect(next.displayName).toBe('Ada'); // unchanged
  });

  it('emits PROFILE_CHANGED_EVENT on save', () => {
    const handler = vi.fn();
    window.addEventListener(PROFILE_CHANGED_EVENT, handler);
    saveProfile({ displayName: 'Bo' });
    expect(handler).toHaveBeenCalled();
    window.removeEventListener(PROFILE_CHANGED_EVENT, handler);
  });

  it('normalizes a corrupt stored profile back to defaults', () => {
    storage['zagafy_profile'] = '{"displayName": 123, "preferences": "nope"}';
    const p = getProfile();
    expect(p.displayName).toBe(defaultProfile().displayName);
    expect(p.preferences.uiLocale).toBe('en');
  });
});
