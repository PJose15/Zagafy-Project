'use client';

import { Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations, useLocale } from 'next-intl';
import { springs } from '@/lib/animations';
import { ParchmentCard, BrassButton } from '@/components/antiquarian';
import type { CharacterInsight } from '@/lib/types/character-chat';

interface InsightCardProps {
  insight: CharacterInsight;
  onSaveAsCanon: (id: string) => void;
}

export function InsightCard({ insight, onSaveAsCanon }: InsightCardProps) {
  const t = useTranslations('characterChat');
  const locale = useLocale();
  return (
    // M25: an insight slides in from the margin like a note tucked into the
    // page edge, settling straight with one brass glow to catch the eye.
    <motion.div
      initial={{ opacity: 0, x: 24, rotate: 1.2 }}
      animate={{
        opacity: 1,
        x: 0,
        rotate: 0,
        boxShadow: [
          '0 0 0px 0px rgba(196, 155, 72, 0)',
          '0 0 16px 2px rgba(196, 155, 72, 0.4)',
          '0 0 0px 0px rgba(196, 155, 72, 0)',
        ],
      }}
      transition={{ ...springs.gentle, boxShadow: { duration: 1.2, times: [0, 0.35, 1], delay: 0.2 } }}
      className="rounded-xl"
    >
      <ParchmentCard variant="aged" className="p-3">
        <div className="flex items-start gap-2">
          <Sparkles size={16} className="text-brass-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-sepia-800 leading-relaxed">{insight.content}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-sepia-700 font-mono">
                {new Date(insight.createdAt).toLocaleDateString(locale)}
              </span>
              {insight.savedAsCanon ? (
                <span className="text-[10px] text-forest-700 font-mono uppercase tracking-wider">
                  {t('savedAsCanon')}
                </span>
              ) : (
                <BrassButton onClick={() => onSaveAsCanon(insight.id)} className="text-xs">
                  {t('saveAsCanon')}
                </BrassButton>
              )}
            </div>
          </div>
        </div>
      </ParchmentCard>
    </motion.div>
  );
}
