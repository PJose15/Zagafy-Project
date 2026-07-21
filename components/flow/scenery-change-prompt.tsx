'use client';

import { motion, AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { Lightbulb, X } from 'lucide-react';
import { fadeUp } from '@/lib/animations';
import type { BlockSignal, DetourSuggestion } from '@/lib/scenery-change/types';

interface SceneryChangePromptProps {
  signal: BlockSignal;
  suggestions: DetourSuggestion[];
  onSelect: (suggestion: DetourSuggestion) => void;
  onDismiss: () => void;
}

export function SceneryChangePrompt({ signal, suggestions, onSelect, onDismiss }: SceneryChangePromptProps) {
  const t = useTranslations('flow.sceneryPrompt');
  const tCatalog = useTranslations('flow.detourCatalog');
  return (
    <AnimatePresence>
      <motion.div {...fadeUp} className="w-full max-w-3xl mx-auto mt-4">
        <div className="bg-parchment-100 border border-brass-500/20 rounded-xl p-4 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Lightbulb size={16} className="text-brass-500" />
              <span className="text-sm font-medium text-sepia-700">
                {signal.severity === 'severe' ? t('severe') :
                 signal.severity === 'moderate' ? t('moderate') :
                 t('mild')}
              </span>
            </div>
            <button
              onClick={onDismiss}
              className="p-1 text-sepia-600 hover:text-sepia-600 rounded"
              aria-label={t('dismiss')}
            >
              <X size={14} />
            </button>
          </div>
          <p className="text-xs text-sepia-600 mb-3">
            {t('instruction')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {suggestions.map(s => (
              <button
                key={s.type}
                onClick={() => onSelect(s)}
                className="text-left p-3 rounded-lg border border-sepia-300/30 hover:border-brass-500/40 hover:bg-parchment-200/50 transition-colors group"
              >
                <h4 className="text-sm font-medium text-sepia-800 group-hover:text-brass-600 transition-colors">
                  {tCatalog(`${s.type}.title`)}
                </h4>
                <p className="text-[10px] text-sepia-600 mt-1">{t('minutes', { count: s.durationMinutes })}</p>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
