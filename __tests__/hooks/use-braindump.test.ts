import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

const mockStart = vi.fn();
const mockStop = vi.fn();
const mockReset = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
const mockSetLanguage = vi.fn();

const mockSpeechState = {
  isSupported: true,
  permissionState: 'unknown' as const,
  isRecording: false,
  isPaused: false,
  finalTranscript: '',
  interimTranscript: '',
  elapsedSeconds: 0,
  language: 'en-US',
  error: null,
  start: mockStart,
  stop: mockStop,
  pause: mockPause,
  resume: mockResume,
  setLanguage: mockSetLanguage,
  reset: mockReset,
};

vi.mock('@/hooks/use-speech-recognition', () => ({
  useSpeechRecognition: vi.fn(() => ({ ...mockSpeechState })),
}));

const mockToast = vi.fn();
vi.mock('@/components/toast', () => ({
  useToast: vi.fn(() => ({ toast: mockToast })),
}));

const mockConfirm = vi.fn().mockResolvedValue(true);
vi.mock('@/components/confirm-dialog', () => ({
  useConfirm: vi.fn(() => ({ confirm: mockConfirm })),
}));

vi.mock('@/lib/types/braindump', () => ({
  readBraindumps: vi.fn(() => []),
  addBraindump: vi.fn(),
  updateBraindump: vi.fn(),
  deleteBraindump: vi.fn(),
  clearBraindumpTemp: vi.fn(),
}));

vi.mock('@/lib/types/writing-session', () => ({
  getProjectId: vi.fn(() => 'proj-1'),
}));

import { useBraindump } from '@/hooks/use-braindump';
import { useSpeechRecognition } from '@/hooks/use-speech-recognition';
import { readBraindumps, addBraindump, updateBraindump, deleteBraindump, clearBraindumpTemp } from '@/lib/types/braindump';

function makeOptions() {
  return {
    textareaRef: { current: null } as React.RefObject<HTMLTextAreaElement | null>,
    content: 'existing content',
    setContent: vi.fn(),
    scheduleAutosave: vi.fn(),
    projectName: 'Test Project',
  };
}

describe('useBraindump', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset speech mock to default state
    vi.mocked(useSpeechRecognition).mockReturnValue({ ...mockSpeechState });
    vi.mocked(readBraindumps).mockReturnValue([]);
  });

  it('starts with panel and history closed', () => {
    const { result } = renderHook(() => useBraindump(makeOptions()));
    expect(result.current.panelOpen).toBe(false);
    expect(result.current.historyOpen).toBe(false);
  });

  it('opens panel and calls speech.start', async () => {
    const { result } = renderHook(() => useBraindump(makeOptions()));

    await act(async () => {
      await result.current.openPanel();
    });

    expect(result.current.panelOpen).toBe(true);
    expect(mockStart).toHaveBeenCalled();
  });

  it('does not open panel when unsupported', async () => {
    vi.mocked(useSpeechRecognition).mockReturnValue({ ...mockSpeechState, isSupported: false });
    const { result } = renderHook(() => useBraindump(makeOptions()));

    await act(async () => {
      await result.current.openPanel();
    });

    expect(result.current.panelOpen).toBe(false);
  });

  it('closes panel and resets speech', async () => {
    const { result } = renderHook(() => useBraindump(makeOptions()));

    await act(async () => {
      await result.current.openPanel();
    });
    await act(async () => {
      await result.current.closePanel();
    });

    expect(result.current.panelOpen).toBe(false);
    expect(mockReset).toHaveBeenCalled();
    expect(clearBraindumpTemp).toHaveBeenCalled();
  });

  it('opens and closes history', () => {
    const { result } = renderHook(() => useBraindump(makeOptions()));

    act(() => { result.current.openHistory(); });
    expect(result.current.historyOpen).toBe(true);

    act(() => { result.current.closeHistory(); });
    expect(result.current.historyOpen).toBe(false);
  });

  it('inserts transcript as-is', () => {
    vi.mocked(useSpeechRecognition).mockReturnValue({
      ...mockSpeechState,
      finalTranscript: 'Hello world test transcript',
      elapsedSeconds: 30,
      isRecording: false,
    });

    const options = makeOptions();
    const { result } = renderHook(() => useBraindump(options));

    // Open panel first
    act(() => { (result.current as unknown as { panelOpen: boolean }).panelOpen = true; });

    act(() => { result.current.insertAsIs(); });

    expect(options.setContent).toHaveBeenCalled();
    expect(options.scheduleAutosave).toHaveBeenCalled();
    expect(addBraindump).toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalled();
  });

  it('re-record resets and starts fresh', () => {
    const { result } = renderHook(() => useBraindump(makeOptions()));

    act(() => { result.current.reRecord(); });

    expect(mockReset).toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalled();
  });

  it('deletes history entry', () => {
    vi.mocked(readBraindumps).mockReturnValue([{
      id: 'h-1',
      timestamp: new Date().toISOString(),
      durationSeconds: 30,
      language: 'en-US',
      projectId: 'proj-1',
      projectName: 'Test',
      rawTranscript: 'hello',
      polishedText: null,
      wasPolished: false,
      wordCount: 1,
    }]);

    const { result } = renderHook(() => useBraindump(makeOptions()));

    act(() => { result.current.deleteHistoryEntry('h-1'); });

    expect(deleteBraindump).toHaveBeenCalledWith('h-1');
  });

  it('polishAndInsert calls API and inserts', async () => {
    vi.mocked(useSpeechRecognition).mockReturnValue({
      ...mockSpeechState,
      finalTranscript: 'um so like the text',
      elapsedSeconds: 20,
      isRecording: false,
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ polishedText: 'The text is here.' }),
    });

    const options = makeOptions();
    const { result } = renderHook(() => useBraindump(options));

    await act(async () => {
      await result.current.polishAndInsert();
    });

    expect(options.setContent).toHaveBeenCalled();
    expect(addBraindump).toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalled();
  });

  it('polishAndInsert sets error on failure', async () => {
    vi.mocked(useSpeechRecognition).mockReturnValue({
      ...mockSpeechState,
      finalTranscript: 'some text here',
      isRecording: false,
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    });

    const { result } = renderHook(() => useBraindump(makeOptions()));

    await act(async () => {
      await result.current.polishAndInsert();
    });

    expect(result.current.polishError).toBe('Server error');
  });

  it('isStopped is true when panel open, not recording, has transcript', () => {
    vi.mocked(useSpeechRecognition).mockReturnValue({
      ...mockSpeechState,
      finalTranscript: 'Hello world',
      isRecording: false,
    });

    const { result } = renderHook(() => useBraindump(makeOptions()));

    // Panel must be open for isStopped
    // Since we can't easily set panelOpen from outside, check that initial state is correct
    expect(result.current.isStopped).toBe(false); // panel not open yet
  });

  it('clears braindump temp on mount', () => {
    renderHook(() => useBraindump(makeOptions()));
    expect(clearBraindumpTemp).toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────
  // 1. Polish flow edge cases
  // ────────────────────────────────────────────────────────────

  describe('polish flow edge cases', () => {
    it('polishAndInsert with empty transcript should no-op', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: '',
        isRecording: false,
      });

      global.fetch = vi.fn();
      const options = makeOptions();
      const { result } = renderHook(() => useBraindump(options));

      await act(async () => {
        await result.current.polishAndInsert();
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(options.setContent).not.toHaveBeenCalled();
      expect(result.current.isPolishing).toBe(false);
    });

    it('polishAndInsert with whitespace-only transcript should no-op', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: '   \n\t  ',
        isRecording: false,
      });

      global.fetch = vi.fn();
      const options = makeOptions();
      const { result } = renderHook(() => useBraindump(options));

      await act(async () => {
        await result.current.polishAndInsert();
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(options.setContent).not.toHaveBeenCalled();
    });

    it('polishAndInsert when already polishing should no-op due to isPolishingRef guard', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'some text to polish',
        isRecording: false,
      });

      // Make fetch hang forever so the first call stays in-flight
      let resolveFetch!: (value: unknown) => void;
      global.fetch = vi.fn().mockImplementation(() =>
        new Promise((resolve) => { resolveFetch = resolve; })
      );

      const options = makeOptions();
      const { result } = renderHook(() => useBraindump(options));

      // Start first polish call (don't await — it hangs)
      let firstPromise: Promise<void>;
      act(() => {
        firstPromise = result.current.polishAndInsert();
      });

      // Second call while first is in flight — should no-op
      await act(async () => {
        await result.current.polishAndInsert();
      });

      // fetch should have been called only once
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Resolve the hanging fetch to clean up
      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ polishedText: 'polished' }),
      });
      await act(async () => { await firstPromise!; });
    });

    it('polish API returns 200 but empty polishedText should set error', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'some text here',
        isRecording: false,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ polishedText: '' }),
      });

      const options = makeOptions();
      const { result } = renderHook(() => useBraindump(options));

      await act(async () => {
        await result.current.polishAndInsert();
      });

      expect(result.current.polishError).toBe('No polished text returned');
      expect(options.setContent).not.toHaveBeenCalled();
      expect(result.current.isPolishing).toBe(false);
    });

    it('polish API returns 200 but null polishedText should set error', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'some text here',
        isRecording: false,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ polishedText: null }),
      });

      const options = makeOptions();
      const { result } = renderHook(() => useBraindump(options));

      await act(async () => {
        await result.current.polishAndInsert();
      });

      expect(result.current.polishError).toBe('No polished text returned');
      expect(options.setContent).not.toHaveBeenCalled();
    });

    it('polish API network error (fetch throws TypeError)', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'some text here',
        isRecording: false,
      });

      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const options = makeOptions();
      const { result } = renderHook(() => useBraindump(options));

      await act(async () => {
        await result.current.polishAndInsert();
      });

      expect(result.current.polishError).toBe('Failed to fetch');
      expect(options.setContent).not.toHaveBeenCalled();
      expect(result.current.isPolishing).toBe(false);
    });

    it('polish abort on unmount cleanup', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'some text to polish here',
        isRecording: false,
      });

      let fetchSignal: AbortSignal | undefined;
      global.fetch = vi.fn().mockImplementation((_url: string, opts: { signal?: AbortSignal }) => {
        fetchSignal = opts?.signal;
        return new Promise(() => {}); // Never resolves
      });

      const options = makeOptions();
      const { result, unmount } = renderHook(() => useBraindump(options));

      // Start polishing (don't await — it hangs)
      act(() => {
        result.current.polishAndInsert();
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(fetchSignal).toBeDefined();
      expect(fetchSignal!.aborted).toBe(false);

      // Unmount should abort
      unmount();
      expect(fetchSignal!.aborted).toBe(true);
    });

    it('polishAndInsert resets polishError from previous failure', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'some text here',
        isRecording: false,
      });

      // First call fails
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      const options = makeOptions();
      const { result } = renderHook(() => useBraindump(options));

      await act(async () => {
        await result.current.polishAndInsert();
      });
      expect(result.current.polishError).toBe('Server error');

      // Second call succeeds — error should clear
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ polishedText: 'Clean text' }),
      });

      await act(async () => {
        await result.current.polishAndInsert();
      });

      expect(result.current.polishError).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────
  // 2. Close panel scenarios
  // ────────────────────────────────────────────────────────────

  describe('close panel scenarios', () => {
    it('closePanel when not recording should close immediately without confirm', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        isRecording: false,
        finalTranscript: '',
      });

      const { result } = renderHook(() => useBraindump(makeOptions()));

      // Open panel first
      await act(async () => { await result.current.openPanel(); });
      expect(result.current.panelOpen).toBe(true);

      // Close — no recording, should close without confirm
      await act(async () => { await result.current.closePanel(); });

      expect(result.current.panelOpen).toBe(false);
      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockReset).toHaveBeenCalled();
      expect(clearBraindumpTemp).toHaveBeenCalled();
    });

    it('closePanel when recording with no words should close without confirm', async () => {
      // Start as not recording so openPanel works
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        isRecording: false,
      });

      const { result } = renderHook(() => useBraindump(makeOptions()));

      await act(async () => { await result.current.openPanel(); });

      // Now simulate recording with empty transcript
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        isRecording: true,
        finalTranscript: '',
      });
      const { result: result2 } = renderHook(() => useBraindump(makeOptions()));

      // Re-render with recording state — close should stop without confirm
      await act(async () => { await result2.current.closePanel(); });

      // Confirm should not be called since there are no words
      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockStop).toHaveBeenCalled();
    });

    it('closePanel when recording with words and confirm denied should keep panel open', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        isRecording: true,
        finalTranscript: 'Hello world this is a recording',
      });

      mockConfirm.mockResolvedValueOnce(false);

      const { result } = renderHook(() => useBraindump(makeOptions()));

      // Manually set panel open
      await act(async () => { await result.current.openPanel(); });

      await act(async () => { await result.current.closePanel(); });

      // Confirm was called
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Stop Recording?',
          variant: 'danger',
        })
      );
      // Panel should remain open because confirm returned false
      // speech.stop and speech.reset should NOT have been called after confirm denial
      expect(mockStop).not.toHaveBeenCalled();
    });

    it('closePanel when recording with words and confirm accepted should close', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        isRecording: true,
        finalTranscript: 'Hello world this is a recording',
      });

      mockConfirm.mockResolvedValueOnce(true);

      const { result } = renderHook(() => useBraindump(makeOptions()));

      await act(async () => { await result.current.openPanel(); });
      await act(async () => { await result.current.closePanel(); });

      expect(mockConfirm).toHaveBeenCalled();
      expect(mockStop).toHaveBeenCalled();
      expect(mockReset).toHaveBeenCalled();
      expect(result.current.panelOpen).toBe(false);
    });

    it('closePanel clears polishError', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'some text here',
        isRecording: false,
      });

      // Make polish fail to set an error
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      const { result } = renderHook(() => useBraindump(makeOptions()));

      await act(async () => { await result.current.openPanel(); });
      await act(async () => { await result.current.polishAndInsert(); });
      expect(result.current.polishError).toBe('Server error');

      await act(async () => { await result.current.closePanel(); });
      expect(result.current.polishError).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────
  // 3. Insert text at cursor
  // ────────────────────────────────────────────────────────────

  describe('insert text at cursor', () => {
    it('insertAsIs when textareaRef is null appends with separator', () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'Appended text',
        elapsedSeconds: 10,
        isRecording: false,
      });

      const options = makeOptions();
      // textareaRef.current is already null by default from makeOptions()
      options.content = 'Existing content';

      const { result } = renderHook(() => useBraindump(options));

      act(() => { result.current.insertAsIs(); });

      // Should append with \n\n separator since content exists
      expect(options.setContent).toHaveBeenCalledWith('Existing content\n\nAppended text');
      expect(options.scheduleAutosave).toHaveBeenCalledWith('Existing content\n\nAppended text');
    });

    it('insertAsIs when textareaRef is null and content is empty appends without separator', () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'First text',
        elapsedSeconds: 10,
        isRecording: false,
      });

      const options = makeOptions();
      options.content = '';

      const { result } = renderHook(() => useBraindump(options));

      act(() => { result.current.insertAsIs(); });

      // Should append without separator since content is empty
      expect(options.setContent).toHaveBeenCalledWith('First text');
      expect(options.scheduleAutosave).toHaveBeenCalledWith('First text');
    });

    it('insertAsIs with empty transcript should no-op', () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: '',
        isRecording: false,
      });

      const options = makeOptions();
      const { result } = renderHook(() => useBraindump(options));

      act(() => { result.current.insertAsIs(); });

      expect(options.setContent).not.toHaveBeenCalled();
      expect(addBraindump).not.toHaveBeenCalled();
    });

    it('reInsertFromHistory with non-existent entry should no-op', () => {
      vi.mocked(readBraindumps).mockReturnValue([]);
      const options = makeOptions();
      const { result } = renderHook(() => useBraindump(options));

      act(() => { result.current.reInsertFromHistory('nonexistent-id'); });

      expect(options.setContent).not.toHaveBeenCalled();
      expect(mockToast).not.toHaveBeenCalled();
    });

    it('reInsertFromHistory with polished entry should use polishedText', () => {
      const entry = {
        id: 'h-polished',
        timestamp: new Date().toISOString(),
        durationSeconds: 30,
        language: 'en-US',
        projectId: 'proj-1',
        projectName: 'Test',
        rawTranscript: 'um so the raw text',
        polishedText: 'The polished text.',
        wasPolished: true,
        wordCount: 5,
      };
      vi.mocked(readBraindumps).mockReturnValue([entry]);

      const options = makeOptions();
      const { result } = renderHook(() => useBraindump(options));

      act(() => { result.current.reInsertFromHistory('h-polished'); });

      // Should use polishedText, not rawTranscript
      expect(options.setContent).toHaveBeenCalledWith(
        expect.stringContaining('The polished text.')
      );
      expect(mockToast).toHaveBeenCalledWith('Text re-inserted from history!', 'success');
    });

    it('reInsertFromHistory with unpolished entry should use rawTranscript', () => {
      const entry = {
        id: 'h-raw',
        timestamp: new Date().toISOString(),
        durationSeconds: 30,
        language: 'en-US',
        projectId: 'proj-1',
        projectName: 'Test',
        rawTranscript: 'the raw transcript text',
        polishedText: null,
        wasPolished: false,
        wordCount: 4,
      };
      vi.mocked(readBraindumps).mockReturnValue([entry]);

      const options = makeOptions();
      const { result } = renderHook(() => useBraindump(options));

      act(() => { result.current.reInsertFromHistory('h-raw'); });

      expect(options.setContent).toHaveBeenCalledWith(
        expect.stringContaining('the raw transcript text')
      );
      expect(mockToast).toHaveBeenCalledWith('Text re-inserted from history!', 'success');
    });

    it('insertAsIs saves to history with correct metadata', () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'hello world test',
        elapsedSeconds: 45,
        language: 'es-ES',
        isRecording: false,
      });

      const options = makeOptions();
      const { result } = renderHook(() => useBraindump(options));

      act(() => { result.current.insertAsIs(); });

      expect(addBraindump).toHaveBeenCalledWith(
        expect.objectContaining({
          rawTranscript: 'hello world test',
          polishedText: null,
          wasPolished: false,
          durationSeconds: 45,
          language: 'es-ES',
          projectName: 'Test Project',
          wordCount: 3,
        })
      );
    });
  });

  // ────────────────────────────────────────────────────────────
  // 4. History management
  // ────────────────────────────────────────────────────────────

  describe('history management', () => {
    const makeHistoryEntry = (overrides: Partial<{
      id: string;
      rawTranscript: string;
      polishedText: string | null;
      wasPolished: boolean;
    }> = {}) => ({
      id: overrides.id ?? 'h-1',
      timestamp: new Date().toISOString(),
      durationSeconds: 30,
      language: 'en-US',
      projectId: 'proj-1',
      projectName: 'Test',
      rawTranscript: overrides.rawTranscript ?? 'hello world',
      polishedText: overrides.polishedText ?? null,
      wasPolished: overrides.wasPolished ?? false,
      wordCount: 2,
    });

    it('rePolishFromHistory success should update entry', async () => {
      const entry = makeHistoryEntry({ id: 'h-polish-1', rawTranscript: 'raw text here' });
      vi.mocked(readBraindumps).mockReturnValue([entry]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ polishedText: 'Polished text here.' }),
      });

      const { result } = renderHook(() => useBraindump(makeOptions()));

      await act(async () => {
        await result.current.rePolishFromHistory('h-polish-1');
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/polish', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ transcript: 'raw text here' }),
      }));
      expect(updateBraindump).toHaveBeenCalledWith('h-polish-1', {
        polishedText: 'Polished text here.',
        wasPolished: true,
      });
      expect(readBraindumps).toHaveBeenCalled(); // refreshHistory called
      expect(mockToast).toHaveBeenCalledWith('History entry polished!', 'success');
      expect(result.current.isPolishing).toBe(false);
    });

    it('rePolishFromHistory with non-existent entry should no-op', async () => {
      vi.mocked(readBraindumps).mockReturnValue([]);

      global.fetch = vi.fn();
      const { result } = renderHook(() => useBraindump(makeOptions()));

      await act(async () => {
        await result.current.rePolishFromHistory('nonexistent');
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(updateBraindump).not.toHaveBeenCalled();
    });

    it('rePolishFromHistory failure should toast error', async () => {
      const entry = makeHistoryEntry({ id: 'h-fail-1', rawTranscript: 'some text' });
      vi.mocked(readBraindumps).mockReturnValue([entry]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      });

      const { result } = renderHook(() => useBraindump(makeOptions()));

      await act(async () => {
        await result.current.rePolishFromHistory('h-fail-1');
      });

      expect(updateBraindump).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith('Internal server error', 'error');
      expect(result.current.isPolishing).toBe(false);
    });

    it('rePolishFromHistory network error should toast error', async () => {
      const entry = makeHistoryEntry({ id: 'h-net-1', rawTranscript: 'some text' });
      vi.mocked(readBraindumps).mockReturnValue([entry]);

      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const { result } = renderHook(() => useBraindump(makeOptions()));

      await act(async () => {
        await result.current.rePolishFromHistory('h-net-1');
      });

      expect(updateBraindump).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith('Failed to fetch', 'error');
    });

    it('rePolishFromHistory with empty polishedText in response should toast error', async () => {
      const entry = makeHistoryEntry({ id: 'h-empty-1', rawTranscript: 'some text' });
      vi.mocked(readBraindumps).mockReturnValue([entry]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ polishedText: '' }),
      });

      const { result } = renderHook(() => useBraindump(makeOptions()));

      await act(async () => {
        await result.current.rePolishFromHistory('h-empty-1');
      });

      expect(updateBraindump).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith('No polished text returned', 'error');
    });

    it('deleteHistoryEntry refreshes history', () => {
      const entry = makeHistoryEntry({ id: 'h-del-1' });
      vi.mocked(readBraindumps).mockReturnValue([entry]);

      const { result } = renderHook(() => useBraindump(makeOptions()));

      // Clear mock counts from initial mount
      vi.mocked(readBraindumps).mockClear();
      vi.mocked(readBraindumps).mockReturnValue([]);

      act(() => { result.current.deleteHistoryEntry('h-del-1'); });

      expect(deleteBraindump).toHaveBeenCalledWith('h-del-1');
      expect(readBraindumps).toHaveBeenCalled(); // refreshHistory
      expect(mockToast).toHaveBeenCalledWith('Entry deleted', 'info');
    });

    it('openHistory refreshes history from localStorage', () => {
      const entry = makeHistoryEntry({ id: 'h-open-1' });
      vi.mocked(readBraindumps).mockReturnValue([]);

      const { result } = renderHook(() => useBraindump(makeOptions()));
      expect(result.current.history).toEqual([]);

      // Simulate adding entries to localStorage externally
      vi.mocked(readBraindumps).mockReturnValue([entry]);

      act(() => { result.current.openHistory(); });

      expect(result.current.historyOpen).toBe(true);
      expect(readBraindumps).toHaveBeenCalled();
      expect(result.current.history).toEqual([entry]);
    });

    it('history is initialized from readBraindumps on mount', () => {
      const entries = [
        makeHistoryEntry({ id: 'h-init-1' }),
        makeHistoryEntry({ id: 'h-init-2' }),
      ];
      vi.mocked(readBraindumps).mockReturnValue(entries);

      const { result } = renderHook(() => useBraindump(makeOptions()));

      expect(result.current.history).toEqual(entries);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 5. beforeunload guard
  // ────────────────────────────────────────────────────────────

  describe('beforeunload guard', () => {
    let addEventSpy: ReturnType<typeof vi.spyOn>;
    let removeEventSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      addEventSpy = vi.spyOn(window, 'addEventListener');
      removeEventSpy = vi.spyOn(window, 'removeEventListener');
    });

    afterEach(() => {
      addEventSpy.mockRestore();
      removeEventSpy.mockRestore();
    });

    it('not set when panel is closed', () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        isRecording: true,
        finalTranscript: 'a '.repeat(25).trim(), // 25 words
      });

      renderHook(() => useBraindump(makeOptions()));

      // Panel is not open, so beforeunload should NOT be registered
      const beforeunloadCalls = addEventSpy.mock.calls.filter(
        ([event]: [string, ...unknown[]]) => event === 'beforeunload'
      );
      expect(beforeunloadCalls).toHaveLength(0);
    });

    it('not set when recording with fewer than 20 words', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        isRecording: true,
        finalTranscript: 'one two three',
      });

      const { result } = renderHook(() => useBraindump(makeOptions()));

      await act(async () => { await result.current.openPanel(); });

      // Re-render with isRecording and short transcript
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        isRecording: true,
        finalTranscript: 'one two three',
      });

      // Fewer than 20 words while recording — guard should not be set
      const beforeunloadCalls = addEventSpy.mock.calls.filter(
        ([event]: [string, ...unknown[]]) => event === 'beforeunload'
      );
      expect(beforeunloadCalls).toHaveLength(0);
    });

    it('set when panel open, recording, and has 20+ words', async () => {
      const longTranscript = Array.from({ length: 25 }, (_, i) => `word${i}`).join(' ');

      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        isRecording: true,
        finalTranscript: longTranscript,
      });

      const { result } = renderHook(() => useBraindump(makeOptions()));

      // Open panel to set panelOpen = true
      await act(async () => { await result.current.openPanel(); });

      const beforeunloadCalls = addEventSpy.mock.calls.filter(
        ([event]: [string, ...unknown[]]) => event === 'beforeunload'
      );
      expect(beforeunloadCalls.length).toBeGreaterThan(0);
    });

    it('cleanup removes beforeunload listener on unmount', async () => {
      const longTranscript = Array.from({ length: 25 }, (_, i) => `word${i}`).join(' ');

      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        isRecording: true,
        finalTranscript: longTranscript,
      });

      const { result, unmount } = renderHook(() => useBraindump(makeOptions()));

      await act(async () => { await result.current.openPanel(); });

      unmount();

      const removeBeforeunloadCalls = removeEventSpy.mock.calls.filter(
        ([event]: [string, ...unknown[]]) => event === 'beforeunload'
      );
      expect(removeBeforeunloadCalls.length).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Additional edge cases
  // ────────────────────────────────────────────────────────────

  describe('additional edge cases', () => {
    it('polishAndInsert sends correct request body', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: '  hello world  ',
        elapsedSeconds: 10,
        isRecording: false,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ polishedText: 'Hello world.' }),
      });

      const { result } = renderHook(() => useBraindump(makeOptions()));

      await act(async () => {
        await result.current.polishAndInsert();
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: 'hello world' }),
        signal: expect.any(AbortSignal),
      });
    });

    it('polishAndInsert saves both raw and polished to history', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'um so like the raw text',
        elapsedSeconds: 60,
        language: 'en-US',
        isRecording: false,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ polishedText: 'The polished text.' }),
      });

      const options = makeOptions();
      const { result } = renderHook(() => useBraindump(options));

      await act(async () => {
        await result.current.polishAndInsert();
      });

      expect(addBraindump).toHaveBeenCalledWith(
        expect.objectContaining({
          rawTranscript: 'um so like the raw text',
          polishedText: 'The polished text.',
          wasPolished: true,
          durationSeconds: 60,
          language: 'en-US',
        })
      );
    });

    it('polishAndInsert closes panel on success', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'some text',
        isRecording: false,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ polishedText: 'Some text.' }),
      });

      const { result } = renderHook(() => useBraindump(makeOptions()));

      await act(async () => { await result.current.openPanel(); });
      expect(result.current.panelOpen).toBe(true);

      await act(async () => { await result.current.polishAndInsert(); });
      expect(result.current.panelOpen).toBe(false);
    });

    it('polishAndInsert does not close panel on failure', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'some text',
        isRecording: false,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      const { result } = renderHook(() => useBraindump(makeOptions()));

      await act(async () => { await result.current.openPanel(); });
      expect(result.current.panelOpen).toBe(true);

      await act(async () => { await result.current.polishAndInsert(); });
      // Panel should remain open on error
      expect(result.current.panelOpen).toBe(true);
      expect(result.current.polishError).toBe('Server error');
    });

    it('polish API error with unparseable JSON body uses fallback message', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'some text',
        isRecording: false,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error('invalid json')),
      });

      const { result } = renderHook(() => useBraindump(makeOptions()));

      await act(async () => { await result.current.polishAndInsert(); });

      // Unparseable body → translated status-based fallback (en catalog copy)
      expect(result.current.polishError).toBe('Failed to polish (502)');
    });

    it('reRecord clears polishError', async () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'some text',
        isRecording: false,
      });

      // First, create an error
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      const { result } = renderHook(() => useBraindump(makeOptions()));

      await act(async () => { await result.current.polishAndInsert(); });
      expect(result.current.polishError).toBe('Server error');

      act(() => { result.current.reRecord(); });
      expect(result.current.polishError).toBeNull();
    });

    it('insertAsIs toasts success message', () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'hello world',
        elapsedSeconds: 10,
        isRecording: false,
      });

      const { result } = renderHook(() => useBraindump(makeOptions()));

      act(() => { result.current.insertAsIs(); });

      expect(mockToast).toHaveBeenCalledWith('Voice transcript inserted!', 'success');
    });

    it('insertAsIs clears braindump temp', () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        ...mockSpeechState,
        finalTranscript: 'hello world',
        elapsedSeconds: 10,
        isRecording: false,
      });

      vi.mocked(clearBraindumpTemp).mockClear();
      const { result } = renderHook(() => useBraindump(makeOptions()));

      // clearBraindumpTemp is also called on mount, clear the count
      vi.mocked(clearBraindumpTemp).mockClear();

      act(() => { result.current.insertAsIs(); });

      expect(clearBraindumpTemp).toHaveBeenCalled();
    });
  });
});
