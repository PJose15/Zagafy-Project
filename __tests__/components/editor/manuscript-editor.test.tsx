import { describe, it, expect } from 'vitest';
import {
  createEditor,
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  $createRangeSelection,
  $setSelection,
  type ElementNode,
  type LexicalEditor,
  type TextNode,
} from 'lexical';

import {
  $applyBlockQuoteToSelection,
  $isOpeningQuoteAtCaret,
} from '@/components/editor/ManuscriptEditor';

// The transforms run inside `editor.update()` against editor STATE, so they
// are tested headlessly (no root element): selection re-derivation from the
// DOM — unsupported in happy-dom — never gets a chance to interfere.

function makeEditor(lines: string[]): LexicalEditor {
  const editor = createEditor({
    namespace: 'test',
    onError: (error) => {
      throw error;
    },
  });
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      for (const line of lines) {
        const p = $createParagraphNode();
        if (line) p.append($createTextNode(line));
        root.append(p);
      }
    },
    { discrete: true },
  );
  return editor;
}

function paragraphTexts(editor: LexicalEditor): string[] {
  return editor
    .getEditorState()
    .read(() => $getRoot().getChildren().map((n) => n.getTextContent()));
}

/** Set a text-point selection and apply the block quote in ONE update. */
function applyWithTextSelection(
  editor: LexicalEditor,
  anchorPara: number,
  anchorOffset: number,
  focusPara: number,
  focusOffset: number,
) {
  editor.update(
    () => {
      const paras = $getRoot().getChildren();
      const anchorText = (paras[anchorPara] as ElementNode).getFirstChild() as TextNode;
      const focusText = (paras[focusPara] as ElementNode).getFirstChild() as TextNode;
      const sel = $createRangeSelection();
      sel.anchor.set(anchorText.getKey(), anchorOffset, 'text');
      sel.focus.set(focusText.getKey(), focusOffset, 'text');
      $setSelection(sel);
      $applyBlockQuoteToSelection();
    },
    { discrete: true },
  );
}

const THREE_PARAS = ['First paragraph', 'Second paragraph', 'Third paragraph'];

describe('$applyBlockQuoteToSelection', () => {
  it('prefixes only the selected paragraph in place — partial selection loses no text', () => {
    const editor = makeEditor(THREE_PARAS);

    // Select "paragraph" inside the first block only.
    applyWithTextSelection(editor, 0, 6, 0, 15);

    expect(paragraphTexts(editor)).toEqual([
      '> First paragraph',
      'Second paragraph',
      'Third paragraph',
    ]);
  });

  it('prefixes every paragraph covered by a multi-paragraph selection without duplication', () => {
    const editor = makeEditor(THREE_PARAS);

    applyWithTextSelection(editor, 0, 2, 2, 4);

    expect(paragraphTexts(editor)).toEqual([
      '> First paragraph',
      '> Second paragraph',
      '> Third paragraph',
    ]);
  });

  it('is idempotent — applying twice does not double-prefix', () => {
    const editor = makeEditor(THREE_PARAS);

    applyWithTextSelection(editor, 1, 0, 1, 5);
    applyWithTextSelection(editor, 1, 0, 1, 5);

    expect(paragraphTexts(editor)).toEqual([
      'First paragraph',
      '> Second paragraph',
      'Third paragraph',
    ]);
  });

  it('handles a collapsed caret in a paragraph (quotes just that block)', () => {
    const editor = makeEditor(THREE_PARAS);

    applyWithTextSelection(editor, 2, 5, 2, 5);

    expect(paragraphTexts(editor)).toEqual([
      'First paragraph',
      'Second paragraph',
      '> Third paragraph',
    ]);
  });

  it('quotes an empty paragraph via an element-point selection', () => {
    const editor = makeEditor(['Before', '', 'After']);

    editor.update(
      () => {
        const empty = $getRoot().getChildren()[1];
        const sel = $createRangeSelection();
        sel.anchor.set(empty.getKey(), 0, 'element');
        sel.focus.set(empty.getKey(), 0, 'element');
        $setSelection(sel);
        $applyBlockQuoteToSelection();
      },
      { discrete: true },
    );

    expect(paragraphTexts(editor)).toEqual(['Before', '> ', 'After']);
  });
});

describe('$isOpeningQuoteAtCaret', () => {
  function isOpeningAt(
    editor: LexicalEditor,
    setSel: () => void,
  ): boolean {
    let result = false;
    editor.update(
      () => {
        setSel();
        result = $isOpeningQuoteAtCaret();
      },
      { discrete: true },
    );
    return result;
  }

  function textPoint(paraIndex: number, offset: number): () => void {
    return () => {
      const paras = $getRoot().getChildren();
      const text = (paras[paraIndex] as ElementNode).getFirstChild() as TextNode;
      const sel = $createRangeSelection();
      sel.anchor.set(text.getKey(), offset, 'text');
      sel.focus.set(text.getKey(), offset, 'text');
      $setSelection(sel);
    };
  }

  it('opens at the start of an EMPTY paragraph (element anchor)', () => {
    const editor = makeEditor(['']);
    const result = isOpeningAt(editor, () => {
      const empty = $getRoot().getChildren()[0];
      const sel = $createRangeSelection();
      sel.anchor.set(empty.getKey(), 0, 'element');
      sel.focus.set(empty.getKey(), 0, 'element');
      $setSelection(sel);
    });
    expect(result).toBe(true);
  });

  it('opens at offset 0 of a text node', () => {
    const editor = makeEditor(['Hello']);
    expect(isOpeningAt(editor, textPoint(0, 0))).toBe(true);
  });

  it('opens after a space', () => {
    const editor = makeEditor(['Hello ']);
    expect(isOpeningAt(editor, textPoint(0, 6))).toBe(true);
  });

  it('closes mid-word', () => {
    const editor = makeEditor(['Hello']);
    expect(isOpeningAt(editor, textPoint(0, 3))).toBe(false);
  });
});
