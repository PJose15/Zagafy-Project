'use client';

import { useTranslations } from 'next-intl';
import { useGamification } from '@/hooks/use-gamification';
import { StreakBadge } from './streak-badge';
import { XPBar } from './xp-bar';
import { QuestPanel } from './quest-panel';
import { FinishingProgress } from './finishing-progress';

export function DashboardGamification() {
  const t = useTranslations('gamification');
  const {
    gamification,
    isLoaded,
    xpProgress,
    streak,
    streakWarning,
    quests,
    completeQuest,
    finishing,
  } = useGamification();

  // M15: Show loading skeleton while localStorage hydrates
  if (!isLoaded) {
    return (
      <div className="space-y-6 animate-pulse" aria-label={t('loadingAria')}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="h-7 w-20 bg-parchment-200/50 rounded-lg" />
          <div className="flex-1 w-full sm:max-w-xs h-2 bg-parchment-200/50 rounded-full" />
        </div>
        <div className="h-24 bg-parchment-200/50 rounded-lg" />
        <div className="h-16 bg-parchment-200/50 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Streak + XP row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <StreakBadge streak={streak.currentStreak} warning={streakWarning} />
        <div className="flex-1 w-full sm:max-w-xs">
          <XPBar
            level={gamification.xp.level}
            current={xpProgress.current}
            needed={xpProgress.needed}
            progress={xpProgress.progress}
          />
        </div>
      </div>

      {/* Daily Quests */}
      <QuestPanel quests={quests} onComplete={completeQuest} />

      {/* Finishing Progress */}
      <FinishingProgress finishing={finishing} />
    </div>
  );
}
