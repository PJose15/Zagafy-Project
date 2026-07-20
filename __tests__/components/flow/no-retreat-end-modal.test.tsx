import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NoRetreatEndModal } from '@/components/flow/no-retreat-end-modal';

// Mock motion to render children immediately
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, whileHover, ...rest } = props;
      const htmlProps: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (typeof v !== 'object' && typeof v !== 'function') {
          htmlProps[k] = v;
        }
      }
      return <div {...htmlProps}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

describe('NoRetreatEndModal', () => {
  const defaultProps = {
    open: true,
    stats: { wordsWritten: 42, sessionDurationMs: 180000 },
    onSave: vi.fn(),
    onBurn: vi.fn(),
  };

  afterEach(() => {
    cleanup();
  });

  it('renders when open', () => {
    render(<NoRetreatEndModal {...defaultProps} />);
    expect(screen.getByText('End No-Retreat Session')).toBeDefined();
  });

  it('does not render when closed', () => {
    render(<NoRetreatEndModal {...defaultProps} open={false} />);
    expect(screen.queryByText('End No-Retreat Session')).toBeNull();
  });

  it('displays word count', () => {
    render(<NoRetreatEndModal {...defaultProps} />);
    expect(screen.getByText('Words Written')).toBeDefined();
    // Use getAllByText since "42" may match multiple nodes
    const wordCountElements = screen.getAllByText('42');
    expect(wordCountElements.length).toBeGreaterThan(0);
  });

  it('displays formatted duration in minutes', () => {
    render(<NoRetreatEndModal {...defaultProps} />);
    expect(screen.getByText('3m 0s')).toBeDefined();
    expect(screen.getByText('Duration')).toBeDefined();
  });

  it('displays seconds-only duration for short sessions', () => {
    render(<NoRetreatEndModal {...defaultProps} stats={{ wordsWritten: 5, sessionDurationMs: 45000 }} />);
    expect(screen.getByText('45s')).toBeDefined();
  });

  it('calls onSave when Save is clicked', () => {
    const onSave = vi.fn();
    render(<NoRetreatEndModal {...defaultProps} onSave={onSave} />);
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('arms on the first Burn click and only burns on the second', () => {
    const onBurn = vi.fn();
    render(<NoRetreatEndModal {...defaultProps} onBurn={onBurn} />);
    fireEvent.click(screen.getByText('Burn'));
    expect(onBurn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Burn it — I’m sure'));
    expect(onBurn).toHaveBeenCalledOnce();
  });

  it('has accessible dialog attributes', () => {
    render(<NoRetreatEndModal {...defaultProps} />);
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs.length).toBeGreaterThan(0);
    expect(dialogs[0].getAttribute('aria-modal')).toBe('true');
  });
});
