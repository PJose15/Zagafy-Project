import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HeteronymSettings } from '@/components/heteronyms/heteronym-settings';
import type { Heteronym } from '@/lib/types/heteronym';

// Mock motion/react
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, exit, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
}));

// Mock toast and confirm
const mockToast = vi.fn();
const mockConfirm = vi.fn();

vi.mock('@/components/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/components/confirm-dialog', () => ({
  useConfirm: () => ({ confirm: mockConfirm }),
}));

// Heteronyms are scoped per active project; pin it so the scoped keys are stable.
vi.mock('@/lib/projects/active-project', () => ({
  getActiveProjectId: () => 'test-proj',
}));

const HETERONYMS_KEY = 'zagafy_heteronyms_test-proj';
const ACTIVE_KEY = 'zagafy_active_heteronym_test-proj';

function makeHeteronym(overrides: Partial<Heteronym> = {}): Heteronym {
  return {
    id: 'het-1',
    name: 'Álvaro de Campos',
    bio: 'A naval engineer',
    styleNote: 'Ecstatic, verbose',
    avatarColor: '#E74C3C',
    avatarEmoji: '⚡',
    createdAt: '2026-03-10T10:00:00Z',
    isDefault: false,
    ...overrides,
  };
}

describe('HeteronymSettings', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    storage = {};

    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
      clear: vi.fn(() => { storage = {}; }),
      get length() { return Object.keys(storage).length; },
      key: vi.fn((i: number) => Object.keys(storage)[i] ?? null),
    });

    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'new-uuid-1234') });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders section heading', () => {
    render(<HeteronymSettings />);
    expect(screen.getByText('Alter Egos')).toBeTruthy();
  });

  it('shows empty state when no heteronyms', () => {
    render(<HeteronymSettings />);
    expect(screen.getByText(/No alter egos yet/)).toBeTruthy();
  });

  it('renders heteronym cards', () => {
    storage[HETERONYMS_KEY] = JSON.stringify([
      makeHeteronym({ id: 'def', name: 'Myself', isDefault: true }),
      makeHeteronym({ id: 'h1', name: 'Álvaro' }),
    ]);
    render(<HeteronymSettings />);
    expect(screen.getByText('Myself')).toBeTruthy();
    expect(screen.getByText('Álvaro')).toBeTruthy();
  });

  it('shows Default badge on default heteronym', () => {
    storage[HETERONYMS_KEY] = JSON.stringify([
      makeHeteronym({ id: 'def', name: 'Myself', isDefault: true }),
    ]);
    render(<HeteronymSettings />);
    expect(screen.getByText('Default')).toBeTruthy();
  });

  it('shows Active badge on active heteronym', () => {
    storage[HETERONYMS_KEY] = JSON.stringify([
      makeHeteronym({ id: 'def', name: 'Myself', isDefault: true }),
    ]);
    storage[ACTIVE_KEY] = 'def';
    render(<HeteronymSettings />);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('shows heteronym count', () => {
    storage[HETERONYMS_KEY] = JSON.stringify([
      makeHeteronym({ id: 'def', isDefault: true }),
      makeHeteronym({ id: 'h1' }),
    ]);
    render(<HeteronymSettings />);
    expect(screen.getByText('2/10 alter egos')).toBeTruthy();
  });

  it('opens create modal on New button click', () => {
    render(<HeteronymSettings />);
    fireEvent.click(screen.getByText('New'));
    expect(screen.getByText('New Alter Ego')).toBeTruthy();
  });

  it('opens edit modal on Edit button click', () => {
    storage[HETERONYMS_KEY] = JSON.stringify([
      makeHeteronym({ id: 'h1', name: 'Álvaro' }),
    ]);
    render(<HeteronymSettings />);
    fireEvent.click(screen.getByLabelText('Edit Álvaro'));
    expect(screen.getByText('Edit Alter Ego')).toBeTruthy();
  });

  it('does not show delete button for default heteronym', () => {
    storage[HETERONYMS_KEY] = JSON.stringify([
      makeHeteronym({ id: 'def', name: 'Myself', isDefault: true }),
    ]);
    render(<HeteronymSettings />);
    expect(screen.queryByLabelText('Delete Myself')).toBeNull();
  });

  it('shows delete button for non-default heteronym', () => {
    storage[HETERONYMS_KEY] = JSON.stringify([
      makeHeteronym({ id: 'h1', name: 'Álvaro', isDefault: false }),
    ]);
    render(<HeteronymSettings />);
    expect(screen.getByLabelText('Delete Álvaro')).toBeTruthy();
  });

  it('calls confirm on delete', async () => {
    mockConfirm.mockResolvedValue(false);
    storage[HETERONYMS_KEY] = JSON.stringify([
      makeHeteronym({ id: 'def', isDefault: true }),
      makeHeteronym({ id: 'h1', name: 'Álvaro', isDefault: false }),
    ]);
    render(<HeteronymSettings />);
    fireEvent.click(screen.getByLabelText('Delete Álvaro'));
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Delete "Álvaro"?' })
    );
  });

  it('creates a new heteronym via modal', () => {
    render(<HeteronymSettings />);
    fireEvent.click(screen.getByText('New'));

    const nameInput = screen.getByPlaceholderText('e.g. Álvaro de Campos');
    fireEvent.change(nameInput, { target: { value: 'Ricardo Reis' } });
    fireEvent.click(screen.getByText('Create Alter Ego'));

    const saved = JSON.parse(storage[HETERONYMS_KEY]);
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('Ricardo Reis');
    expect(mockToast).toHaveBeenCalledWith('"Ricardo Reis" created.', 'success');
  });

  it('disables New button at limit (10)', () => {
    const ten = Array.from({ length: 10 }, (_, i) => makeHeteronym({ id: `h-${i}` }));
    storage[HETERONYMS_KEY] = JSON.stringify(ten);
    render(<HeteronymSettings />);
    const newBtn = screen.getByText('New').closest('button')!;
    expect(newBtn.disabled).toBe(true);
  });

  it('shows style note in card', () => {
    storage[HETERONYMS_KEY] = JSON.stringify([
      makeHeteronym({ id: 'h1', styleNote: 'Ecstatic, verbose' }),
    ]);
    render(<HeteronymSettings />);
    expect(screen.getByText('Ecstatic, verbose')).toBeTruthy();
  });

  it('has proper ARIA attributes', () => {
    storage[HETERONYMS_KEY] = JSON.stringify([
      makeHeteronym({ id: 'h1' }),
    ]);
    render(<HeteronymSettings />);
    expect(screen.getByLabelText('Alter egos settings')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Alter ego list' })).toBeTruthy();
  });
});
