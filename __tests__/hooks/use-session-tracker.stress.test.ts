import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock next/navigation
const mockPathname = vi.fn(() => '/manuscript');
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

// Mock store
const mockChapters = vi.fn(() => [
  { id: 'ch-1', title: 'Chapter 1', content: '', summary: '' },
]);
const mockTitle = vi.fn(() => 'My Novel');

vi.mock('@/lib/store', () => ({
  useStory: () => ({
    state: {
      title: mockTitle(),
      chapters: mockChapters(),
    },
  }),
}));

// Mock writing-session module

const mockAddSession = vi.fn((_session: any) => Promise.resolve());
const mockReadWipSession = vi.fn((): { id: string; projectId: string; projectName: string; startedAt: string; wordsStart: number; currentWords: number; heteronymId?: string | null; heteronymName?: string | null } | null => null);

const mockSaveWipSession = vi.fn((_wip: any) => {});
const mockClearWipSession = vi.fn();
const mockGetProjectId = vi.fn(() => 'proj-1');

vi.mock('@/lib/types/writing-session', () => ({
  addSession: (...args: unknown[]) => mockAddSession(args[0]),
  readWipSession: () => mockReadWipSession(),
  saveWipSession: (...args: unknown[]) => mockSaveWipSession(args[0]),
  clearWipSession: () => mockClearWipSession(),
  getProjectId: () => mockGetProjectId(),
}));

// Mock heteronym module
const mockGetActiveHeteronymId = vi.fn((): string | null => 'het-1');
const mockReadHeteronyms = vi.fn(() => [
  { id: 'het-1', name: 'Dark Poet', bio: '', styleNote: '', avatarColor: '#000', avatarEmoji: '🖊️', createdAt: '', isDefault: true },
]);

vi.mock('@/lib/types/heteronym', () => ({
  getActiveHeteronymId: () => mockGetActiveHeteronymId(),
  readHeteronyms: () => mockReadHeteronyms(),
}));

import { useSessionTracker } from '@/hooks/use-session-tracker';

function words(n: number): string {
  return 'word '.repeat(n).trim();
}

describe('useSessionTracker STRESS', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'test-sess-id') });
    mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Chapter 1', content: '', summary: '' }]);
    mockPathname.mockReturnValue('/manuscript');
    mockTitle.mockReturnValue('My Novel');
    mockAddSession.mockClear();
    mockReadWipSession.mockReturnValue(null);
    mockSaveWipSession.mockClear();
    mockClearWipSession.mockClear();
    mockGetActiveHeteronymId.mockReturnValue('het-1');
    mockReadHeteronyms.mockReturnValue([
      { id: 'het-1', name: 'Dark Poet', bio: '', styleNote: '', avatarColor: '#000', avatarEmoji: '🖊️', createdAt: '', isDefault: true },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // ──────────────────────────────────────────────────────
  // WORD COUNT BOUNDARIES (MIN_WORDS_TO_START = 10)
  // ──────────────────────────────────────────────────────
  describe('word count start threshold', () => {
    it('exactly 9 new words → does NOT start session', () => {
      const { rerender } = renderHook(() => useSessionTracker());
      // Establish baseline at 5 words
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(5), summary: '' }]);
      rerender();
      // Add 9 more (total 14, delta from baseline = 9)
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(14), summary: '' }]);
      rerender();
      act(() => { vi.advanceTimersByTime(5 * 60 * 1000 + 1000); });
      expect(mockAddSession).not.toHaveBeenCalled();
    });

    it('exactly 10 new words → starts session', () => {
      const { rerender } = renderHook(() => useSessionTracker());
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(5), summary: '' }]);
      rerender();
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(15), summary: '' }]);
      rerender();
      act(() => { vi.advanceTimersByTime(5 * 60 * 1000 + 1000); });
      expect(mockAddSession).toHaveBeenCalledTimes(1);
    });

    it('11 new words → starts session', () => {
      const { rerender } = renderHook(() => useSessionTracker());
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(5), summary: '' }]);
      rerender();
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(16), summary: '' }]);
      rerender();
      act(() => { vi.advanceTimersByTime(5 * 60 * 1000 + 1000); });
      expect(mockAddSession).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────
  // MIN_SESSION_WORDS (= 5) BOUNDARY
  // ──────────────────────────────────────────────────────
  describe('minimum session words to save', () => {
    it('4 words added → session NOT saved', () => {
      const { rerender } = renderHook(() => useSessionTracker());
      // Set baseline at 5 words
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(5), summary: '' }]);
      rerender();
      // Start session with +10 delta from baseline (total = 15, baseline = 5)
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(15), summary: '' }]);
      rerender();
      // Delete words back to 9 → wordsAdded = 9 - 5 = 4 < MIN_SESSION_WORDS(5)
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(9), summary: '' }]);
      rerender();
      // Let idle timer fire — session ends but wordsAdded < 5 so not saved
      act(() => { vi.advanceTimersByTime(5 * 60 * 1000 + 1000); });
      expect(mockAddSession).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // 3-MINUTE FLOW SCORE GATE (EXACT BOUNDARIES)
  // ──────────────────────────────────────────────────────
  describe('3-minute flow score gate boundaries', () => {
    function startSession(rerender: () => void) {
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(3), summary: '' }]);
      rerender();
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(20), summary: '' }]);
      rerender();
    }

    it('exactly 3 minutes → NO flow score (exclusive >3)', () => {
      const { result, rerender } = renderHook(() => useSessionTracker());
      startSession(rerender);
      act(() => { vi.advanceTimersByTime(3 * 60 * 1000); });
      mockPathname.mockReturnValue('/other');
      rerender();
      expect(mockAddSession).toHaveBeenCalledTimes(1);
      expect(result.current.pendingFlowScore).toBeNull();
    });

    it('3 minutes + 1 second → shows flow score', () => {
      const { result, rerender } = renderHook(() => useSessionTracker());
      startSession(rerender);
      act(() => { vi.advanceTimersByTime(3 * 60 * 1000 + 1000); });
      mockPathname.mockReturnValue('/other2');
      rerender();
      expect(mockAddSession).toHaveBeenCalledTimes(1);
      expect(result.current.pendingFlowScore).toEqual({ sessionId: 'test-sess-id' });
    });

    it('2 minutes → NO flow score', () => {
      const { result, rerender } = renderHook(() => useSessionTracker());
      startSession(rerender);
      act(() => { vi.advanceTimersByTime(2 * 60 * 1000); });
      mockPathname.mockReturnValue('/other3');
      rerender();
      expect(mockAddSession).toHaveBeenCalledTimes(1);
      expect(result.current.pendingFlowScore).toBeNull();
    });

    it('10 minutes → shows flow score', () => {
      const { result, rerender } = renderHook(() => useSessionTracker());
      startSession(rerender);
      // Session runs for 5 minutes idle timeout (total > 3 min)
      act(() => { vi.advanceTimersByTime(5 * 60 * 1000 + 1000); });
      expect(mockAddSession).toHaveBeenCalledTimes(1);
      expect(result.current.pendingFlowScore).toEqual({ sessionId: 'test-sess-id' });
    });
  });

  // ──────────────────────────────────────────────────────
  // HETERONYM EDGE CASES
  // ──────────────────────────────────────────────────────
  describe('heteronym edge cases', () => {
    it('captures heteronym when active', () => {
      const { rerender } = renderHook(() => useSessionTracker());
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(3), summary: '' }]);
      rerender();
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(20), summary: '' }]);
      rerender();
      act(() => { vi.advanceTimersByTime(5 * 60 * 1000 + 1000); });
      const session = mockAddSession.mock.calls[0][0];
      expect(session.heteronymId).toBe('het-1');
      expect(session.heteronymName).toBe('Dark Poet');
    });

    it('captures null when no active heteronym', () => {
      mockGetActiveHeteronymId.mockReturnValue(null);
      mockReadHeteronyms.mockReturnValue([]);
      const { rerender } = renderHook(() => useSessionTracker());
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(3), summary: '' }]);
      rerender();
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(20), summary: '' }]);
      rerender();
      act(() => { vi.advanceTimersByTime(5 * 60 * 1000 + 1000); });
      const session = mockAddSession.mock.calls[0][0];
      expect(session.heteronymId).toBeNull();
      expect(session.heteronymName).toBeNull();
    });

    it('captures null when activeId does not match any heteronym', () => {
      mockGetActiveHeteronymId.mockReturnValue('nonexistent-id');
      mockReadHeteronyms.mockReturnValue([
        { id: 'het-1', name: 'Dark Poet', bio: '', styleNote: '', avatarColor: '#000', avatarEmoji: '🖊️', createdAt: '', isDefault: true },
      ]);
      const { rerender } = renderHook(() => useSessionTracker());
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(3), summary: '' }]);
      rerender();
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(20), summary: '' }]);
      rerender();
      act(() => { vi.advanceTimersByTime(5 * 60 * 1000 + 1000); });
      const session = mockAddSession.mock.calls[0][0];
      expect(session.heteronymId).toBeNull();
      expect(session.heteronymName).toBeNull();
    });

    it('includes heteronym in WIP heartbeat', () => {
      const { rerender } = renderHook(() => useSessionTracker());
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(3), summary: '' }]);
      rerender();
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(20), summary: '' }]);
      rerender();
      act(() => { vi.advanceTimersByTime(30 * 1000); });
      expect(mockSaveWipSession).toHaveBeenCalled();
      const wip = mockSaveWipSession.mock.calls[0][0];
      expect(wip.heteronymId).toBe('het-1');
      expect(wip.heteronymName).toBe('Dark Poet');
    });
  });

  // ──────────────────────────────────────────────────────
  // WIP RECOVERY EDGE CASES
  // ──────────────────────────────────────────────────────
  describe('WIP recovery edge cases', () => {
    it('recovers WIP with heteronym data', () => {
      mockReadWipSession.mockReturnValue({
        id: 'recovered', projectId: 'p', projectName: 'Novel',
        startedAt: '2026-03-10T10:00:00Z', wordsStart: 100, currentWords: 200,
        heteronymId: 'het-1', heteronymName: 'Dark Poet',
      });
      renderHook(() => useSessionTracker());
      const recovered = mockAddSession.mock.calls[0][0];
      expect(recovered.heteronymId).toBe('het-1');
      expect(recovered.heteronymName).toBe('Dark Poet');
    });

    it('recovers WIP without heteronym data (legacy)', () => {
      mockReadWipSession.mockReturnValue({
        id: 'recovered', projectId: 'p', projectName: 'Novel',
        startedAt: '2026-03-10T10:00:00Z', wordsStart: 100, currentWords: 200,
        // No heteronym fields
      });
      renderHook(() => useSessionTracker());
      const recovered = mockAddSession.mock.calls[0][0];
      expect(recovered.heteronymId).toBeNull();
      expect(recovered.heteronymName).toBeNull();
    });

    it('does not recover WIP with exactly 4 words added', () => {
      mockReadWipSession.mockReturnValue({
        id: 'recovered', projectId: 'p', projectName: 'Novel',
        startedAt: '2026-03-10T10:00:00Z', wordsStart: 100, currentWords: 104,
        heteronymId: null, heteronymName: null,
      });
      renderHook(() => useSessionTracker());
      expect(mockAddSession).not.toHaveBeenCalled();
      expect(mockClearWipSession).toHaveBeenCalled();
    });

    it('recovers WIP with exactly 5 words added', () => {
      mockReadWipSession.mockReturnValue({
        id: 'recovered', projectId: 'p', projectName: 'Novel',
        startedAt: '2026-03-10T10:00:00Z', wordsStart: 100, currentWords: 105,
        heteronymId: null, heteronymName: null,
      });
      renderHook(() => useSessionTracker());
      expect(mockAddSession).toHaveBeenCalledTimes(1);
      expect(mockAddSession.mock.calls[0][0].wordsAdded).toBe(5);
    });
  });

  // ──────────────────────────────────────────────────────
  // IDLE TIMER BEHAVIOR
  // ──────────────────────────────────────────────────────
  describe('idle timer behavior', () => {
    it('continuous writing for 15 minutes keeps session alive', () => {
      const { rerender } = renderHook(() => useSessionTracker());
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(3), summary: '' }]);
      rerender();
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(20), summary: '' }]);
      rerender();

      // Write every 2 minutes for 15 minutes
      for (let i = 0; i < 7; i++) {
        act(() => { vi.advanceTimersByTime(2 * 60 * 1000); });
        mockChapters.mockReturnValue([
          { id: 'ch-1', title: 'Ch', content: words(25 + i * 5), summary: '' },
        ]);
        rerender();
      }

      // Session should still be active
      expect(mockAddSession).not.toHaveBeenCalled();

      // Now stop writing and wait for idle
      act(() => { vi.advanceTimersByTime(5 * 60 * 1000 + 1000); });
      expect(mockAddSession).toHaveBeenCalledTimes(1);
    });

    it('does not fire idle timer when session is not active', () => {
      renderHook(() => useSessionTracker());
      act(() => { vi.advanceTimersByTime(10 * 60 * 1000); });
      expect(mockAddSession).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // MULTIPLE CHAPTERS
  // ──────────────────────────────────────────────────────
  describe('multiple chapters', () => {
    it('counts words across multiple chapters', () => {
      const { rerender } = renderHook(() => useSessionTracker());
      // 2 chapters with 3 words each = 6 total → sets baseline
      mockChapters.mockReturnValue([
        { id: 'ch-1', title: 'Ch 1', content: 'one two three', summary: '' },
        { id: 'ch-2', title: 'Ch 2', content: 'four five six', summary: '' },
      ]);
      rerender();
      // Need +10 from baseline(6) → total ≥ 16
      mockChapters.mockReturnValue([
        { id: 'ch-1', title: 'Ch 1', content: 'one two three alpha beta gamma delta epsilon zeta iota', summary: '' },
        { id: 'ch-2', title: 'Ch 2', content: 'four five six alpha beta gamma', summary: '' },
      ]);
      rerender();
      act(() => { vi.advanceTimersByTime(5 * 60 * 1000 + 1000); });
      expect(mockAddSession).toHaveBeenCalledTimes(1);
    });

    it('handles empty chapter content', () => {
      const { rerender } = renderHook(() => useSessionTracker());
      mockChapters.mockReturnValue([
        { id: 'ch-1', title: 'Ch 1', content: '', summary: '' },
        { id: 'ch-2', title: 'Ch 2', content: '', summary: '' },
      ]);
      rerender();
      // No words, no session
      act(() => { vi.advanceTimersByTime(5 * 60 * 1000 + 1000); });
      expect(mockAddSession).not.toHaveBeenCalled();
    });

    it('handles whitespace-only content', () => {
      const { rerender } = renderHook(() => useSessionTracker());
      mockChapters.mockReturnValue([
        { id: 'ch-1', title: 'Ch 1', content: '   \n\t  ', summary: '' },
      ]);
      rerender();
      act(() => { vi.advanceTimersByTime(5 * 60 * 1000 + 1000); });
      expect(mockAddSession).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // PATHNAME CHANGES
  // ──────────────────────────────────────────────────────
  describe('pathname changes', () => {
    it('same pathname rerender does not end session', () => {
      const { rerender } = renderHook(() => useSessionTracker());
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(3), summary: '' }]);
      rerender();
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(20), summary: '' }]);
      rerender();
      // Re-render with same pathname
      mockPathname.mockReturnValue('/manuscript');
      rerender();
      expect(mockAddSession).not.toHaveBeenCalled();
    });

    it('multiple pathname changes end session once', () => {
      const { rerender } = renderHook(() => useSessionTracker());
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(3), summary: '' }]);
      rerender();
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(20), summary: '' }]);
      rerender();

      // Navigate away
      act(() => { vi.advanceTimersByTime(4 * 60 * 1000); });
      mockPathname.mockReturnValue('/characters');
      rerender();
      expect(mockAddSession).toHaveBeenCalledTimes(1);

      // Navigate again — no active session, nothing to end
      mockPathname.mockReturnValue('/settings');
      rerender();
      expect(mockAddSession).toHaveBeenCalledTimes(1); // still 1
    });
  });

  // ──────────────────────────────────────────────────────
  // DISMISS FLOW SCORE
  // ──────────────────────────────────────────────────────
  describe('dismissFlowScore', () => {
    it('clears pendingFlowScore', () => {
      const { result, rerender } = renderHook(() => useSessionTracker());
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(3), summary: '' }]);
      rerender();
      mockChapters.mockReturnValue([{ id: 'ch-1', title: 'Ch', content: words(20), summary: '' }]);
      rerender();
      act(() => { vi.advanceTimersByTime(5 * 60 * 1000 + 1000); });
      expect(result.current.pendingFlowScore).not.toBeNull();

      act(() => { result.current.dismissFlowScore(); });
      expect(result.current.pendingFlowScore).toBeNull();
    });
  });
});
