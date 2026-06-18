'use client';

import { Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { fadeUp } from '@/lib/animations';
import { ParchmentCard, BrassButton } from '@/components/antiquarian';
import type { CharacterInsight } from '@/lib/types/character-chat';

interface InsightCardProps {
  insight: CharacterInsight;
  onSaveAsCanon: (id: string) => void;
}

export function InsightCard({ insight, onSaveAsCanon }: InsightCardProps) {
  return (
    <motion.div {...fadeUp}>
      <ParchmentCard variant="aged" className="p-3">
        <div className="flex items-start gap-2">
          <Sparkles size={16} className="text-brass-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-sepia-800 leading-relaxed">{insight.content}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-sepia-700 font-mono">
                {new Date(insight.createdAt).toLocaleDateString()}
              </span>
              {insight.savedAsCanon ? (
                <span className="text-[10px] text-forest-700 font-mono uppercase tracking-wider">
                  Saved as Canon
                </span>
              ) : (
                <BrassButton onClick={() => onSaveAsCanon(insight.id)} className="text-xs">
                  Save as Canon
                </BrassButton>
              )}
            </div>
          </div>
        </div>
      </ParchmentCard>
    </motion.div>
  );
}
