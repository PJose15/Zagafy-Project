'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { springs } from '@/lib/animations';
import { useStory } from '@/lib/store';
import { BookOpen, X } from 'lucide-react';

interface ChapterSelectModalProps {
  onSelect: (chapterId: string) => void;
  onClose: () => void;
}

export function ChapterSelectModal({ onSelect, onClose }: ChapterSelectModalProps) {
  const t = useTranslations('flow.chapterSelect');
  const { state } = useStory();

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chapter-select-title"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={springs.gentle}
        className="relative bg-parchment-100 border border-sepia-300/40 rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[70vh] flex flex-col texture-parchment"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 id="chapter-select-title" className="text-xl font-serif font-bold text-sepia-900 flex items-center gap-2">
            <BookOpen className="text-brass-500" size={20} />
            {t('title')}
          </h2>
          <button onClick={onClose} className="text-sepia-600 hover:text-sepia-700 transition-colors" aria-label={t('close')}>
            <X size={20} />
          </button>
        </div>

        {state.chapters.length === 0 ? (
          <p className="text-sepia-600 text-sm text-center py-8">
            {t('empty')}
          </p>
        ) : (
          <div className="space-y-2 overflow-y-auto flex-1">
            {state.chapters.map((chapter, i) => (
              <motion.button
                key={chapter.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...springs.gentle, delay: Math.min(i, 8) * 0.04 }}
                onClick={() => onSelect(chapter.id)}
                className="w-full text-left px-4 py-3 rounded-xl border border-sepia-300/50 hover:border-brass-500/50 hover:bg-parchment-200/50 transition-colors"
              >
                <p className="text-sm font-medium text-sepia-800">
                  {i + 1}. {chapter.title}
                </p>
                {chapter.summary && (
                  <p className="text-xs text-sepia-600 mt-1 line-clamp-1">{chapter.summary}</p>
                )}
              </motion.button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
