import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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

describe('SessionsTable', () => {
  afterEach(() => {
    cleanup();
    mockPush.mockClear();
  });

  it('shows empty state when no sessions', () => {
    render(<SessionsTable sessions={[]} />);
    expect(screen.getByTestId('sessions-table-empty')).toBeTruthy();
    expect(screen.getByText(/No writing sessions/)).toBeTruthy();
  });

  it('renders sessions in a table', () => {
    render(<SessionsTable sessions={[makeSession()]} />);
    expect(screen.getByTestId('sessions-table')).toBeTruthy();
    expect(screen.getByText('+150')).toBeTruthy();
  });

  it('shows flow score as ink rating', () => {
    render(<SessionsTable sessions={[makeSession({ flowScore: 5 })]} />);
    const rating = screen.getByTestId('ink-rating');
    expect(rating.getAttribute('data-score')).toBe('5');
  });

  it('shows dash for null flow score', () => {
    render(<SessionsTable sessions={[makeSession({ flowScore: null })]} />);
    // Both Auto Flow (null by default) and Flow (null) render em dashes
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBe(2);
  });

  it('sorts by words when header clicked', () => {
    const sessions = [
      makeSession({ id: 's1', wordsAdded: 50, startedAt: '2026-03-10T10:00:00Z', endedAt: '2026-03-10T10:30:00Z' }),
      makeSession({ id: 's2', wordsAdded: 200, startedAt: '2026-03-10T11:00:00Z', endedAt: '2026-03-10T11:30:00Z' }),
    ];
    render(<SessionsTable sessions={sessions} />);

    const wordsHeader = screen.getByRole('columnheader', { name: /Words/ });
    fireEvent.click(wordsHeader);

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 data rows
  });

  it('toggles sort direction on repeated header click', () => {
    const sessions = [
      makeSession({ id: 's1', wordsAdded: 50 }),
      makeSession({ id: 's2', wordsAdded: 200 }),
    ];
    render(<SessionsTable sessions={sessions} />);

    const wordsHeader = screen.getByRole('columnheader', { name: /Words/ });
    fireEvent.click(wordsHeader); // desc
    fireEvent.click(wordsHeader); // asc
    expect(screen.getByTestId('sessions-table')).toBeTruthy();
  });

  it('shows project name column', () => {
    render(<SessionsTable sessions={[makeSession()]} />);
    expect(screen.getByText('Project')).toBeTruthy();
    expect(screen.getByText('My Novel')).toBeTruthy();
  });

  it('truncates long project names to 20 chars', () => {
    const longName = 'A Very Long Project Name That Exceeds Twenty Characters';
    render(<SessionsTable sessions={[makeSession({ projectName: longName })]} />);
    expect(screen.getByText(longName.slice(0, 20) + '\u2026')).toBeTruthy();
  });

  it('navigates on row click', () => {
    render(<SessionsTable sessions={[makeSession()]} />);
    const rows = screen.getAllByRole('row');
    // rows[0] is header, rows[1] is first data row
    fireEvent.click(rows[1]);
    expect(mockPush).toHaveBeenCalledWith('/flow');
  });

  it('limits to last 20 sessions', () => {
    const sessions = Array.from({ length: 25 }, (_, i) =>
      makeSession({ id: `s-${i}`, wordsAdded: 10 + i })
    );
    render(<SessionsTable sessions={sessions} />);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(21); // header + 20 data rows
  });
});
