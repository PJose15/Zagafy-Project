import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { VoiceToneEditor } from '@/components/heteronyms/voice-tone-editor';
import type { HeteronymVoice } from '@/lib/heteronym-voice';

describe('VoiceToneEditor', () => {
  const defaultProps = {
    initialVoice: null as HeteronymVoice | null,
    styleNote: '',
    onVoiceChange: vi.fn(),
    onStyleNoteChange: vi.fn(),
  };

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all three section labels', () => {
    render(<VoiceToneEditor {...defaultProps} />);
    expect(screen.getByText('Tone')).toBeDefined();
    expect(screen.getByText('Vocabulary')).toBeDefined();
    expect(screen.getByText('Pacing')).toBeDefined();
  });

  it('renders all 6 tone buttons', () => {
    render(<VoiceToneEditor {...defaultProps} />);
    // Labels come from TONE_LABELS split on ' & ', taking first part
    expect(screen.getByText('Formal')).toBeDefined();
    expect(screen.getByText('Casual')).toBeDefined();
    expect(screen.getByText('Poetic')).toBeDefined();
    expect(screen.getByText('Raw')).toBeDefined();
    expect(screen.getByText('Clinical')).toBeDefined();
    expect(screen.getByText('Playful')).toBeDefined();
  });

  it('renders all 6 vocabulary buttons', () => {
    render(<VoiceToneEditor {...defaultProps} />);
    // Labels come from the i18n `heteronyms.editor.vocabulary.*` catalog keys.
    expect(screen.getByText('Simple')).toBeDefined();
    expect(screen.getByText('Literary')).toBeDefined();
    expect(screen.getByText('Technical')).toBeDefined();
    expect(screen.getByText('Archaic')).toBeDefined();
    expect(screen.getByText('Slang')).toBeDefined();
    expect(screen.getByText('Mixed')).toBeDefined();
  });

  it('renders all 5 pacing buttons', () => {
    render(<VoiceToneEditor {...defaultProps} />);
    // Labels come from PACING_LABELS split on ' — ', taking first part
    expect(screen.getByText('Staccato')).toBeDefined();
    expect(screen.getByText('Flowing')).toBeDefined();
    expect(screen.getByText('Measured')).toBeDefined();
    expect(screen.getByText('Breathless')).toBeDefined();
    expect(screen.getByText('Languid')).toBeDefined();
  });

  it('does not call onVoiceChange on initial render (skips first render)', () => {
    const onVoiceChange = vi.fn();
    render(<VoiceToneEditor {...defaultProps} onVoiceChange={onVoiceChange} />);
    // isFirstRender ref skips the initial useEffect call
    expect(onVoiceChange).not.toHaveBeenCalled();
  });

  it('calls onVoiceChange with updated tone when tone button clicked', () => {
    const onVoiceChange = vi.fn();
    render(<VoiceToneEditor {...defaultProps} onVoiceChange={onVoiceChange} />);
    onVoiceChange.mockClear();

    fireEvent.click(screen.getByText('Poetic'));

    expect(onVoiceChange).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'poetic' })
    );
  });

  it('calls onVoiceChange with updated vocabulary when vocabulary button clicked', () => {
    const onVoiceChange = vi.fn();
    render(<VoiceToneEditor {...defaultProps} onVoiceChange={onVoiceChange} />);
    onVoiceChange.mockClear();

    fireEvent.click(screen.getByText('Archaic'));

    expect(onVoiceChange).toHaveBeenCalledWith(
      expect.objectContaining({ vocabulary: 'archaic' })
    );
  });

  it('calls onVoiceChange with updated pacing when pacing button clicked', () => {
    const onVoiceChange = vi.fn();
    render(<VoiceToneEditor {...defaultProps} onVoiceChange={onVoiceChange} />);
    onVoiceChange.mockClear();

    fireEvent.click(screen.getByText('Staccato'));

    expect(onVoiceChange).toHaveBeenCalledWith(
      expect.objectContaining({ pacing: 'staccato' })
    );
  });

  it('updates freeform note and includes it in onVoiceChange', () => {
    const onVoiceChange = vi.fn();
    render(<VoiceToneEditor {...defaultProps} onVoiceChange={onVoiceChange} />);
    onVoiceChange.mockClear();

    const textarea = screen.getByPlaceholderText(/Uses metaphors from the sea/);
    fireEvent.change(textarea, { target: { value: 'Writes like the wind' } });

    expect(onVoiceChange).toHaveBeenCalledWith(
      expect.objectContaining({ freeformNote: 'Writes like the wind' })
    );
  });

  it('shows freeform note character count', () => {
    render(<VoiceToneEditor {...defaultProps} />);
    expect(screen.getAllByText('0/200').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onStyleNoteChange when legacy style note is edited', () => {
    const onStyleNoteChange = vi.fn();
    render(<VoiceToneEditor {...defaultProps} onStyleNoteChange={onStyleNoteChange} />);

    const legacyTextarea = screen.getByPlaceholderText(/Fragmented sentences/);
    fireEvent.change(legacyTextarea, { target: { value: 'Short bursts' } });

    expect(onStyleNoteChange).toHaveBeenCalledWith('Short bursts');
  });

  it('initializes with provided initialVoice values (no call on mount)', () => {
    const voice: HeteronymVoice = {
      tone: 'raw',
      vocabulary: 'slang',
      pacing: 'breathless',
      freeformNote: 'No filters',
    };
    const onVoiceChange = vi.fn();
    render(<VoiceToneEditor {...defaultProps} initialVoice={voice} onVoiceChange={onVoiceChange} />);

    // isFirstRender ref skips the initial useEffect — no call on mount
    expect(onVoiceChange).not.toHaveBeenCalled();
  });

  it('displays the provided styleNote', () => {
    render(<VoiceToneEditor {...defaultProps} styleNote="My custom style" />);
    const legacyTextarea = screen.getByPlaceholderText(/Fragmented sentences/) as HTMLTextAreaElement;
    expect(legacyTextarea.value).toBe('My custom style');
  });

  it('truncates freeform note at 200 characters', () => {
    const onVoiceChange = vi.fn();
    render(<VoiceToneEditor {...defaultProps} onVoiceChange={onVoiceChange} />);
    onVoiceChange.mockClear();

    const longText = 'a'.repeat(250);
    const textarea = screen.getByPlaceholderText(/Uses metaphors from the sea/);
    fireEvent.change(textarea, { target: { value: longText } });

    expect(onVoiceChange).toHaveBeenCalledWith(
      expect.objectContaining({ freeformNote: 'a'.repeat(200) })
    );
  });
});
