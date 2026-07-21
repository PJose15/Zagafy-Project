import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import type { CoachingInsight } from '@/lib/story-coach/types';

// Mock motion/react
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, exit, transition, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
}));

// Mock lucide-react icons as simple spans
vi.mock('lucide-react', () => ({
  X: (props: any) => <span data-testid="icon-x" {...props} />,
  RefreshCw: (props: any) => <span data-testid="icon-refresh" {...props} />,
  Lightbulb: (props: any) => <span data-testid="icon-lightbulb" {...props} />,
}));

// Mock sub-components
vi.mock('@/components/story-coach/coaching-insight-card', () => ({
  CoachingInsightCard: ({ insight, onDismiss }: any) => (
    <div data-testid={`insight-${insight.id}`}>
      <span>{insight.observation}</span>
      <button onClick={onDismiss} data-testid={`dismiss-${insight.id}`}>Dismiss</button>
    </div>
  ),
}));

vi.mock('@/components/story-coach/coach-lens-filter', () => ({
  CoachLensFilter: ({ activeLens, onChange }: any) => (
    <div data-testid="lens-filter">
      <button onClick={() => onChange('tension')} data-testid="lens-tension">Tension</button>
      <button onClick={() => onChange('pacing')} data-testid="lens-pacing">Pacing</button>
      <button onClick={() => onChange('all')} data-testid="lens-all">All</button>
      <span data-testid="active-lens">{activeLens}</span>
    </div>
  ),
}));

import { CoachPanel } from '@/components/story-coach/coach-panel';
import type { StoryCoachError } from '@/hooks/use-story-coach';

function makeInsight(overrides: Partial<CoachingInsight> = {}): CoachingInsight {
  return {
    id: 'i-1',
    lens: 'tension',
    observation: 'Low tension in middle section',
    suggestion: 'Add a conflict element',
    priority: 'high',
    ...overrides,
  };
}

describe('CoachPanel', () => {
  const defaultProps = {
    insights: [] as CoachingInsight[],
    isLoading: false,
    error: null as StoryCoachError | null,
    onRefresh: vi.fn(),
    onDismiss: vi.fn(),
    onClose: vi.fn(),
  };

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Story Coach header', () => {
    render(<CoachPanel {...defaultProps} />);
    expect(screen.getByText('Story Coach')).toBeDefined();
  });

  it('renders the lens filter', () => {
    render(<CoachPanel {...defaultProps} />);
    expect(screen.getByTestId('lens-filter')).toBeDefined();
  });

  it('shows empty state when no insights, not loading, and no error', () => {
    render(<CoachPanel {...defaultProps} />);
    expect(screen.getByText('No insights yet. Click refresh to analyze your chapter.')).toBeDefined();
  });

  it('shows loading state when isLoading is true and no insights', () => {
    render(<CoachPanel {...defaultProps} isLoading={true} />);
    expect(screen.getByText('Analyzing your chapter...')).toBeDefined();
  });

  it('shows a translated error message when an error code is present', () => {
    render(<CoachPanel {...defaultProps} error="apiError" />);
    expect(screen.getByText("The coach couldn't analyze this chapter. Please try again.")).toBeDefined();
  });

  it('shows the network error copy for networkError', () => {
    render(<CoachPanel {...defaultProps} error="networkError" />);
    expect(screen.getByText("Couldn't reach the story coach. Check your connection and try again.")).toBeDefined();
  });

  it('renders insight cards for each insight', () => {
    const insights = [
      makeInsight({ id: 'i-1', observation: 'Obs 1' }),
      makeInsight({ id: 'i-2', observation: 'Obs 2', priority: 'low' }),
    ];
    render(<CoachPanel {...defaultProps} insights={insights} />);
    expect(screen.getByTestId('insight-i-1')).toBeDefined();
    expect(screen.getByTestId('insight-i-2')).toBeDefined();
  });

  it('sorts insights by priority: high before medium before low', () => {
    const insights = [
      makeInsight({ id: 'low', priority: 'low', observation: 'Low pri' }),
      makeInsight({ id: 'high', priority: 'high', observation: 'High pri' }),
      makeInsight({ id: 'med', priority: 'medium', observation: 'Med pri' }),
    ];
    const { container } = render(<CoachPanel {...defaultProps} insights={insights} />);
    const cards = container.querySelectorAll('[data-testid^="insight-"]');
    expect(cards[0].getAttribute('data-testid')).toBe('insight-high');
    expect(cards[1].getAttribute('data-testid')).toBe('insight-med');
    expect(cards[2].getAttribute('data-testid')).toBe('insight-low');
  });

  it('calls onRefresh when refresh button is clicked', () => {
    const onRefresh = vi.fn();
    render(<CoachPanel {...defaultProps} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByLabelText('Refresh insights'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables refresh button when loading', () => {
    render(<CoachPanel {...defaultProps} isLoading={true} />);
    const btn = screen.getByLabelText('Refresh insights');
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<CoachPanel {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close coach panel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss with insight id when dismiss button clicked', () => {
    const onDismiss = vi.fn();
    const insights = [makeInsight({ id: 'i-42' })];
    render(<CoachPanel {...defaultProps} insights={insights} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('dismiss-i-42'));
    expect(onDismiss).toHaveBeenCalledWith('i-42');
  });

  it('filters insights by lens selection', () => {
    const insights = [
      makeInsight({ id: 'i-t', lens: 'tension' }),
      makeInsight({ id: 'i-p', lens: 'pacing' }),
    ];
    render(<CoachPanel {...defaultProps} insights={insights} />);

    // Initially shows all (default lens is 'all')
    expect(screen.getByTestId('insight-i-t')).toBeDefined();
    expect(screen.getByTestId('insight-i-p')).toBeDefined();

    // Click tension filter
    fireEvent.click(screen.getByTestId('lens-tension'));
    expect(screen.getByTestId('insight-i-t')).toBeDefined();
    expect(screen.queryByTestId('insight-i-p')).toBeNull();
  });

  it('shows all insights again after selecting "all" lens', () => {
    const insights = [
      makeInsight({ id: 'i-t', lens: 'tension' }),
      makeInsight({ id: 'i-p', lens: 'pacing' }),
    ];
    render(<CoachPanel {...defaultProps} insights={insights} />);

    // Filter to tension only
    fireEvent.click(screen.getByTestId('lens-tension'));
    expect(screen.queryByTestId('insight-i-p')).toBeNull();

    // Back to all
    fireEvent.click(screen.getByTestId('lens-all'));
    expect(screen.getByTestId('insight-i-t')).toBeDefined();
    expect(screen.getByTestId('insight-i-p')).toBeDefined();
  });

  it('does not show empty state when loading with existing insights', () => {
    const insights = [makeInsight()];
    render(<CoachPanel {...defaultProps} insights={insights} isLoading={true} />);
    expect(screen.queryByText('No insights yet.')).toBeNull();
    expect(screen.queryByText('Analyzing your chapter...')).toBeNull();
  });
});
