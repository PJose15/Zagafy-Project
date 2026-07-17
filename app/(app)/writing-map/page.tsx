'use client';

import { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { CarvedHeader, ParchmentCard, FeatureErrorBoundary, Reveal } from '@/components/antiquarian';
import { readSessions } from '@/lib/types/writing-session';
import { CalendarHeatmap } from '@/components/writing-map/calendar-heatmap';
// Lazy-load WordsByHour (pulls in recharts, ~110 kB). Only needed when the
// Words-by-Hour section is rendered, which happens below-the-fold.
const WordsByHour = dynamic(
  () => import('@/components/writing-map/words-by-hour').then(m => m.WordsByHour),
  {
    ssr: false,
    loading: () => <WordsByHourLoading />,
  }
);

function WordsByHourLoading() {
  const t = useTranslations('writingMap');
  return (
    <div
      className="h-48 flex items-center justify-center text-sepia-600 text-sm"
      data-testid="words-by-hour-loading"
    >
      {t('wordsByHourLoading')}
    </div>
  );
}
import { InsightCard } from '@/components/writing-map/insight-card';
import { SessionsTable } from '@/components/writing-map/sessions-table';
import { FlowTimeline } from '@/components/writing-map/flow-timeline';
import { HeteronymAnalytics } from '@/components/writing-map/heteronym-analytics';
import { PacingHealth } from '@/components/writing-map/pacing-health';
import { WriterMemoryCard } from '@/components/writing-map/writer-memory-card';
import type { WritingSession } from '@/lib/types/writing-session';
import { useGamification } from '@/hooks/use-gamification';
import { StreakBadge } from '@/components/gamification/streak-badge';
import { XPBar } from '@/components/gamification/xp-bar';
import { Flame, Zap } from 'lucide-react';

export default function WritingMapPage() {
  const t = useTranslations('writingMap');
  const [sessions, setSessions] = useState<WritingSession[]>([]);
  useEffect(() => { readSessions().then(setSessions); }, []);
  const { gamification, xpProgress, streak, streakWarning } = useGamification();

  const totalWords = sessions.reduce((sum, s) => sum + s.wordsAdded, 0);
  const totalSessions = sessions.length;

  const latestFlowSession = useMemo(() => {
    const withFlow = sessions.filter(s => s.autoFlowScore !== null && s.autoFlowScore !== undefined);
    if (withFlow.length === 0) return null;
    return withFlow.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
  }, [sessions]);

  return (
    <FeatureErrorBoundary title={t('errorTitle')}>
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <CarvedHeader
        title={t('title')}
        subtitle={totalSessions > 0
          ? t('subtitleStats', { count: totalSessions, words: totalWords })
          : t('subtitleEmpty')}
      />

      {/* Streak + XP Summary */}
      <ParchmentCard padding="md">
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
          <div className="text-xs font-mono text-sepia-600">
            {t('longestStreak', { days: streak.longestStreak })}
          </div>
        </div>
      </ParchmentCard>

      {/* Section 1: Calendar Heatmap */}
      <section aria-label={t('activityAria')}>
        <h2 className="text-lg font-medium text-parchment-200 mb-4">{t('activityHeading')}</h2>
        <ParchmentCard className="p-4 md:p-6">
          <CalendarHeatmap sessions={sessions} />
        </ParchmentCard>
      </section>

      {/* Section 2: Words by Hour */}
      <section aria-label={t('wordsByHourAria')}>
        <h2 className="text-lg font-medium text-parchment-200 mb-4">{t('wordsByHourHeading')}</h2>
        <ParchmentCard className="p-4 md:p-6">
          <WordsByHour sessions={sessions} />
        </ParchmentCard>
      </section>

      {/* Section 3: Latest Flow Timeline */}
      {latestFlowSession && (
        <section aria-label={t('latestFlowAria')}>
          <h2 className="text-lg font-medium text-parchment-200 mb-4">{t('latestFlowHeading')}</h2>
          <FlowTimeline
            sessionStart={latestFlowSession.startedAt}
            sessionEnd={latestFlowSession.endedAt}
            autoFlowScore={latestFlowSession.autoFlowScore}
            flowMoments={latestFlowSession.flowMoments}
            avgWPM={latestFlowSession.keystrokeMetrics?.avgWPM}
          />
        </section>
      )}

      {/* Section 4: Insight Card */}
      <section aria-label={t('insightAria')}>
        <InsightCard sessions={sessions} />
      </section>

      {/* A8: below-the-fold sections unfold as the reader scrolls to them */}
      {/* Section 5: Voice Analytics */}
      <Reveal>
      <section aria-label={t('voiceAnalyticsAria')}>
        <h2 className="text-lg font-medium text-parchment-200 mb-4">{t('voiceAnalyticsHeading')}</h2>
        <ParchmentCard className="p-4 md:p-6">
          <HeteronymAnalytics />
        </ParchmentCard>
      </section>
      </Reveal>

      {/* Section 5b: Pacing Health (MP-08 / Phase 4.6) */}
      <Reveal>
      <section aria-label={t('pacingAria')}>
        <h2 className="text-lg font-medium text-parchment-200 mb-4">{t('pacingHeading')}</h2>
        <ParchmentCard className="p-4 md:p-6">
          <PacingHealth />
        </ParchmentCard>
      </section>
      </Reveal>

      {/* Section 5c: Writer memory (MP-11 / Phase 4.12) */}
      <Reveal>
      <section aria-label={t('craftAria')}>
        <h2 className="text-lg font-medium text-parchment-200 mb-4">
          {t('craftHeading')}
        </h2>
        <ParchmentCard className="p-4 md:p-6">
          <WriterMemoryCard />
        </ParchmentCard>
      </section>
      </Reveal>

      {/* Section 6: Sessions Table */}
      <Reveal>
      <section aria-label={t('recentSessionsAria')}>
        <h2 className="text-lg font-medium text-parchment-200 mb-4">{t('recentSessionsHeading')}</h2>
        <ParchmentCard className="p-4 md:p-6">
          <SessionsTable sessions={sessions} />
        </ParchmentCard>
      </section>
      </Reveal>
    </div>
    </FeatureErrorBoundary>
  );
}
