import { describe, it, expect } from 'vitest';
import { diffWords } from '@/lib/text-diff';

describe('diffWords', () => {
  it('returns empty array for two empty strings', () => {
    expect(diffWords('', '')).toEqual([]);
  });

  it('returns equal segment for identical strings', () => {
    const result = diffWords('hello world', 'hello world');
    expect(result).toEqual([{ type: 'equal', text: 'hello world' }]);
  });

  it('returns added segment for empty old text', () => {
    const result = diffWords('', 'new text');
    expect(result).toEqual([{ type: 'added', text: 'new text' }]);
  });

  it('returns removed segment for empty new text', () => {
    const result = diffWords('old text', '');
    expect(result).toEqual([{ type: 'removed', text: 'old text' }]);
  });

  it('detects added words', () => {
    const result = diffWords('hello world', 'hello beautiful world');
    const added = result.filter(s => s.type === 'added');
    expect(added.length).toBeGreaterThan(0);
    expect(added.some(s => s.text.includes('beautiful'))).toBe(true);
  });

  it('detects removed words', () => {
    const result = diffWords('hello beautiful world', 'hello world');
    const removed = result.filter(s => s.type === 'removed');
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.some(s => s.text.includes('beautiful'))).toBe(true);
  });

  it('handles complete replacement', () => {
    const result = diffWords('old text here', 'new content now');
    expect(result.length).toBeGreaterThan(0);
    const types = new Set(result.map(s => s.type));
    expect(types.has('added')).toBe(true);
    expect(types.has('removed')).toBe(true);
  });

  it('preserves whitespace in segments', () => {
    const result = diffWords('one two', 'one two');
    expect(result).toEqual([{ type: 'equal', text: 'one two' }]);
  });

  it('merges consecutive same-type segments', () => {
    const result = diffWords('a b c', 'a b c');
    // Should be a single equal segment
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('equal');
  });

  it('handles single word diff', () => {
    const result = diffWords('cat', 'dog');
    expect(result.some(s => s.type === 'removed' && s.text.includes('cat'))).toBe(true);
    expect(result.some(s => s.type === 'added' && s.text.includes('dog'))).toBe(true);
  });

  it('handles multiline text', () => {
    const result = diffWords('line one\nline two', 'line one\nline three');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles long texts without error', () => {
    const old = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
    const newer = Array.from({ length: 100 }, (_, i) => i === 50 ? 'CHANGED' : `word${i}`).join(' ');
    const result = diffWords(old, newer);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(s => s.type === 'added' && s.text.includes('CHANGED'))).toBe(true);
  });

  it('all segments reconstruct both texts', () => {
    const result = diffWords('the quick brown fox', 'the slow brown cat');
    const removed = result.filter(s => s.type !== 'added').map(s => s.text).join('');
    const added = result.filter(s => s.type !== 'removed').map(s => s.text).join('');
    expect(removed).toContain('quick');
    expect(added).toContain('slow');
  });

  it('diffs very large texts without allocating a huge matrix (CR-4 guard)', () => {
    // Two ~12k-word versions differing only in the middle. The old O(n·m) path
    // would allocate a ~140M-cell matrix; the prefix/suffix trim + fallback must
    // keep this fast and bounded.
    const big = (marker: string) =>
      Array.from({ length: 12000 }, (_, i) => (i === 6000 ? marker : `word${i}`)).join(' ');
    const start = Date.now();
    const result = diffWords(big('ALPHA'), big('OMEGA'));
    expect(Date.now() - start).toBeLessThan(2000);
    expect(result.some(s => s.type === 'removed' && s.text.includes('ALPHA'))).toBe(true);
    expect(result.some(s => s.type === 'added' && s.text.includes('OMEGA'))).toBe(true);
    // The unchanged bulk collapses into equal segments.
    expect(result.some(s => s.type === 'equal' && s.text.includes('word0'))).toBe(true);
  });

  it('falls back to a block replace for two large, fully-different texts', () => {
    const oldText = Array.from({ length: 3000 }, (_, i) => `alpha${i}`).join(' ');
    const newText = Array.from({ length: 3000 }, (_, i) => `omega${i}`).join(' ');
    const result = diffWords(oldText, newText);
    const removed = result.filter(s => s.type !== 'added').map(s => s.text).join('');
    const added = result.filter(s => s.type !== 'removed').map(s => s.text).join('');
    expect(removed).toContain('alpha0');
    expect(added).toContain('omega0');
  });
});
