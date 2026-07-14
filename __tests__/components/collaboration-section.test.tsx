import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('lucide-react', () => ({
  Users: () => <span data-testid="icon-users" />,
  UserPlus: () => <span data-testid="icon-userplus" />,
  BookOpen: () => <span data-testid="icon-book" />,
  LogOut: () => <span data-testid="icon-logout" />,
  Trash2: () => <span data-testid="icon-trash" />,
  Loader2: () => <span data-testid="icon-loader" />,
}));

vi.mock('@/components/antiquarian', () => ({
  ParchmentCard: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  ParchmentInput: ({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) => (
    <input aria-label={label} {...props} />
  ),
  ParchmentSelect: ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props}>{children}</select>
  ),
  BrassButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  InkStampButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  useConfirm: () => ({ confirm: vi.fn(async () => true) }),
}));

vi.mock('@/components/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const mockGetSyncMeta = vi.fn(async (): Promise<unknown> => null);
vi.mock('@/lib/sync/sync-queue', () => ({
  getSyncMeta: () => mockGetSyncMeta(),
}));

vi.mock('@/lib/sync/sync-context', () => ({
  useSync: () => ({ syncNow: vi.fn(async () => {}), enabled: true }),
}));

vi.mock('@/lib/collab-client', () => ({
  importSharedStory: vi.fn(async () => ({ projectId: 'p1', created: true })),
}));

import { CollaborationSection } from '@/components/collab/CollaborationSection';

function jsonResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, data, requestId: 'r', timestamp: 't', ...data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('CollaborationSection', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_123';
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('shared-with-me')) {
        return jsonResponse({ me: 'user_me', stories: [] });
      }
      return jsonResponse({ role: 'owner', owner: null, collaborators: [] });
    }));
  });

  it('renders the invite form when the project is bound to a server story', async () => {
    mockGetSyncMeta.mockResolvedValue({
      id: 'proj-1',
      serverStoryId: 'srv-1',
      lastPulledAt: null,
      lastPushedAt: null,
    });

    render(<CollaborationSection />);

    expect(screen.getByTestId('collaboration')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('collaborator-email')).toBeTruthy();
    });
    expect(screen.getByTestId('invite-collaborator')).toBeTruthy();
    expect(screen.queryByText('syncFirst')).toBeNull();
  });

  it('shows the sync-first hint when no server story is bound', async () => {
    mockGetSyncMeta.mockResolvedValue(null);

    render(<CollaborationSection />);

    await waitFor(() => {
      expect(screen.getByText('syncFirst')).toBeTruthy();
    });
    expect(screen.queryByTestId('collaborator-email')).toBeNull();
  });

  it('renders nothing in keyless mode', () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

    const { container } = render(<CollaborationSection />);
    expect(container.firstChild).toBeNull();
  });
});
