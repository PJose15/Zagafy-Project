import { describe, it, expect } from 'vitest';
import { mergeFill, normalizeForMatch } from '@/lib/import/mergeEntities';

describe('mergeFill (CB-11 non-destructive merge)', () => {
  it('fills empty scalar fields from the patch', () => {
    const existing = { name: 'Aldric', role: '', description: '' };
    const patch = { name: 'Aldric', role: 'protagonist', description: 'A weary knight.' };
    expect(mergeFill(existing, patch)).toEqual({
      name: 'Aldric',
      role: 'protagonist',
      description: 'A weary knight.',
    });
  });

  it('never overwrites an existing non-empty scalar', () => {
    const existing = { name: 'Aldric', role: 'hero', description: 'Original.' };
    const patch = { role: 'villain', description: 'Rewritten.' };
    const merged = mergeFill(existing, patch);
    expect(merged.role).toBe('hero');
    expect(merged.description).toBe('Original.');
  });

  it('treats whitespace-only strings as empty and fills them', () => {
    const existing = { role: '   ' };
    expect(mergeFill(existing, { role: 'knight' }).role).toBe('knight');
  });

  it('unions string arrays case-insensitively, preserving existing order', () => {
    const existing = { traits: ['Brave', 'loyal'] };
    const patch = { traits: ['brave', 'haunted', 'Loyal'] };
    expect(mergeFill(existing, patch).traits).toEqual(['Brave', 'loyal', 'haunted']);
  });

  it('unions object arrays structurally', () => {
    const existing = { evidence: [{ q: 'a' }] };
    const patch = { evidence: [{ q: 'a' }, { q: 'b' }] };
    expect(mergeFill(existing, patch).evidence).toEqual([{ q: 'a' }, { q: 'b' }]);
  });

  it('ignores null/undefined patch values', () => {
    const existing = { role: 'hero', note: 'keep' };
    const merged = mergeFill(existing, { role: undefined, note: null } as unknown as Partial<typeof existing>);
    expect(merged).toEqual({ role: 'hero', note: 'keep' });
  });

  it('does not mutate the inputs', () => {
    const existing = { tags: ['x'], role: '' };
    const patch = { tags: ['y'], role: 'r' };
    const merged = mergeFill(existing, patch);
    expect(existing).toEqual({ tags: ['x'], role: '' });
    expect(patch).toEqual({ tags: ['y'], role: 'r' });
    expect(merged.tags).toEqual(['x', 'y']);
  });

  it('fills an empty array field from the patch', () => {
    const existing = { evidence: [] as string[] };
    expect(mergeFill(existing, { evidence: ['clue'] }).evidence).toEqual(['clue']);
  });
});

describe('normalizeForMatch', () => {
  it('lowercases and trims', () => {
    expect(normalizeForMatch('  Aldric ')).toBe('aldric');
  });
});
