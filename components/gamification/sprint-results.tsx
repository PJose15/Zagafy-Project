'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
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

// M20: ember palette — brass sparks with the odd wax and forest fleck.
const EMBER_TINTS = [
  'var(--color-brass-400)',
  'var(--color-brass-500)',
  'var(--color-wax-500)',
  'var(--color-brass-300)',
  'var(--color-forest-500)',
];

export function SprintResults({ result, onDismiss }: SprintResultsProps) {
  const t = useTranslations('gamification');
  return (
    <motion.div {...stampSlam} className="relative">
      {/* M20: embers rise off the finished sprint. Deterministic per index so
          renders stay stable; the CSS animation handles the rest. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-6 bottom-0 overflow-visible">
        {Array.from({ length: 14 }, (_, i) => (
          <span
            key={i}
            className="triumph-ember absolute rounded-full"
            style={{
              left: `${(i * 29 + 7) % 100}%`,
              top: `${20 + ((i * 13) % 55)}%`,
              width: i % 3 === 0 ? 5 : 3,
              height: i % 3 === 0 ? 5 : 3,
              backgroundColor: EMBER_TINTS[i % EMBER_TINTS.length],
              ['--ember-drift' as string]: `${((i % 5) - 2) * 16}px`,
              ['--ember-delay' as string]: `${i * 0.09}s`,
            }}
          />
        ))}
      </div>
      <ParchmentCard padding="lg" className="max-w-md mx-auto text-center">
        {/* M14: Accessible result icon */}
        <div className="flex justify-center mb-4">
          <div
            className={[
              'w-14 h-14 rounded-full flex items-center justify-center',
              result.targetMet ? 'bg-forest-600/15' : 'bg-brass-500/15',
            ].join(' ')}
            aria-label={result.targetMet ? t('targetAchievedAria') : t('sprintCompletedAria')}
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
          {result.targetMet ? t('targetSmashed') : t('sprintComplete')}
        </h3>
        <p className="text-xs text-sepia-600 mb-4">
          {t('resultDurationTarget', { duration: result.durationMinutes, percent: result.percentOfTarget })}
        </p>

        <div className="flex justify-center gap-6 mb-4">
          <div>
            <span className="text-3xl font-mono font-bold text-sepia-800">{result.wordsWritten}</span>
            <span className="block text-[10px] text-sepia-600 uppercase mt-0.5">{t('wordsWritten')}</span>
          </div>
        </div>

        {/* L7: Zap icon aria-hidden; M11: Compute XP based on target performance */}
        <div className="flex items-center justify-center gap-1.5 text-sm text-brass-600 font-medium mb-4">
          <Zap size={14} aria-hidden="true" />
          <span>{t('xpEarned', { xp: result.targetMet ? 75 : Math.max(5, Math.round(75 * (result.percentOfTarget / 100))) })}</span>
        </div>

        <BrassButton onClick={onDismiss}>{t('done')}</BrassButton>
      </ParchmentCard>
    </motion.div>
  );
}
