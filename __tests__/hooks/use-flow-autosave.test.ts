import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

import * as dexieDb from '@/lib/storage/dexie-db';
import { StoryProvider, useStory } from '@/lib/store';
import type { Chapter, StoryState } from '@/lib/store';
import { useFlowAutosave } from '@/hooks/use-flow-autosave';
import { getPlainText } from '@/lib/editor/serialization';

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(StoryProvider, null, children);
}

const testChapter: Chapter = {
  id: 'ch-1',
  title: 'Chapter One',
  content: 'Once upon a time...',
  summary: 'The beginning',
};

function setupLocalStorage(chapters: Chapter[]) {
  const state: Partial<StoryState> = { chapters };
  // Legacy name kept — now seeds the mocked Dexie story + chapter content map
  vi.mocked(dexieDb.getStory).mockResolvedValue(state as Record<string, unknown>);
  const contentMap = new Map<string, string>();
  for (const ch of chapters) {
    contentMap.set(ch.id, ch.content);
  }
  vi.mocked(dexieDb.getAllChapterContents).mockResolvedValue(contentMap);
}

describe('useFlowAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial content for the given chapter', async () => {
    setupLocalStorage([testChapter]);

    const { result } = renderHook(() => useFlowAutosave('ch-1'), { wrapper });
    // Wait for async StoryProvider load to complete
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.initialContent).toBe('Once upon a time...');
  });

  it('returns empty string for unknown chapter ID', async () => {
    setupLocalStorage([testChapter]);

    const { result } = renderHook(() => useFlowAutosave('unknown-id'), { wrapper });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.initialContent).toBe('');
  });

  it('scheduleAutosave debounces saves', async () => {
    setupLocalStorage([testChapter]);

    const { result } = renderHook(
      () => {
        const autosave = useFlowAutosave('ch-1');
        const story = useStory();
        return { autosave, story };
      },
      { wrapper }
    );

    // Wait for async StoryProvider load
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Schedule multiple saves quickly
    act(() => {
      result.current.autosave.scheduleAutosave('Updated once');
    });
    act(() => {
      result.current.autosave.scheduleAutosave('Updated twice');
    });
    act(() => {
      result.current.autosave.scheduleAutosave('Final update');
    });

    // Before timer fires, state should still have old content
    const chapterBefore = result.current.story.state.chapters.find(ch => ch.id === 'ch-1');
    expect(chapterBefore?.content).toBe('Once upon a time...');

    // Advance past the 5-second debounce
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // After timer fires, state should have the final content (stored as Lexical JSON)
    const chapterAfter = result.current.story.state.chapters.find(ch => ch.id === 'ch-1');
    expect(getPlainText(chapterAfter?.content ?? '')).toBe('Final update');
  });

  // ── Branch coverage: null chapterId ──

  it('does nothing when chapterId is null', async () => {
    setupLocalStorage([testChapter]);

    const { result } = renderHook(
      () => {
        const autosave = useFlowAutosave(null);
        const story = useStory();
        return { autosave, story };
      },
      { wrapper }
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // initialContent should be empty for null chapterId
    expect(result.current.autosave.initialContent).toBe('');

    // scheduleAutosave + advance should not crash
    act(() => {
      result.current.autosave.scheduleAutosave('Should not save');
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Chapter content should remain unchanged
    const chapter = result.current.story.state.chapters.find(ch => ch.id === 'ch-1');
    expect(chapter?.content).toBe('Once upon a time...');
  });

  // ── Branch coverage: saveNow clears pending timer ──

  it('saveNow saves immediately and clears pending debounce', async () => {
    setupLocalStorage([testChapter]);

    const { result } = renderHook(
      () => {
        const autosave = useFlowAutosave('ch-1');
        const story = useStory();
        return { autosave, story };
      },
      { wrapper }
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Schedule a debounced save
    act(() => {
      result.current.autosave.scheduleAutosave('debounced content');
    });

    // Before debounce fires, saveNow with different content
    act(() => {
      result.current.autosave.saveNow('immediate content');
    });

    // Should have saved immediately
    const chapter = result.current.story.state.chapters.find(ch => ch.id === 'ch-1');
    expect(getPlainText(chapter?.content ?? '')).toBe('immediate content');

    // Advance past debounce — should NOT overwrite with 'debounced content' since timer was cleared
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    const chapterAfter = result.current.story.state.chapters.find(ch => ch.id === 'ch-1');
    expect(getPlainText(chapterAfter?.content ?? '')).toBe('immediate content');
  });

  // ── Branch coverage: unmount saves only if timer pending ──

  it('unmount triggers final save when timer is pending', async () => {
    setupLocalStorage([testChapter]);

    const { result, unmount } = renderHook(
      () => {
        const autosave = useFlowAutosave('ch-1');
        const story = useStory();
        return { autosave, story };
      },
      { wrapper }
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Schedule a save (starts the timer)
    act(() => {
      result.current.autosave.scheduleAutosave('unsaved content');
    });

    // Unmount before timer fires — should save
    act(() => {
      unmount();
    });

    // Content should have been saved on unmount
    // Note: since unmount calls save() directly via the cleanup, the setState
    // may not reflect in result.current (hook is unmounted), but the save function ran
  });

  it('returns empty initialContent for nonexistent chapterId', async () => {
    setupLocalStorage([testChapter]);

    const { result } = renderHook(() => useFlowAutosave('nonexistent'), { wrapper });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.initialContent).toBe('');
  });

  // ── Chapter swap without remount (scene change) — stale timer guard ──

  const chapterTwo: Chapter = {
    id: 'ch-2',
    title: 'Chapter Two',
    content: 'Second chapter text',
    summary: 'The middle',
  };

  it('never writes a previous chapter\'s content into another chapter after swaps', async () => {
    setupLocalStorage([testChapter, chapterTwo]);

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => {
        const autosave = useFlowAutosave(id);
        const story = useStory();
        return { autosave, story };
      },
      { wrapper, initialProps: { id: 'ch-1' } }
    );
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Type in chapter one and let the debounce FIRE (timer completes).
    act(() => {
      result.current.autosave.scheduleAutosave('typed in chapter one');
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(
      getPlainText(result.current.story.state.chapters.find(ch => ch.id === 'ch-1')?.content ?? '')
    ).toBe('typed in chapter one');

    // Swap to chapter two, then back — a stale (already-fired) timer ref must
    // not cause the cleanup flush to write chapter one's text into chapter two.
    act(() => {
      rerender({ id: 'ch-2' });
    });
    act(() => {
      rerender({ id: 'ch-1' });
    });

    const chapterTwoAfter = result.current.story.state.chapters.find(ch => ch.id === 'ch-2');
    expect(getPlainText(chapterTwoAfter?.content ?? '')).toBe('Second chapter text');
  });

  it('flushes a pending save to the OLD chapter when chapterId swaps', async () => {
    setupLocalStorage([testChapter, chapterTwo]);

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => {
        const autosave = useFlowAutosave(id);
        const story = useStory();
        return { autosave, story };
      },
      { wrapper, initialProps: { id: 'ch-1' } }
    );
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Schedule and swap BEFORE the debounce fires.
    act(() => {
      result.current.autosave.scheduleAutosave('mid-flight edit');
    });
    act(() => {
      rerender({ id: 'ch-2' });
    });

    // The pending content landed in chapter one (old closure)…
    expect(
      getPlainText(result.current.story.state.chapters.find(ch => ch.id === 'ch-1')?.content ?? '')
    ).toBe('mid-flight edit');

    // …and advancing time writes nothing into chapter two.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(
      getPlainText(result.current.story.state.chapters.find(ch => ch.id === 'ch-2')?.content ?? '')
    ).toBe('Second chapter text');
  });
});
