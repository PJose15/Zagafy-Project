'use client';

import type { FinishingEngineState, NarrativePhase } from '@/lib/types/gamification';
import { useTranslations } from 'next-intl';
import { Compass } from 'lucide-react';
import { DecorativeDivider } from '@/components/antiquarian';

const PHASE_KEYS: NarrativePhase[] = [
  'setup', 'rising-action', 'midpoint', 'climax', 'falling-action', 'resolution',
];

interface FinishingProgressProps {
  finishing: FinishingEngineState;
}

export function FinishingProgress({ finishing }: FinishingProgressProps) {
  const t = useTranslations('gamification');
  // M12: Guard findIndex returning -1 (unknown phase) — default to 0 (setup)
  const rawIndex = PHASE_KEYS.findIndex((k) => k === finishing.currentPhase);
  const phaseIndex = rawIndex >= 0 ? rawIndex : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Compass size={16} className="text-brass-600" aria-hidden="true" />
        <h2 className="text-sm font-serif font-semibold text-sepia-400 uppercase tracking-wider">{t('storyProgress')}</h2>
        <DecorativeDivider variant="section" className="flex-1" />
        <span className="text-xs font-mono text-sepia-400">{finishing.overallProgress}%</span>
      </div>

      {/* M2: Accessible segmented progress bar */}
      <div
        className="flex h-3 rounded-full overflow-hidden bg-parchment-200/50 border border-sepia-300/20"
        role="progressbar"
        aria-valuenow={finishing.overallProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('progressAria', { percent: finishing.overallProgress, phase: t(`phase.${PHASE_KEYS[phaseIndex]}`) })}
      >
        {PHASE_KEYS.map((key, i) => (
          <div
            key={key}
            className={[
              'flex-1 transition-colors duration-300',
              i <= phaseIndex ? 'bg-forest-600' : 'bg-transparent',
              i < PHASE_KEYS.length - 1 ? 'border-r border-parchment-100/50' : '',
            ].join(' ')}
          />
        ))}
      </div>

      {/* Phase labels */}
      <div className="flex">
        {PHASE_KEYS.map((key, i) => (
          <div
            key={key}
            className={[
              'flex-1 text-center text-[9px] font-mono uppercase tracking-wider',
              i === phaseIndex ? 'text-forest-700 font-semibold' : 'text-sepia-600',
            ].join(' ')}
          >
            <abbr title={key} className="no-underline">{t(`phase.${key}`)}</abbr>
          </div>
        ))}
      </div>

      {/* Next suggestion */}
      {finishing.nextSuggestion && (
        <p className="text-xs text-sepia-600 italic mt-1">
          {t('next', { suggestion: finishing.nextSuggestion })}
        </p>
      )}
    </div>
  );
}
