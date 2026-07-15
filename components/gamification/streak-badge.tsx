'use client';

import { useTranslations } from 'next-intl';
import { Flame, Bell } from 'lucide-react';
import { isStreakMilestone } from '@/lib/gamification/writing-streak';

interface StreakBadgeProps {
  streak: number;
  warning?: string | null;
  compact?: boolean;
}

export function StreakBadge({ streak, warning, compact = false }: StreakBadgeProps) {
  const t = useTranslations('gamification');
  const isMilestone = isStreakMilestone(streak);

  if (streak === 0 && !warning) {
    return compact ? null : (
      <div className="flex items-center gap-1.5 text-xs text-sepia-600">
        <Flame size={14} className="text-sepia-600/50" aria-hidden="true" />
        <span>{t('noStreak')}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* M3: Accessible streak badge */}
      <div
        className={[
          'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-mono font-medium',
          isMilestone
            ? 'bg-brass-500/20 text-brass-700 ring-1 ring-brass-500/30 animate-pulse motion-reduce:animate-none'
            : 'bg-parchment-200/60 text-sepia-700',
        ].join(' ')}
        aria-label={`${t('streakAria', { count: streak })}${isMilestone ? t('milestoneSuffix') : ''}`}
      >
        <Flame
          size={compact ? 12 : 14}
          className={[
            isMilestone ? 'text-brass-500' : 'text-sepia-600',
            streak >= 7 ? 'streak-flame-glow motion-reduce:animate-none' : '',
          ].join(' ')}
          aria-hidden="true"
        />
        <span>{t('dayLabel', { count: streak })}</span>
      </div>

      {warning && (
        <div className="flex items-center gap-1 text-[10px] text-wax-600" role="alert">
          <Bell size={10} className="text-wax-500" aria-hidden="true" />
          {/* M3: sr-only fallback so warning is always announced */}
          <span className="hidden sm:inline">{warning}</span>
          <span className="sm:hidden sr-only">{warning}</span>
        </div>
      )}
    </div>
  );
}
