/**
 * CB-07 — Lexical serialization utilities.
 *
 * Converts between plain text, Lexical JSON, and HTML.
 * Used for migration, find-replace, prose analysis, and export.
 */

import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
  type SerializedEditorState,
} from 'lexical';

/**
 * Convert a plain-text string into a Lexical serialized state (JSON).
 * Each line becomes a paragraph node; empty lines are preserved.
 */
export function plaintextToLexicalJson(text: string): string {
  const editor = createEditor({ namespace: 'migration', onError: () => {} });
  const state = editor.parseEditorState(
    JSON.stringify(buildLexicalStateFromText(text)),
  );
  return JSON.stringify(state.toJSON());
}

/**
 * Build a raw Lexical SerializedEditorState from plain text.
 * This avoids needing a mounted editor for the conversion.
 */
export function buildLexicalStateFromText(text: string): SerializedEditorState {
  const lines = text.split('\n');
  const children = lines.map((line) => ({
    type: 'paragraph',
    version: 1,
    direction: null,
    format: '' as const,
    indent: 0,
    textFormat: 0,
    textStyle: '',
    children: line.length > 0
      ? [{ type: 'text', version: 1, text: line, format: 0, style: '', detail: 0, mode: 'normal' as const }]
      : [],
  }));

  return {
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '' as const,
      indent: 0,
      children,
    },
  } as SerializedEditorState;
}

/**
 * Extract plain text from a Lexical serialized JSON string.
 * Each paragraph becomes a line; inline text is concatenated.
 */
export function lexicalJsonToPlaintext(json: string): string {
  try {
    const state: SerializedEditorState = JSON.parse(json);
    return extractTextFromNode(state.root);
  } catch {
    return json; // Fallback: treat as plain text if parse fails
  }
}

function extractTextFromNode(node: Record<string, unknown>): string {
  if (node.type === 'text') {
    return (node.text as string) || '';
  }

  const children = node.children as Record<string, unknown>[] | undefined;
  if (!children || !Array.isArray(children)) return '';

  if (node.type === 'root') {
    return children.map(extractTextFromNode).join('\n');
  }

  // Paragraph, heading, listitem, etc — children joined without separator
  return children.map(extractTextFromNode).join('');
}

/**
 * Detect whether a content string is Lexical JSON or plain text.
 */
export function isLexicalJson(content: string): boolean {
  if (!content || content.length < 10) return false;
  try {
    const parsed = JSON.parse(content);
    return parsed?.root?.type === 'root';
  } catch {
    return false;
  }
}

/**
 * Get plain text from content regardless of format.
 * If it's Lexical JSON, extracts text. If it's plain text, returns as-is.
 */
export function getPlainText(content: string): string {
  if (isLexicalJson(content)) {
    return lexicalJsonToPlaintext(content);
  }
  return content;
}

/**
 * Word count from any content format.
 */
export function wordCount(content: string): number {
  const text = getPlainText(content).trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}
