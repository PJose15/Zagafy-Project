'use client';

import { Timer, Pen, Mountain, MessageCircle, Flame } from 'lucide-react';
import { ParchmentCard } from '@/components/antiquarian';
import { BrassButton } from '@/components/antiquarian';
import { SPRINT_THEMES } from '@/lib/gamification/sprints';
import type { SprintTheme } from '@/lib/types/gamification';

const themeIcons: Record<SprintTheme, typeof Timer> = {
  'quick-focus': Timer,
  'deep-dive': Mountain,
  'marathon-push': Flame,
  'dialogue-sprint': MessageCircle,
  'conflict-burst': Pen,
};

interface SprintLauncherProps {
  onStart: (theme: SprintTheme) => void;
}

export function SprintLauncher({ onStart }: SprintLauncherProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {SPRINT_THEMES.map((config) => {
        const Icon = themeIcons[config.theme];
        return (
          <ParchmentCard key={config.theme} padding="lg" hover>
            <div className="flex items-start gap-3 mb-3">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-brass-500/10 flex items-center justify-center">
                <Icon size={20} className="text-brass-600" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-sepia-800">{config.name}</h3>
                <p className="text-[10px] font-mono text-sepia-600 mt-0.5">
                  {config.durationMinutes}m · {config.targetWords}w target
                </p>
              </div>
            </div>
            <p className="text-xs text-sepia-600 leading-relaxed mb-3">{config.prompt}</p>
            <BrassButton size="sm" onClick={() => onStart(config.theme)}>
              Begin
            </BrassButton>
          </ParchmentCard>
        );
      })}
    </div>
  );
}
