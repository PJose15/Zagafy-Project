import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

const { mockFetchPrompt, mockClearPrompt, mockScheduleAutosave, mockSaveNow } = vi.hoisted(() => ({
  mockFetchPrompt: vi.fn(),
  mockClearPrompt: vi.fn(),
  mockScheduleAutosave: vi.fn(),
  mockSaveNow: vi.fn(),
}));

vi.mock('motion/react', () => {
  const MockMotionDiv = React.forwardRef<HTMLDivElement, Record<string, unknown>>(
    function MockMotionDiv({ children, initial, animate, exit, transition, whileHover, whileTap, ...props }, ref) {
      return <div ref={ref as React.Ref<HTMLDivElement>} {...props as React.HTMLAttributes<HTMLDivElement>}>{children as React.ReactNode}</div>;
    }
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: { div: MockMotionDiv },
  };
});

vi.mock('@/hooks/use-micro-prompt', () => ({
  useMicroPrompt: vi.fn().mockReturnValue({
    prompt: null,
    isLoading: false,
    fetchPrompt: mockFetchPrompt,
    clearPrompt: mockClearPrompt,
  }),
}));

vi.mock('@/hooks/use-flow-autosave', () => ({
  useFlowAutosave: vi.fn().mockReturnValue({
    scheduleAutosave: mockScheduleAutosave,
    saveNow: mockSaveNow,
    initialContent: 'Initial text',
  }),
}));

vi.mock('@/hooks/use-scene-change', () => ({
  useSceneChange: vi.fn().mockReturnValue({
    isActive: false,
    canActivate: false,
    sceneState: null,
    remainingSeconds: 0,
    isExpired: false,
    extensionsLeft: 0,
    depart: vi.fn(),
    grantExtension: vi.fn(),
    returnToOriginal: vi.fn(),
    cancelSceneChange: vi.fn(),
  }),
}));

vi.mock('@/lib/types/scene-change', () => ({
  readSceneChangeReturn: vi.fn().mockReturnValue(null),
  clearSceneChangeReturn: vi.fn(),
}));

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

vi.mock('@/hooks/use-braindump', () => ({
  useBraindump: vi.fn().mockReturnValue({
    panelOpen: false,
    historyOpen: false,
    speech: {
      isSupported: true,
      permissionState: 'unknown',
      isRecording: false,
      isPaused: false,
      finalTranscript: '',
      interimTranscript: '',
      elapsedSeconds: 0,
      language: 'en-US',
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      setLanguage: vi.fn(),
      reset: vi.fn(),
    },
    isStopped: false,
    isPolishing: false,
    polishError: null,
    polishProgress: '',
    openPanel: vi.fn(),
    closePanel: vi.fn(),
    openHistory: vi.fn(),
    closeHistory: vi.fn(),
    insertAsIs: vi.fn(),
    polishAndInsert: vi.fn(),
    reRecord: vi.fn(),
    reInsertFromHistory: vi.fn(),
    rePolishFromHistory: vi.fn(),
    deleteHistoryEntry: vi.fn(),
    history: [],
  }),
}));

import { StoryProvider } from '@/lib/store';
import { SessionProvider } from '@/lib/session';
import { ToastProvider } from '@/components/toast';
import { ConfirmProvider } from '@/components/confirm-dialog';
import { FlowEditor } from '@/components/flow/flow-editor';
import { useBraindump } from '@/hooks/use-braindump';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <StoryProvider>
      <SessionProvider>
        <ToastProvider>
          <ConfirmProvider>
            {children}
          </ConfirmProvider>
        </ToastProvider>
      </SessionProvider>
    </StoryProvider>
  );
}

async function renderEditor(onExit = vi.fn()) {
  const result = render(
    <FlowEditor chapterId="ch-1" onExit={onExit} />,
    { wrapper }
  );
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/start writing/i)).toBeDefined();
  });
  return result;
}

describe('FlowEditor', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders textarea', async () => {
    await renderEditor();
    const textarea = screen.getByPlaceholderText(/start writing/i);
    expect(textarea).toBeDefined();
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('blocks Backspace key (preventDefault called)', async () => {
    await renderEditor();
    const textarea = screen.getByPlaceholderText(/start writing/i);
    const prevented = fireEvent.keyDown(textarea, { key: 'Backspace' });
    expect(prevented).toBe(false);
  });

  it('blocks Delete key', async () => {
    await renderEditor();
    const textarea = screen.getByPlaceholderText(/start writing/i);
    const prevented = fireEvent.keyDown(textarea, { key: 'Delete' });
    expect(prevented).toBe(false);
  });

  it('blocks Ctrl+Z (undo)', async () => {
    await renderEditor();
    const textarea = screen.getByPlaceholderText(/start writing/i);
    const prevented = fireEvent.keyDown(textarea, { key: 'z', ctrlKey: true });
    expect(prevented).toBe(false);
  });

  it('blocks Ctrl+X (cut)', async () => {
    await renderEditor();
    const textarea = screen.getByPlaceholderText(/start writing/i);
    const prevented = fireEvent.keyDown(textarea, { key: 'x', ctrlKey: true });
    expect(prevented).toBe(false);
  });

  it('allows normal character typing', async () => {
    await renderEditor();
    const textarea = screen.getByPlaceholderText(/start writing/i);
    const prevented = fireEvent.keyDown(textarea, { key: 'a' });
    expect(prevented).toBe(true);
  });

  it('shows "Exit Flow" button', async () => {
    await renderEditor();
    expect(screen.getByText('Exit Flow')).toBeDefined();
  });

  it('calls onExit when Exit Flow button is clicked (empty content)', async () => {
    const { useFlowAutosave } = await import('@/hooks/use-flow-autosave');
    vi.mocked(useFlowAutosave).mockReturnValueOnce({
      scheduleAutosave: mockScheduleAutosave,
      saveNow: mockSaveNow,
      initialContent: '',
    });
    const onExit = vi.fn();
    await renderEditor(onExit);
    fireEvent.click(screen.getByText('Exit Flow'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('shows word count', async () => {
    await renderEditor();
    expect(screen.getByText('2 words')).toBeDefined();
  });

  it('renders mic button for voice braindump', async () => {
    await renderEditor();
    expect(screen.getByLabelText('Voice braindump')).toBeDefined();
  });

  it('renders history button for braindump history', async () => {
    await renderEditor();
    expect(screen.getByLabelText('Braindump history')).toBeDefined();
  });

  it('history button calls openHistory when clicked', async () => {
    const mockBraindump = vi.mocked(useBraindump);
    const openHistory = vi.fn();
    const current = mockBraindump.mock.results[0]?.value ?? {};
    mockBraindump.mockReturnValue({
      ...current,
      openHistory,
    });

    await renderEditor();
    fireEvent.click(screen.getByLabelText('Braindump history'));
    expect(openHistory).toHaveBeenCalledTimes(1);
  });

  it('blocks Ctrl+Backspace (delete word backwards)', async () => {
    await renderEditor();
    const textarea = screen.getByPlaceholderText(/start writing/i);
    const prevented = fireEvent.keyDown(textarea, { key: 'Backspace', ctrlKey: true });
    expect(prevented).toBe(false);
  });

  it('blocks Ctrl+Delete (delete word forwards)', async () => {
    await renderEditor();
    const textarea = screen.getByPlaceholderText(/start writing/i);
    const prevented = fireEvent.keyDown(textarea, { key: 'Delete', ctrlKey: true });
    expect(prevented).toBe(false);
  });

  it('blocks Meta+Z (undo on Mac)', async () => {
    await renderEditor();
    const textarea = screen.getByPlaceholderText(/start writing/i);
    const prevented = fireEvent.keyDown(textarea, { key: 'z', metaKey: true });
    expect(prevented).toBe(false);
  });

  it('blocks Meta+X (cut on Mac)', async () => {
    await renderEditor();
    const textarea = screen.getByPlaceholderText(/start writing/i);
    const prevented = fireEvent.keyDown(textarea, { key: 'x', metaKey: true });
    expect(prevented).toBe(false);
  });

  it('allows Enter key', async () => {
    await renderEditor();
    const textarea = screen.getByPlaceholderText(/start writing/i);
    const prevented = fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(prevented).toBe(true);
  });

  it('allows space key', async () => {
    await renderEditor();
    const textarea = screen.getByPlaceholderText(/start writing/i);
    const prevented = fireEvent.keyDown(textarea, { key: ' ' });
    expect(prevented).toBe(true);
  });

  // ── Select-range-and-type bypass of the destructive-key block ──
  // initialContent is 'Initial text' (12 chars) → session start offset 12.

  it('blocks printable keys over a selection reaching into pre-session text', async () => {
    await renderEditor();
    const textarea = screen.getByPlaceholderText(/start writing/i) as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 5);
    const prevented = fireEvent.keyDown(textarea, { key: 'a' });
    expect(prevented).toBe(false);
  });

  it('allows printable keys over a selection entirely within session text', async () => {
    await renderEditor();
    const textarea = screen.getByPlaceholderText(/start writing/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Initial text plus more' } });
    textarea.setSelectionRange(13, 17);
    const prevented = fireEvent.keyDown(textarea, { key: 'a' });
    expect(prevented).toBe(true);
  });

  // ── No-Retreat Burn restores the armed snapshot, not a length slice ──

  it('Burn restores the exact session-start snapshot after mid-document edits', async () => {
    await renderEditor();
    const textarea = screen.getByPlaceholderText(/start writing/i) as HTMLTextAreaElement;

    // Arm no-retreat with 'Initial text' in the buffer.
    fireEvent.click(screen.getByLabelText('Enable No-Retreat Mode'));

    // Mid-document insertion breaks the old append-only slice() assumption.
    fireEvent.change(textarea, { target: { value: 'XX Initial text plus' } });

    // Disarm → end modal → armed Burn (two clicks).
    fireEvent.click(screen.getByLabelText('Disable No-Retreat Mode'));
    fireEvent.click(screen.getByText('Burn'));
    fireEvent.click(screen.getByText('Burn it — I’m sure'));

    expect(textarea.value).toBe('Initial text');
    expect(mockScheduleAutosave).toHaveBeenCalledWith('Initial text');
  });
});
