import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('@/lib/storage/dexie-db', () => ({
  migrateFromLocalStorage: vi.fn().mockResolvedValue(undefined),
  getAllChapterContents: vi.fn().mockResolvedValue(new Map()),
  putChapterContent: vi.fn().mockResolvedValue(undefined),
  getChapterContent: vi.fn().mockResolvedValue(undefined),
  deleteChapterContent: vi.fn().mockResolvedValue(undefined),
  getStory: vi.fn().mockResolvedValue(null),
  putStory: vi.fn().mockResolvedValue(undefined),
  clearAllStoryData: vi.fn().mockResolvedValue(undefined),
}));

import { StoryProvider, useStory, defaultState } from '@/lib/store';
import type { StoryState } from '@/lib/store';

describe('defaultState', () => {
  it('has expected shape', () => {
    expect(defaultState.title).toBe('Untitled Project');
    expect(defaultState.language).toBe('English');
    expect(Array.isArray(defaultState.genre)).toBe(true);
    expect(defaultState.genre).toHaveLength(0);
    expect(Array.isArray(defaultState.characters)).toBe(true);
    expect(Array.isArray(defaultState.chapters)).toBe(true);
    expect(Array.isArray(defaultState.timeline_events)).toBe(true);
    expect(Array.isArray(defaultState.open_loops)).toBe(true);
    expect(Array.isArray(defaultState.world_rules)).toBe(true);
    expect(Array.isArray(defaultState.active_conflicts)).toBe(true);
    expect(Array.isArray(defaultState.foreshadowing_elements)).toBe(true);
    expect(Array.isArray(defaultState.locations)).toBe(true);
    expect(Array.isArray(defaultState.themes)).toBe(true);
    expect(Array.isArray(defaultState.canon_items)).toBe(true);
    expect(Array.isArray(defaultState.ambiguities)).toBe(true);
    expect(Array.isArray(defaultState.chat_messages)).toBe(true);
    expect(defaultState.synopsis).toBe('');
    expect(defaultState.style_profile).toBe('');
  });

  it('has all StoryState keys', () => {
    const keys: (keyof StoryState)[] = [
      'language', 'title', 'genre', 'synopsis', 'author_intent',
      'chapters', 'scenes', 'characters', 'timeline_events', 'open_loops',
      'world_rules', 'style_profile', 'active_conflicts', 'foreshadowing_elements',
      'locations', 'themes', 'canon_items', 'ambiguities', 'chat_messages',
    ];
    for (const key of keys) {
      expect(defaultState).toHaveProperty(key);
    }
  });
});

describe('useStory() outside StoryProvider', () => {
  it('throws an error', () => {
    expect(() => {
      renderHook(() => useStory());
    }).toThrow('useStory must be used within a StoryProvider');
  });
});

describe('useStory() inside StoryProvider', () => {
  function wrapper({ children }: { children: React.ReactNode }) {
    return <StoryProvider>{children}</StoryProvider>;
  }

  it('provides initial state matching defaultState', async () => {
    const { result } = renderHook(() => useStory(), { wrapper });
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    expect(result.current.state.title).toBe(defaultState.title);
    expect(result.current.state.language).toBe(defaultState.language);
  });

  it('updateField updates a specific field', async () => {
    const { result } = renderHook(() => useStory(), { wrapper });
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    act(() => {
      result.current.updateField('title', 'My Novel');
    });

    expect(result.current.state.title).toBe('My Novel');
    // Other fields remain unchanged
    expect(result.current.state.language).toBe('English');
  });

  it('updateField works with array fields', async () => {
    const { result } = renderHook(() => useStory(), { wrapper });
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    act(() => {
      result.current.updateField('genre', ['Fantasy', 'Adventure']);
    });

    expect(result.current.state.genre).toEqual(['Fantasy', 'Adventure']);
  });

  it('saveNow persists immediately and adopts the passed state', async () => {
    const { putStory } = await import('@/lib/storage/dexie-db');
    const { result } = renderHook(() => useStory(), { wrapper });
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    vi.mocked(putStory).mockClear();
    const next: StoryState = { ...defaultState, title: 'Saved Novel', synopsis: 'A flushed tale' };
    await act(async () => {
      await result.current.saveNow(next);
    });

    // Store adopted the passed state...
    expect(result.current.state.title).toBe('Saved Novel');
    // ...and the persist actually ran with that title (the Genesis race fix).
    expect(putStory).toHaveBeenCalled();
    const lastArgs = vi.mocked(putStory).mock.calls.at(-1);
    expect((lastArgs?.[0] as { title?: string }).title).toBe('Saved Novel');
  });
});
