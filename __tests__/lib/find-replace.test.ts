import { describe, it, expect } from 'vitest';
import {
  buildPattern,
  findInChapter,
  findAll,
  replaceAllInChapter,
} from '@/lib/find-replace';

const ch = (id: string, title: string, content: string) => ({ id, title, content });

describe('buildPattern', () => {
  it('case-insensitive by default with global flag', () => {
    const re = buildPattern('foo');
    expect(re.flags).toContain('g');
    expect(re.flags).toContain('i');
    expect('Foo bar foo FOO'.match(re)).toHaveLength(3);
  });

  it('respects caseSensitive=true', () => {
    const re = buildPattern('foo', { caseSensitive: true });
    expect(re.flags).not.toContain('i');
    expect('Foo bar foo FOO'.match(re)).toHaveLength(1);
  });

  it('escapes regex metacharacters in plain mode', () => {
    const re = buildPattern('a.b');
    expect('a.b axb'.match(re)).toEqual(['a.b']);
  });

  it('honors regex mode (no escaping)', () => {
    const re = buildPattern('a.b', { regex: true });
    expect('a.b axb'.match(re)).toEqual(['a.b', 'axb']);
  });

  it('throws when regex mode is on and the pattern is invalid', () => {
    expect(() => buildPattern('a(b', { regex: true })).toThrow();
  });

  it('honors wholeWord boundaries', () => {
    const re = buildPattern('foo', { wholeWord: true });
    expect('foo footer afoo foo!'.match(re)).toEqual(['foo', 'foo']);
  });

  it('combines wholeWord with regex', () => {
    const re = buildPattern('fo+', { wholeWord: true, regex: true });
    expect('foo fooo footer'.match(re)).toEqual(['foo', 'fooo']);
  });
});

describe('findInChapter', () => {
  it('returns empty for empty query', () => {
    const out = findInChapter(ch('a', 'A', 'foo bar'), '');
    expect(out).toEqual([]);
  });

  it('finds every occurrence with chapter id, index, length, and context', () => {
    const c = ch('ch-1', 'Beginnings', '0123456789 foo bar foo baz');
    const matches = findInChapter(c, 'foo');
    expect(matches).toHaveLength(2);
    expect(matches[0].chapterId).toBe('ch-1');
    expect(matches[0].chapterTitle).toBe('Beginnings');
    expect(matches[0].length).toBe(3);
    expect(c.content.slice(matches[0].index, matches[0].index + matches[0].length)).toBe('foo');
    expect(matches[0].contextBefore.endsWith(' ')).toBe(true);
  });

  it('case-insensitive by default', () => {
    const c = ch('a', 'A', 'Foo foo FOO');
    expect(findInChapter(c, 'foo')).toHaveLength(3);
  });

  it('records the exact matched text (not the query) for each hit', () => {
    // Under case-insensitive/regex mode the matched substring can differ from
    // the query; the preview highlight must show the real match.
    const c = ch('a', 'A', 'Foo foo FOO');
    expect(findInChapter(c, 'foo').map(m => m.matchText)).toEqual(['Foo', 'foo', 'FOO']);

    const r = ch('b', 'B', 'foo123 bar456');
    expect(findInChapter(r, '\\d+', { regex: true }).map(m => m.matchText)).toEqual(['123', '456']);
  });

  it('case-sensitive when requested', () => {
    const c = ch('a', 'A', 'Foo foo FOO');
    expect(findInChapter(c, 'foo', { caseSensitive: true })).toHaveLength(1);
  });

  it('whole-word excludes partial matches', () => {
    const c = ch('a', 'A', 'cat cats catalog cat.');
    const matches = findInChapter(c, 'cat', { wholeWord: true });
    expect(matches).toHaveLength(2);
  });

  it('handles regex mode', () => {
    const c = ch('a', 'A', 'foo123 bar456');
    const matches = findInChapter(c, '\\d+', { regex: true });
    expect(matches.map(m => c.content.slice(m.index, m.index + m.length))).toEqual(['123', '456']);
  });
});

describe('findAll', () => {
  const chapters = [
    ch('1', 'One', 'aragorn rides at dawn. Aragorn waits.'),
    ch('2', 'Two', 'frodo follows. ARAGORN watches.'),
    ch('3', 'Three', 'no match here.'),
  ];

  it('walks every chapter when scope is all-chapters', () => {
    const matches = findAll(chapters, 'aragorn');
    expect(matches).toHaveLength(3);
    expect(new Set(matches.map(m => m.chapterId))).toEqual(new Set(['1', '2']));
  });

  it('restricts to first chapter when scope is current-chapter', () => {
    const matches = findAll(chapters, 'aragorn', { scope: 'current-chapter' });
    expect(matches.every(m => m.chapterId === '1')).toBe(true);
    expect(matches).toHaveLength(2);
  });

  it('returns empty for empty query', () => {
    expect(findAll(chapters, '')).toEqual([]);
  });

  it('preserves document order', () => {
    const matches = findAll(chapters, 'aragorn');
    expect(matches.map(m => m.chapterId)).toEqual(['1', '1', '2']);
  });
});

describe('replaceAllInChapter', () => {
  it('replaces every occurrence and reports the count', () => {
    const result = replaceAllInChapter('Aragorn rides. aragorn waits.', 'aragorn', 'Strider');
    expect(result.replaced).toBe(2);
    expect(result.newContent).toBe('Strider rides. Strider waits.');
  });

  it('case-sensitive replace leaves mismatches alone', () => {
    const result = replaceAllInChapter(
      'Aragorn rides. aragorn waits.',
      'aragorn',
      'Strider',
      { caseSensitive: true },
    );
    expect(result.replaced).toBe(1);
    expect(result.newContent).toContain('Aragorn rides');
  });

  it('whole-word replace keeps substrings intact', () => {
    const result = replaceAllInChapter('cat cats catalog', 'cat', 'feline', { wholeWord: true });
    expect(result.replaced).toBe(1);
    expect(result.newContent).toBe('feline cats catalog');
  });

  it('regex replace substitutes by pattern', () => {
    const result = replaceAllInChapter('item 42 and item 7', '\\d+', '#', { regex: true });
    expect(result.replaced).toBe(2);
    expect(result.newContent).toBe('item # and item #');
  });

  it('does not loop on a replacement that creates new matches', () => {
    // Replacing "aa" with "aaa" must NOT cascade — replace() with /g iterates
    // the original string left-to-right.
    const result = replaceAllInChapter('aaaa', 'aa', 'aaa');
    expect(result.replaced).toBe(2);
    expect(result.newContent).toBe('aaaaaa');
  });

  it('returns input unchanged for empty query', () => {
    const result = replaceAllInChapter('hello', '', 'x');
    expect(result).toEqual({ newContent: 'hello', replaced: 0 });
  });

  it('regex injection safety: special chars in plain mode are literal', () => {
    const result = replaceAllInChapter('foo.bar foo.bar', 'foo.bar', 'X');
    expect(result.replaced).toBe(2);
    expect(result.newContent).toBe('X X');
    // Sanity check: the user-supplied "." would have matched anything in regex
    // mode but doesn't here.
    const lit = replaceAllInChapter('foo!bar', 'foo.bar', 'X');
    expect(lit.replaced).toBe(0);
  });
});
