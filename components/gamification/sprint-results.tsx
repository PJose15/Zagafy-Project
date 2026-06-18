'use client';

import { motion } from 'motion/react';
import { stampSlam } from '@/lib/animations';
import { ParchmentCard } from '@/components/antiquarian';
import { BrassButton } from '@/components/antiquarian';
import { Trophy, Target, Zap } from 'lucide-react';
import type { SprintResult } from '@/lib/gamification/sprints';
import { XP_RATES } from '@/lib/gamification/xp';

interface SprintResultsProps {
  result: SprintResult;
  onDismiss: () => void;
}

export function SprintResults({ result, onDismiss }: SprintResultsProps) {
  return (
    <motion.div {...stampSlam}>
      <ParchmentCard padding="lg" className="max-w-md mx-auto text-center">
        {/* M14: Accessible result icon */}
        <div className="flex justify-center mb-4">
          <div
            className={[
              'w-14 h-14 rounded-full flex items-center justify-center',
              result.targetMet ? 'bg-forest-600/15' : 'bg-brass-500/15',
            ].join(' ')}
            aria-label={result.targetMet ? 'Target achieved' : 'Sprint completed'}
            role="img"
          >
            {result.targetMet ? (
              <Trophy size={28} className="text-forest-600" aria-hidden="true" />
            ) : (
              <Target size={28} className="text-brass-600" aria-hidden="true" />
            )}
          </div>
        </div>

        <h3 className="text-xl font-serif font-bold text-sepia-900 mb-1">
          {result.targetMet ? 'Target Smashed!' : 'Sprint Complete'}
        </h3>
        <p className="text-xs text-sepia-600 mb-4">
          {result.durationMinutes} min · {result.percentOfTarget}% of target
        </p>

        <div className="flex justify-center gap-6 mb-4">
          <div>
            <span className="text-3xl font-mono font-bold text-sepia-800">{result.wordsWritten}</span>
            <span className="block text-[10px] text-sepia-600 uppercase mt-0.5">Words Written</span>
          </div>
        </div>

        {/* L7: Zap icon aria-hidden; M11: Compute XP based on target performance */}
        <div className="flex items-center justify-center gap-1.5 text-sm text-brass-600 font-medium mb-4">
          <Zap size={14} aria-hidden="true" />
          <span>+{result.targetMet ? 75 : Math.max(5, Math.round(75 * (result.percentOfTarget / 100)))} XP earned</span>
        </div>

        <BrassButton onClick={onDismiss}>Done</BrassButton>
      </ParchmentCard>
    </motion.div>
  );
}
