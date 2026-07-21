import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStoryCoach, clearCoachSessionCache } from '@/hooks/use-story-coach';
import type { CoachingInsight } from '@/lib/story-coach/types';

function mockInsights(count = 2): CoachingInsight[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `insight-${i}`,
    lens: 'tension' as const,
    observation: `Observation ${i}`,
    suggestion: `Suggestion ${i}`,
    priority: i === 0 ? 'high' as const : 'medium' as const,
  }));
}

function mockFetchSuccess(insights: CoachingInsight[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ insights }),
  });
}

function mockFetchError(status = 500) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  });
}

describe('useStoryCoach', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // The session cache is module-level (and now keyed per chapter+lens, so
    // lens-scoped refreshes also cache) — clear it so tests stay independent.
    clearCoachSessionCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with empty state', () => {
    const { result } = renderHook(() => useStoryCoach());
    expect(result.current.insights).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetches insights on refresh and sets them', async () => {
    const insights = mockInsights();
    globalThis.fetch = mockFetchSuccess(insights);

    const { result } = renderHook(() => useStoryCoach());

    await act(async () => {
      result.current.refresh('ch-1', { chapterContent: 'Some text', focusLens: 'tension' });
    });

    expect(result.current.insights).toHaveLength(2);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/story-coach', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
  });

  it('sends correct body in fetch request', async () => {
    globalThis.fetch = mockFetchSuccess([]);

    const { result } = renderHook(() => useStoryCoach());

    await act(async () => {
      result.current.refresh('ch-2', {
        chapterContent: 'Chapter text',
        chapterTitle: 'My Chapter',
        storyContext: 'Fantasy world',
        focusLens: 'pacing',
        // The heteronym slice buildVoiceDirective reads (name/voice/styleNote).
        heteronymVoice: {
          name: 'Álvaro',
          voice: { tone: 'poetic', vocabulary: 'literary', pacing: 'flowing', freeformNote: '' },
          styleNote: 'long sentences',
        },
      });
    });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.chapterId).toBe('ch-2');
    expect(body.chapterContent).toBe('Chapter text');
    expect(body.chapterTitle).toBe('My Chapter');
    expect(body.storyContext).toBe('Fantasy world');
    expect(body.focusLens).toBe('pacing');
    expect(body.heteronymVoice).toEqual({
      name: 'Álvaro',
      voice: { tone: 'poetic', vocabulary: 'literary', pacing: 'flowing', freeformNote: '' },
      styleNote: 'long sentences',
    });
  });

  it('forwards the story language so coaching matches the prose language', async () => {
    globalThis.fetch = mockFetchSuccess([]);

    const { result } = renderHook(() => useStoryCoach());

    await act(async () => {
      result.current.refresh('ch-3', { chapterContent: 'Texto del capítulo', language: 'Spanish' });
    });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.language).toBe('Spanish');
  });

  it('sets error on fetch failure', async () => {
    globalThis.fetch = mockFetchError(500);

    const { result } = renderHook(() => useStoryCoach());

    await act(async () => {
      result.current.refresh('ch-1', { focusLens: 'tension', chapterContent: 'x' });
    });

    expect(result.current.error).toBe('apiError');
    expect(result.current.insights).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useStoryCoach());

    await act(async () => {
      result.current.refresh('ch-1', { focusLens: 'tension', chapterContent: 'x' });
    });

    expect(result.current.error).toBe('networkError');
    expect(result.current.isLoading).toBe(false);
  });

  it('dismisses an insight by id', async () => {
    const insights = mockInsights(3);
    globalThis.fetch = mockFetchSuccess(insights);

    const { result } = renderHook(() => useStoryCoach());

    await act(async () => {
      result.current.refresh('ch-1', { focusLens: 'tension', chapterContent: 'x' });
    });

    expect(result.current.insights).toHaveLength(3);

    act(() => {
      result.current.dismissInsight('insight-1');
    });

    expect(result.current.insights).toHaveLength(2);
    expect(result.current.insights.find(i => i.id === 'insight-1')).toBeUndefined();
  });

  it('aborts previous request when refresh is called again', async () => {
    const abortSpy = vi.fn();
    const originalAbortController = globalThis.AbortController;
    globalThis.AbortController = class {
      signal = { aborted: false };
      abort = abortSpy;
    } as any;

    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useStoryCoach());

    act(() => {
      result.current.refresh('ch-1', { focusLens: 'tension', chapterContent: 'x' });
    });

    act(() => {
      result.current.refresh('ch-1', { focusLens: 'pacing', chapterContent: 'y' });
    });

    expect(abortSpy).toHaveBeenCalledTimes(1);
    globalThis.AbortController = originalAbortController;
  });

  it('handles non-array insights data gracefully', async () => {
    const originalAbortController = globalThis.AbortController;
    globalThis.AbortController = class {
      signal = { aborted: false };
      abort = vi.fn();
    } as any;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ insights: 'not-an-array' }),
    });

    const { result } = renderHook(() => useStoryCoach());

    await act(async () => {
      result.current.refresh('ch-1', { focusLens: 'tension', chapterContent: 'x' });
    });

    expect(result.current.insights).toEqual([]);
    expect(result.current.error).toBeNull();
    globalThis.AbortController = originalAbortController;
  });

  it('sets isLoading true during fetch', async () => {
    const originalAbortController = globalThis.AbortController;
    globalThis.AbortController = class {
      signal = { aborted: false };
      abort = vi.fn();
    } as any;

    let resolvePromise: (val: any) => void;
    globalThis.fetch = vi.fn().mockReturnValue(
      new Promise(r => { resolvePromise = r; })
    );

    const { result } = renderHook(() => useStoryCoach());

    act(() => {
      result.current.refresh('ch-1', { focusLens: 'tension', chapterContent: 'x' });
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ insights: [] }),
      });
    });

    expect(result.current.isLoading).toBe(false);
    globalThis.AbortController = originalAbortController;
  });

  it('uses cache on 2nd refresh without focusLens change (no new fetch)', async () => {
    const insights = mockInsights(2);
    const fetchFn = mockFetchSuccess(insights);
    globalThis.fetch = fetchFn;

    const { result } = renderHook(() => useStoryCoach());

    await act(async () => {
      result.current.refresh('ch-1', { chapterContent: 'Text', focusLens: 'tension' });
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.current.insights).toHaveLength(2);

    // Second refresh with same params — should hit cache
    await act(async () => {
      result.current.refresh('ch-1', { chapterContent: 'Text', focusLens: 'tension' });
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.current.insights).toHaveLength(2);
  });

  it('force bypasses and replaces the cached session', async () => {
    const fetchFn = mockFetchSuccess(mockInsights(2));
    globalThis.fetch = fetchFn;

    const { result } = renderHook(() => useStoryCoach());

    await act(async () => {
      result.current.refresh('ch-1', { chapterContent: 'Text' });
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Refresh button path — must refetch despite the cache…
    const freshInsights = [{ ...mockInsights(1)[0], id: 'fresh-0' }];
    globalThis.fetch = mockFetchSuccess(freshInsights);
    await act(async () => {
      result.current.refresh('ch-1', { chapterContent: 'Text', force: true });
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result.current.insights[0].id).toBe('fresh-0');

    // …and the replaced cache entry serves the next non-forced refresh.
    const thirdFetch = mockFetchSuccess([]);
    globalThis.fetch = thirdFetch;
    await act(async () => {
      result.current.refresh('ch-1', { chapterContent: 'Text' });
    });
    expect(thirdFetch).not.toHaveBeenCalled();
    expect(result.current.insights[0].id).toBe('fresh-0');
  });

  it('keys the cache per lens so lens results never poison the general entry', async () => {
    const fetchFn = mockFetchSuccess(mockInsights(2));
    globalThis.fetch = fetchFn;

    const { result } = renderHook(() => useStoryCoach());

    await act(async () => {
      result.current.refresh('ch-1', { chapterContent: 'Text' });
    });
    await act(async () => {
      result.current.refresh('ch-1', { chapterContent: 'Text', focusLens: 'pacing' });
    });
    // Different cache keys → two fetches
    expect(fetchFn).toHaveBeenCalledTimes(2);

    // Both entries now cached: repeats of either hit the cache.
    await act(async () => {
      result.current.refresh('ch-1', { chapterContent: 'Text' });
    });
    await act(async () => {
      result.current.refresh('ch-1', { chapterContent: 'Text', focusLens: 'pacing' });
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('cached insights exclude dismissed ones on subsequent access', async () => {
    const insights = mockInsights(3);
    globalThis.fetch = mockFetchSuccess(insights);

    const { result } = renderHook(() => useStoryCoach());

    await act(async () => {
      result.current.refresh('ch-1', { chapterContent: 'Text', focusLens: 'tension' });
    });

    expect(result.current.insights).toHaveLength(3);

    act(() => {
      result.current.dismissInsight('insight-0');
    });

    expect(result.current.insights).toHaveLength(2);
    expect(result.current.insights.find(i => i.id === 'insight-0')).toBeUndefined();
  });

  it('silently ignores abort errors', async () => {
    const originalAbortController = globalThis.AbortController;
    globalThis.AbortController = class {
      signal = { aborted: false };
      abort = vi.fn();
    } as any;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const abortErr = new DOMException('The operation was aborted.', 'AbortError');
    globalThis.fetch = vi.fn().mockRejectedValue(abortErr);

    const { result } = renderHook(() => useStoryCoach());

    await act(async () => {
      result.current.refresh('ch-1', { focusLens: 'tension', chapterContent: 'x' });
    });

    expect(result.current.error).toBeNull();
    consoleSpy.mockRestore();
    globalThis.AbortController = originalAbortController;
  });
});
