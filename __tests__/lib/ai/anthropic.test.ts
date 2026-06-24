import { describe, it, expect } from 'vitest';
import { supportsSamplingParams, extractText } from '@/lib/ai/anthropic';

describe('supportsSamplingParams', () => {
  it('allows sampling params on Sonnet 4.5 / 4.6', () => {
    expect(supportsSamplingParams('claude-sonnet-4-5-20250929')).toBe(true);
    expect(supportsSamplingParams('claude-sonnet-4-6')).toBe(true);
  });

  it('allows sampling params on Opus 4.5 / 4.6', () => {
    expect(supportsSamplingParams('claude-opus-4-5')).toBe(true);
    expect(supportsSamplingParams('claude-opus-4-6')).toBe(true);
  });

  it('rejects sampling params on Opus 4.7 / 4.8 and Fable (they 400)', () => {
    expect(supportsSamplingParams('claude-opus-4-7')).toBe(false);
    expect(supportsSamplingParams('claude-opus-4-8')).toBe(false);
    expect(supportsSamplingParams('claude-fable-5')).toBe(false);
  });
});

describe('extractText', () => {
  it('reads the legacy/test shape with no type field', () => {
    expect(extractText({ content: [{ text: 'hello' }] })).toBe('hello');
  });

  it('reads a standard text block', () => {
    expect(extractText({ content: [{ type: 'text', text: 'hi there' }] })).toBe('hi there');
  });

  it('skips a leading thinking block and returns the text block', () => {
    expect(
      extractText({
        content: [
          { type: 'thinking', thinking: 'reasoning...' },
          { type: 'text', text: 'the answer' },
        ],
      }),
    ).toBe('the answer');
  });

  it('trims whitespace', () => {
    expect(extractText({ content: [{ type: 'text', text: '  spaced  ' }] })).toBe('spaced');
  });

  it('returns empty string for missing / malformed content', () => {
    expect(extractText({})).toBe('');
    expect(extractText(null)).toBe('');
    expect(extractText({ content: [{ type: 'thinking', thinking: 'only thinking' }] })).toBe('');
  });
});
