import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HeteronymModal } from '@/components/heteronyms/heteronym-modal';

// Mock motion/react to avoid animation issues in tests
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, exit, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
}));

describe('HeteronymModal', () => {
  const defaultProps = {
    onSave: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders create mode by default', () => {
    render(<HeteronymModal {...defaultProps} />);
    expect(screen.getByText('New Alter Ego')).toBeTruthy();
    expect(screen.getByText('Create Alter Ego')).toBeTruthy();
  });

  it('renders edit mode when heteronym provided', () => {
    render(
      <HeteronymModal
        {...defaultProps}
        heteronym={{
          id: 'h1',
          name: 'Álvaro',
          bio: 'A poet',
          styleNote: 'Verbose',
          avatarColor: '#E74C3C',
          avatarEmoji: '⚡',
          createdAt: '2026-03-10T10:00:00Z',
          isDefault: false,
        }}
      />
    );
    expect(screen.getByText('Edit Alter Ego')).toBeTruthy();
    expect(screen.getByText('Save Changes')).toBeTruthy();
  });

  it('pre-fills form fields in edit mode', () => {
    render(
      <HeteronymModal
        {...defaultProps}
        heteronym={{
          id: 'h1',
          name: 'Álvaro',
          bio: 'A poet',
          styleNote: 'Verbose',
          avatarColor: '#E74C3C',
          avatarEmoji: '⚡',
          createdAt: '2026-03-10T10:00:00Z',
          isDefault: false,
        }}
      />
    );
    expect((screen.getByPlaceholderText('e.g. Álvaro de Campos') as HTMLInputElement).value).toBe('Álvaro');
  });

  it('shows validation error when name is empty', () => {
    render(<HeteronymModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Create Alter Ego'));
    expect(screen.getByText('Name is required')).toBeTruthy();
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it('calls onSave with form data on submit', () => {
    render(<HeteronymModal {...defaultProps} />);
    const nameInput = screen.getByPlaceholderText('e.g. Álvaro de Campos');
    fireEvent.change(nameInput, { target: { value: 'Ricardo Reis' } });
    fireEvent.click(screen.getByText('Create Alter Ego'));
    expect(defaultProps.onSave).toHaveBeenCalledWith({
      name: 'Ricardo Reis',
      bio: '',
      styleNote: '',
      avatarColor: '#991b1b',
      avatarEmoji: '✍️',
      voice: undefined,
    });
  });

  it('calls onClose when Cancel is clicked', () => {
    render(<HeteronymModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    render(<HeteronymModal {...defaultProps} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('enforces name max length of 30', () => {
    render(<HeteronymModal {...defaultProps} />);
    const nameInput = screen.getByPlaceholderText('e.g. Álvaro de Campos') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'A'.repeat(40) } });
    expect(nameInput.value).toBe('A'.repeat(30));
  });

  it('shows character count for name', () => {
    render(<HeteronymModal {...defaultProps} />);
    expect(screen.getByText('0/30')).toBeTruthy();
    const nameInput = screen.getByPlaceholderText('e.g. Álvaro de Campos');
    fireEvent.change(nameInput, { target: { value: 'Test' } });
    expect(screen.getByText('4/30')).toBeTruthy();
  });

  it('renders color swatches', () => {
    render(<HeteronymModal {...defaultProps} />);
    const colorButtons = screen.getAllByLabelText(/^Color #/);
    expect(colorButtons.length).toBe(12);
  });

  it('changes avatar color on swatch click', () => {
    render(<HeteronymModal {...defaultProps} />);
    const nameInput = screen.getByPlaceholderText('e.g. Álvaro de Campos');
    fireEvent.change(nameInput, { target: { value: 'Test' } });
    const forestSwatch = screen.getByLabelText('Color #166534');
    fireEvent.click(forestSwatch);
    fireEvent.click(screen.getByText('Create Alter Ego'));
    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ avatarColor: '#166534' })
    );
  });

  it('renders emoji grid', () => {
    render(<HeteronymModal {...defaultProps} />);
    expect(screen.getByText('🎭')).toBeTruthy();
    expect(screen.getByText('🔥')).toBeTruthy();
    expect(screen.getByText('🌊')).toBeTruthy();
  });

  it('changes avatar emoji on grid click', () => {
    render(<HeteronymModal {...defaultProps} />);
    const nameInput = screen.getByPlaceholderText('e.g. Álvaro de Campos');
    fireEvent.change(nameInput, { target: { value: 'Test' } });
    fireEvent.click(screen.getByText('🔥'));
    fireEvent.click(screen.getByText('Create Alter Ego'));
    expect(defaultProps.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ avatarEmoji: '🔥' })
    );
  });

  it('shows live preview with name', () => {
    render(<HeteronymModal {...defaultProps} />);
    expect(screen.getByText('Unnamed')).toBeTruthy();
    const nameInput = screen.getByPlaceholderText('e.g. Álvaro de Campos');
    fireEvent.change(nameInput, { target: { value: 'Fernando' } });
    expect(screen.getByText('Fernando')).toBeTruthy();
  });

  it('has proper ARIA attributes', () => {
    render(<HeteronymModal {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Create heteronym');
  });
});
