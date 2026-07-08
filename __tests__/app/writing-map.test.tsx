import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Phase 4.6: PacingHealth reads useStory(); the page-level test renders
// without a StoryProvider, so stub the store.
vi.mock('@/lib/store', () => ({
  useStory: () => ({
    state: { chapters: [] },
  }),
}));

// Phase 4.12: WriterMemoryCard reads useConfirm; stub it for the
// provider-less page-level test.
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

// Mock writing-session module
vi.mock('@/lib/types/writing-session', () => ({
  readSessions: () => Promise.resolve([
    {
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
    },
    {
      id: 'sess-2',
      projectId: 'proj-1',
      projectName: 'My Novel',
      startedAt: '2026-03-09T14:00:00Z',
      endedAt: '2026-03-09T15:00:00Z',
      wordsStart: 0,
      wordsEnd: 300,
      wordsAdded: 300,
      flowScore: 5,
      heteronymId: null,
      heteronymName: null,
    },
  ]),
}));

import WritingMapPage from '@/app/(app)/writing-map/page';

describe('WritingMapPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-03-11T12:00:00Z'));
    cleanup();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders the page title', () => {
    render(<WritingMapPage />);
    expect(screen.getByText('Writing Map')).toBeTruthy();
  });

  it('shows session count and word total', async () => {
    render(<WritingMapPage />);
    await waitFor(() => {
      expect(screen.getByText(/2 sessions — 450 words tracked/)).toBeTruthy();
    });
  });

  it('renders all 4 sections', async () => {
    render(<WritingMapPage />);
    await waitFor(() => {
      expect(screen.getByText('Activity')).toBeTruthy();
    });
    expect(screen.getByText('Words by Hour')).toBeTruthy();
    expect(screen.getByText('Recent Sessions')).toBeTruthy();
    expect(screen.getByTestId('insight-card')).toBeTruthy();
  });

  it('renders section ARIA labels', async () => {
    render(<WritingMapPage />);
    await waitFor(() => {
      expect(screen.getByLabelText('Writing activity heatmap')).toBeTruthy();
    });
    expect(screen.getByLabelText('Words written by hour of day')).toBeTruthy();
    expect(screen.getByLabelText('Writing insight')).toBeTruthy();
    expect(screen.getByLabelText('Recent writing sessions')).toBeTruthy();
  });
});
