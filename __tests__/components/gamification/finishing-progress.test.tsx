import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import type { FinishingEngineState } from '@/lib/types/gamification';

vi.mock('lucide-react', () => ({
  Compass: (props: any) => <span data-testid="icon-compass" {...props} />,
}));

vi.mock('@/components/antiquarian', () => ({
  DecorativeDivider: () => <hr />,
}));

import { FinishingProgress } from '@/components/gamification/finishing-progress';

const makeFinishing = (overrides: Partial<FinishingEngineState> = {}): FinishingEngineState => ({
  currentPhase: 'midpoint',
  overallProgress: 45,
  milestones: [],
  nextSuggestion: 'Try raising the stakes in this scene.',
  ...overrides,
});

describe('FinishingProgress', () => {
  afterEach(cleanup);

  it('renders progress percentage', () => {
    render(<FinishingProgress finishing={makeFinishing({ overallProgress: 45 })} />);

    expect(screen.getByText('45%')).toBeDefined();
  });

  it('shows all 6 phase labels', () => {
    render(<FinishingProgress finishing={makeFinishing()} />);

    expect(screen.getByText('Setup')).toBeDefined();
    expect(screen.getByText('Rising')).toBeDefined();
    expect(screen.getByText('Midpoint')).toBeDefined();
    expect(screen.getByText('Climax')).toBeDefined();
    expect(screen.getByText('Falling')).toBeDefined();
    expect(screen.getByText('Resolution')).toBeDefined();
  });

  it('highlights current phase', () => {
    render(<FinishingProgress finishing={makeFinishing({ currentPhase: 'climax' })} />);

    // The "Climax" label container should have the highlighted style
    const climaxAbbr = screen.getByText('Climax');
    const container = climaxAbbr.closest('div');
    expect(container?.className).toContain('font-semibold');

    // A non-current phase should not be highlighted
    const risingAbbr = screen.getByText('Rising');
    const risingContainer = risingAbbr.closest('div');
    expect(risingContainer?.className).toContain('text-sepia-600');
  });

  it('shows next suggestion text', () => {
    render(<FinishingProgress finishing={makeFinishing({ nextSuggestion: 'Introduce a plot twist.' })} />);

    expect(screen.getByText(/Introduce a plot twist/)).toBeDefined();
  });

  it('has accessible progressbar with aria attributes', () => {
    render(<FinishingProgress finishing={makeFinishing({ overallProgress: 60 })} />);

    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('60');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-label')).toContain('60%');
  });

  it('handles unknown phase by defaulting to setup index', () => {
    const finishing = makeFinishing({ currentPhase: 'unknown-phase' as any });
    render(<FinishingProgress finishing={finishing} />);

    // Should not crash; progressbar should still render
    const bar = screen.getByRole('progressbar');
    expect(bar).toBeDefined();

    // The aria-label should mention "Setup" as the current phase
    expect(bar.getAttribute('aria-label')).toContain('Setup');
  });
});
