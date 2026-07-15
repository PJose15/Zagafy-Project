import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SceneChangeBanner } from '@/components/flow/scene-change-banner';

describe('SceneChangeBanner', () => {
  const defaultProps = {
    originalChapterTitle: 'Chapter One',
    remainingSeconds: 300,
    isExpired: false,
    extensionsLeft: 3,
    onReturn: vi.fn(),
    onExtend: vi.fn(),
  };

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders original chapter title', () => {
    render(<SceneChangeBanner {...defaultProps} />);
    expect(screen.getByText('Chapter One')).toBeDefined();
  });

  it('formats countdown as mm:ss', () => {
    render(<SceneChangeBanner {...defaultProps} remainingSeconds={125} />);
    expect(screen.getByText('02:05')).toBeDefined();
  });

  it('shows "Return now" button', () => {
    render(<SceneChangeBanner {...defaultProps} />);
    const btn = screen.getByText('Return now');
    expect(btn).toBeDefined();
    btn.click();
    expect(defaultProps.onReturn).toHaveBeenCalledTimes(1);
  });

  it('shows "+10 min" button when extensions remain', () => {
    render(<SceneChangeBanner {...defaultProps} extensionsLeft={2} />);
    const btn = screen.getByText('+10 min');
    expect(btn).toBeDefined();
    btn.click();
    expect(defaultProps.onExtend).toHaveBeenCalledTimes(1);
  });

  it('hides "+10 min" button and shows message at max extensions', () => {
    render(<SceneChangeBanner {...defaultProps} extensionsLeft={0} />);
    expect(screen.queryByText('+10 min')).toBeNull();
    expect(screen.getByText('(no more extensions)')).toBeDefined();
  });

  it('shows expired state with wax styling', () => {
    const { container } = render(
      <SceneChangeBanner {...defaultProps} isExpired={true} remainingSeconds={0} />
    );
    const banner = container.firstElementChild as HTMLElement;
    expect(banner.className).toContain('bg-wax-500/10');
  });

  it('shows expired message', () => {
    render(
      <SceneChangeBanner {...defaultProps} isExpired={true} remainingSeconds={0} />
    );
    expect(screen.getByText(/Time's up/)).toBeDefined();
  });

  it('hides +10 min button when expired', () => {
    render(
      <SceneChangeBanner {...defaultProps} isExpired={true} remainingSeconds={0} extensionsLeft={2} />
    );
    expect(screen.queryByText('+10 min')).toBeNull();
  });

  it('has role="status"', () => {
    render(<SceneChangeBanner {...defaultProps} />);
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('formats zero seconds as 00:00', () => {
    render(<SceneChangeBanner {...defaultProps} remainingSeconds={0} />);
    expect(screen.getByText('00:00')).toBeDefined();
  });
});
