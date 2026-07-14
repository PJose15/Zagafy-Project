import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('@/lib/storage/dexie-db', () => ({
  migrateFromLocalStorage: vi.fn().mockResolvedValue(undefined),
  getAllChapterContents: vi.fn().mockResolvedValue(new Map()),
  putChapterContent: vi.fn().mockResolvedValue(undefined),
  getChapterContent: vi.fn().mockResolvedValue(undefined),
  deleteChapterContent: vi.fn().mockResolvedValue(undefined),
  getStory: vi.fn().mockResolvedValue(null),
  putStory: vi.fn().mockResolvedValue(undefined),
  clearAllStoryData: vi.fn().mockResolvedValue(undefined),
}));

import * as dexieDb from '@/lib/storage/dexie-db';
import { StoryProvider } from '@/lib/store';
import type { Chapter, StoryState } from '@/lib/store';

vi.mock('motion/react', () => {
  const MockMotionDiv = React.forwardRef<HTMLDivElement, Record<string, unknown>>(
    function MockMotionDiv({ children, initial, animate, exit, transition, ...props }, ref) {
      return <div ref={ref as React.Ref<HTMLDivElement>} {...props as React.HTMLAttributes<HTMLDivElement>}>{children as React.ReactNode}</div>;
    }
  );
  const MockMotionButton = React.forwardRef<HTMLButtonElement, Record<string, unknown>>(
    function MockMotionButton({ children, initial, animate, exit, transition, ...props }, ref) {
      return <button ref={ref as React.Ref<HTMLButtonElement>} {...props as React.ButtonHTMLAttributes<HTMLButtonElement>}>{children as React.ReactNode}</button>;
    }
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: { div: MockMotionDiv, button: MockMotionButton },
  };
});

vi.mock('lucide-react', () => ({
  BookOpen: () => <span data-testid="icon-book-open" />,
  X: () => <span data-testid="icon-x" />,
}));

import { ChapterSelectModal } from '@/components/flow/chapter-select-modal';

const testChapters: Chapter[] = [
  { id: 'ch-1', title: 'The Beginning', content: '', summary: 'How it all started' },
  { id: 'ch-2', title: 'The Journey', content: '', summary: 'On the road' },
  { id: 'ch-3', title: 'The End', content: '', summary: '' },
];

function setupLocalStorage(chapters: Chapter[]) {
  const state: Partial<StoryState> = { chapters };
  vi.mocked(dexieDb.getStory).mockResolvedValue(state as Record<string, unknown>);
  const contentMap = new Map<string, string>();
  for (const ch of chapters) {
    contentMap.set(ch.id, ch.content);
  }
  vi.mocked(dexieDb.getAllChapterContents).mockResolvedValue(contentMap);
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <StoryProvider>{children}</StoryProvider>;
}

describe('ChapterSelectModal', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders chapter list heading', async () => {
    setupLocalStorage(testChapters);
    render(
      <ChapterSelectModal onSelect={vi.fn()} onClose={vi.fn()} />,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText('Choose a chapter')).toBeDefined();
    });
  });

  it('shows "No chapters" message when chapters array is empty', async () => {
    setupLocalStorage([]);
    render(
      <ChapterSelectModal onSelect={vi.fn()} onClose={vi.fn()} />,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText(/No chapters yet/)).toBeDefined();
    });
  });

  it('renders chapter titles', async () => {
    setupLocalStorage(testChapters);
    render(
      <ChapterSelectModal onSelect={vi.fn()} onClose={vi.fn()} />,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText(/The Beginning/)).toBeDefined();
    });
    expect(screen.getByText(/The Journey/)).toBeDefined();
    expect(screen.getByText(/The End/)).toBeDefined();
  });

  it('clicking a chapter calls onSelect with chapter ID', async () => {
    setupLocalStorage(testChapters);
    const onSelect = vi.fn();
    render(
      <ChapterSelectModal onSelect={onSelect} onClose={vi.fn()} />,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText(/The Journey/)).toBeDefined();
    });
    screen.getByText(/The Journey/).click();
    expect(onSelect).toHaveBeenCalledWith('ch-2');
  });

  it('close button calls onClose', async () => {
    setupLocalStorage(testChapters);
    const onClose = vi.fn();
    render(
      <ChapterSelectModal onSelect={vi.fn()} onClose={onClose} />,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Close')).toBeDefined();
    });
    screen.getByLabelText('Close').click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
