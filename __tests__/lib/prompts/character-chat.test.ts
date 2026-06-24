import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '@/lib/prompts/character-chat';
import type { Character } from '@/lib/store';

const char: Character = {
  id: '1',
  name: 'Mira',
  role: 'Cartographer',
  description: 'A mapmaker who falsified borders.',
  relationships: '',
};

describe('buildSystemPrompt — story grounding', () => {
  it('omits the grounding block when no story context is given', () => {
    const p = buildSystemPrompt(char, 'exploration');
    expect(p).not.toContain('STORY GROUNDING');
  });

  it('omits the grounding block when story context has only empty fields', () => {
    const p = buildSystemPrompt(char, 'exploration', {});
    expect(p).not.toContain('STORY GROUNDING');
  });

  it('includes premise, canon, and story-so-far with a no-contradiction instruction', () => {
    const p = buildSystemPrompt(char, 'confrontation', {
      premise: 'A kingdom of falsified maps.',
      canon: ['Mira has grey eyes.', 'The war ended in 1847.'],
      storySoFar: 'Chapter 1: she signed the false map.',
    });
    expect(p).toContain('STORY GROUNDING');
    expect(p).toContain('A kingdom of falsified maps.');
    expect(p).toContain('Mira has grey eyes.');
    expect(p).toContain('1847');
    expect(p).toContain('she signed the false map');
    expect(p).toContain('NEVER contradict');
  });

  it('still renders the character identity alongside grounding', () => {
    const p = buildSystemPrompt(char, 'exploration', { premise: 'X' });
    expect(p).toContain('You are Mira');
    expect(p).toContain('STORY GROUNDING');
  });
});
