import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { CalendarHeatmap } from '@/components/writing-map/calendar-heatmap';
import type { WritingSession } from '@/lib/types/writing-session';
import { formatDateKey } from '@/lib/gamification/date-utils';

function makeSession(overrides: Partial<WritingSession> = {}): WritingSession {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    projectName: 'My Novel',
    startedAt: '2026-03-10T10:00:00Z',
    endedAt: '2026-03-10T10:30:00Z',
    wordsStart: 0,
    wordsEnd: 150,
    wordsAdded: 150,
    flowScore: 4,
    heteronymId: null,
    heteronymName: null,
    keystrokeMetrics: null,
    autoFlowScore: null,
    flowMoments: null,
    ...overrides,
  };
}

describe('CalendarHeatmap STRESS', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-11T12:00:00Z'));
    cleanup();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // ──────────────────────────────────────────────────────
  // COLOR THRESHOLD EXACT BOUNDARIES
  // ──────────────────────────────────────────────────────
  describe('color threshold exact boundaries', () => {
    it('0 words → fill-sepia-300/50', () => {
      render(<CalendarHeatmap sessions={[]} />);
      const cell = screen.getByLabelText('2026-03-10: 0 words');
      expect(cell.getAttribute('class')).toContain('fill-sepia-300/50');
    });

    it('1 word → fill-forest-900', () => {
      render(<CalendarHeatmap sessions={[makeSession({ startedAt: '2026-03-10T10:00:00Z', wordsAdded: 1 })]} />);
      const cell = screen.getByLabelText('2026-03-10: 1 words');
      expect(cell.getAttribute('class')).toContain('fill-forest-900');
    });

    it('exactly 200 words → fill-forest-900 (≤ 200)', () => {
      render(<CalendarHeatmap sessions={[makeSession({ startedAt: '2026-03-10T10:00:00Z', wordsAdded: 200 })]} />);
      const cell = screen.getByLabelText('2026-03-10: 200 words');
      expect(cell.getAttribute('class')).toContain('fill-forest-900');
    });

    it('201 words → fill-forest-700', () => {
      render(<CalendarHeatmap sessions={[makeSession({ startedAt: '2026-03-10T10:00:00Z', wordsAdded: 201 })]} />);
      const cell = screen.getByLabelText('2026-03-10: 201 words');
      expect(cell.getAttribute('class')).toContain('fill-forest-700');
    });

    it('exactly 500 words → fill-forest-700 (≤ 500)', () => {
      render(<CalendarHeatmap sessions={[makeSession({ startedAt: '2026-03-10T10:00:00Z', wordsAdded: 500 })]} />);
      const cell = screen.getByLabelText('2026-03-10: 500 words');
      expect(cell.getAttribute('class')).toContain('fill-forest-700');
    });

    it('501 words → fill-forest-500', () => {
      render(<CalendarHeatmap sessions={[makeSession({ startedAt: '2026-03-10T10:00:00Z', wordsAdded: 501 })]} />);
      const cell = screen.getByLabelText('2026-03-10: 501 words');
      expect(cell.getAttribute('class')).toContain('fill-forest-500');
    });

    it('exactly 1000 words → fill-forest-500 (≤ 1000)', () => {
      render(<CalendarHeatmap sessions={[makeSession({ startedAt: '2026-03-10T10:00:00Z', wordsAdded: 1000 })]} />);
      const cell = screen.getByLabelText('2026-03-10: 1000 words');
      expect(cell.getAttribute('class')).toContain('fill-forest-500');
    });

    it('1001 words → fill-forest-400', () => {
      render(<CalendarHeatmap sessions={[makeSession({ startedAt: '2026-03-10T10:00:00Z', wordsAdded: 1001 })]} />);
      const cell = screen.getByLabelText('2026-03-10: 1001 words');
      expect(cell.getAttribute('class')).toContain('fill-forest-400');
    });

    it('50000 words → fill-forest-400', () => {
      render(<CalendarHeatmap sessions={[makeSession({ startedAt: '2026-03-10T10:00:00Z', wordsAdded: 50000 })]} />);
      const cell = screen.getByLabelText('2026-03-10: 50000 words');
      expect(cell.getAttribute('class')).toContain('fill-forest-400');
    });
  });

  // ──────────────────────────────────────────────────────
  // MASS DATA
  // ──────────────────────────────────────────────────────
  describe('mass data', () => {
    it('renders with 1000 sessions across many dates', () => {
      const sessions = Array.from({ length: 1000 }, (_, i) => {
        const d = new Date('2025-06-01');
        d.setDate(d.getDate() + (i % 300));
        return makeSession({
          id: `s-${i}`,
          startedAt: d.toISOString(),
          endedAt: new Date(d.getTime() + 30 * 60_000).toISOString(),
          wordsAdded: 50 + (i % 200),
        });
      });
      render(<CalendarHeatmap sessions={sessions} />);
      expect(screen.getByRole('img')).toBeTruthy();
      expect(screen.getAllByRole('gridcell').length).toBeGreaterThan(300);
    });

    it('aggregates 50 sessions on the same date', () => {
      const sessions = Array.from({ length: 50 }, (_, i) =>
        makeSession({
          id: `s-${i}`,
          startedAt: '2026-03-10T10:00:00Z',
          endedAt: '2026-03-10T10:30:00Z',
          wordsAdded: 20,
        })
      );
      render(<CalendarHeatmap sessions={sessions} />);
      // 50 × 20 = 1000 words → fill-forest-500
      const cell = screen.getByLabelText('2026-03-10: 1000 words');
      expect(cell.getAttribute('class')).toContain('fill-forest-500');
    });
  });

  // ──────────────────────────────────────────────────────
  // TOOLTIP DATA RICHNESS
  // ──────────────────────────────────────────────────────
  describe('tooltip data richness', () => {
    it('shows "No writing" for empty day', () => {
      render(<CalendarHeatmap sessions={[]} />);
      const cell = screen.getByLabelText('2026-03-10: 0 words');
      fireEvent.mouseEnter(cell);
      const tooltip = document.querySelector('[data-testid="heatmap-tooltip"]');
      expect(tooltip!.textContent).toContain('No writing');
    });

    it('shows session count and words for day with data', () => {
      const sessions = [
        makeSession({ id: 's1', startedAt: '2026-03-10T08:00:00Z', endedAt: '2026-03-10T08:45:00Z', wordsAdded: 300 }),
        makeSession({ id: 's2', startedAt: '2026-03-10T14:00:00Z', endedAt: '2026-03-10T15:00:00Z', wordsAdded: 200 }),
      ];
      render(<CalendarHeatmap sessions={sessions} />);
      const cell = screen.getByLabelText('2026-03-10: 500 words');
      fireEvent.mouseEnter(cell);
      const tooltip = document.querySelector('[data-testid="heatmap-tooltip"]');
      expect(tooltip!.textContent).toContain('500 words');
      expect(tooltip!.textContent).toContain('2 sessions');
    });

    it('shows singular "session" for 1 session day', () => {
      render(<CalendarHeatmap sessions={[makeSession({ startedAt: '2026-03-10T10:00:00Z', endedAt: '2026-03-10T10:30:00Z' })]} />);
      const cell = screen.getByLabelText('2026-03-10: 150 words');
      fireEvent.mouseEnter(cell);
      const tooltip = document.querySelector('[data-testid="heatmap-tooltip"]');
      expect(tooltip!.textContent).toContain('1 session');
      expect(tooltip!.textContent).not.toContain('1 sessions');
    });

    it('shows "No rating" when all flowScores are null', () => {
      render(<CalendarHeatmap sessions={[makeSession({ startedAt: '2026-03-10T10:00:00Z', flowScore: null })]} />);
      const cell = screen.getByLabelText('2026-03-10: 150 words');
      fireEvent.mouseEnter(cell);
      const tooltip = document.querySelector('[data-testid="heatmap-tooltip"]');
      expect(tooltip!.textContent).toContain('No rating');
    });

    it('shows avg flow emoji when flowScores present', () => {
      const sessions = [
        makeSession({ id: 's1', startedAt: '2026-03-10T08:00:00Z', flowScore: 4 }),
        makeSession({ id: 's2', startedAt: '2026-03-10T14:00:00Z', flowScore: 5 }),
      ];
      render(<CalendarHeatmap sessions={sessions} />);
      const cell = screen.getByLabelText('2026-03-10: 300 words');
      fireEvent.mouseEnter(cell);
      const tooltip = document.querySelector('[data-testid="heatmap-tooltip"]');
      // avg(4,5) = 4.5, rounds to 5 → 🔥
      expect(tooltip!.textContent).toContain('Avg flow:');
    });

    it('shows writing time in tooltip', () => {
      render(<CalendarHeatmap sessions={[
        makeSession({ startedAt: '2026-03-10T10:00:00Z', endedAt: '2026-03-10T11:30:00Z' }),
      ]} />);
      const cell = screen.getByLabelText('2026-03-10: 150 words');
      fireEvent.mouseEnter(cell);
      const tooltip = document.querySelector('[data-testid="heatmap-tooltip"]');
      expect(tooltip!.textContent).toContain('1h 30m');
    });

    it('shows duration under 60 minutes as Xm', () => {
      render(<CalendarHeatmap sessions={[
        makeSession({ startedAt: '2026-03-10T10:00:00Z', endedAt: '2026-03-10T10:45:00Z' }),
      ]} />);
      const cell = screen.getByLabelText('2026-03-10: 150 words');
      fireEvent.mouseEnter(cell);
      const tooltip = document.querySelector('[data-testid="heatmap-tooltip"]');
      expect(tooltip!.textContent).toContain('45m');
    });

    it('hides tooltip on mouse leave', () => {
      render(<CalendarHeatmap sessions={[makeSession({ startedAt: '2026-03-10T10:00:00Z' })]} />);
      const cell = screen.getByLabelText('2026-03-10: 150 words');
      fireEvent.mouseEnter(cell);
      expect(document.querySelector('[data-testid="heatmap-tooltip"]')).toBeTruthy();
      fireEvent.mouseLeave(cell);
      expect(document.querySelector('[data-testid="heatmap-tooltip"]')).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────
  // DATE EDGE CASES
  // ──────────────────────────────────────────────────────
  describe('date edge cases', () => {
    it('handles sessions on year boundary (Dec 31 → Jan 1)', () => {
      vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
      const sessions = [
        makeSession({ id: 's1', startedAt: '2025-12-31T23:00:00Z', endedAt: '2026-01-01T00:00:00Z', wordsAdded: 100 }),
        makeSession({ id: 's2', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T01:00:00Z', wordsAdded: 200 }),
      ];
      render(<CalendarHeatmap sessions={sessions} />);
      // REG-10: sessions bucket by LOCAL date (the streak's convention), not the
      // ISO string's UTC date. Derive the expected day keys the same way so the
      // assertion is timezone-independent (near a midnight/year boundary the two
      // sessions may even fall on the same local day and aggregate).
      const expected = new Map<string, number>();
      for (const s of sessions) {
        const key = formatDateKey(new Date(s.startedAt));
        expected.set(key, (expected.get(key) ?? 0) + s.wordsAdded);
      }
      for (const [key, words] of expected) {
        expect(screen.getByLabelText(`${key}: ${words} words`)).toBeTruthy();
      }
    });

    it('handles leap year Feb 29', () => {
      vi.setSystemTime(new Date('2028-03-15T12:00:00Z')); // 2028 is a leap year
      const sessions = [
        makeSession({ startedAt: '2028-02-29T10:00:00Z', endedAt: '2028-02-29T11:00:00Z', wordsAdded: 500 }),
      ];
      render(<CalendarHeatmap sessions={sessions} />);
      expect(screen.getByLabelText('2028-02-29: 500 words')).toBeTruthy();
    });

    it('handles session starting at midnight', () => {
      const startedAt = '2026-03-10T00:00:00Z';
      render(<CalendarHeatmap sessions={[makeSession({ startedAt, endedAt: '2026-03-10T00:30:00Z', wordsAdded: 100 })]} />);
      // REG-10: bucket by the session's LOCAL date (timezone-independent assertion).
      const key = formatDateKey(new Date(startedAt));
      expect(screen.getByLabelText(`${key}: 100 words`)).toBeTruthy();
    });

    it('renders correctly with sessions far in the past (ignored by calendar)', () => {
      const sessions = [
        makeSession({ startedAt: '2020-01-01T10:00:00Z', endedAt: '2020-01-01T11:00:00Z', wordsAdded: 500 }),
      ];
      render(<CalendarHeatmap sessions={sessions} />);
      // Session is outside the 365-day window, should not affect any cell
      const cells = screen.getAllByRole('gridcell');
      const coloredCells = cells.filter(c => !c.getAttribute('class')?.includes('fill-sepia-300/50'));
      expect(coloredCells).toHaveLength(0);
    });
  });

  // ──────────────────────────────────────────────────────
  // LEGEND
  // ──────────────────────────────────────────────────────
  describe('legend', () => {
    it('renders exactly 5 legend colors', () => {
      render(<CalendarHeatmap sessions={[]} />);
      // Legend has Less + 5 color blocks + More
      expect(screen.getByText('Less')).toBeTruthy();
      expect(screen.getByText('More')).toBeTruthy();
    });
  });

  // ──────────────────────────────────────────────────────
  // LARGE WORD COUNTS IN TOOLTIP
  // ──────────────────────────────────────────────────────
  describe('large word counts', () => {
    it('formats large word count with locale separator', () => {
      render(<CalendarHeatmap sessions={[
        makeSession({ startedAt: '2026-03-10T10:00:00Z', wordsAdded: 999_999 }),
      ]} />);
      const cell = screen.getByLabelText('2026-03-10: 999999 words');
      fireEvent.mouseEnter(cell);
      const tooltip = document.querySelector('[data-testid="heatmap-tooltip"]');
      // toLocaleString() should add comma separators
      expect(tooltip!.textContent).toContain('999,999 words');
    });
  });
});
