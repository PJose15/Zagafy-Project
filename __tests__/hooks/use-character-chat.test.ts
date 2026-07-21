import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { plaintextToLexicalJson } from '@/lib/editor/serialization';
import { readChatSessions } from '@/lib/types/character-chat';

// ─── Store mock (mutable module-level state, story-brain test pattern) ───

const charA = {
  id: 'char-a',
  name: 'Alice',
  role: 'Protagonist',
  description: 'A curious wanderer',
  coreIdentity: 'Curiosity above all',
  relationships: [],
  currentState: { emotionalState: 'calm', pressureLevel: 'Low', indicator: 'stable' },
};

const charB = {
  id: 'char-b',
  name: 'Bruno',
  role: 'Antagonist',
  description: 'A grim rival',
  coreIdentity: 'Win at any cost',
  relationships: [],
  currentState: { emotionalState: 'wary', pressureLevel: 'Low', indicator: 'stable' },
};

const mockState: Record<string, unknown> = {
  title: 'Test Story',
  synopsis: 'A tale of two rivals',
  language: 'English',
  canon_items: [],
  chapters: [],
  characters: [charA, charB],
};

vi.mock('@/lib/store', () => ({
  useStory: () => ({
    state: mockState,
    updateField: vi.fn(),
  }),
}));

// Must import AFTER mock setup
const { useCharacterChat } = await import('@/hooks/use-character-chat');

// ─── Streaming fetch helpers ───

/** A reader whose chunks the test pushes manually — lets us pause mid-stream. */
function createControlledStream() {
  type ReadResult = { done: boolean; value?: Uint8Array };
  const pending: ReadResult[] = [];
  let resolveRead: ((r: ReadResult) => void) | null = null;
  const deliver = (item: ReadResult) => {
    if (resolveRead) {
      const r = resolveRead;
      resolveRead = null;
      r(item);
    } else {
      pending.push(item);
    }
  };
  return {
    reader: {
      read: () =>
        new Promise<ReadResult>(res => {
          if (pending.length) res(pending.shift()!);
          else resolveRead = res;
        }),
    },
    push: (chunk: string) => deliver({ done: false, value: new TextEncoder().encode(chunk) }),
    end: () => deliver({ done: true }),
  };
}

interface FetchRouting {
  main: unknown;
  state?: unknown;
}

const failResponse = { ok: false, status: 500, json: async () => ({}) };

/** Route /api/character-chat to `main`; side-channel endpoints default to a no-op failure. */
function installFetch(routes: FetchRouting) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url === '/api/character-chat') return routes.main;
    if (url === '/api/character-chat/state' && routes.state) return routes.state;
    return failResponse;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { fetchMock, calls };
}

describe('useCharacterChat', () => {
  beforeEach(() => {
    localStorage.clear();
    mockState.chapters = [];
    mockState.canon_items = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('streams the reply and keeps isStreaming true until the stream completes', async () => {
    const stream = createControlledStream();
    installFetch({ main: { ok: true, body: { getReader: () => stream.reader } } });

    const { result } = renderHook(() => useCharacterChat('char-a'));

    act(() => {
      void result.current.sendMessage('Hello');
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isStreaming).toBe(true);

    await act(async () => {
      stream.push('Hi ');
    });

    // First token: thinking pulse drops but the stream is still open —
    // the composer must stay gated on isStreaming.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.messages.at(-1)?.content).toBe('Hi ');

    await act(async () => {
      stream.push('there');
      stream.end();
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(result.current.messages.at(-1)?.content).toBe('Hi there');
    expect(result.current.messages.at(-1)?.role).toBe('character');
  });

  it('does not bleed a mid-stream reply or its state callback into a newly selected character', async () => {
    const stream = createControlledStream();
    installFetch({
      main: { ok: true, body: { getReader: () => stream.reader } },
      state: {
        ok: true,
        json: async () => ({
          state: { emotionalState: 'furious', pressureLevel: 'Critical', indicator: 'under pressure' },
        }),
      },
    });

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useCharacterChat(id),
      { initialProps: { id: 'char-a' } },
    );

    act(() => {
      void result.current.sendMessage('Hello');
    });
    await act(async () => {
      stream.push('I was thinking');
    });
    expect(result.current.messages).toHaveLength(2);

    // Switch characters mid-stream
    rerender({ id: 'char-b' });

    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isStreaming).toBe(false);

    // The old stream keeps resolving reads (our fake reader ignores the abort
    // signal) — none of it may reach the new character's chat or live meter.
    await act(async () => {
      stream.push(' about the market.');
      stream.end();
    });
    await act(async () => {
      await Promise.resolve(); // let the fire-and-forget state callback settle
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.liveState?.pressureLevel).toBe('Low'); // Bruno's baseline, not Alice's Critical

    // Persistence to the OLD session is still allowed to complete.
    await waitFor(() => {
      const oldSession = readChatSessions().find(s => s.characterId === 'char-a');
      expect(oldSession?.messages.at(-1)?.content).toBe('I was thinking about the market.');
    });
  });

  it('aborts the in-flight request on unmount', async () => {
    const stream = createControlledStream();
    const { calls } = installFetch({ main: { ok: true, body: { getReader: () => stream.reader } } });

    const { result, unmount } = renderHook(() => useCharacterChat('char-a'));

    act(() => {
      void result.current.sendMessage('Hello');
    });
    await waitFor(() => expect(calls.length).toBe(1));
    const signal = calls[0].init.signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('surfaces an httpError code (with status and server message) on a failed response', async () => {
    installFetch({
      main: { ok: false, status: 503, json: async () => ({ error: 'Overloaded upstream' }) },
    });

    const { result } = renderHook(() => useCharacterChat('char-a'));

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    expect(result.current.error).toMatchObject({
      code: 'httpError',
      status: 503,
      serverMessage: 'Overloaded upstream',
      notConfigured: false,
      lastInput: 'Hello',
    });
    // Optimistic user message reverted
    expect(result.current.messages).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
  });

  it('surfaces an emptyReply code when the stream produces no text', async () => {
    const stream = createControlledStream();
    installFetch({ main: { ok: true, body: { getReader: () => stream.reader } } });

    const { result } = renderHook(() => useCharacterChat('char-a'));

    act(() => {
      void result.current.sendMessage('Hello');
    });
    await act(async () => {
      stream.end();
    });

    await waitFor(() => expect(result.current.error?.code).toBe('emptyReply'));
    expect(result.current.isStreaming).toBe(false);
  });

  it('decodes Lexical chapter content before building excerpt story context', async () => {
    mockState.chapters = [
      {
        id: 'ch-1',
        title: 'Chapter One',
        summary: '',
        content: plaintextToLexicalJson('Alice went to the market at dawn to trade her last coins.'),
      },
    ];

    const stream = createControlledStream();
    const { calls } = installFetch({ main: { ok: true, body: { getReader: () => stream.reader } } });

    const { result } = renderHook(() => useCharacterChat('char-a'));

    act(() => {
      void result.current.sendMessage('Hello');
    });
    await waitFor(() => expect(calls.length).toBe(1));

    const body = JSON.parse(calls[0].init.body as string);
    expect(body.storyContext.storySoFar).toContain('Alice went to the market');
    expect(body.storyContext.storySoFar).not.toContain('"root"');

    await act(async () => {
      stream.push('Hi');
      stream.end();
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });
});
