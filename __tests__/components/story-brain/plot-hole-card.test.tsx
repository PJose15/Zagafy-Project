import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import type { PlotHole } from '@/lib/story-brain/plot-hole-types';
import type { InconsistencyResolution } from '@/lib/story-brain/types';

// Mock antiquarian
vi.mock('@/components/antiquarian', () => ({
  ParchmentCard: ({ children, ...props }: any) => (
    <div data-testid="parchment-card" {...props}>{children}</div>
  ),
}));

// Mock lucide-react with explicit named exports. Vitest 4 validates mock exports against
// ownKeys, so a Proxy-based catch-all mock ({} target) crashes the worker during module init.
vi.mock('lucide-react', () => ({
  AlertTriangle: (props: any) => <span data-testid="icon-alerttriangle" {...props} />,
  Eye: (props: any) => <span data-testid="icon-eye" {...props} />,
  CheckCircle: (props: any) => <span data-testid="icon-checkcircle" {...props} />,
  Paintbrush: (props: any) => <span data-testid="icon-paintbrush" {...props} />,
  ArrowRight: (props: any) => <span data-testid="icon-arrowright" {...props} />,
}));

import { PlotHoleCard } from '@/components/story-brain/plot-hole-card';

function makePlotHole(overrides: Partial<PlotHole> = {}): PlotHole {
  return {
    id: 'ph-1',
    type: 'plot_hole',
    severity: 'high',
    title: 'Missing Character Return',
    description: 'Alice disappeared after chapter 3 and never returned.',
    relatedEntityIds: ['e-1'],
    chapterIds: ['ch-3'],
    plotHoleType: 'character_disappearance',
    suggestedChapterIndex: null,
    narrativeImpact: 75,
    ...overrides,
  };
}

function makeResolution(overrides: Partial<InconsistencyResolution> = {}): InconsistencyResolution {
  return {
    inconsistencyId: 'ph-1',
    action: 'correct',
    resolvedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('PlotHoleCard', () => {
  const defaultProps = {
    plotHole: makePlotHole(),
    onResolve: vi.fn(),
    onUnresolve: vi.fn(),
  };

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title, description, and impact score', () => {
    render(<PlotHoleCard {...defaultProps} />);
    expect(screen.getByText('Missing Character Return')).toBeDefined();
    expect(screen.getByText(/Alice disappeared/)).toBeDefined();
    expect(screen.getByText(/Impact: 75/)).toBeDefined();
  });

  it('shows action buttons when unresolved', () => {
    render(<PlotHoleCard {...defaultProps} />);
    expect(screen.getByText('Ignore')).toBeDefined();
    expect(screen.getByText('Fix')).toBeDefined();
    expect(screen.getByText('Intentional')).toBeDefined();
  });

  it('calls onResolve with correct action when button clicked', () => {
    const onResolve = vi.fn();
    render(<PlotHoleCard {...defaultProps} onResolve={onResolve} />);

    fireEvent.click(screen.getByText('Ignore'));
    expect(onResolve).toHaveBeenCalledWith('ph-1', 'ignore');

    fireEvent.click(screen.getByText('Fix'));
    expect(onResolve).toHaveBeenCalledWith('ph-1', 'correct');

    fireEvent.click(screen.getByText('Intentional'));
    expect(onResolve).toHaveBeenCalledWith('ph-1', 'intentional');
  });

  it('shows Undo when resolved', () => {
    const resolution = makeResolution();
    render(<PlotHoleCard {...defaultProps} resolution={resolution} />);
    expect(screen.getByText('Undo')).toBeDefined();
    // Action buttons should not be present
    expect(screen.queryByText('Ignore')).toBeNull();
    expect(screen.queryByText('Fix')).toBeNull();
    expect(screen.queryByText('Intentional')).toBeNull();
  });

  it('calls onUnresolve when Undo clicked', () => {
    const onUnresolve = vi.fn();
    const resolution = makeResolution();
    render(<PlotHoleCard {...defaultProps} resolution={resolution} onUnresolve={onUnresolve} />);
    fireEvent.click(screen.getByText('Undo'));
    expect(onUnresolve).toHaveBeenCalledWith('ph-1');
  });

  it('shows "Go to Ch.N" when suggestedChapterIndex provided', () => {
    const plotHole = makePlotHole({ suggestedChapterIndex: 4 });
    const onGoToChapter = vi.fn();
    render(<PlotHoleCard {...defaultProps} plotHole={plotHole} onGoToChapter={onGoToChapter} />);
    // suggestedChapterIndex = 4 => Ch.5
    expect(screen.getByText(/Go to Ch\.5/)).toBeDefined();
  });

  it('calls onGoToChapter when Go button clicked', () => {
    const onGoToChapter = vi.fn();
    const plotHole = makePlotHole({ suggestedChapterIndex: 4 });
    render(<PlotHoleCard {...defaultProps} plotHole={plotHole} onGoToChapter={onGoToChapter} />);
    fireEvent.click(screen.getByText(/Go to Ch\.5/));
    expect(onGoToChapter).toHaveBeenCalledWith(4);
  });

  it('does not show Go button when suggestedChapterIndex is null', () => {
    const plotHole = makePlotHole({ suggestedChapterIndex: null });
    render(<PlotHoleCard {...defaultProps} plotHole={plotHole} />);
    expect(screen.queryByText(/Go to Ch/)).toBeNull();
  });

  it('does not show Go button when onGoToChapter not provided', () => {
    const plotHole = makePlotHole({ suggestedChapterIndex: 2 });
    render(<PlotHoleCard {...defaultProps} plotHole={plotHole} />);
    expect(screen.queryByText(/Go to Ch/)).toBeNull();
  });

  it('impact level: high when narrativeImpact >= 70', () => {
    const plotHole = makePlotHole({ narrativeImpact: 85 });
    const { container } = render(<PlotHoleCard {...defaultProps} plotHole={plotHole} />);
    const impactSpan = screen.getByText(/Impact: 85/);
    expect(impactSpan.className).toContain('text-wax-600');
  });

  it('impact level: medium when narrativeImpact >= 40 and < 70', () => {
    const plotHole = makePlotHole({ narrativeImpact: 50 });
    const { container } = render(<PlotHoleCard {...defaultProps} plotHole={plotHole} />);
    const impactSpan = screen.getByText(/Impact: 50/);
    expect(impactSpan.className).toContain('text-brass-600');
  });

  it('impact level: low when narrativeImpact < 40', () => {
    const plotHole = makePlotHole({ narrativeImpact: 25 });
    const { container } = render(<PlotHoleCard {...defaultProps} plotHole={plotHole} />);
    const impactSpan = screen.getByText(/Impact: 25/);
    expect(impactSpan.className).toContain('text-sepia-600');
  });
});
