import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

afterEach(() => {
  cleanup();
});

// Explicit named exports — a Proxy-based lucide mock crashes Vitest workers.
vi.mock('lucide-react', () => ({
  Check: () => <span data-testid="icon-check" />,
  CornerDownRight: () => <span data-testid="icon-corner" />,
  RotateCcw: () => <span data-testid="icon-rotate" />,
  Trash2: () => <span data-testid="icon-trash" />,
  Pencil: () => <span data-testid="icon-pencil" />,
}));

const confirmMock = vi.fn().mockResolvedValue(true);
vi.mock('@/components/antiquarian', () => ({
  useConfirm: () => ({ confirm: confirmMock }),
}));

import { CommentCard } from '@/components/comments/CommentCard';
import type { ManuscriptComment } from '@/lib/types/comment';

function makeComment(overrides: Partial<ManuscriptComment> = {}): ManuscriptComment {
  return {
    id: 'c1',
    projectId: 'p1',
    chapterId: 'ch1',
    startOffset: 4,
    endOffset: 8,
    quote: 'rain',
    prefix: 'The ',
    suffix: ' fell',
    text: 'Lovely imagery here',
    replies: [],
    resolved: false,
    orphaned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const noop = () => {};

describe('CommentCard', () => {
  it('renders the quote excerpt and comment text', () => {
    render(
      <CommentCard comment={makeComment()} onResolveToggle={noop} onDelete={noop} onReply={noop} onEdit={noop} />,
    );
    expect(screen.getByText('rain')).toBeTruthy();
    expect(screen.getByText('Lovely imagery here')).toBeTruthy();
  });

  it('truncates long quotes', () => {
    const long = 'x'.repeat(120);
    render(
      <CommentCard
        comment={makeComment({ quote: long })}
        onResolveToggle={noop}
        onDelete={noop}
        onReply={noop} onEdit={noop}
      />,
    );
    expect(screen.getByText(`${'x'.repeat(80)}…`)).toBeTruthy();
  });

  it('calls onResolveToggle with the flipped state', () => {
    const onResolveToggle = vi.fn();
    render(
      <CommentCard
        comment={makeComment()}
        onResolveToggle={onResolveToggle}
        onDelete={noop}
        onReply={noop} onEdit={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(onResolveToggle).toHaveBeenCalledWith('c1', true);
  });

  it('offers unresolve for resolved comments and hides the reply input', () => {
    const onResolveToggle = vi.fn();
    render(
      <CommentCard
        comment={makeComment({ resolved: true })}
        onResolveToggle={onResolveToggle}
        onDelete={noop}
        onReply={noop} onEdit={noop}
      />,
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(onResolveToggle).toHaveBeenCalledWith('c1', false);
  });

  it('submits a reply and clears the input', () => {
    const onReply = vi.fn();
    render(
      <CommentCard comment={makeComment()} onResolveToggle={noop} onDelete={noop} onReply={onReply} onEdit={noop} />,
    );
    const input = screen.getByRole('textbox', { name: 'Reply to comment' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Agreed!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    expect(onReply).toHaveBeenCalledWith('c1', 'Agreed!');
    expect(input.value).toBe('');
  });

  it('renders existing replies', () => {
    render(
      <CommentCard
        comment={makeComment({
          replies: [{ id: 'r1', text: 'A reply', createdAt: '2026-01-02T00:00:00.000Z' }],
        })}
        onResolveToggle={noop}
        onDelete={noop}
        onReply={noop} onEdit={noop}
      />,
    );
    expect(screen.getByText('A reply')).toBeTruthy();
  });

  it('deletes after confirmation', async () => {
    const onDelete = vi.fn();
    render(
      <CommentCard comment={makeComment()} onResolveToggle={noop} onDelete={onDelete} onReply={noop} onEdit={noop} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('c1'));
    expect(confirmMock).toHaveBeenCalled();
  });
});

it("edits the comment text and calls onEdit", () => {
  const onEdit = vi.fn();
  render(
    <CommentCard comment={makeComment()} onResolveToggle={noop} onDelete={noop} onReply={noop} onEdit={onEdit} />,
  );
  fireEvent.click(screen.getByLabelText("Edit comment"));
  const box = screen.getByLabelText("Edit comment", { selector: "textarea" });
  fireEvent.change(box, { target: { value: "Sharper note" } });
  fireEvent.click(screen.getByText("Save"));
  expect(onEdit).toHaveBeenCalledWith("c1", "Sharper note");
});
