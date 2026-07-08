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

describe('CalendarHeatmap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-11T12:00:00Z'));
    cleanup();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders an SVG with gridcells', () => {
    render(<CalendarHeatmap sessions={[makeSession()]} />);
    const svg = screen.getByRole('img');
    expect(svg).toBeTruthy();

    const cells = screen.getAllByRole('gridcell');
    expect(cells.length).toBeGreaterThan(300);
  });

  it('renders mostly empty cells when no sessions', () => {
    render(<CalendarHeatmap sessions={[]} />);
    const cells = screen.getAllByRole('gridcell');
    const sepiaCells = cells.filter(c => c.getAttribute('class')?.includes('fill-sepia-300/50'));
    // All cells should be sepia (empty) — allow small rounding variance
    expect(sepiaCells.length).toBe(cells.length);
  });

  it('colors cells for days with sessions', () => {
    const sessions = [makeSession({ startedAt: '2026-03-10T10:00:00Z', wordsAdded: 500 })];
    render(<CalendarHeatmap sessions={sessions} />);
    const matchingCell = screen.getByLabelText('2026-03-10: 500 words');
    expect(matchingCell.getAttribute('class')).not.toContain('fill-sepia-300/50');
  });

  it('shows rich tooltip on hover with all data', () => {
    const sessions = [makeSession({ startedAt: '2026-03-10T10:00:00Z', endedAt: '2026-03-10T10:30:00Z', wordsAdded: 200, flowScore: 4 })];
    render(<CalendarHeatmap sessions={sessions} />);
    const cell = screen.getByLabelText('2026-03-10: 200 words');
    fireEvent.mouseEnter(cell);
    const tooltip = document.querySelector('[data-testid="heatmap-tooltip"]');
    expect(tooltip).toBeTruthy();
    expect(tooltip!.textContent).toContain('200 words');
    expect(tooltip!.textContent).toContain('1 session');
    expect(tooltip!.textContent).toContain('30m');
  });

  it('renders legend', () => {
    render(<CalendarHeatmap sessions={[]} />);
    const lessElements = screen.getAllByText('Less');
    expect(lessElements.length).toBeGreaterThanOrEqual(1);
    const moreElements = screen.getAllByText('More');
    expect(moreElements.length).toBeGreaterThanOrEqual(1);
  });

  it('uses fixed color thresholds (not relative to max)', () => {
    // 150 words should be forest-900 (1-200 range)
    const sessions = [makeSession({ startedAt: '2026-03-10T10:00:00Z', wordsAdded: 150 })];
    render(<CalendarHeatmap sessions={sessions} />);
    const cell = screen.getByLabelText('2026-03-10: 150 words');
    expect(cell.getAttribute('class')).toContain('fill-forest-900');
  });

  it('applies correct color for 501-1000 word range', () => {
    const sessions = [makeSession({ startedAt: '2026-03-10T10:00:00Z', wordsAdded: 750 })];
    render(<CalendarHeatmap sessions={sessions} />);
    const cell = screen.getByLabelText('2026-03-10: 750 words');
    expect(cell.getAttribute('class')).toContain('fill-forest-500');
  });

  it('applies highest color for 1000+ words', () => {
    const sessions = [makeSession({ startedAt: '2026-03-10T10:00:00Z', wordsAdded: 1500 })];
    render(<CalendarHeatmap sessions={sessions} />);
    const cell = screen.getByLabelText('2026-03-10: 1500 words');
    expect(cell.getAttribute('class')).toContain('fill-forest-400');
  });

  it('aggregates multiple sessions on the same day', () => {
    const sessions = [
      makeSession({ id: 's1', startedAt: '2026-03-10T08:00:00Z', wordsAdded: 100 }),
      makeSession({ id: 's2', startedAt: '2026-03-10T14:00:00Z', wordsAdded: 200 }),
    ];
    render(<CalendarHeatmap sessions={sessions} />);
    const cell = screen.getByLabelText('2026-03-10: 300 words');
    expect(cell).toBeTruthy();
  });

  it('buckets sessions under the same LOCAL date key the streak uses (REG-10)', () => {
    // The heatmap must key days by local date (via the same convention as
    // formatDateKey, which the writing streak uses) — not the ISO string's UTC
    // date. Assert the cell is labeled with formatDateKey's output so the two
    // views can never disagree by a day for west-of-UTC evening sessions.
    const startedAt = '2026-03-10T09:00:00Z';
    const sessions = [makeSession({ startedAt, wordsAdded: 420 })];
    render(<CalendarHeatmap sessions={sessions} />);
    const expectedKey = formatDateKey(new Date(startedAt));
    const cell = screen.getByLabelText(`${expectedKey}: 420 words`);
    expect(cell.getAttribute('class')).not.toContain('fill-sepia-300/50');
  });
});
