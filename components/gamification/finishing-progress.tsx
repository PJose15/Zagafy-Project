'use client';

import type { FinishingEngineState, NarrativePhase } from '@/lib/types/gamification';
import { Compass } from 'lucide-react';
import { DecorativeDivider } from '@/components/antiquarian';

const PHASES: { key: NarrativePhase; label: string }[] = [
  { key: 'setup', label: 'Setup' },
  { key: 'rising-action', label: 'Rising' },
  { key: 'midpoint', label: 'Midpoint' },
  { key: 'climax', label: 'Climax' },
  { key: 'falling-action', label: 'Falling' },
  { key: 'resolution', label: 'Resolution' },
];

interface FinishingProgressProps {
  finishing: FinishingEngineState;
}

export function FinishingProgress({ finishing }: FinishingProgressProps) {
  // M12: Guard findIndex returning -1 (unknown phase) — default to 0 (setup)
  const rawIndex = PHASES.findIndex((p) => p.key === finishing.currentPhase);
  const phaseIndex = rawIndex >= 0 ? rawIndex : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Compass size={16} className="text-brass-600" aria-hidden="true" />
        <h2 className="text-sm font-serif font-semibold text-sepia-700 uppercase tracking-wider">Story Progress</h2>
        <DecorativeDivider variant="section" className="flex-1" />
        <span className="text-xs font-mono text-sepia-600">{finishing.overallProgress}%</span>
      </div>

      {/* M2: Accessible segmented progress bar */}
      <div
        className="flex h-3 rounded-full overflow-hidden bg-parchment-200/50 border border-sepia-300/20"
        role="progressbar"
        aria-valuenow={finishing.overallProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Story progress: ${finishing.overallProgress}%, currently in ${PHASES[phaseIndex].label} phase`}
      >
        {PHASES.map((phase, i) => (
          <div
            key={phase.key}
            className={[
              'flex-1 transition-colors duration-300',
              i <= phaseIndex ? 'bg-forest-600' : 'bg-transparent',
              i < PHASES.length - 1 ? 'border-r border-parchment-100/50' : '',
            ].join(' ')}
          />
        ))}
      </div>

      {/* Phase labels */}
      <div className="flex">
        {PHASES.map((phase, i) => (
          <div
            key={phase.key}
            className={[
              'flex-1 text-center text-[9px] font-mono uppercase tracking-wider',
              i === phaseIndex ? 'text-forest-700 font-semibold' : 'text-sepia-600',
            ].join(' ')}
          >
            <abbr title={phase.key} className="no-underline">{phase.label}</abbr>
          </div>
        ))}
      </div>

      {/* Next suggestion */}
      {finishing.nextSuggestion && (
        <p className="text-xs text-sepia-600 italic mt-1">
          Next: {finishing.nextSuggestion}
        </p>
      )}
    </div>
  );
}
