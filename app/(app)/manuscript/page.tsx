'use client';

import { useStory, Chapter, CanonStatus } from '@/lib/store';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { Plus, Trash2, Edit3, Save, X, BookOpen, ChevronUp, ChevronDown, BookCopy, Search } from 'lucide-react';
import { readVersions } from '@/lib/types/chapter-version';
import { motion, AnimatePresence } from 'motion/react';
import { useConfirm } from '@/components/confirm-dialog';
import { AnimatedNumber, BrassButton, CarvedHeader, EmptyState, ParchmentCard, ParchmentInput, ParchmentTextarea, ParchmentSelect, InkStampButton, WaxSealBadge } from '@/components/antiquarian';
import { useReadingTimeLabel } from '@/lib/i18n/useReadingTimeLabel';
import { FindReplaceDialog } from '@/components/manuscript/FindReplaceDialog';
import { ManuscriptEditor } from '@/components/editor/ManuscriptEditor';
import { getPlainText, wordCount, isLexicalJson } from '@/lib/editor/serialization';
import { addVersion } from '@/lib/types/chapter-version';
import { CommentsPanel } from '@/components/comments/CommentsPanel';
import type { CommentSelection, ManuscriptComment } from '@/lib/types/comment';

function VersionCount({ chapterId }: { chapterId: string }) {
  const t = useTranslations('manuscript');
  const [count, setCount] = useState(0);
  useEffect(() => {
    readVersions(chapterId).then(v => setCount(v.length));
  }, [chapterId]);
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-sepia-600">
      <BookCopy size={10} /> {t('versionCount', { count })}
    </span>
  );
}

export default function ManuscriptPage() {
  const t = useTranslations('manuscript');
  const tStatus = useTranslations('canonStatus');
  const tCommon = useTranslations('common');
  const readingTime = useReadingTimeLabel();
  const { state, updateField } = useStory();
  const { confirm } = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Chapter>>({});
  const [isNewItem, setIsNewItem] = useState(false);
  useUnsavedChanges(editingId !== null);

  // MP-05 — margin comments: latest non-collapsed editor selection (ref so
  // selection churn doesn't re-render) + the selection pinned for composing.
  const selectionRef = useRef<CommentSelection | null>(null);
  const [pendingSelection, setPendingSelection] = useState<CommentSelection | null>(null);
  const handleCommentSelection = useCallback((sel: CommentSelection | null) => {
    if (sel) selectionRef.current = sel;
  }, []);
  const handleCommentShortcut = useCallback(() => {
    if (selectionRef.current) setPendingSelection(selectionRef.current);
  }, []);
  // MP-05 — in-editor highlight ranges: open (unresolved, non-orphaned)
  // comment anchors, decorated by the ManuscriptEditor overlay.
  const [commentRanges, setCommentRanges] = useState<Array<{ start: number; end: number }>>([]);
  const handleCommentsChange = useCallback((comments: ManuscriptComment[]) => {
    setCommentRanges(
      comments
        .filter((c) => !c.resolved && !c.orphaned)
        .map((c) => ({ start: c.startOffset, end: c.endOffset })),
    );
  }, []);
  const editingPlainText = useMemo(
    () => getPlainText(editForm.content || ''),
    [editForm.content],
  );

  const handleAddChapter = () => {
    const newChapter: Chapter = {
      id: crypto.randomUUID(),
      title: t('newChapterTitle', { n: state.chapters.length + 1 }),
      content: '',
      summary: '',
      canonStatus: 'draft',
    };
    updateField('chapters', [...state.chapters, newChapter]);
    setEditingId(newChapter.id);
    setEditForm(newChapter);
    setIsNewItem(true);
  };

  const handleSave = async () => {
    if (!editingId) return;
    if (!editForm.title?.trim()) return;

    // CB-07: snapshot the pre-migration plain text before the rich-text editor
    // first persists Lexical JSON over it, so the conversion stays reversible.
    const original = state.chapters.find((c) => c.id === editingId);
    if (
      original &&
      original.content.trim() &&
      !isLexicalJson(original.content) &&
      isLexicalJson(editForm.content ?? '')
    ) {
      await addVersion(editingId, original.content, 'Before rich text', 'auto-snapshot').catch(() => {
        // Snapshot is best-effort — never block the save.
      });
    }

    const updatedChapters = state.chapters.map((c) =>
      c.id === editingId ? { ...c, ...editForm } : c
    );
    updateField('chapters', updatedChapters as Chapter[]);
    setEditingId(null);
    setIsNewItem(false);
    setPendingSelection(null);
    selectionRef.current = null;
  };

  const handleCancel = () => {
    if (isNewItem && editingId) {
      updateField('chapters', state.chapters.filter(c => c.id !== editingId));
    }
    setEditingId(null);
    setIsNewItem(false);
    setPendingSelection(null);
    selectionRef.current = null;
  };

  const handleDelete = async (id: string) => {
    const chapter = state.chapters.find(c => c.id === id);
    const confirmed = await confirm({
      title: t('deleteTitle'),
      message: t('deleteMessage', { title: chapter?.title || t('deleteFallback') }),
      confirmLabel: tCommon('delete'),
      variant: 'danger',
    });
    if (!confirmed) return;
    updateField('chapters', state.chapters.filter((c) => c.id !== id));
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const updated = [...state.chapters];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    updateField('chapters', updated);
  };

  const handleMoveDown = (index: number) => {
    if (index >= state.chapters.length - 1) return;
    const updated = [...state.chapters];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    updateField('chapters', updated);
  };

  // Memoize total word count — otherwise reduces over every chapter on every render
  const totalWordCount = useMemo(
    () => state.chapters.reduce((sum, c) => sum + wordCount(c.content), 0),
    [state.chapters]
  );

  // Phase 4.2 / MP-06 — find-and-replace dialog
  const [findOpen, setFindOpen] = useState(false);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && !e.shiftKey) {
        // Don't hijack the browser shortcut while the user is editing a
        // textarea — they'd expect the native in-textarea find. We open the
        // global cross-chapter dialog only when no text input has focus.
        const active = document.activeElement;
        const tag = active?.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        setFindOpen(true);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);

  const handleFindReplaceApply = useCallback(
    (edits: Array<{ chapterId: string; newContent: string }>) => {
      const idToContent = new Map(edits.map(e => [e.chapterId, e.newContent]));
      updateField(
        'chapters',
        state.chapters.map(c =>
          idToContent.has(c.id) ? { ...c, content: idToContent.get(c.id)! } : c,
        ),
      );
    },
    [state.chapters, updateField],
  );

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <CarvedHeader
        title={t('title')}
        subtitle={
          <>
            {t('subtitleBase')}
            {state.chapters.length > 0 && (
              // Keyed by count so the stat pulses whenever the total changes
              <motion.span
                key={totalWordCount}
                initial={{ scale: 1.06, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="ml-2 text-sepia-600 font-mono inline-block origin-left"
              >
                {t('subtitleStats', { count: totalWordCount, readingTime: readingTime(totalWordCount) })}
              </motion.span>
            )}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <BrassButton
              onClick={() => setFindOpen(true)}
              icon={<Search size={16} />}
              aria-label={t('findAria')}
              title={t('findTitle')}
            >
              {t('find')}
            </BrassButton>
            <BrassButton onClick={handleAddChapter} icon={<Plus size={18} />}>
              {t('newChapter')}
            </BrassButton>
          </div>
        }
      />

      <div className="space-y-6">
        <AnimatePresence>
          {state.chapters.map((chapter, index) => (
            <motion.div
              key={chapter.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
            <ParchmentCard padding="none" className="overflow-hidden page-stack">
              {editingId === chapter.id ? (
                <div className="p-6 space-y-4">
                  <ParchmentInput
                    type="text"
                    value={editForm.title || ''}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="text-xl font-serif font-semibold"
                    placeholder={t('titlePlaceholder')}
                  />
                  <div className="flex gap-4 items-start">
                    <div className="flex-1 min-w-0">
                      <ManuscriptEditor
                        initialContent={editForm.content || ''}
                        onChange={(json) => setEditForm((f) => ({ ...f, content: json }))}
                        placeholder={t('editorPlaceholder')}
                        onCommentSelection={handleCommentSelection}
                        onCommentShortcut={handleCommentShortcut}
                        highlightRanges={commentRanges}
                      />
                    </div>
                    <CommentsPanel
                      chapterId={chapter.id}
                      plainText={editingPlainText}
                      pendingSelection={pendingSelection}
                      onClearSelection={() => setPendingSelection(null)}
                      onCommentsChange={handleCommentsChange}
                    />
                  </div>
                  <ParchmentTextarea
                    value={editForm.summary || ''}
                    onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
                    className="h-24"
                    placeholder={t('summaryPlaceholder')}
                  />
                  <div className="flex items-center gap-3 pt-2">
                    <ParchmentSelect
                      value={editForm.canonStatus || 'draft'}
                      onChange={(e) => setEditForm({ ...editForm, canonStatus: e.target.value as CanonStatus })}
                    >
                      <option value="confirmed">{tStatus('confirmed')}</option>
                      <option value="flexible">{tStatus('flexible')}</option>
                      <option value="draft">{tStatus('draft')}</option>
                      <option value="discarded">{tStatus('discarded')}</option>
                    </ParchmentSelect>
                    <div className="flex-1" />
                    <InkStampButton variant="ghost" onClick={handleCancel} icon={<X size={18} />}>
                      {tCommon('cancel')}
                    </InkStampButton>
                    <InkStampButton variant="primary" onClick={handleSave} icon={<Save size={18} />}>
                      {t('saveChapter')}
                    </InkStampButton>
                  </div>
                </div>
              ) : (
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-serif font-semibold text-sepia-900">{chapter.title}</h2>
                      {chapter.canonStatus && (
                        <WaxSealBadge status={chapter.canonStatus} />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        className="p-1.5 text-sepia-600 hover:text-sepia-700 hover:bg-sepia-300/20 rounded-lg transition-colors disabled:opacity-30 disabled:hover:text-sepia-600 disabled:hover:bg-transparent"
                        aria-label={t('moveUpAria', { title: chapter.title })}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        onClick={() => handleMoveDown(index)}
                        disabled={index === state.chapters.length - 1}
                        className="p-1.5 text-sepia-600 hover:text-sepia-700 hover:bg-sepia-300/20 rounded-lg transition-colors disabled:opacity-30 disabled:hover:text-sepia-600 disabled:hover:bg-transparent"
                        aria-label={t('moveDownAria', { title: chapter.title })}
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(chapter.id);
                          setEditForm(chapter);
                          setPendingSelection(null);
                          selectionRef.current = null;
                        }}
                        className="p-2 text-sepia-600 hover:text-brass-500 hover:bg-sepia-300/20 rounded-lg transition-colors"
                        aria-label={t('editAria', { title: chapter.title })}
                      >
                        <Edit3 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(chapter.id)}
                        className="p-2 text-sepia-600 hover:text-wax-500 hover:bg-sepia-300/20 rounded-lg transition-colors"
                        aria-label={t('deleteAria', { title: chapter.title })}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="prose prose-sepia max-w-none font-serif text-sepia-700 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                    {getPlainText(chapter.content) || <span className="text-sepia-600 italic">{t('emptyChapter')}</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-sepia-600 font-mono">
                    {/* M18: the ledger rolls to its new count when a save lands */}
                    <span>
                      {t.rich('words', {
                        count: wordCount(chapter.content),
                        n: () => <AnimatedNumber value={wordCount(chapter.content)} pulseOnChange />,
                      })}
                    </span>
                    <span>{readingTime(wordCount(chapter.content))}</span>
                    <VersionCount chapterId={chapter.id} />
                  </div>
                  {chapter.summary && (
                    <div className="mt-6 pt-4 border-t border-sepia-300/50">
                      <p className="text-sm font-medium text-sepia-600 uppercase tracking-wider mb-2">{t('summaryLabel')}</p>
                      <p className="text-sm text-sepia-600">{chapter.summary}</p>
                    </div>
                  )}
                </div>
              )}
            </ParchmentCard>
            </motion.div>
          ))}
        </AnimatePresence>

        {state.chapters.length === 0 && (
          <EmptyState variant="manuscript" title={t('emptyTitle')} subtitle={t('emptySubtitle')} action={{ label: t('emptyAction'), onClick: handleAddChapter }} />
        )}
      </div>

      <FindReplaceDialog
        open={findOpen}
        onClose={() => setFindOpen(false)}
        chapters={state.chapters}
        currentChapterId={editingId}
        onApplyEdits={handleFindReplaceApply}
      />
    </div>
  );
}
