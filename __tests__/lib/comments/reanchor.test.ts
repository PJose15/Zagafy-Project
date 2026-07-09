import { describe, it, expect } from 'vitest';
import { reanchorComment, reanchorAll } from '@/lib/comments/comments';
import type { ManuscriptComment } from '@/lib/types/comment';

function makeComment(overrides: Partial<ManuscriptComment> = {}): ManuscriptComment {
  return {
    id: 'c1',
    projectId: 'p1',
    chapterId: 'ch1',
    startOffset: 0,
    endOffset: 0,
    quote: '',
    prefix: '',
    suffix: '',
    text: 'A note',
    replies: [],
    resolved: false,
    orphaned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('reanchorComment', () => {
  it('returns the same object when the anchor is still intact', () => {
    const text = 'The rain fell on the old chapel roof.';
    const comment = makeComment({ startOffset: 4, endOffset: 8, quote: 'rain' });
    expect(reanchorComment(comment, text)).toBe(comment);
  });

  it('re-anchors when text is inserted before the quote', () => {
    const comment = makeComment({
      startOffset: 4,
      endOffset: 8,
      quote: 'rain',
      prefix: 'The ',
      suffix: ' fell',
    });
    const edited = 'Suddenly, the rain fell on the roof.';
    const result = reanchorComment(comment, edited);
    expect(result).not.toBe(comment);
    expect(result.startOffset).toBe(edited.indexOf('rain'));
    expect(result.endOffset).toBe(edited.indexOf('rain') + 4);
    expect(result.orphaned).toBe(false);
    expect(edited.slice(result.startOffset, result.endOffset)).toBe('rain');
  });

  it('marks the comment orphaned when the quote is edited away, keeping offsets and quote', () => {
    const comment = makeComment({ startOffset: 4, endOffset: 8, quote: 'rain' });
    const result = reanchorComment(comment, 'The snow fell on the roof.');
    expect(result.orphaned).toBe(true);
    expect(result.startOffset).toBe(4);
    expect(result.endOffset).toBe(8);
    expect(result.quote).toBe('rain');
  });

  it('disambiguates duplicate quotes via prefix/suffix context', () => {
    // Two occurrences of "the door" — the anchor context matches the second.
    const text = 'She opened the door. He slammed the door behind him.';
    const second = text.lastIndexOf('the door');
    const comment = makeComment({
      startOffset: 999, // stale — forces the occurrence search
      endOffset: 999 + 8,
      quote: 'the door',
      prefix: 'He slammed ',
      suffix: ' behind him.',
    });
    const result = reanchorComment(comment, text);
    expect(result.startOffset).toBe(second);
    expect(result.endOffset).toBe(second + 8);
    expect(result.orphaned).toBe(false);
  });

  it('clears a stale orphan flag when the quoted text returns at its offsets', () => {
    const text = 'The rain fell.';
    const comment = makeComment({ startOffset: 4, endOffset: 8, quote: 'rain', orphaned: true });
    const result = reanchorComment(comment, text);
    expect(result.orphaned).toBe(false);
  });

  it('orphans a comment with an empty quote', () => {
    const comment = makeComment({ quote: '' });
    expect(reanchorComment(comment, 'anything').orphaned).toBe(true);
  });
});

describe('reanchorAll', () => {
  it('handles a mixed batch: intact, shifted, and orphaned', () => {
    const text = 'Prologue. The rain fell on the chapel.';
    const intact = makeComment({ id: 'a', startOffset: 0, endOffset: 9, quote: 'Prologue.' });
    const shifted = makeComment({
      id: 'b',
      startOffset: 4, // stale offset — quote now lives at 14
      endOffset: 8,
      quote: 'rain',
      prefix: 'The ',
      suffix: ' fell',
    });
    const gone = makeComment({ id: 'c', startOffset: 20, endOffset: 24, quote: 'snow' });

    const { comments, changed } = reanchorAll([intact, shifted, gone], text);

    expect(comments).toHaveLength(3);
    expect(comments[0]).toBe(intact); // unchanged by reference
    expect(comments[1].startOffset).toBe(text.indexOf('rain'));
    expect(comments[1].orphaned).toBe(false);
    expect(comments[2].orphaned).toBe(true);
    expect(changed.map((c) => c.id).sort()).toEqual(['b', 'c']);
  });
});
