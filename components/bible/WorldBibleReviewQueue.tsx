'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { X, CheckSquare, Square, ArrowUp, Archive } from 'lucide-react';
import { springs } from '@/lib/animations';
import { InkStampButton } from '@/components/antiquarian';
import { useConfirm } from '@/components/antiquarian/parchment-modal';
import { type WorldBibleSection } from '@/lib/types/world-bible';

interface WorldBibleReviewQueueProps {
  open: boolean;
  onClose: () => void;
  sections: WorldBibleSection[];
  onPromote: (ids: string[], target: 'flexible' | 'confirmed') => void;
  onDiscard: (ids: string[]) => void;
}

/**
 * Phase 4.8 / CB-05 — review queue for draft world-bible sections.
 *
 * Lists every section currently in `draft` status and lets the writer
 * bulk-promote them to `flexible` (default) or `confirmed`. Promoting to
 * confirmed shows the canon-enforcement warning before applying the change.
 */
export function WorldBibleReviewQueue({
  open,
  onClose,
  sections,
  onPromote,
  onDiscard,
}: WorldBibleReviewQueueProps) {
  const t = useTranslations('bible');
  const drafts = useMemo(
    () => sections.filter(s => s.canonStatus === 'draft'),
    [sections],
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set(drafts.map(d => d.id)));
  const [prevOpen, setPrevOpen] = useState(open);
  const { confirm } = useConfirm();

  // React 19 derived-state idiom: reset selection when the modal transitions
  // from closed → open with a fresh draft set. Synchronous setState during
  // render (allowed when guarded by a transition check).
  if (open && !prevOpen) {
    setPrevOpen(true);
    setSelected(new Set(drafts.map(d => d.id)));
  }
  if (!open && prevOpen) {
    setPrevOpen(false);
  }

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === drafts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(drafts.map(d => d.id)));
    }
  };

  const selectedIds = () => drafts.filter(d => selected.has(d.id)).map(d => d.id);

  const handlePromoteFlexible = () => {
    const ids = selectedIds();
    if (ids.length === 0) return;
    onPromote(ids, 'flexible');
    onClose();
  };

  const handlePromoteConfirmed = async () => {
    const ids = selectedIds();
    if (ids.length === 0) return;
    const ok = await confirm({
      title: t('promoteTitle'),
      message: t('promoteAllMessage', { count: ids.length }),
      confirmLabel: t('promoteAllConfirm'),
    });
    if (!ok) return;
    onPromote(ids, 'confirmed');
    onClose();
  };

  const handleDiscard = async () => {
    const ids = selectedIds();
    if (ids.length === 0) return;
    const ok = await confirm({
      title: t('discardSelectedTitle'),
      message: t('discardSelectedMessage', { count: ids.length }),
      confirmLabel: t('discardConfirm'),
      variant: 'danger',
    });
    if (!ok) return;
    onDiscard(ids);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-queue-title"
        >
          <div className="absolute inset-0 bg-sepia-900/60 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={springs.gentle}
            className="relative bg-parchment-100 border border-sepia-300/50 rounded-xl shadow-card-hover max-w-2xl w-full max-h-[80vh] flex flex-col texture-parchment"
          >
            <div className="flex items-center justify-between p-5 border-b border-sepia-300/30">
              <div>
                <h2 id="review-queue-title" className="text-lg font-serif font-semibold text-sepia-900">
                  {t('queueTitle')}
                </h2>
                <p className="text-sm text-sepia-600 mt-0.5">
                  {drafts.length === 0
                    ? t('nothingWaiting')
                    : t('queueDraftCount', { count: drafts.length })}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-full text-sepia-600 hover:text-sepia-800 hover:bg-sepia-300/30 transition-colors"
                aria-label={t('close')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {drafts.length === 0 ? (
                <p className="text-sm text-sepia-600 italic">
                  {t('emptyHint')}
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs text-sepia-600 hover:text-sepia-900 underline"
                  >
                    {selected.size === drafts.length ? t('deselectAll') : t('selectAll')}
                  </button>
                  {drafts.map(s => {
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggle(s.id)}
                        className="w-full flex items-start gap-3 text-left p-3 rounded-lg border border-sepia-300/30 hover:bg-parchment-200/50 transition-colors"
                      >
                        <span className="mt-0.5 shrink-0 text-forest-700">
                          {selected.has(s.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-wider text-sepia-600">
                              {t(`category.${s.category}`)}
                            </span>
                            {s.source === 'ai-extracted' && (
                              <span className="text-[10px] bg-brass-500/10 text-brass-700 px-1.5 py-0.5 rounded-full">AI</span>
                            )}
                          </div>
                          <p className="font-serif font-semibold text-sm text-sepia-900 mt-0.5">
                            {s.title}
                          </p>
                          <p className="text-xs text-sepia-600 mt-0.5 line-clamp-2">{s.content}</p>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>

            {drafts.length > 0 && (
              <div className="flex items-center justify-between p-5 border-t border-sepia-300/30 gap-3 flex-wrap">
                <span className="text-sm text-sepia-600">
                  {t('selectedCount', { selected: selected.size, total: drafts.length })}
                </span>
                <div className="flex items-center gap-2">
                  <InkStampButton
                    variant="ghost"
                    size="sm"
                    icon={<Archive size={14} />}
                    onClick={handleDiscard}
                    disabled={selected.size === 0}
                  >
                    {t('discard')}
                  </InkStampButton>
                  <InkStampButton
                    variant="ghost"
                    size="sm"
                    icon={<ArrowUp size={14} />}
                    onClick={handlePromoteFlexible}
                    disabled={selected.size === 0}
                  >
                    {t('toFlexible')}
                  </InkStampButton>
                  <InkStampButton
                    variant="primary"
                    size="sm"
                    icon={<ArrowUp size={14} />}
                    onClick={handlePromoteConfirmed}
                    disabled={selected.size === 0}
                  >
                    {t('toConfirmed')}
                  </InkStampButton>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
