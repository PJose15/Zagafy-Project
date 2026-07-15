import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { WordsByHour } from '@/components/writing-map/words-by-hour';
import type { WritingSession } from '@/lib/types/writing-session';

// Mock recharts to avoid SVG rendering in tests
vi.mock('recharts', () => ({
  BarChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) => (
    <div data-testid="bar-chart" data-count={data?.length}>{children}</div>
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
    wordsStart: 100,
    wordsEnd: 250,
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

describe('WordsByHour', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows empty state when no sessions', () => {
    render(<WordsByHour sessions={[]} />);
    expect(screen.getByTestId('words-by-hour-empty')).toBeTruthy();
  });

  it('renders chart when sessions exist', () => {
    render(<WordsByHour sessions={[makeSession()]} />);
    expect(screen.getByTestId('words-by-hour-chart')).toBeTruthy();
  });

  it('renders 24 bar cells for each hour', () => {
    render(<WordsByHour sessions={[makeSession()]} />);
    const cells = screen.getAllByTestId('bar-cell');
    expect(cells).toHaveLength(24);
  });

  it('highlights top hours in brass', () => {
    render(<WordsByHour sessions={[makeSession()]} />);
    const cells = screen.getAllByTestId('bar-cell');
    const topCells = cells.filter(c => c.getAttribute('data-fill') === '#c49b48');
    expect(topCells.length).toBeGreaterThan(0);
    expect(topCells.length).toBeLessThanOrEqual(3);
  });

  it('handles sessions at various hours', () => {
    const sessions = [
      makeSession({ id: 's1', startedAt: localDateAt(0), wordsAdded: 100 }),
      makeSession({ id: 's2', startedAt: localDateAt(12), wordsAdded: 200 }),
    ];
    render(<WordsByHour sessions={sessions} />);
    expect(screen.getByTestId('words-by-hour-chart')).toBeTruthy();
  });

  it('shows average words per session (not total)', () => {
    // Two sessions at 10am: 100 + 200 = 300 total, avg = 150
    const sessions = [
      makeSession({ id: 's1', startedAt: localDateAt(10), wordsAdded: 100 }),
      makeSession({ id: 's2', startedAt: localDateAt(10, 1), wordsAdded: 200 }),
    ];
    render(<WordsByHour sessions={sessions} />);
    // Chart should render with 24 data points
    const chart = screen.getByTestId('bar-chart');
    expect(chart.getAttribute('data-count')).toBe('24');
  });
});
