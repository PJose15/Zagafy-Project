import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechSynthesis } from '@/hooks/use-speech-synthesis';

const mockVoices: any[] = [
  { name: 'Voice A', lang: 'en-US', default: true },
  { name: 'Voice B', lang: 'en-GB', default: false },
];

let voicesChangedHandler: (() => void) | null = null;

const mockSpeechSynthesis = {
  getVoices: vi.fn(() => mockVoices),
  speak: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  addEventListener: vi.fn((event: string, handler: () => void) => {
    if (event === 'voiceschanged') voicesChangedHandler = handler;
  }),
  removeEventListener: vi.fn(),
};

class MockUtterance {
  text = '';
  voice: any = null;
  rate = 1;
  onstart: ((e?: any) => void) | null = null;
  onend: ((e?: any) => void) | null = null;
  onpause: ((e?: any) => void) | null = null;
  onresume: ((e?: any) => void) | null = null;
  onboundary: ((e?: any) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

describe('useSpeechSynthesis', () => {
  beforeEach(() => {
    voicesChangedHandler = null;
    vi.clearAllMocks();
    vi.stubGlobal('speechSynthesis', mockSpeechSynthesis);
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isSupported returns true when speechSynthesis exists', () => {
    const { result } = renderHook(() => useSpeechSynthesis());
    expect(result.current.isSupported).toBe(true);
  });

  it('loads voices on mount', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    expect(mockSpeechSynthesis.getVoices).toHaveBeenCalled();
    expect(result.current.voices).toEqual(mockVoices);
    expect(result.current.voices).toHaveLength(2);
  });

  it('selectedVoice defaults to the default voice', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    expect(result.current.selectedVoice).not.toBeNull();
    expect(result.current.selectedVoice!.name).toBe('Voice A');
    expect(result.current.selectedVoice!.default).toBe(true);
  });

  it('speak creates utterance and calls speechSynthesis.speak', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    act(() => {
      result.current.speak('Hello world');
    });

    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledTimes(1);

    const utterance = mockSpeechSynthesis.speak.mock.calls[0][0] as MockUtterance;
    expect(utterance.text).toBe('Hello world');
    expect(utterance.voice).toEqual(mockVoices[0]);
    expect(utterance.rate).toBe(1);
  });

  it('pause calls speechSynthesis.pause', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    act(() => {
      result.current.pause();
    });

    expect(mockSpeechSynthesis.pause).toHaveBeenCalledTimes(1);
  });

  it('resume calls speechSynthesis.resume', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    act(() => {
      result.current.resume();
    });

    expect(mockSpeechSynthesis.resume).toHaveBeenCalledTimes(1);
  });

  it('cancel calls speechSynthesis.cancel and resets state', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    // First start speaking so we have state to reset
    act(() => {
      result.current.speak('Some text');
    });

    const utterance = mockSpeechSynthesis.speak.mock.calls[0][0] as MockUtterance;
    act(() => {
      utterance.onstart?.();
    });

    expect(result.current.isSpeaking).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.currentIndex).toBe(0);
  });

  it('setVoice updates selectedVoice', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    expect(result.current.selectedVoice!.name).toBe('Voice A');

    act(() => {
      result.current.setVoice(mockVoices[1]);
    });

    expect(result.current.selectedVoice!.name).toBe('Voice B');
  });

  it('setRate updates rate', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    expect(result.current.rate).toBe(1);

    act(() => {
      result.current.setRate(1.5);
    });

    expect(result.current.rate).toBe(1.5);
  });

  it('isSpeaking becomes true after utterance.onstart fires', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    expect(result.current.isSpeaking).toBe(false);

    act(() => {
      result.current.speak('Test speech');
    });

    // isSpeaking is still false until onstart fires
    expect(result.current.isSpeaking).toBe(false);

    const utterance = mockSpeechSynthesis.speak.mock.calls[0][0] as MockUtterance;
    act(() => {
      utterance.onstart?.();
    });

    expect(result.current.isSpeaking).toBe(true);
    expect(result.current.isPaused).toBe(false);
  });

  it('isSpeaking becomes false after utterance.onend fires', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    act(() => {
      result.current.speak('Test speech');
    });

    const utterance = mockSpeechSynthesis.speak.mock.calls[0][0] as MockUtterance;
    act(() => {
      utterance.onstart?.();
    });

    expect(result.current.isSpeaking).toBe(true);

    act(() => {
      utterance.onend?.();
    });

    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.currentIndex).toBe(0);
  });

  it('isPaused updates on utterance pause/resume events', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    act(() => {
      result.current.speak('Test speech');
    });

    const utterance = mockSpeechSynthesis.speak.mock.calls[0][0] as MockUtterance;

    act(() => {
      utterance.onstart?.();
    });

    act(() => {
      utterance.onpause?.();
    });

    expect(result.current.isPaused).toBe(true);

    act(() => {
      utterance.onresume?.();
    });

    expect(result.current.isPaused).toBe(false);
  });

  it('registers voiceschanged event listener', () => {
    renderHook(() => useSpeechSynthesis());

    expect(mockSpeechSynthesis.addEventListener).toHaveBeenCalledWith(
      'voiceschanged',
      expect.any(Function),
    );
  });

  it('cancels any ongoing speech on unmount', () => {
    const { result, unmount } = renderHook(() => useSpeechSynthesis());

    act(() => {
      result.current.speak('Long chapter text');
    });
    mockSpeechSynthesis.cancel.mockClear();

    unmount();

    expect(mockSpeechSynthesis.cancel).toHaveBeenCalledTimes(1);
  });

  it('ignores utterance callbacks that fire after unmount', () => {
    const { result, unmount } = renderHook(() => useSpeechSynthesis());

    act(() => {
      result.current.speak('Some text');
    });

    const utterance = mockSpeechSynthesis.speak.mock.calls[0][0] as MockUtterance;
    unmount();

    // Late async callbacks from the browser must not setState on an
    // unmounted hook.
    expect(() => {
      utterance.onstart?.();
      utterance.onboundary?.({ name: 'word', charIndex: 5 });
      utterance.onpause?.();
      utterance.onresume?.();
      utterance.onend?.();
    }).not.toThrow();
  });

  it('speak applies selected voice and rate to utterance', () => {
    const { result } = renderHook(() => useSpeechSynthesis());

    act(() => {
      result.current.setVoice(mockVoices[1]);
      result.current.setRate(2);
    });

    act(() => {
      result.current.speak('Faster speech');
    });

    const utterance = mockSpeechSynthesis.speak.mock.calls[0][0] as MockUtterance;
    expect(utterance.voice).toEqual(mockVoices[1]);
    expect(utterance.rate).toBe(2);
  });
});
