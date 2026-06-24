'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { X, CheckSquare, Square, AlertTriangle } from 'lucide-react';
import { springs } from '@/lib/animations';
import { InkStampButton } from '@/components/antiquarian';
import { type WorldBibleSection, type WorldBibleCategory } from '@/lib/types/world-bible';

interface WorldBibleMergeModalProps {
  open: boolean;
  onClose: () => void;
  incoming: WorldBibleSection[];
  existing: WorldBibleSection[];
  onConfirm: (selected: WorldBibleSection[]) => void;
}

export function WorldBibleMergeModal({ open, onClose, incoming, existing, onConfirm }: WorldBibleMergeModalProps) {
  const t = useTranslations('bible');
  const tCommon = useTranslations('common');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(incoming.map((s) => s.id)));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const existingCategories = new Set(existing.map((s) => s.category));

  // Group incoming by category
  const grouped = incoming.reduce<Record<string, WorldBibleSection[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  const handleConfirm = () => {
    const accepted = incoming.filter((s) => selected.has(s.id));
    onConfirm(accepted);
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
          aria-labelledby="merge-title"
        >
          <div className="absolute inset-0 bg-sepia-900/60 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={springs.gentle}
            className="relative bg-parchment-100 border border-sepia-300/50 rounded-xl shadow-card-hover max-w-2xl w-full max-h-[80vh] flex flex-col texture-parchment"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-sepia-300/30">
              <div>
                <h2 id="merge-title" className="text-lg font-serif font-semibold text-sepia-900">
                  {t('reviewTitle')}
                </h2>
                <p className="text-sm text-sepia-600 mt-0.5">
                  {t('foundSelect', { count: incoming.length })}
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

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {Object.entries(grouped).map(([category, sections]) => {
                const hasConflict = existingCategories.has(category as WorldBibleCategory);

                return (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-sepia-700 uppercase tracking-wider">
                        {t(`category.${category}`)}
                      </h3>
                      {hasConflict && (
                        <span className="flex items-center gap-1 text-[10px] text-brass-700 bg-brass-500/10 px-1.5 py-0.5 rounded-full">
                          <AlertTriangle size={10} />
                          {t('hasExisting')}
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {sections.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => toggle(s.id)}
                          className="w-full flex items-start gap-3 text-left p-3 rounded-lg border border-sepia-300/30 hover:bg-parchment-200/50 transition-colors"
                        >
                          <span className="mt-0.5 shrink-0 text-forest-700">
                            {selected.has(s.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                          </span>
                          <div className="min-w-0">
                            <p className="font-serif font-semibold text-sm text-sepia-900">{s.title}</p>
                            <p className="text-xs text-sepia-600 mt-0.5 line-clamp-2">{s.content}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-5 border-t border-sepia-300/30">
              <span className="text-sm text-sepia-600">
                {t('selectedCount', { selected: selected.size, total: incoming.length })}
              </span>
              <div className="flex gap-3">
                <InkStampButton variant="ghost" onClick={onClose}>
                  {tCommon('cancel')}
                </InkStampButton>
                <InkStampButton onClick={handleConfirm} disabled={selected.size === 0}>
                  {t('acceptSelected')}
                </InkStampButton>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
