import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import type { WritingSession } from '@/lib/types/writing-session';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock the story store — the new PacingHealth section reads it but the
// stress test renders WritingMapPage without a real StoryProvider.
vi.mock('@/lib/store', () => ({
  useStory: () => ({
    state: {
      chapters: [],
    },
  }),
}));

// Phase 4.12: WriterMemoryCard reads useConfirm; stub it.
vi.mock('@/components/antiquarian/parchment-modal', () => ({
  useConfirm: () => ({ confirm: () => Promise.resolve(true) }),
  ConfirmProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Phase 4.12: WriterMemoryCard hits Dexie via writer-memory; this test
// runs without fake-indexeddb so stub the module.
vi.mock('@/lib/writer-memory', () => ({
  readWriterInsights: () => Promise.resolve([]),
  refreshConfidences: () => Promise.resolve(),
  deleteInsight: () => Promise.resolve(),
  setInsightPinned: () => Promise.resolve(),
  clearAllInsights: () => Promise.resolve(),
  topWriterInsights: () => Promise.resolve([]),
  formatInsightsForPrompt: () => '',
  observe: () => Promise.resolve({}),
  WRITER_INSIGHT_CATEGORIES: ['pacing', 'dialogue', 'description', 'plot', 'voice'],
  PROMPT_INJECTION_LIMIT: 3,
}));

// Mock gamification hook
vi.mock('@/hooks/use-gamification', () => ({
  useGamification: () => ({
    gamification: { xp: { totalXP: 0, level: 1, events: [] }, streak: { currentStreak: 0, longestStreak: 0, lastQualifyingDate: '', todayQualified: false, streakHistory: [] }, quests: { currentDate: '', quests: [], questHistory: [] }, sprints: { activeSprint: null, sprintHistory: [] }, finishing: { currentPhase: 'setup', overallProgress: 0, milestones: [], nextSuggestion: '' }, version: 1 },
    xpProgress: { current: 0, needed: 200, progress: 0 },
    streak: { currentStreak: 0, longestStreak: 0, lastQualifyingDate: '', todayQualified: false, streakHistory: [] },
    streakWarning: null,
    quests: [],
    completeQuest: vi.fn(),
    activeSprint: null,
    startSprint: vi.fn(),
    endSprint: vi.fn(),
    abandonSprint: vi.fn(),
    finishing: { currentPhase: 'setup', overallProgress: 0, milestones: [], nextSuggestion: '' },
    refreshFinishing: vi.fn(),
    awardXP: vi.fn(),
  }),
}));

// Mock recharts
vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => <div />,
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

// Dynamic mock — tests set this before rendering
let mockSessions: WritingSession[] = [];

vi.mock('@/lib/types/writing-session', () => ({
  readSessions: () => Promise.resolve(mockSessions),
}));

import WritingMapPage from '@/app/writing-map/page';

describe('WritingMapPage STRESS', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-03-11T12:00:00Z'));
    mockSessions = [];
    cleanup();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // ──────────────────────────────────────────────────────
  // EXTREME SESSION COUNTS
  // ──────────────────────────────────────────────────────
  describe('extreme session counts', () => {
    it('renders with 0 sessions', async () => {
      mockSessions = [];
      render(<WritingMapPage />);
      await waitFor(() => {
        expect(screen.getByText(/Your writing patterns will appear here/)).toBeTruthy();
      });
    });

    it('renders with 1 session', async () => {
      mockSessions = [makeSession({ wordsAdded: 500 })];
      render(<WritingMapPage />);
      await waitFor(() => {
        expect(screen.getByText(/1 session/)).toBeTruthy();
      });
      expect(screen.getByText(/500 words tracked/)).toBeTruthy();
    });

    it('renders with 500 sessions without crashing', async () => {
      mockSessions = Array.from({ length: 500 }, (_, i) => {
        const d = new Date('2025-06-01');
        d.setDate(d.getDate() + (i % 300));
        return makeSession({
          id: `s-${i}`,
          startedAt: d.toISOString(),
          endedAt: new Date(d.getTime() + 30 * 60_000).toISOString(),
          wordsAdded: 100 + i,
        });
      });
      render(<WritingMapPage />);
      await waitFor(() => {
        expect(screen.getByText(/500 sessions/)).toBeTruthy();
      });
    });

    it('handles 1000+ sessions with large word totals', async () => {
      mockSessions = Array.from({ length: 1000 }, (_, i) =>
        makeSession({ id: `s-${i}`, wordsAdded: 1000 })
      );
      render(<WritingMapPage />);
      await waitFor(() => {
        expect(screen.getByText(/1,000,000 words tracked/)).toBeTruthy();
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // ALL 4 SECTIONS RENDER
  // ──────────────────────────────────────────────────────
  describe('all sections render together', () => {
    it('renders all sections with populated data', async () => {
      mockSessions = Array.from({ length: 10 }, (_, i) =>
        makeSession({
          id: `s-${i}`,
          startedAt: `2026-03-${String(i + 1).padStart(2, '0')}T14:00:00Z`,
          endedAt: `2026-03-${String(i + 1).padStart(2, '0')}T15:00:00Z`,
          wordsAdded: 200 + i * 50,
        })
      );
      render(<WritingMapPage />);
      await waitFor(() => {
        expect(screen.getByText('Activity')).toBeTruthy();
      });
      expect(screen.getByText('Words by Hour')).toBeTruthy();
      expect(screen.getByText('Recent Sessions')).toBeTruthy();
      expect(screen.getByTestId('insight-card')).toBeTruthy();
    });

    it('renders all ARIA labels', async () => {
      mockSessions = [makeSession()];
      render(<WritingMapPage />);
      await waitFor(() => {
        expect(screen.getByLabelText('Writing activity heatmap')).toBeTruthy();
      });
      expect(screen.getByLabelText('Words written by hour of day')).toBeTruthy();
      expect(screen.getByLabelText('Writing insight')).toBeTruthy();
      expect(screen.getByLabelText('Recent writing sessions')).toBeTruthy();
    });
  });

  // ──────────────────────────────────────────────────────
  // WORD TOTAL FORMATTING
  // ──────────────────────────────────────────────────────
  describe('word total formatting', () => {
    it('formats large totals with commas', async () => {
      mockSessions = Array.from({ length: 50 }, (_, i) =>
        makeSession({ id: `s-${i}`, wordsAdded: 1000 })
      );
      render(<WritingMapPage />);
      await waitFor(() => {
        expect(screen.getByText(/50,000 words tracked/)).toBeTruthy();
      });
    });

    it('small total no commas', async () => {
      mockSessions = [makeSession({ wordsAdded: 42 })];
      render(<WritingMapPage />);
      await waitFor(() => {
        expect(screen.getByText(/42 words tracked/)).toBeTruthy();
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // MIXED SESSION DATA
  // ──────────────────────────────────────────────────────
  describe('mixed session data', () => {
    it('handles sessions with various flowScores including null', async () => {
      mockSessions = [
        makeSession({ id: 's1', flowScore: 1 }),
        makeSession({ id: 's2', flowScore: 3 }),
        makeSession({ id: 's3', flowScore: 5 }),
        makeSession({ id: 's4', flowScore: null }),
      ];
      render(<WritingMapPage />);
      await waitFor(() => {
        expect(screen.getByText(/4 sessions/)).toBeTruthy();
      });
    });

    it('handles sessions with heteronym data', async () => {
      mockSessions = [
        makeSession({ id: 's1', heteronymId: 'het-1', heteronymName: 'Dark Poet' }),
        makeSession({ id: 's2', heteronymId: null, heteronymName: null }),
      ];
      render(<WritingMapPage />);
      await waitFor(() => {
        expect(screen.getByText(/2 sessions/)).toBeTruthy();
      });
    });

    it('handles sessions with different project names', async () => {
      mockSessions = [
        makeSession({ id: 's1', projectName: 'Novel A' }),
        makeSession({ id: 's2', projectName: 'Novel B' }),
        makeSession({ id: 's3', projectName: 'A Very Long Novel Name That Exceeds Limit' }),
      ];
      render(<WritingMapPage />);
      await waitFor(() => {
        expect(screen.getByText(/3 sessions/)).toBeTruthy();
      });
    });

    it('handles sessions with 0 wordsAdded', async () => {
      mockSessions = [
        makeSession({ id: 's1', wordsAdded: 0 }),
        makeSession({ id: 's2', wordsAdded: 500 }),
      ];
      render(<WritingMapPage />);
      await waitFor(() => {
        expect(screen.getByText(/500 words tracked/)).toBeTruthy();
      });
    });
  });
});
