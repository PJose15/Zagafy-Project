'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $createTextNode,
  $isElementNode,
  $isTextNode,
  FORMAT_TEXT_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_DOWN_COMMAND,
  KEY_TAB_COMMAND,
  type EditorState,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type SerializedEditorState,
  type TextFormatType,
} from 'lexical';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { mergeRegister } from '@lexical/utils';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Quote,
  Minus,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { isLexicalJson, buildLexicalStateFromText } from '@/lib/editor/serialization';
import {
  sliceRangesAcrossNodes,
  type AbsoluteRange,
  type HighlightNode,
} from '@/lib/editor/highlight-geometry';
import { COMMENT_ANCHOR_CONTEXT, type CommentSelection } from '@/lib/types/comment';

// ─── Types ───

interface ManuscriptEditorProps {
  /** Initial content — plain text or Lexical JSON string */
  initialContent: string;
  /** Called on every change with the serialized Lexical JSON */
  onChange: (json: string) => void;
  /** Optional: called with plain text on every change (for word count etc.) */
  onPlainTextChange?: (text: string) => void;
  /** Enable/disable browser spellcheck */
  spellCheck?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Additional class for the content area */
  className?: string;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** ID for accessibility */
  id?: string;
  /**
   * MP-05: called whenever the selection changes with the absolute plain-text
   * offsets of the current selection (indexing into `getPlainText(content)`),
   * or null when the selection is collapsed. Not emitted in readOnly mode.
   */
  onCommentSelection?: (selection: CommentSelection | null) => void;
  /** MP-05: Cmd/Ctrl+Shift+C pressed while a non-collapsed selection exists. */
  onCommentShortcut?: () => void;
  /**
   * MP-05: absolute plain-text offset ranges (indexing into
   * `getPlainText(content)`) to decorate with a highlight overlay — typically
   * the anchors of open comments. Only active when not readOnly.
   */
  highlightRanges?: AbsoluteRange[];
}

// ─── Initial config ───

function buildInitialConfig(content: string, readOnly: boolean) {
  let editorState: string | undefined;

  if (isLexicalJson(content)) {
    editorState = content;
  } else if (content) {
    editorState = JSON.stringify(buildLexicalStateFromText(content));
  }

  return {
    namespace: 'ManuscriptEditor',
    onError: (error: Error) => console.error('[ManuscriptEditor]', error),
    editable: !readOnly,
    editorState: editorState || undefined,
    theme: {
      root: 'manuscript-editor-root',
      paragraph: 'manuscript-editor-paragraph',
      text: {
        bold: 'font-bold',
        italic: 'italic',
        underline: 'underline',
        strikethrough: 'line-through',
      },
      quote: 'manuscript-editor-quote',
    },
  };
}

// ─── Toolbar Plugin ───

/**
 * No QuoteNode is registered in this editor config, so the block-quote
 * convention is a "> " text prefix (styled via CSS). Prefix each top-level
 * block covered by the selection IN PLACE — never rebuild or remove nodes,
 * so text outside the selection survives partial and multi-paragraph
 * selections. Already-quoted blocks are skipped to keep the action
 * idempotent. Must run inside `editor.update()`. Exported for tests.
 */
export function $applyBlockQuoteToSelection(): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;

  const seen = new Set<string>();
  const blocks: ElementNode[] = [];
  const addBlock = (node: LexicalNode) => {
    const top = node.getTopLevelElement();
    if (top && $isElementNode(top) && !seen.has(top.getKey())) {
      seen.add(top.getKey());
      blocks.push(top);
    }
  };
  const nodes = selection.getNodes();
  if (nodes.length === 0) addBlock(selection.anchor.getNode());
  for (const node of nodes) addBlock(node);

  for (const block of blocks) {
    if (block.getTextContent().startsWith('> ')) continue;
    const first = block.getFirstChild();
    if ($isTextNode(first)) {
      first.setTextContent(`> ${first.getTextContent()}`);
    } else {
      const prefix = $createTextNode('> ');
      if (first) first.insertBefore(prefix);
      else block.append(prefix);
    }
  }
}

function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const t = useTranslations('manuscriptEditor');

  const formatText = (format: TextFormatType) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const insertSceneBreak = () => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      const breakNode = $createParagraphNode();
      breakNode.append($createTextNode('* * *'));
      breakNode.setFormat('center');

      const afterNode = $createParagraphNode();

      const anchor = selection.anchor.getNode();
      const topLevel = anchor.getTopLevelElementOrThrow();
      topLevel.insertAfter(breakNode);
      breakNode.insertAfter(afterNode);
      afterNode.selectStart();
    });
  };

  const insertBlockQuote = () => {
    editor.update($applyBlockQuoteToSelection);
  };

  const btnClass =
    'p-1.5 rounded text-sepia-600 hover:text-sepia-800 hover:bg-parchment-200/60 transition-colors';
  const dividerClass = 'w-px h-5 bg-sepia-300/40 mx-0.5';

  return (
    <div className="flex items-center gap-0.5 px-3 py-2 border-b border-sepia-300/30 bg-parchment-100/80 rounded-t-lg flex-wrap">
      <button type="button" onClick={() => formatText('bold')} className={btnClass} aria-label={t('bold')} title={t('boldTitle')}>
        <Bold size={15} />
      </button>
      <button type="button" onClick={() => formatText('italic')} className={btnClass} aria-label={t('italic')} title={t('italicTitle')}>
        <Italic size={15} />
      </button>
      <button type="button" onClick={() => formatText('underline')} className={btnClass} aria-label={t('underline')} title={t('underlineTitle')}>
        <Underline size={15} />
      </button>
      <button type="button" onClick={() => formatText('strikethrough')} className={btnClass} aria-label={t('strikethrough')} title={t('strikethroughTitle')}>
        <Strikethrough size={15} />
      </button>

      <div className={dividerClass} />

      <button type="button" onClick={insertBlockQuote} className={btnClass} aria-label={t('blockQuote')} title={t('blockQuoteTitle')}>
        <Quote size={15} />
      </button>
      <button type="button" onClick={insertSceneBreak} className={btnClass} aria-label={t('sceneBreak')} title={t('sceneBreakTitle')}>
        <Minus size={15} />
      </button>
    </div>
  );
}

// ─── Auto-format Plugin (em-dash, curly quotes) ───

/**
 * Whether a quote typed at the current caret should be an OPENING quote.
 * An element anchor (e.g. the caret in an empty paragraph — the usual
 * opening-dialogue position) has no preceding char, so it opens. Must run
 * inside an editor read/update. Exported for tests.
 */
export function $isOpeningQuoteAtCaret(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return true;
  const anchor = selection.anchor;
  const node = anchor.getNode();
  if (node.getType() !== 'text') return true;
  const text = node.getTextContent();
  const offset = anchor.offset;
  const charBefore = offset > 0 ? text[offset - 1] : '';
  return !charBefore || /[\s(\[]/.test(charBefore);
}

function AutoFormatPlugin() {
  const [editor] = useLexicalComposerContext();

  // Auto-replace (em-dash, curly quotes) on keypress via input events.
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const handleBeforeInput = (e: InputEvent) => {
      if (e.inputType !== 'insertText' || !e.data) return;

      // Em-dash: -- → —
      if (e.data === '-') {
        editor.getEditorState().read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const anchor = selection.anchor;
          const node = anchor.getNode();
          if (node.getType() !== 'text') return;
          const text = node.getTextContent();
          const offset = anchor.offset;
          if (offset >= 1 && text[offset - 1] === '-') {
            // Schedule the replacement
            setTimeout(() => {
              editor.update(() => {
                const sel = $getSelection();
                if (!$isRangeSelection(sel)) return;
                const n = sel.anchor.getNode();
                if (n.getType() !== 'text') return;
                const t = n.getTextContent();
                const o = sel.anchor.offset;
                // Check if we now have "--" at the cursor
                if (o >= 2 && t.substring(o - 2, o) === '--') {
                  const newText = t.substring(0, o - 2) + '\u2014' + t.substring(o);
                  if ('setTextContent' in n && typeof n.setTextContent === 'function') {
                    (n as import('lexical').TextNode).setTextContent(newText);
                    sel.anchor.set(n.getKey(), o - 1, 'text');
                    sel.focus.set(n.getKey(), o - 1, 'text');
                  }
                }
              });
            }, 0);
          }
        });
      }

      // Curly quotes: " → smart quotes
      if (e.data === '"') {
        editor.getEditorState().read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const isOpening = $isOpeningQuoteAtCaret();

          e.preventDefault();
          setTimeout(() => {
            editor.update(() => {
              const sel = $getSelection();
              if (!$isRangeSelection(sel)) return;
              sel.insertRawText(isOpening ? '\u201C' : '\u201D');
            });
          }, 0);
        });
      }

      // Curly single quotes
      if (e.data === "'") {
        editor.getEditorState().read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const isOpening = $isOpeningQuoteAtCaret();

          e.preventDefault();
          setTimeout(() => {
            editor.update(() => {
              const sel = $getSelection();
              if (!$isRangeSelection(sel)) return;
              sel.insertRawText(isOpening ? '\u2018' : '\u2019');
            });
          }, 0);
        });
      }
    };

    root.addEventListener('beforeinput', handleBeforeInput);
    return () => root.removeEventListener('beforeinput', handleBeforeInput);
  }, [editor]);

  return null;
}

// ─── Tab override plugin ───

function TabPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_TAB_COMMAND,
      (event: KeyboardEvent) => {
        event.preventDefault();
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertRawText('\t');
          }
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}

// ─── Ref plugin to expose editor instance ───

function EditorRefPlugin({ editorRef }: { editorRef: React.MutableRefObject<LexicalEditor | null> }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editorRef.current = editor;
  }, [editor, editorRef]);
  return null;
}

// ─── Comment selection plugin (MP-05) ───
//
// Computes ABSOLUTE plain-text offsets of the current selection using the
// exact traversal/join rules of `lexicalJsonToPlaintext` (serialization.ts):
// root children are joined with '\n'; inside any other element, children are
// concatenated with no separator; text nodes contribute their text; nodes
// that are neither text nor elements (linebreaks, decorators) contribute ''.
// Offsets therefore index into `getPlainText(chapter.content)` exactly.

/** Plain text of one node, mirroring `extractTextFromNode` for non-root nodes. */
function $nodePlainText(node: LexicalNode): string {
  if ($isTextNode(node)) return node.getTextContent();
  if ($isElementNode(node)) return node.getChildren().map($nodePlainText).join('');
  return '';
}

/** Full document plain text, mirroring `lexicalJsonToPlaintext`. */
function $documentPlainText(): string {
  return $getRoot().getChildren().map($nodePlainText).join('\n');
}

/**
 * Absolute plain-text offset of a selection point. Walks the tree in document
 * order, accumulating text lengths with the same join rules as above ('\n'
 * between root children only).
 */
function $absolutePointOffset(point: { key: string; offset: number; type: 'text' | 'element' }): number | null {
  const root = $getRoot();
  const rootKey = root.getKey();
  let acc = 0;
  let result: number | null = null;

  const resolveAt = (node: LexicalNode): void => {
    if ($isTextNode(node)) {
      result = acc + Math.min(point.offset, node.getTextContent().length);
      return;
    }
    if ($isElementNode(node)) {
      // Element point: offset is a child index — sum the preceding children.
      const children = node.getChildren();
      const isRoot = node.getKey() === rootKey;
      let sub = 0;
      for (let i = 0; i < point.offset && i < children.length; i++) {
        if (isRoot && i > 0) sub += 1; // '\n' between top-level blocks
        sub += $nodePlainText(children[i]).length;
      }
      // Position sits at the start of child `offset` — account for the '\n'
      // separating it from the previous top-level block.
      if (isRoot && point.offset > 0 && point.offset < children.length) sub += 1;
      result = acc + sub;
      return;
    }
    result = acc;
  };

  const visit = (node: LexicalNode): boolean => {
    if (node.getKey() === point.key) {
      resolveAt(node);
      return true;
    }
    if ($isTextNode(node)) {
      acc += node.getTextContent().length;
      return false;
    }
    if ($isElementNode(node)) {
      const children = node.getChildren();
      const isRoot = node.getKey() === rootKey;
      for (let i = 0; i < children.length; i++) {
        if (isRoot && i > 0) acc += 1; // '\n' join between top-level blocks
        if (visit(children[i])) return true;
      }
    }
    return false;
  };

  visit(root);
  return result;
}

/** Current selection as absolute offsets + quote/context, or null if collapsed. */
function $computeCommentSelection(): CommentSelection | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return null;

  const anchor = $absolutePointOffset(selection.anchor);
  const focus = $absolutePointOffset(selection.focus);
  if (anchor === null || focus === null) return null;

  const fullText = $documentPlainText();
  const start = Math.min(Math.min(anchor, focus), fullText.length);
  const end = Math.min(Math.max(anchor, focus), fullText.length);
  if (start === end) return null;

  return {
    start,
    end,
    quote: fullText.slice(start, end),
    prefix: fullText.slice(Math.max(0, start - COMMENT_ANCHOR_CONTEXT), start),
    suffix: fullText.slice(end, end + COMMENT_ANCHOR_CONTEXT),
  };
}

function CommentSelectionPlugin({
  onCommentSelection,
  onCommentShortcut,
}: {
  onCommentSelection?: (selection: CommentSelection | null) => void;
  onCommentShortcut?: () => void;
}) {
  const [editor] = useLexicalComposerContext();
  const hasSelectionRef = useRef(false);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          const sel = $computeCommentSelection();
          hasSelectionRef.current = sel !== null;
          onCommentSelection?.(sel);
        });
      }),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event: KeyboardEvent) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            event.shiftKey &&
            event.key.toLowerCase() === 'c' &&
            hasSelectionRef.current
          ) {
            event.preventDefault();
            onCommentShortcut?.();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, onCommentSelection, onCommentShortcut]);

  return null;
}

// ─── Comment highlight plugin (MP-05) ───
//
// Non-invasive overlay decoration of commented ranges. Deliberately does NOT
// insert Lexical mark/decorator nodes — that would mutate the chapter JSON
// (dirtying content, word counts, sync deltas). Instead it converts absolute
// plain-text ranges into per-text-node segments (same traversal/join rules as
// `lexicalJsonToPlaintext`), measures them via DOM Ranges, and paints
// absolutely-positioned tinted divs in an overlay portal.

/** Brass-500 tint for commented text (see design palette). */
const HIGHLIGHT_COLOR = 'rgba(196,155,72,0.22)';

interface HighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Walk text nodes in document order using the exact join rules of
 * `lexicalJsonToPlaintext`: root children joined with '\n', other elements
 * concatenated, non-text/non-element nodes contribute ''. Joins that occur
 * before any text node (leading empty blocks) are carried by a zero-length
 * sentinel entry, which `sliceRangesAcrossNodes` never emits segments for.
 */
function $collectHighlightNodes(): HighlightNode[] {
  const nodes: HighlightNode[] = [];
  const addJoin = () => {
    if (nodes.length === 0) {
      nodes.push({ key: '', length: 0, joinAfter: 1 });
    } else {
      nodes[nodes.length - 1].joinAfter += 1;
    }
  };
  const root = $getRoot();
  const rootKey = root.getKey();

  const visit = (node: LexicalNode): void => {
    if ($isTextNode(node)) {
      nodes.push({ key: node.getKey(), length: node.getTextContent().length, joinAfter: 0 });
      return;
    }
    if ($isElementNode(node)) {
      const children = node.getChildren();
      const isRoot = node.getKey() === rootKey;
      for (let i = 0; i < children.length; i++) {
        if (isRoot && i > 0) addJoin(); // '\n' join between top-level blocks
        visit(children[i]);
      }
    }
    // Other node types (linebreaks, decorators) contribute '' — skip.
  };

  visit(root);
  return nodes;
}

/** First DOM Text descendant of a Lexical text node's element. */
function firstTextDescendant(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text;
  for (let i = 0; i < node.childNodes.length; i++) {
    const found = firstTextDescendant(node.childNodes[i]);
    if (found) return found;
  }
  return null;
}

function CommentHighlightPlugin({ ranges }: { ranges: AbsoluteRange[] }) {
  const [editor] = useLexicalComposerContext();
  const [rects, setRects] = useState<HighlightRect[]>([]);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);

  const compute = useCallback(() => {
    const rootEl = editor.getRootElement();
    const container = rootEl?.parentElement ?? null;
    if (!rootEl || !container || ranges.length === 0) {
      setRects([]);
      return;
    }

    const segments = editor
      .getEditorState()
      .read(() => sliceRangesAcrossNodes($collectHighlightNodes(), ranges));

    const containerRect = container.getBoundingClientRect();
    const next: HighlightRect[] = [];
    for (const seg of segments) {
      const el = editor.getElementByKey(seg.key);
      if (!el) continue;
      const textDom = firstTextDescendant(el);
      if (!textDom) continue;
      const max = textDom.data.length;
      const range = document.createRange();
      range.setStart(textDom, Math.min(seg.start, max));
      range.setEnd(textDom, Math.min(seg.end, max));
      const clientRects = range.getClientRects();
      for (let i = 0; i < clientRects.length; i++) {
        const r = clientRects[i];
        if (r.width <= 0 || r.height <= 0) continue;
        next.push({
          left: r.left - containerRect.left,
          top: r.top - containerRect.top,
          width: r.width,
          height: r.height,
        });
      }
    }
    setRects(next);
  }, [editor, ranges]);

  // Keep the latest compute in a ref so `schedule` stays stable across
  // `ranges` changes (avoids re-registering listeners on every re-anchor).
  const computeRef = useRef(compute);

  const schedule = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      computeRef.current();
    });
  }, []);

  // Recompute when the ranges themselves change.
  useEffect(() => {
    computeRef.current = compute;
    schedule();
  }, [compute, schedule]);

  // Recompute on editor updates, root resize, and internal scroll.
  useEffect(() => {
    let resizeObserver: ResizeObserver | null = null;
    let scrollTarget: HTMLElement | null = null;

    const detach = () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
      scrollTarget?.removeEventListener('scroll', schedule);
      scrollTarget = null;
    };

    const unregister = mergeRegister(
      editor.registerRootListener((rootElement) => {
        detach();
        setHost(rootElement?.parentElement ?? null);
        if (rootElement) {
          if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(schedule);
            resizeObserver.observe(rootElement);
          }
          // The content area scrolls internally (overflow-y-auto).
          rootElement.addEventListener('scroll', schedule, { passive: true });
          scrollTarget = rootElement;
          schedule();
        }
      }),
      editor.registerUpdateListener(schedule),
    );

    return () => {
      unregister();
      detach();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [editor, schedule]);

  if (!host || rects.length === 0) return null;

  return createPortal(
    <div
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
    >
      {rects.map((r, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            backgroundColor: HIGHLIGHT_COLOR,
            borderRadius: 2,
            pointerEvents: 'none',
          }}
        />
      ))}
    </div>,
    host,
  );
}

// ─── Main component ───

export function ManuscriptEditor({
  initialContent,
  onChange,
  onPlainTextChange,
  spellCheck = true,
  placeholder,
  className = '',
  readOnly = false,
  id,
  onCommentSelection,
  onCommentShortcut,
  highlightRanges,
}: ManuscriptEditorProps) {
  const t = useTranslations('manuscriptEditor');
  const placeholderText = placeholder ?? t('placeholder');
  const editorRef = useRef<LexicalEditor | null>(null);

  const initialConfig = useMemo(
    () => buildInitialConfig(initialContent, readOnly),
    // Only compute on mount — content updates come via onChange
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleChange = useCallback(
    (editorState: EditorState) => {
      const json = JSON.stringify(editorState.toJSON());
      onChange(json);

      if (onPlainTextChange) {
        editorState.read(() => {
          const root = $getRoot();
          onPlainTextChange(root.getTextContent());
        });
      }
    },
    [onChange, onPlainTextChange],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className={`border border-sepia-300/50 rounded-lg bg-parchment-100 ${className}`}>
        {!readOnly && <ToolbarPlugin />}
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                id={id}
                className="min-h-[16rem] max-h-[70vh] overflow-y-auto px-4 py-3 text-sepia-800 font-serif text-base leading-relaxed outline-none custom-scrollbar manuscript-editor-content"
                spellCheck={spellCheck}
                aria-label={t('contentAria')}
              />
            }
            placeholder={
              <div className="absolute top-3 left-4 text-sepia-600 pointer-events-none font-serif text-base">
                {placeholderText}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
        <HistoryPlugin />
        {!readOnly && <AutoFormatPlugin />}
        {!readOnly && (onCommentSelection || onCommentShortcut) && (
          <CommentSelectionPlugin
            onCommentSelection={onCommentSelection}
            onCommentShortcut={onCommentShortcut}
          />
        )}
        {!readOnly && highlightRanges && <CommentHighlightPlugin ranges={highlightRanges} />}
        <TabPlugin />
        <EditorRefPlugin editorRef={editorRef} />
      </div>
    </LexicalComposer>
  );
}
