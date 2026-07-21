import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

const { mockConfirm, mockAddVersion } = vi.hoisted(() => ({
  mockConfirm: vi.fn().mockResolvedValue(true),
  mockAddVersion: vi.fn().mockResolvedValue(undefined),
}));

// Mock motion to render children immediately
vi.mock('motion/react', () => ({
  motion: {
    div: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
      function MockMotionDiv({ children, ...props }, ref) {
        const htmlProps: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(props)) {
          if (typeof v !== 'object' && typeof v !== 'function') {
            htmlProps[k] = v;
          }
        }
        return <div ref={ref} {...htmlProps}>{children as React.ReactNode}</div>;
      },
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@/components/antiquarian', () => ({
  InkStampButton: ({
    children,
    icon,
    variant,
    size,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  ),
  ParchmentInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/antiquarian/parchment-modal', () => ({
  useConfirm: () => ({ confirm: mockConfirm }),
}));

vi.mock('@/hooks/use-modal-hygiene', () => ({
  useModalHygiene: vi.fn(),
}));

vi.mock('@/lib/types/chapter-version', () => ({
  addVersion: mockAddVersion,
}));

import { FindReplaceDialog } from '@/components/manuscript/FindReplaceDialog';
import type { Chapter } from '@/lib/store';

const chapters: Chapter[] = [
  { id: 'a', title: 'Alpha', content: 'the cat sat on the mat', summary: '' },
  { id: 'b', title: 'Beta', content: 'the dog barked', summary: '' },
];

function renderDialog(props: Partial<React.ComponentProps<typeof FindReplaceDialog>> = {}) {
  const onApplyEdits = vi.fn();
  const utils = render(
    <FindReplaceDialog
      open
      onClose={vi.fn()}
      chapters={chapters}
      currentChapterId={null}
      onApplyEdits={onApplyEdits}
      {...props}
    />,
  );
  return { onApplyEdits, ...utils };
}

function typeQuery(query: string, replacement?: string) {
  fireEvent.change(screen.getByLabelText('Find query'), { target: { value: query } });
  if (replacement !== undefined) {
    fireEvent.change(screen.getByLabelText('Replacement text'), { target: { value: replacement } });
  }
}

describe('FindReplaceDialog', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockConfirm.mockResolvedValue(true);
  });

  it('finds matches across chapters', () => {
    renderDialog();
    typeQuery('the');
    expect(screen.getByText('Alpha')).toBeDefined();
    expect(screen.getByText('Beta')).toBeDefined();
  });

  it('replace-all applies edits to every matched chapter without exclusion', async () => {
    const { onApplyEdits } = renderDialog();
    typeQuery('the', 'a');
    fireEvent.click(screen.getByText('Replace all'));
    await waitFor(() => expect(onApplyEdits).toHaveBeenCalledTimes(1));
    const edits = onApplyEdits.mock.calls[0][0] as Array<{ chapterId: string; newContent: string }>;
    expect(edits.map(e => e.chapterId).sort()).toEqual(['a', 'b']);
  });

  // ── The chapter open in the manuscript editor is excluded from replace:
  // its edits live in local editForm state, so a store write would be
  // silently erased by the next Save. ──

  it('shows the exclusion notice when the edited chapter has matches', () => {
    renderDialog({ currentChapterId: 'a', excludedChapterId: 'a' });
    typeQuery('the');
    expect(
      screen.getByText('The chapter being edited is excluded from replace — save it first.'),
    ).toBeDefined();
  });

  it('does not show the exclusion notice when the edited chapter has no matches', () => {
    renderDialog({ currentChapterId: 'a', excludedChapterId: 'a' });
    typeQuery('dog');
    expect(
      screen.queryByText('The chapter being edited is excluded from replace — save it first.'),
    ).toBeNull();
  });

  it('disables the per-chapter replace button for the excluded chapter', () => {
    renderDialog({ currentChapterId: 'a', excludedChapterId: 'a' });
    typeQuery('the');
    const buttons = screen.getAllByText('Replace in this chapter') as HTMLButtonElement[];
    // Chapters render in manuscript order: Alpha (excluded) first, then Beta.
    expect(buttons).toHaveLength(2);
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(false);
  });

  it('replace-all skips the excluded chapter', async () => {
    const { onApplyEdits } = renderDialog({ currentChapterId: 'a', excludedChapterId: 'a' });
    typeQuery('the', 'a');
    fireEvent.click(screen.getByText('Replace all'));
    await waitFor(() => expect(onApplyEdits).toHaveBeenCalledTimes(1));
    const edits = onApplyEdits.mock.calls[0][0] as Array<{ chapterId: string; newContent: string }>;
    expect(edits.map(e => e.chapterId)).toEqual(['b']);
    expect(edits[0].newContent).toBe('a dog barked');
  });

  it('disables Replace all when every match is in the excluded chapter', () => {
    renderDialog({ currentChapterId: 'a', excludedChapterId: 'a' });
    typeQuery('cat');
    const button = screen.getByText('Replace all') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
