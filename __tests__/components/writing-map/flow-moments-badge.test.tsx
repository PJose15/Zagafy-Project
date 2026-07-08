import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { FlowMomentsBadge } from '@/components/writing-map/flow-moments-badge';

afterEach(cleanup);

describe('FlowMomentsBadge', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(<FlowMomentsBadge count={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders badge with count when > 0', () => {
    const { getByTestId } = render(<FlowMomentsBadge count={3} />);
    const badge = getByTestId('flow-moments-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain('3');
  });

  it('shows singular title for count=1', () => {
    const { getByTestId } = render(<FlowMomentsBadge count={1} />);
    const badge = getByTestId('flow-moments-badge');
    expect(badge.getAttribute('title')).toBe('1 flow moment detected');
  });

  it('shows plural title for count>1', () => {
    const { getByTestId } = render(<FlowMomentsBadge count={5} />);
    const badge = getByTestId('flow-moments-badge');
    expect(badge.getAttribute('title')).toBe('5 flow moments detected');
  });

  it('uses sm size by default', () => {
    const { getByTestId } = render(<FlowMomentsBadge count={2} />);
    const badge = getByTestId('flow-moments-badge');
    expect(badge.className).toContain('text-xs');
  });

  it('uses md size when specified', () => {
    const { getByTestId } = render(<FlowMomentsBadge count={2} size="md" />);
    const badge = getByTestId('flow-moments-badge');
    expect(badge.className).toContain('text-sm');
  });

  it('has brass (antiquarian) styling', () => {
    const { getByTestId } = render(<FlowMomentsBadge count={1} />);
    const badge = getByTestId('flow-moments-badge');
    expect(badge.className).toContain('bg-brass-300/30');
    expect(badge.className).toContain('text-brass-800');
  });

  it('renders large count correctly', () => {
    const { getByTestId } = render(<FlowMomentsBadge count={42} />);
    const badge = getByTestId('flow-moments-badge');
    expect(badge.textContent).toContain('42');
  });
});
