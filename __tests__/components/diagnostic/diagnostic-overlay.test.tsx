import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import React from 'react';

vi.mock('motion/react', () => {
  const MockMotionButton = React.forwardRef<HTMLButtonElement, Record<string, unknown>>(
    function MockMotionButton({ children, initial, animate, exit, transition, whileHover, whileTap, ...props }, ref) {
      return <button ref={ref as React.Ref<HTMLButtonElement>} {...props as React.ButtonHTMLAttributes<HTMLButtonElement>}>{children as React.ReactNode}</button>;
    }
  );
  const MockMotionDiv = React.forwardRef<HTMLDivElement, Record<string, unknown>>(
    function MockMotionDiv({ children, initial, animate, exit, transition, whileHover, whileTap, ...props }, ref) {
      return <div ref={ref as React.Ref<HTMLDivElement>} {...props as React.HTMLAttributes<HTMLDivElement>}>{children as React.ReactNode}</div>;
    }
  );
  const MockMotionP = React.forwardRef<HTMLParagraphElement, Record<string, unknown>>(
    function MockMotionP({ children, initial, animate, exit, transition, whileHover, whileTap, ...props }, ref) {
      return <p ref={ref as React.Ref<HTMLParagraphElement>} {...props as React.HTMLAttributes<HTMLParagraphElement>}>{children as React.ReactNode}</p>;
    }
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      div: MockMotionDiv,
      button: MockMotionButton,
      p: MockMotionP,
    },
  };
});

vi.mock('lucide-react', () => ({
  Eye: () => <span data-testid="icon-eye" />,
  Target: () => <span data-testid="icon-target" />,
  Compass: () => <span data-testid="icon-compass" />,
  BatteryLow: () => <span data-testid="icon-battery" />,
}));

const mockIncrementStreak = vi.fn().mockReturnValue(1);
const mockGetStreak = vi.fn().mockReturnValue(0);

vi.mock('@/lib/diagnostic-streak', () => ({
  incrementStreak: (...args: unknown[]) => mockIncrementStreak(...args),
  getStreak: (...args: unknown[]) => mockGetStreak(...args),
}));

import { SessionProvider, useSession } from '@/lib/session';
import { DiagnosticOverlay } from '@/components/diagnostic/diagnostic-overlay';

function renderOverlay() {
  return render(
    <SessionProvider>
      <DiagnosticOverlay />
    </SessionProvider>
  );
}

describe('DiagnosticOverlay', () => {
  beforeEach(() => {
    cleanup();
    // F5: completeDiagnostic stamps localStorage — clear it so the mount
    // effect in SessionProvider can't restore a gate from an earlier test.
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockIncrementStreak.mockReturnValue(1);
    mockGetStreak.mockReturnValue(0);
  });

  it('renders the heading "Before you begin..."', () => {
    renderOverlay();
    expect(screen.getByText('Before you begin...')).toBeDefined();
  });

  it('renders 4 block type cards', () => {
    renderOverlay();
    expect(screen.getByText('Fear')).toBeDefined();
    expect(screen.getByText('Perfectionism')).toBeDefined();
    expect(screen.getByText('Direction')).toBeDefined();
    expect(screen.getByText('Exhaustion')).toBeDefined();
  });

  it('renders card descriptions via aria-labels', () => {
    renderOverlay();
    expect(screen.getByLabelText(/Select Fear/)).toBeDefined();
    expect(screen.getByLabelText(/Select Perfectionism/)).toBeDefined();
    expect(screen.getByLabelText(/Select Direction/)).toBeDefined();
    expect(screen.getByLabelText(/Select Exhaustion/)).toBeDefined();
  });

  it('renders skip button', () => {
    renderOverlay();
    expect(screen.getByText('Skip check-in')).toBeDefined();
  });

  it('clicking a card sets block type and completes diagnostic', () => {
    vi.useFakeTimers();
    function TestHarness() {
      const { session } = useSession();
      return (
        <>
          <DiagnosticOverlay />
          <div data-testid="block-type">{session.blockType ?? 'null'}</div>
          <div data-testid="diagnostic-completed">{String(session.diagnosticCompleted)}</div>
          <div data-testid="diagnostic-skipped">{String(session.diagnosticSkipped)}</div>
        </>
      );
    }

    render(
      <SessionProvider>
        <TestHarness />
      </SessionProvider>
    );

    expect(screen.getByTestId('block-type').textContent).toBe('null');

    act(() => {
      screen.getByLabelText(/Select Fear/).click();
    });

    expect(screen.getByTestId('block-type').textContent).toBe('fear');
    expect(mockIncrementStreak).toHaveBeenCalled();

    // completeDiagnostic fires after 3s timeout
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByTestId('diagnostic-completed').textContent).toBe('true');
    expect(screen.getByTestId('diagnostic-skipped').textContent).toBe('false');
    vi.useRealTimers();
  });

  it('clicking skip completes diagnostic as skipped', () => {
    function TestHarness() {
      const { session } = useSession();
      return (
        <>
          <DiagnosticOverlay />
          <div data-testid="block-type">{session.blockType ?? 'null'}</div>
          <div data-testid="diagnostic-completed">{String(session.diagnosticCompleted)}</div>
          <div data-testid="diagnostic-skipped">{String(session.diagnosticSkipped)}</div>
        </>
      );
    }

    render(
      <SessionProvider>
        <TestHarness />
      </SessionProvider>
    );

    act(() => {
      screen.getByText('Skip check-in').click();
    });

    expect(screen.getByTestId('block-type').textContent).toBe('null');
    expect(screen.getByTestId('diagnostic-completed').textContent).toBe('true');
    expect(screen.getByTestId('diagnostic-skipped').textContent).toBe('true');
    expect(mockIncrementStreak).toHaveBeenCalled();
  });

  it('calls getStreak on mount', () => {
    renderOverlay();
    expect(mockGetStreak).toHaveBeenCalled();
  });

  it('displays streak when greater than 0', () => {
    mockGetStreak.mockReturnValue(5);
    renderOverlay();
    expect(screen.getByText(/Check-in streak: 5 days/)).toBeDefined();
  });

  it('does not display streak when 0', () => {
    mockGetStreak.mockReturnValue(0);
    renderOverlay();
    expect(screen.queryByText(/Check-in streak/)).toBeNull();
  });
});
