import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/types/braindump', () => ({
  saveBraindumpTemp: vi.fn(),
}));

import { useSpeechRecognition, isSpeechRecognitionSupported } from '@/hooks/use-speech-recognition';
import { saveBraindumpTemp } from '@/lib/types/braindump';

// Mock SpeechRecognition
class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;

  start() {
    this.started = true;
  }
  stop() {
    this.started = false;
    this.onend?.();
  }
  abort() {
    this.started = false;
  }
}

// Track the latest created instance for test access
let latestInstance: MockSpeechRecognition;

function setupSpeechRecognition() {
  // Assign the class itself so `new SpeechRecognition()` works
  const OrigClass = MockSpeechRecognition;
  (window as unknown as Record<string, unknown>).SpeechRecognition = class extends OrigClass {
    constructor() {
      super();
      latestInstance = this;
    }
  };
}

function removeSpeechRecognition() {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
}

describe('useSpeechRecognition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setupSpeechRecognition();

    // Mock getUserMedia
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    removeSpeechRecognition();
  });

  it('detects browser support', () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(true);
  });

  it('detects lack of browser support', () => {
    removeSpeechRecognition();
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isSupported).toBe(false);
  });

  it('isSpeechRecognitionSupported() reports true when SpeechRecognition is on window', () => {
    expect(isSpeechRecognitionSupported()).toBe(true);
  });

  it('isSpeechRecognitionSupported() reports false when neither prefix is available', () => {
    removeSpeechRecognition();
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  it('isSpeechRecognitionSupported() picks up the legacy webkitSpeechRecognition prefix', () => {
    removeSpeechRecognition();
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = MockSpeechRecognition;
    expect(isSpeechRecognitionSupported()).toBe(true);
  });

  it('starts recording and sets states', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.isRecording).toBe(true);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.permissionState).toBe('granted');
  });

  it('stops recording', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    // Prevent auto-restart on stop
    latestInstance.onend = null;

    act(() => {
      result.current.stop();
    });

    expect(result.current.isRecording).toBe(false);
  });

  it('pauses and resumes', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    // Prevent auto-restart on pause
    latestInstance.onend = null;

    act(() => {
      result.current.pause();
    });
    expect(result.current.isPaused).toBe(true);

    act(() => {
      result.current.resume();
    });
    expect(result.current.isPaused).toBe(false);
    expect(result.current.isRecording).toBe(true);
  });

  it('accumulates final transcript from recognition results', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      latestInstance.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: { isFinal: true, 0: { transcript: 'Hello world' }, length: 1 },
        },
      });
    });

    expect(result.current.finalTranscript).toBe('Hello world');
  });

  it('shows interim transcript', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      latestInstance.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: { isFinal: false, 0: { transcript: 'hel' }, length: 1 },
        },
      });
    });

    expect(result.current.interimTranscript).toBe('hel');
  });

  it('handles language change during recording', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.setLanguage('pt-BR');
    });

    expect(result.current.language).toBe('pt-BR');
  });

  it('handles permission denied error', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      latestInstance.onerror?.({ error: 'not-allowed' });
    });

    expect(result.current.permissionState).toBe('denied');
    expect(result.current.error).toContain('denied');
    expect(result.current.isRecording).toBe(false);
  });

  it('handles no-speech error without stopping', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      latestInstance.onerror?.({ error: 'no-speech' });
    });

    expect(result.current.error).toContain('No speech');
    expect(result.current.isRecording).toBe(true);
  });

  it('ticks elapsed seconds timer', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.elapsedSeconds).toBe(3);
  });

  it('pauses the timer when paused', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.elapsedSeconds).toBe(2);

    // Prevent auto-restart
    latestInstance.onend = null;

    act(() => { result.current.pause(); });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.elapsedSeconds).toBe(2); // unchanged
  });

  it('auto-saves temp every 10 seconds', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    // Simulate getting a final transcript
    act(() => {
      latestInstance.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: { isFinal: true, 0: { transcript: 'some text' }, length: 1 },
        },
      });
    });

    act(() => { vi.advanceTimersByTime(10000); });

    expect(saveBraindumpTemp).toHaveBeenCalled();
  });

  it('resets all state', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      latestInstance.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: { isFinal: true, 0: { transcript: 'some text' }, length: 1 },
        },
      });
    });

    // Prevent auto-restart
    latestInstance.onend = null;

    act(() => { result.current.reset(); });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.finalTranscript).toBe('');
    expect(result.current.elapsedSeconds).toBe(0);
  });

  it('sets error when browser unsupported and start called', async () => {
    removeSpeechRecognition();
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error).toContain('not supported');
  });

  it('sets error when getUserMedia fails', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('denied'));

    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.permissionState).toBe('denied');
    expect(result.current.isRecording).toBe(false);
  });

  it('concatenates multiple final transcripts with spaces', async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      latestInstance.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: { isFinal: true, 0: { transcript: 'Hello' }, length: 1 },
        },
      });
    });

    act(() => {
      latestInstance.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: { isFinal: true, 0: { transcript: 'world' }, length: 1 },
        },
      });
    });

    expect(result.current.finalTranscript).toBe('Hello world');
  });

  // ─── Guard Checks ────────────────────────────────────────────────────

  describe('guard checks', () => {
    it('pause() when not recording is a no-op', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      // Should not throw and state should remain unchanged
      act(() => {
        result.current.pause();
      });

      expect(result.current.isRecording).toBe(false);
      expect(result.current.isPaused).toBe(false);
    });

    it('pause() when already paused is a no-op', async () => {
      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.start();
      });

      // Prevent auto-restart
      latestInstance.onend = null;

      act(() => {
        result.current.pause();
      });
      expect(result.current.isPaused).toBe(true);

      // Second pause should be a no-op
      act(() => {
        result.current.pause();
      });
      expect(result.current.isPaused).toBe(true);
      expect(result.current.isRecording).toBe(true);
    });

    it('resume() when not recording is a no-op', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.resume();
      });

      expect(result.current.isRecording).toBe(false);
      expect(result.current.isPaused).toBe(false);
    });

    it('resume() when not paused is a no-op', async () => {
      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.start();
      });

      // Recording but not paused — resume should be a no-op
      act(() => {
        result.current.resume();
      });

      expect(result.current.isRecording).toBe(true);
      expect(result.current.isPaused).toBe(false);
    });

    it('stop() when not recording should not crash', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      // Should not throw
      act(() => {
        result.current.stop();
      });

      expect(result.current.isRecording).toBe(false);
      expect(result.current.isPaused).toBe(false);
    });

    it('reset() when already reset should not crash', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      // Initial state is effectively reset — calling reset again should be safe
      act(() => {
        result.current.reset();
      });

      expect(result.current.isRecording).toBe(false);
      expect(result.current.finalTranscript).toBe('');
      expect(result.current.interimTranscript).toBe('');
      expect(result.current.elapsedSeconds).toBe(0);
      expect(result.current.error).toBe(null);
    });
  });

  // ─── Error Recovery ───────────────────────────────────────────────────

  describe('error recovery', () => {
    it('after permission denied, start() again should re-request mic', async () => {
      const { result } = renderHook(() => useSpeechRecognition());

      // First attempt: deny permission via getUserMedia failure
      (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('denied'));

      await act(async () => {
        await result.current.start();
      });

      expect(result.current.permissionState).toBe('denied');
      expect(result.current.isRecording).toBe(false);

      // Second attempt: permission succeeds
      (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        getTracks: () => [{ stop: vi.fn() }],
      });

      await act(async () => {
        await result.current.start();
      });

      expect(result.current.permissionState).toBe('granted');
      expect(result.current.isRecording).toBe(true);
      expect(result.current.error).toBe(null);
    });

    it('after general error, start() again should work', async () => {
      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.start();
      });

      // Trigger a general error (not 'not-allowed', not 'no-speech', not 'aborted')
      act(() => {
        latestInstance.onerror?.({ error: 'network' });
      });

      expect(result.current.error).toContain('network');

      // Prevent auto-restart
      latestInstance.onend = null;

      act(() => {
        result.current.stop();
      });

      // Start again
      await act(async () => {
        await result.current.start();
      });

      expect(result.current.isRecording).toBe(true);
      expect(result.current.error).toBe(null);
    });

    it('error during pause state', async () => {
      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.start();
      });

      // Prevent auto-restart
      latestInstance.onend = null;

      act(() => {
        result.current.pause();
      });
      expect(result.current.isPaused).toBe(true);

      // Trigger an error from the recognition instance while paused
      // The 'not-allowed' error is the one that forces isRecording=false
      act(() => {
        latestInstance.onerror?.({ error: 'not-allowed' });
      });

      expect(result.current.permissionState).toBe('denied');
      expect(result.current.isRecording).toBe(false);
      expect(result.current.isPaused).toBe(false);
    });
  });

  // ─── Language ─────────────────────────────────────────────────────────

  describe('language', () => {
    it('setLanguage when not recording should just update state', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.setLanguage('fr-FR');
      });

      expect(result.current.language).toBe('fr-FR');
      expect(result.current.isRecording).toBe(false);
    });

    it('setLanguage when paused should update state but not restart recognition', async () => {
      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.start();
      });

      // Prevent auto-restart
      latestInstance.onend = null;

      act(() => {
        result.current.pause();
      });
      expect(result.current.isPaused).toBe(true);

      // Capture the instance before setLanguage
      const instanceBeforeChange = latestInstance;

      act(() => {
        result.current.setLanguage('ja-JP');
      });

      expect(result.current.language).toBe('ja-JP');
      expect(result.current.isPaused).toBe(true);
      expect(result.current.isRecording).toBe(true);
      // The recognition should NOT have been restarted because we're paused
      // (setLanguage only restarts when recording and NOT paused)
      // latestInstance should still be the same since no new instance was created
      expect(latestInstance).toBe(instanceBeforeChange);
    });
  });

  // ─── Transcript Edge Cases ────────────────────────────────────────────

  describe('transcript edge cases', () => {
    it('empty final result (empty string transcript)', async () => {
      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.start();
      });

      act(() => {
        latestInstance.onresult?.({
          resultIndex: 0,
          results: {
            length: 1,
            0: { isFinal: true, 0: { transcript: '' }, length: 1 },
          },
        });
      });

      // Empty string after trim is falsy, so finalChunk check prevents appending
      expect(result.current.finalTranscript).toBe('');
    });

    it('final result with only spaces', async () => {
      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.start();
      });

      act(() => {
        latestInstance.onresult?.({
          resultIndex: 0,
          results: {
            length: 1,
            0: { isFinal: true, 0: { transcript: '   ' }, length: 1 },
          },
        });
      });

      // '   '.trim() === '' which is falsy — should not append
      // But the code checks `if (finalChunk)` before trimming:
      // finalChunk = '   ' which is truthy, then it appends trimmed version ''
      // The result depends on the implementation — test the actual behavior
      // finalChunk is '   ' (truthy), prev='' so separator='', then '' + '' + '' = ''
      expect(result.current.finalTranscript).toBe('');
    });

    it('multiple interim results before a final', async () => {
      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.start();
      });

      // First interim
      act(() => {
        latestInstance.onresult?.({
          resultIndex: 0,
          results: {
            length: 1,
            0: { isFinal: false, 0: { transcript: 'He' }, length: 1 },
          },
        });
      });
      expect(result.current.interimTranscript).toBe('He');
      expect(result.current.finalTranscript).toBe('');

      // Second interim (replaces the first)
      act(() => {
        latestInstance.onresult?.({
          resultIndex: 0,
          results: {
            length: 1,
            0: { isFinal: false, 0: { transcript: 'Hello wor' }, length: 1 },
          },
        });
      });
      expect(result.current.interimTranscript).toBe('Hello wor');
      expect(result.current.finalTranscript).toBe('');

      // Final result
      act(() => {
        latestInstance.onresult?.({
          resultIndex: 0,
          results: {
            length: 1,
            0: { isFinal: true, 0: { transcript: 'Hello world' }, length: 1 },
          },
        });
      });
      expect(result.current.finalTranscript).toBe('Hello world');
      // Interim should be cleared since there's no interim part in this event
      expect(result.current.interimTranscript).toBe('');
    });

    it('clearing interim on stop', async () => {
      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.start();
      });

      // Create an interim result
      act(() => {
        latestInstance.onresult?.({
          resultIndex: 0,
          results: {
            length: 1,
            0: { isFinal: false, 0: { transcript: 'in progress' }, length: 1 },
          },
        });
      });
      expect(result.current.interimTranscript).toBe('in progress');

      // Prevent auto-restart
      latestInstance.onend = null;

      act(() => {
        result.current.stop();
      });

      expect(result.current.interimTranscript).toBe('');
    });
  });

  // ─── Timer Edge Cases ────────────────────────────────────────────────

  describe('timer edge cases', () => {
    it('timer resets on reset()', async () => {
      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.start();
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.elapsedSeconds).toBe(5);

      // Prevent auto-restart
      latestInstance.onend = null;

      act(() => {
        result.current.reset();
      });

      expect(result.current.elapsedSeconds).toBe(0);
    });

    it('timer at 0 initially', () => {
      const { result } = renderHook(() => useSpeechRecognition());
      expect(result.current.elapsedSeconds).toBe(0);
    });
  });

  // ─── Auto-save Elapsed Seconds ────────────────────────────────────────

  describe('auto-save uses actual elapsedSeconds', () => {
    it('saves current elapsedSeconds value (not stale 0)', async () => {
      const { result } = renderHook(() => useSpeechRecognition());

      await act(async () => {
        await result.current.start();
      });

      // Get some transcript so auto-save fires
      act(() => {
        latestInstance.onresult?.({
          resultIndex: 0,
          results: {
            length: 1,
            0: { isFinal: true, 0: { transcript: 'auto save test' }, length: 1 },
          },
        });
      });

      // Advance time to 7 seconds (timer ticks 7 times)
      act(() => {
        vi.advanceTimersByTime(7000);
      });
      expect(result.current.elapsedSeconds).toBe(7);

      // Advance to 10s total to trigger auto-save
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(saveBraindumpTemp).toHaveBeenCalled();

      // Verify the last call used the actual elapsedSeconds (10), not 0
      const lastCall = (saveBraindumpTemp as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
      expect(lastCall).toMatchObject({
        transcript: 'auto save test',
        elapsedSeconds: 10,
      });
    });
  });
});
