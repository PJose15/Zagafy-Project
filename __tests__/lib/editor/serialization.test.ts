import { describe, it, expect } from 'vitest';
import {
  buildLexicalStateFromText,
  plaintextToLexicalJson,
  lexicalJsonToPlaintext,
  isLexicalJson,
  getPlainText,
  wordCount,
  hasFormatting,
  mapLexicalText,
} from '@/lib/editor/serialization';

/** Build a Lexical JSON document with a single text node carrying a format bitfield. */
function richDoc(text: string, format: number, paraFormat = ''): string {
  return JSON.stringify({
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: [
        {
          type: 'paragraph',
          version: 1,
          direction: null,
          format: paraFormat,
          indent: 0,
          textFormat: 0,
          textStyle: '',
          children: [
            { type: 'text', version: 1, text, format, style: '', detail: 0, mode: 'normal' },
          ],
        },
      ],
    },
  });
}

describe('isLexicalJson', () => {
  it('recognizes a serialized root', () => {
    expect(isLexicalJson(JSON.stringify(buildLexicalStateFromText('hi')))).toBe(true);
  });

  it('rejects plain prose', () => {
    expect(isLexicalJson('Once upon a time, there was a dragon.')).toBe(false);
    expect(isLexicalJson('')).toBe(false);
    expect(isLexicalJson('{"foo":1}')).toBe(false);
  });
});

describe('plain text <-> Lexical round-trip', () => {
  it('preserves single and multi-line prose', () => {
    const samples = ['Hello world', 'Line one\n\nLine two', '', 'Tab\tseparated'];
    for (const text of samples) {
      const json = JSON.stringify(buildLexicalStateFromText(text));
      expect(getPlainText(json)).toBe(text);
      // The createEditor-based path normalizes but must still round-trip.
      expect(lexicalJsonToPlaintext(plaintextToLexicalJson(text))).toBe(text);
    }
  });

  it('getPlainText is a no-op on plain text', () => {
    expect(getPlainText('plain prose')).toBe('plain prose');
  });
});

describe('wordCount', () => {
  it('counts words across both formats identically', () => {
    const text = 'the quick brown fox jumps';
    expect(wordCount(text)).toBe(5);
    expect(wordCount(JSON.stringify(buildLexicalStateFromText(text)))).toBe(5);
  });

  it('returns 0 for empty content', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount(JSON.stringify(buildLexicalStateFromText('')))).toBe(0);
  });
});

describe('hasFormatting', () => {
  it('is false for plain text and plain-paragraph documents', () => {
    expect(hasFormatting('just prose')).toBe(false);
    expect(hasFormatting(JSON.stringify(buildLexicalStateFromText('a\n\nb')))).toBe(false);
  });

  it('detects a bold text node (format bitfield != 0)', () => {
    expect(hasFormatting(richDoc('bold', 1))).toBe(true);
  });

  it('detects a centered scene break (element-level alignment)', () => {
    expect(hasFormatting(richDoc('* * *', 0, 'center'))).toBe(true);
  });
});

describe('mapLexicalText', () => {
  it('replaces text within nodes, preserving the format bitfield', () => {
    const json = richDoc('aragorn', 1);
    const out = mapLexicalText(json, (t) => t.replace(/aragorn/g, 'Strider'));
    expect(getPlainText(out)).toBe('Strider');
    const parsed = JSON.parse(out);
    expect(parsed.root.children[0].children[0].format).toBe(1); // bold preserved
  });

  it('returns plain text unchanged', () => {
    expect(mapLexicalText('not json', (t) => t.toUpperCase())).toBe('not json');
  });
});
