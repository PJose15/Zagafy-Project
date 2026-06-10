import { describe, it, expect } from 'vitest';
import {
  buildManuscriptModel,
  contentToParagraphs,
  isSceneBreak,
  roundWordCount,
} from '@/lib/export/manuscript-model';

/** Lexical JSON with a paragraph whose runs carry the given format bitfields. */
function lexicalDoc(
  blocks: { runs: { text: string; format?: number }[]; format?: string }[],
): string {
  return JSON.stringify({
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: blocks.map(b => ({
        type: 'paragraph',
        version: 1,
        direction: null,
        format: b.format ?? '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        children: b.runs.map(r => ({
          type: 'text',
          version: 1,
          text: r.text,
          format: r.format ?? 0,
          style: '',
          detail: 0,
          mode: 'normal',
        })),
      })),
    },
  });
}

describe('isSceneBreak', () => {
  it('matches common separators', () => {
    expect(isSceneBreak('* * *')).toBe(true);
    expect(isSceneBreak('***')).toBe(true);
    expect(isSceneBreak('#')).toBe(true);
    expect(isSceneBreak('  #  ')).toBe(true);
  });
  it('rejects prose', () => {
    expect(isSceneBreak('The end.')).toBe(false);
    expect(isSceneBreak('')).toBe(false);
    expect(isSceneBreak('a long line of text')).toBe(false);
  });
});

describe('contentToParagraphs — plain text', () => {
  it('splits lines into paragraphs and drops blanks', () => {
    const paras = contentToParagraphs('First line.\n\nSecond line.');
    expect(paras).toHaveLength(2);
    expect(paras[0].runs[0].text).toBe('First line.');
    expect(paras[0].align).toBe('left');
    expect(paras[0].sceneBreak).toBe(false);
  });
  it('centers scene-break markers', () => {
    const paras = contentToParagraphs('A.\n* * *\nB.');
    expect(paras).toHaveLength(3);
    expect(paras[1].sceneBreak).toBe(true);
    expect(paras[1].align).toBe('center');
  });
});

describe('contentToParagraphs — Lexical JSON', () => {
  it('preserves run formatting (bold=1, italic=2)', () => {
    const doc = lexicalDoc([{ runs: [{ text: 'plain ' }, { text: 'bold', format: 1 }, { text: ' italic', format: 2 }] }]);
    const paras = contentToParagraphs(doc);
    expect(paras).toHaveLength(1);
    expect(paras[0].runs).toHaveLength(3);
    expect(paras[0].runs[1]).toMatchObject({ text: 'bold', bold: true });
    expect(paras[0].runs[2]).toMatchObject({ text: ' italic', italic: true });
  });

  it('detects a centered scene break from a centered paragraph', () => {
    const doc = lexicalDoc([{ runs: [{ text: '* * *' }], format: 'center' }]);
    const paras = contentToParagraphs(doc);
    expect(paras[0].sceneBreak).toBe(true);
    expect(paras[0].align).toBe('center');
  });

  it('maps underline (8) and strikethrough (4)', () => {
    const doc = lexicalDoc([{ runs: [{ text: 'u', format: 8 }, { text: 's', format: 4 }] }]);
    const paras = contentToParagraphs(doc);
    expect(paras[0].runs[0]).toMatchObject({ underline: true });
    expect(paras[0].runs[1]).toMatchObject({ strikethrough: true });
  });
});

describe('buildManuscriptModel', () => {
  it('builds chapters, word counts and a total (excluding scene breaks)', () => {
    const model = buildManuscriptModel({
      title: '  My Novel  ',
      author: { name: 'Jane Q. Writer', email: 'jane@example.com' },
      chapters: [
        { title: 'One', content: 'the quick brown fox\n* * *\njumps over' },
        { title: '', content: lexicalDoc([{ runs: [{ text: 'two words' }] }]) },
      ],
      options: { titlePage: true },
    });

    expect(model.title).toBe('My Novel');
    expect(model.chapters[0].title).toBe('One');
    expect(model.chapters[1].title).toBe('Chapter 2'); // empty title fallback
    expect(model.chapters[0].wordCount).toBe(6); // scene break excluded
    expect(model.chapters[1].wordCount).toBe(2);
    expect(model.totalWordCount).toBe(8);
  });
});

describe('roundWordCount', () => {
  it('rounds to submission-friendly figures', () => {
    expect(roundWordCount(0)).toBe(0);
    expect(roundWordCount(842)).toBe(800);
    expect(roundWordCount(4_237)).toBe(4_200);
    expect(roundWordCount(83_500)).toBe(84_000);
  });
});
