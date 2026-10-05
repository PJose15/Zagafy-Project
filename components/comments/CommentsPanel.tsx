'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useModalHygiene } from '@/hooks/use-modal-hygiene';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronRight, MessageSquare, Unlink, X } from 'lucide-react';
import { InkStampButton, ParchmentCard, ParchmentTextarea } from '@/components/antiquarian';
import { springs } from '@/lib/animations';
import {
  addComment,
  addReply,
  deleteComment,
  listComments,
  putComments,
  reanchorAll,
  setResolved,
  updateCommentText,
} from '@/lib/comments/comments';
import type { CommentSelection, ManuscriptComment } from '@/lib/types/comment';
import { CommentCard } from './CommentCard';

interface CommentsPanelProps {
  chapterId: string;
  /** Current chapter plain text — `getPlainText(chapter.content)`. */
  plainText: string;
  /** Selection captured from the editor, pending a new comment. */
  pendingSelection: CommentSelection | null;
  onClearSelection: () => void;
  /**
   * Called whenever the comment list changes (load, re-anchor, add, delete,
   * resolve) — lets the page derive highlight ranges for the editor.
   */
  onCommentsChange?: (comments: ManuscriptComment[]) => void;
}

const REANCHOR_DEBOUNCE_MS = 400;

export function CommentsPanel({
  chapterId,
  plainText,
  pendingSelection,
  onClearSelection,
  onCommentsChange,
}: CommentsPanelProps) {
  const t = useTranslations('comments');
  const [comments, setComments] = useState<ManuscriptComment[]>([]);
  const [draft, setDraft] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Load this chapter's comments.
  useEffect(() => {
    let cancelled = false;
    listComments(chapterId).then((rows) => {
      if (!cancelled) setComments(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  // Surface every comment-list change (load/re-anchor/add/delete/resolve) so
  // the page can derive editor highlight ranges.
  useEffect(() => {
    onCommentsChange?.(comments);
  }, [comments, onCommentsChange]);

  // Re-anchor against the current text (debounced — plainText changes on every
  // keystroke while editing). Persists any offset/orphan updates.
  useEffect(() => {
    if (comments.length === 0) return;
    const handle = setTimeout(() => {
      const { comments: updated, changed } = reanchorAll(comments, plainText);
      if (changed.length > 0) {
        setComments(updated);
        void putComments(changed);
      }
    }, REANCHOR_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [comments, plainText]);

  // A fresh selection on a small screen should surface the composer: the
  // sheet is derived-open while a pending selection exists, unless the writer
  // explicitly dismissed the sheet for that selection.
  const [dismissedSelection, setDismissedSelection] = useState<CommentSelection | null>(null);
  const sheetVisible = !desktop &&
    (sheetOpen || (pendingSelection !== null && pendingSelection !== dismissedSelection));
  const closeSheet = () => {
    setSheetOpen(false);
    setDismissedSelection(pendingSelection);
  };
  useModalHygiene(sheetRef, closeSheet, sheetVisible);
  useEffect(() => {
    if (sheetVisible) closeRef.current?.focus();
  }, [sheetVisible]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const resize = () => {
      setDesktop(media.matches);
      if (media.matches) {
        setSheetOpen(false);
        setDismissedSelection(pendingSelection);
      }
    };
    resize();
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, [pendingSelection]);

  const open = useMemo(
    () =>
      comments
        .filter((c) => !c.resolved && !c.orphaned)
        .sort((a, b) => a.startOffset - b.startOffset),
    [comments],
  );
  const resolved = useMemo(() => comments.filter((c) => c.resolved && !c.orphaned), [comments]);
  const orphaned = useMemo(() => comments.filter((c) => c.orphaned), [comments]);

  const handleSave = async () => {
    if (!pendingSelection || !draft.trim()) return;
    const created = await addComment({
      chapterId,
      startOffset: pendingSelection.start,
      endOffset: pendingSelection.end,
      quote: pendingSelection.quote,
      prefix: pendingSelection.prefix,
      suffix: pendingSelection.suffix,
      text: draft.trim(),
    });
    setComments((prev) => [...prev, created]);
    setDraft('');
    onClearSelection();
  };

  const handleCancel = () => {
    setDraft('');
    onClearSelection();
  };

  const handleResolveToggle = (id: string, value: boolean) => {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, resolved: value } : c)));
    void setResolved(id, value);
  };

  const handleDelete = (id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
    void deleteComment(id);
  };

  const handleEdit = (id: string, text: string) => {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, text } : c)));
    void updateCommentText(id, text);
  };

  const handleReply = (id: string, text: string) => {
    void addReply(id, text).then((reply) => {
      if (!reply) return;
      setComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, replies: [...c.replies, reply] } : c)),
      );
    });
  };

  const totalCount = open.length + orphaned.length;

  const body = (
    <div className="space-y-4">
      {pendingSelection && (
        <div className="rounded-lg border border-brass-500/50 bg-parchment-50 p-3 space-y-2">
          <blockquote className="border-l-2 border-brass-500 pl-2 text-xs italic text-sepia-600 font-serif">
            {pendingSelection.quote.length > 80
              ? `${pendingSelection.quote.slice(0, 80)}…`
              : pendingSelection.quote}
          </blockquote>
          <ParchmentTextarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('placeholder')}
            aria-label={t('placeholder')}
            className="h-20 text-sm"
          />
          <div className="flex items-center justify-end gap-2">
            <InkStampButton variant="ghost" onClick={handleCancel}>
              {t('cancel')}
            </InkStampButton>
            <InkStampButton variant="primary" onClick={handleSave} disabled={!draft.trim()}>
              {t('save')}
            </InkStampButton>
          </div>
        </div>
      )}

      {open.length === 0 && !pendingSelection && (
        <div className="text-sm text-sepia-600 space-y-1">
          <p>{t('empty')}</p>
          <p className="text-xs italic">{t('shortcutHint')}</p>
        </div>
      )}

      {open.map((comment) => (
        <CommentCard
          key={comment.id}
          comment={comment}
          onResolveToggle={handleResolveToggle}
          onDelete={handleDelete}
          onReply={handleReply}
                onEdit={handleEdit}
        />
      ))}

      {resolved.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowResolved((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-sepia-600 hover:text-sepia-800 uppercase tracking-wider transition-colors"
            aria-expanded={showResolved}
          >
            {showResolved ? (
              <ChevronDown size={12} aria-hidden="true" />
            ) : (
              <ChevronRight size={12} aria-hidden="true" />
            )}
            {t('resolvedGroup', { count: resolved.length })}
          </button>
          {showResolved &&
            resolved.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                onResolveToggle={handleResolveToggle}
                onDelete={handleDelete}
                onReply={handleReply}
                onEdit={handleEdit}
              />
            ))}
        </div>
      )}

      {orphaned.length > 0 && (
        <div className="space-y-2 border-t border-sepia-300/40 pt-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-sepia-600 uppercase tracking-wider">
            <Unlink size={12} aria-hidden="true" />
            {t('orphanedTitle')}
          </p>
          <p className="text-xs text-sepia-600 italic">{t('orphanedExplanation')}</p>
          {orphaned.map((comment) => (
            <div
              key={comment.id}
              className="rounded-lg border border-sepia-300/40 bg-parchment-50 p-3 space-y-1.5"
            >
              <blockquote className="border-l-2 border-sepia-300 pl-2 text-xs italic text-sepia-600 font-serif line-through">
                {comment.quote.length > 80 ? `${comment.quote.slice(0, 80)}…` : comment.quote}
              </blockquote>
              <p className="text-sm text-sepia-800 whitespace-pre-wrap">{comment.text}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleResolveToggle(comment.id, true)}
                  className="text-xs text-forest-600 hover:text-forest-700 transition-colors"
                >
                  {t('resolve')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(comment.id)}
                  className="text-xs text-wax-600 hover:text-wax-700 transition-colors"
                >
                  {t('delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop: right margin column */}
      <aside className="hidden lg:block w-80 shrink-0" aria-label={t('panelAria')}>
        <ParchmentCard className="max-h-[70vh] overflow-y-auto custom-scrollbar">
          <h3 className="text-sm font-serif font-semibold text-sepia-900 uppercase tracking-wider mb-3">
            {t('panelTitle')}
          </h3>
          {body}
        </ParchmentCard>
      </aside>

      {/* Keep the mobile trigger in flow so it cannot cover chapter actions. */}
      <div className="lg:hidden w-full">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2 rounded-lg bg-forest-700 text-cream-50 shadow-lg hover:bg-forest-600 transition-colors"
          aria-label={t('mobileButtonAria', { count: totalCount })}
          aria-expanded={sheetVisible}
        >
          <MessageSquare size={20} aria-hidden="true" />
          <span>{t('panelTitle')}</span>
          {totalCount > 0 && (
            <span
              className="min-w-[1.25rem] h-5 px-1 rounded-full bg-brass-500 text-parchment-50 text-xs font-bold flex items-center justify-center"
              aria-hidden="true"
            >
              {totalCount}
            </span>
          )}
        </button>

        <AnimatePresence>
          {sheetVisible && (
            <motion.div
              ref={sheetRef}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={springs.gentle}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-parchment-100 border-t border-x border-sepia-300/50 shadow-2xl p-4 custom-scrollbar"
              role="dialog"
              aria-modal="true"
              aria-label={t('panelTitle')}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-serif font-semibold text-sepia-900 uppercase tracking-wider">
                  {t('panelTitle')}
                </h3>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={closeSheet}
                  className="p-1.5 rounded text-sepia-600 hover:text-sepia-800 hover:bg-parchment-200/60 transition-colors"
                  aria-label={t('close')}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              {body}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
