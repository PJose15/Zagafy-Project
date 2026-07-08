'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $createTextNode,
  FORMAT_TEXT_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_TAB_COMMAND,
  type EditorState,
  type LexicalEditor,
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
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      const quoteNode = $createParagraphNode();
      // We use a simple approach: prefix with ">" for block quote styling
      // This is handled via CSS class in the theme
      const textContent = selection.getTextContent();
      quoteNode.append($createTextNode(textContent ? `> ${textContent}` : '> '));

      const anchor = selection.anchor.getNode();
      const topLevel = anchor.getTopLevelElementOrThrow();
      topLevel.insertAfter(quoteNode);
      topLevel.remove();
      quoteNode.selectEnd();
    });
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
          const anchor = selection.anchor;
          const node = anchor.getNode();
          if (node.getType() !== 'text') return;
          const text = node.getTextContent();
          const offset = anchor.offset;
          const charBefore = offset > 0 ? text[offset - 1] : '';
          const isOpening = !charBefore || /[\s(\[]/.test(charBefore);

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
          const anchor = selection.anchor;
          const node = anchor.getNode();
          if (node.getType() !== 'text') return;
          const text = node.getTextContent();
          const offset = anchor.offset;
          const charBefore = offset > 0 ? text[offset - 1] : '';
          const isOpening = !charBefore || /[\s(\[]/.test(charBefore);

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
        <TabPlugin />
        <EditorRefPlugin editorRef={editorRef} />
      </div>
    </LexicalComposer>
  );
}
