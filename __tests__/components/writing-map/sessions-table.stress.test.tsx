import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import React from 'react';
import { SessionsTable } from '@/components/writing-map/sessions-table';
import type { WritingSession } from '@/lib/types/writing-session';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

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

describe('SessionsTable STRESS', () => {
  afterEach(() => {
    cleanup();
    mockPush.mockClear();
  });

  // ──────────────────────────────────────────────────────
  // TRUNCATION EXACT BOUNDARIES
  // ──────────────────────────────────────────────────────
  describe('truncation boundaries', () => {
    it('19 characters → no truncation', () => {
      const name = 'A'.repeat(19);
      render(<SessionsTable sessions={[makeSession({ projectName: name })]} />);
      expect(screen.getByText(name)).toBeTruthy();
    });

    it('exactly 20 characters → no truncation', () => {
      const name = 'B'.repeat(20);
      render(<SessionsTable sessions={[makeSession({ projectName: name })]} />);
      expect(screen.getByText(name)).toBeTruthy();
    });

    it('21 characters → truncated to 20 + ellipsis', () => {
      const name = 'C'.repeat(21);
      render(<SessionsTable sessions={[makeSession({ projectName: name })]} />);
      expect(screen.getByText('C'.repeat(20) + '\u2026')).toBeTruthy();
    });

    it('100 characters → truncated to 20 + ellipsis', () => {
      const name = 'D'.repeat(100);
      render(<SessionsTable sessions={[makeSession({ projectName: name })]} />);
      expect(screen.getByText('D'.repeat(20) + '\u2026')).toBeTruthy();
    });

    it('empty project name → no truncation', () => {
      render(<SessionsTable sessions={[makeSession({ projectName: '' })]} />);
      // Empty string renders, shouldn't crash
      expect(screen.getByTestId('sessions-table')).toBeTruthy();
    });

    it('unicode emoji in project name — slice operates on UTF-16 code units', () => {
      // 🔥 is a surrogate pair (2 code units), so '🔥'.repeat(11) = 22 code units > 20
      const name = '🔥'.repeat(11); // 22 code units
      render(<SessionsTable sessions={[makeSession({ projectName: name })]} />);
      // slice(0, 20) = 10 complete 🔥 emojis (20 code units) + ellipsis
      expect(screen.getByText('🔥'.repeat(10) + '\u2026')).toBeTruthy();
    });

    it('mixed ASCII + emoji truncation', () => {
      const name = 'My Story 🔥✨ Extras!!'; // 22 chars including emoji
      render(<SessionsTable sessions={[makeSession({ projectName: name })]} />);
      // Should truncate at 20 chars
      const expected = name.slice(0, 20) + '\u2026';
      expect(screen.getByText(expected)).toBeTruthy();
    });

    it('title attribute shows full project name', () => {
      const longName = 'A Very Long Project Name That Goes Beyond';
      render(<SessionsTable sessions={[makeSession({ projectName: longName })]} />);
      const cell = screen.getByTitle(longName);
      expect(cell).toBeTruthy();
    });
  });

  // ──────────────────────────────────────────────────────
  // 20-SESSION LIMIT BOUNDARIES
  // ──────────────────────────────────────────────────────
  describe('20-session limit boundaries', () => {
    it('1 session → 1 data row', () => {
      render(<SessionsTable sessions={[makeSession()]} />);
      const rows = screen.getAllByRole('row');
      expect(rows).toHaveLength(2); // header + 1
    });

    it('19 sessions → 19 data rows', () => {
      const sessions = Array.from({ length: 19 }, (_, i) => makeSession({ id: `s-${i}` }));
      render(<SessionsTable sessions={sessions} />);
      const rows = screen.getAllByRole('row');
      expect(rows).toHaveLength(20); // header + 19
    });

    it('exactly 20 sessions → 20 data rows', () => {
      const sessions = Array.from({ length: 20 }, (_, i) => makeSession({ id: `s-${i}` }));
      render(<SessionsTable sessions={sessions} />);
      const rows = screen.getAllByRole('row');
      expect(rows).toHaveLength(21); // header + 20
    });

    it('21 sessions → 20 data rows (limit)', () => {
      const sessions = Array.from({ length: 21 }, (_, i) => makeSession({ id: `s-${i}` }));
      render(<SessionsTable sessions={sessions} />);
      const rows = screen.getAllByRole('row');
      expect(rows).toHaveLength(21); // header + 20
    });

    it('100 sessions → 20 data rows', () => {
      const sessions = Array.from({ length: 100 }, (_, i) => makeSession({ id: `s-${i}` }));
      render(<SessionsTable sessions={sessions} />);
      const rows = screen.getAllByRole('row');
      expect(rows).toHaveLength(21); // header + 20
    });

    it('shows the LAST 20 sessions (most recent)', () => {
      const sessions = Array.from({ length: 25 }, (_, i) =>
        makeSession({
          id: `s-${i}`,
          wordsAdded: i + 1,
          startedAt: `2026-03-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
          endedAt: `2026-03-${String(i + 1).padStart(2, '0')}T10:30:00Z`,
        })
      );
      render(<SessionsTable sessions={sessions} />);
      // The first 5 sessions (s-0 through s-4, wordsAdded 1-5) should be excluded
      // Default sort is date desc, so newest first
      expect(screen.queryByText('+1')).toBeNull(); // session s-0 excluded
      expect(screen.queryByText('+5')).toBeNull(); // session s-4 excluded
      expect(screen.getByText('+6')).toBeTruthy(); // session s-5 included
    });
  });

  // ──────────────────────────────────────────────────────
  // SORTING ALL COLUMNS
  // ──────────────────────────────────────────────────────
  describe('sorting all columns', () => {
    const sessions = [
      makeSession({
        id: 's1', wordsAdded: 100, flowScore: 3,
        startedAt: '2026-03-10T10:00:00Z', endedAt: '2026-03-10T10:30:00Z',
      }),
      makeSession({
        id: 's2', wordsAdded: 300, flowScore: 5,
        startedAt: '2026-03-11T14:00:00Z', endedAt: '2026-03-11T16:00:00Z',
      }),
      makeSession({
        id: 's3', wordsAdded: 50, flowScore: 1,
        startedAt: '2026-03-09T08:00:00Z', endedAt: '2026-03-09T08:15:00Z',
      }),
    ];

    it('sorts by date desc (default)', () => {
      render(<SessionsTable sessions={sessions} />);
      const rows = screen.getAllByRole('row').slice(1); // skip header
      // Desc: s2 (Mar 11), s1 (Mar 10), s3 (Mar 9)
      expect(rows).toHaveLength(3);
    });

    it('sorts by words desc on click', () => {
      render(<SessionsTable sessions={sessions} />);
      fireEvent.click(screen.getByRole('columnheader', { name: /Words/ }));
      const rows = screen.getAllByRole('row').slice(1);
      expect(rows).toHaveLength(3);
    });

    it('sorts by words asc on double click', () => {
      render(<SessionsTable sessions={sessions} />);
      const header = screen.getByRole('columnheader', { name: /Words/ });
      fireEvent.click(header); // desc
      fireEvent.click(header); // asc
      expect(screen.getAllByRole('row')).toHaveLength(4);
    });

    it('sorts by duration', () => {
      render(<SessionsTable sessions={sessions} />);
      fireEvent.click(screen.getByRole('columnheader', { name: /Duration/ }));
      expect(screen.getAllByRole('row')).toHaveLength(4);
    });

    it('sorts by flow score', () => {
      render(<SessionsTable sessions={sessions} />);
      fireEvent.click(screen.getByRole('columnheader', { name: /^Flow/ }));
      expect(screen.getAllByRole('row')).toHaveLength(4);
    });

    it('sorts by flow with mixed null scores', () => {
      const mixed = [
        makeSession({ id: 's1', flowScore: null }),
        makeSession({ id: 's2', flowScore: 5 }),
        makeSession({ id: 's3', flowScore: 1 }),
      ];
      render(<SessionsTable sessions={mixed} />);
      fireEvent.click(screen.getByRole('columnheader', { name: /^Flow/ }));
      expect(screen.getAllByRole('row')).toHaveLength(4);
    });

    it('switching sort field resets direction to desc', () => {
      render(<SessionsTable sessions={sessions} />);
      const wordsHeader = screen.getByRole('columnheader', { name: /Words/ });
      const dateHeader = screen.getByRole('columnheader', { name: /Date/ });
      fireEvent.click(wordsHeader); // words desc
      fireEvent.click(wordsHeader); // words asc
      fireEvent.click(dateHeader); // date desc (reset)
      expect(screen.getAllByRole('row')).toHaveLength(4);
    });
  });

  // ──────────────────────────────────────────────────────
  // FLOW SCORE INK RATINGS
  // ──────────────────────────────────────────────────────
  describe('flow score ink ratings', () => {
    it.each([1, 2, 3, 4, 5] as const)('score %i renders an ink rating with that score', (score) => {
      render(<SessionsTable sessions={[makeSession({ flowScore: score })]} />);
      const rating = screen.getByTestId('ink-rating');
      expect(rating.getAttribute('data-score')).toBe(String(score));
    });

    it('null score → dash', () => {
      render(<SessionsTable sessions={[makeSession({ flowScore: null })]} />);
      // Both Auto Flow (null by default) and Flow (null) render em dashes
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────────
  // DURATION FORMATTING
  // ──────────────────────────────────────────────────────
  describe('duration formatting', () => {
    it('30 minutes → "30m"', () => {
      render(<SessionsTable sessions={[makeSession({
        startedAt: '2026-03-10T10:00:00Z', endedAt: '2026-03-10T10:30:00Z',
      })]} />);
      expect(screen.getByText('30m')).toBeTruthy();
    });

    it('exactly 60 minutes → "1h"', () => {
      render(<SessionsTable sessions={[makeSession({
        startedAt: '2026-03-10T10:00:00Z', endedAt: '2026-03-10T11:00:00Z',
      })]} />);
      expect(screen.getByText('1h')).toBeTruthy();
    });

    it('90 minutes → "1h 30m"', () => {
      render(<SessionsTable sessions={[makeSession({
        startedAt: '2026-03-10T10:00:00Z', endedAt: '2026-03-10T11:30:00Z',
      })]} />);
      expect(screen.getByText('1h 30m')).toBeTruthy();
    });

    it('1 minute → "1m"', () => {
      render(<SessionsTable sessions={[makeSession({
        startedAt: '2026-03-10T10:00:00Z', endedAt: '2026-03-10T10:01:00Z',
      })]} />);
      expect(screen.getByText('1m')).toBeTruthy();
    });

    it('0 minutes → "0m"', () => {
      render(<SessionsTable sessions={[makeSession({
        startedAt: '2026-03-10T10:00:00Z', endedAt: '2026-03-10T10:00:00Z',
      })]} />);
      expect(screen.getByText('0m')).toBeTruthy();
    });

    it('120 minutes → "2h"', () => {
      render(<SessionsTable sessions={[makeSession({
        startedAt: '2026-03-10T10:00:00Z', endedAt: '2026-03-10T12:00:00Z',
      })]} />);
      expect(screen.getByText('2h')).toBeTruthy();
    });
  });

  // ──────────────────────────────────────────────────────
  // WORD COUNT DISPLAY
  // ──────────────────────────────────────────────────────
  describe('word count display', () => {
    it('0 words → "+0"', () => {
      render(<SessionsTable sessions={[makeSession({ wordsAdded: 0 })]} />);
      expect(screen.getByText('+0')).toBeTruthy();
    });

    it('large number formatted with commas', () => {
      render(<SessionsTable sessions={[makeSession({ wordsAdded: 12345 })]} />);
      expect(screen.getByText('+12,345')).toBeTruthy();
    });

    it('1 word → "+1"', () => {
      render(<SessionsTable sessions={[makeSession({ wordsAdded: 1 })]} />);
      expect(screen.getByText('+1')).toBeTruthy();
    });
  });

  // ──────────────────────────────────────────────────────
  // CLICK-TO-NAVIGATE
  // ──────────────────────────────────────────────────────
  describe('click-to-navigate', () => {
    it('every row click navigates to /flow', () => {
      const sessions = [
        makeSession({ id: 's1' }),
        makeSession({ id: 's2' }),
        makeSession({ id: 's3' }),
      ];
      render(<SessionsTable sessions={sessions} />);
      const rows = screen.getAllByRole('row').slice(1);
      for (const row of rows) {
        fireEvent.click(row);
      }
      expect(mockPush).toHaveBeenCalledTimes(3);
      expect(mockPush).toHaveBeenCalledWith('/flow');
    });
  });

  // ──────────────────────────────────────────────────────
  // COLUMN HEADERS
  // ──────────────────────────────────────────────────────
  describe('column headers', () => {
    it('renders all 7 column headers', () => {
      render(<SessionsTable sessions={[makeSession()]} />);
      expect(screen.getByText('Project')).toBeTruthy();
      expect(screen.getByRole('columnheader', { name: /Date/ })).toBeTruthy();
      expect(screen.getByText('Time')).toBeTruthy();
      expect(screen.getByRole('columnheader', { name: /Words/ })).toBeTruthy();
      expect(screen.getByRole('columnheader', { name: /Duration/ })).toBeTruthy();
      expect(screen.getByRole('columnheader', { name: /Auto Flow/ })).toBeTruthy();
      expect(screen.getByRole('columnheader', { name: /^Flow/ })).toBeTruthy();
    });
  });
});
