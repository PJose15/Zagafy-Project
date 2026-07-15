import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import { WordsByHour } from '@/components/writing-map/words-by-hour';
import type { WritingSession } from '@/lib/types/writing-session';

// Mock recharts
vi.mock('recharts', () => ({
  BarChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="bar-chart" data-count={data?.length} data-json={JSON.stringify(data)}>{children}</div>
  ),
  Bar: ({ children }: { children: React.ReactNode }) => <div data-testid="bar">{children}</div>,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: ({ fill }: { fill: string }) => <div data-testid="bar-cell" data-fill={fill} />,
}));

function localDateAt(hour: number, dayOffset: number = 0): string {
  const d = new Date(2026, 2, 1 + dayOffset, hour, 0, 0);
  return d.toISOString();
}

function makeSession(overrides: Partial<WritingSession> = {}): WritingSession {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    projectName: 'My Novel',
    startedAt: localDateAt(10),
    endedAt: localDateAt(10),
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

function getChartData(container: HTMLElement): Array<{ hour: number; words: number; count: number; isTop: boolean }> {
  const chart = container.querySelector('[data-testid="bar-chart"]');
  if (!chart) return [];
  return JSON.parse(chart.getAttribute('data-json') || '[]');
}

describe('WordsByHour STRESS', () => {
  afterEach(() => { cleanup(); });

  // ──────────────────────────────────────────────────────
  // AVERAGE CALCULATION (NOT TOTAL)
  // ──────────────────────────────────────────────────────
  describe('average calculation', () => {
    it('computes average for 2 sessions at same hour: (100+200)/2 = 150', () => {
      const sessions = [
        makeSession({ id: 's1', startedAt: localDateAt(10), wordsAdded: 100 }),
        makeSession({ id: 's2', startedAt: localDateAt(10, 1), wordsAdded: 200 }),
      ];
      const { container } = render(<WordsByHour sessions={sessions} />);
      const data = getChartData(container);
      const hour10 = data.find(d => d.hour === 10);
      expect(hour10!.words).toBe(150); // average, not 300
      expect(hour10!.count).toBe(2);
    });

    it('computes average for 3 sessions: (100+200+300)/3 = 200', () => {
      const sessions = [
        makeSession({ id: 's1', startedAt: localDateAt(14), wordsAdded: 100 }),
        makeSession({ id: 's2', startedAt: localDateAt(14, 1), wordsAdded: 200 }),
        makeSession({ id: 's3', startedAt: localDateAt(14, 2), wordsAdded: 300 }),
      ];
      const { container } = render(<WordsByHour sessions={sessions} />);
      const data = getChartData(container);
      const hour14 = data.find(d => d.hour === 14);
      expect(hour14!.words).toBe(200);
      expect(hour14!.count).toBe(3);
    });

    it('single session = total equals average', () => {
      const sessions = [makeSession({ startedAt: localDateAt(8), wordsAdded: 500 })];
      const { container } = render(<WordsByHour sessions={sessions} />);
      const data = getChartData(container);
      const hour8 = data.find(d => d.hour === 8);
      expect(hour8!.words).toBe(500);
      expect(hour8!.count).toBe(1);
    });

    it('zero sessions at an hour = 0 words and 0 count', () => {
      const sessions = [makeSession({ startedAt: localDateAt(10), wordsAdded: 100 })];
      const { container } = render(<WordsByHour sessions={sessions} />);
      const data = getChartData(container);
      const hour5 = data.find(d => d.hour === 5);
      expect(hour5!.words).toBe(0);
      expect(hour5!.count).toBe(0);
    });

    it('rounds average to integer', () => {
      const sessions = [
        makeSession({ id: 's1', startedAt: localDateAt(10), wordsAdded: 100 }),
        makeSession({ id: 's2', startedAt: localDateAt(10, 1), wordsAdded: 201 }),
      ];
      const { container } = render(<WordsByHour sessions={sessions} />);
      const data = getChartData(container);
      const hour10 = data.find(d => d.hour === 10);
      expect(hour10!.words).toBe(151); // (100+201)/2 = 150.5 → 151
    });
  });

  // ──────────────────────────────────────────────────────
  // ALL 24 HOURS COVERAGE
  // ──────────────────────────────────────────────────────
  describe('all 24 hours', () => {
    it('produces 24 data points always', () => {
      const sessions = [makeSession({ startedAt: localDateAt(0), wordsAdded: 100 })];
      const { container } = render(<WordsByHour sessions={sessions} />);
      const data = getChartData(container);
      expect(data).toHaveLength(24);
    });

    it('hour 0 (midnight) formats correctly', () => {
      const sessions = [makeSession({ startedAt: localDateAt(0), wordsAdded: 100 })];
      const { container } = render(<WordsByHour sessions={sessions} />);
      const data = getChartData(container);
      expect(data[0].hour).toBe(0);
      expect(data[0].words).toBe(100);
    });

    it('hour 12 (noon) data is recorded', () => {
      const sessions = [makeSession({ startedAt: localDateAt(12), wordsAdded: 300 })];
      const { container } = render(<WordsByHour sessions={sessions} />);
      const data = getChartData(container);
      expect(data[12].words).toBe(300);
    });

    it('hour 23 data is recorded', () => {
      const sessions = [makeSession({ startedAt: localDateAt(23), wordsAdded: 250 })];
      const { container } = render(<WordsByHour sessions={sessions} />);
      const data = getChartData(container);
      expect(data[23].words).toBe(250);
    });

    it('sessions at every hour produce data for all 24', () => {
      const sessions = Array.from({ length: 24 }, (_, h) =>
        makeSession({ id: `s-${h}`, startedAt: localDateAt(h), wordsAdded: (h + 1) * 10 })
      );
      const { container } = render(<WordsByHour sessions={sessions} />);
      const data = getChartData(container);
      expect(data).toHaveLength(24);
      for (let h = 0; h < 24; h++) {
        expect(data[h].words).toBe((h + 1) * 10);
      }
    });
  });

  // ──────────────────────────────────────────────────────
  // TOP-3 HIGHLIGHT LOGIC
  // ──────────────────────────────────────────────────────
  describe('top-3 highlights', () => {
    it('highlights exactly 3 hours when 3+ have data', () => {
      const sessions = [
        makeSession({ id: 's1', startedAt: localDateAt(8), wordsAdded: 100 }),
        makeSession({ id: 's2', startedAt: localDateAt(10), wordsAdded: 200 }),
        makeSession({ id: 's3', startedAt: localDateAt(14), wordsAdded: 300 }),
        makeSession({ id: 's4', startedAt: localDateAt(18), wordsAdded: 50 }),
      ];
      render(<WordsByHour sessions={sessions} />);
      const cells = screen.getAllByTestId('bar-cell');
      const green = cells.filter(c => c.getAttribute('data-fill') === '#c49b48');
      expect(green).toHaveLength(3);
    });

    it('highlights fewer than 3 when only 2 hours have data', () => {
      const sessions = [
        makeSession({ id: 's1', startedAt: localDateAt(8), wordsAdded: 100 }),
        makeSession({ id: 's2', startedAt: localDateAt(10), wordsAdded: 200 }),
      ];
      render(<WordsByHour sessions={sessions} />);
      const cells = screen.getAllByTestId('bar-cell');
      const green = cells.filter(c => c.getAttribute('data-fill') === '#c49b48');
      expect(green).toHaveLength(2);
    });

    it('highlights 1 hour when only 1 has data', () => {
      render(<WordsByHour sessions={[makeSession({ wordsAdded: 100 })]} />);
      const cells = screen.getAllByTestId('bar-cell');
      const green = cells.filter(c => c.getAttribute('data-fill') === '#c49b48');
      expect(green).toHaveLength(1);
    });

    it('handles tie in top-3 (all hours equal)', () => {
      const sessions = Array.from({ length: 24 }, (_, h) =>
        makeSession({ id: `s-${h}`, startedAt: localDateAt(h), wordsAdded: 100 })
      );
      render(<WordsByHour sessions={sessions} />);
      const cells = screen.getAllByTestId('bar-cell');
      const green = cells.filter(c => c.getAttribute('data-fill') === '#c49b48');
      expect(green).toHaveLength(3); // First 3 in sort order
    });
  });

  // ──────────────────────────────────────────────────────
  // MASS DATA
  // ──────────────────────────────────────────────────────
  describe('mass data', () => {
    it('handles 100 sessions at the same hour', () => {
      const sessions = Array.from({ length: 100 }, (_, i) =>
        makeSession({ id: `s-${i}`, startedAt: localDateAt(15, i), wordsAdded: 100 })
      );
      const { container } = render(<WordsByHour sessions={sessions} />);
      const data = getChartData(container);
      const hour15 = data.find(d => d.hour === 15);
      expect(hour15!.words).toBe(100); // avg of 100 × 100 / 100 = 100
      expect(hour15!.count).toBe(100);
    });

    it('handles 1000 sessions spread across hours', () => {
      const sessions = Array.from({ length: 1000 }, (_, i) =>
        makeSession({ id: `s-${i}`, startedAt: localDateAt(i % 24, i), wordsAdded: 50 + (i % 100) })
      );
      const { container } = render(<WordsByHour sessions={sessions} />);
      const data = getChartData(container);
      expect(data).toHaveLength(24);
      // Every hour should have data
      for (const d of data) {
        expect(d.count).toBeGreaterThan(0);
        expect(d.words).toBeGreaterThan(0);
      }
    });
  });

  // ──────────────────────────────────────────────────────
  // EMPTY STATE
  // ──────────────────────────────────────────────────────
  describe('empty states', () => {
    it('shows empty message for 0 sessions', () => {
      render(<WordsByHour sessions={[]} />);
      expect(screen.getByTestId('words-by-hour-empty')).toBeTruthy();
    });

    it('shows empty message when all sessions have 0 words', () => {
      const sessions = Array.from({ length: 5 }, (_, i) =>
        makeSession({ id: `s-${i}`, startedAt: localDateAt(i * 4), wordsAdded: 0 })
      );
      render(<WordsByHour sessions={sessions} />);
      expect(screen.getByTestId('words-by-hour-empty')).toBeTruthy();
    });
  });
});
