'use client';

import { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { CarvedHeader, ParchmentCard, FeatureErrorBoundary } from '@/components/antiquarian';
import { readSessions } from '@/lib/types/writing-session';
import { CalendarHeatmap } from '@/components/writing-map/calendar-heatmap';
// Lazy-load WordsByHour (pulls in recharts, ~110 kB). Only needed when the
// Words-by-Hour section is rendered, which happens below-the-fold.
const WordsByHour = dynamic(
  () => import('@/components/writing-map/words-by-hour').then(m => m.WordsByHour),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-48 flex items-center justify-center text-sepia-500 text-sm"
        data-testid="words-by-hour-loading"
      >
        Loading hourly patterns…
      </div>
    ),
  }
);
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
    <FeatureErrorBoundary title="Writing Map">
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <CarvedHeader
        title="Writing Map"
        subtitle={totalSessions > 0
          ? `${totalSessions.toLocaleString()} session${totalSessions === 1 ? '' : 's'} — ${totalWords.toLocaleString()} words tracked`
          : 'Your writing patterns will appear here as you write.'}
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
          <div className="text-xs font-mono text-sepia-500">
            Longest streak: {streak.longestStreak}d
          </div>
        </div>
      </ParchmentCard>

      {/* Section 1: Calendar Heatmap */}
      <section aria-label="Writing activity heatmap">
        <h2 className="text-lg font-medium text-sepia-800 mb-4">Activity</h2>
        <ParchmentCard className="p-4 md:p-6">
          <CalendarHeatmap sessions={sessions} />
        </ParchmentCard>
      </section>

      {/* Section 2: Words by Hour */}
      <section aria-label="Words written by hour of day">
        <h2 className="text-lg font-medium text-sepia-800 mb-4">Words by Hour</h2>
        <ParchmentCard className="p-4 md:p-6">
          <WordsByHour sessions={sessions} />
        </ParchmentCard>
      </section>

      {/* Section 3: Latest Flow Timeline */}
      {latestFlowSession && (
        <section aria-label="Latest flow timeline">
          <h2 className="text-lg font-medium text-sepia-800 mb-4">Latest Flow</h2>
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
      <section aria-label="Writing insight">
        <InsightCard sessions={sessions} />
      </section>

      {/* Section 5: Voice Analytics */}
      <section aria-label="Heteronym voice analytics">
        <h2 className="text-lg font-medium text-sepia-800 mb-4">Voice Analytics</h2>
        <ParchmentCard className="p-4 md:p-6">
          <HeteronymAnalytics />
        </ParchmentCard>
      </section>

      {/* Section 5b: Pacing Health (MP-08 / Phase 4.6) */}
      <section aria-label="Chapter pacing health">
        <h2 className="text-lg font-medium text-sepia-800 mb-4">Pacing</h2>
        <ParchmentCard className="p-4 md:p-6">
          <PacingHealth />
        </ParchmentCard>
      </section>

      {/* Section 5c: Writer memory (MP-11 / Phase 4.12) */}
      <section aria-label="What I've noticed about your craft">
        <h2 className="text-lg font-medium text-sepia-800 mb-4">
          What I&apos;ve noticed about your craft
        </h2>
        <ParchmentCard className="p-4 md:p-6">
          <WriterMemoryCard />
        </ParchmentCard>
      </section>

      {/* Section 6: Sessions Table */}
      <section aria-label="Recent writing sessions">
        <h2 className="text-lg font-medium text-sepia-800 mb-4">Recent Sessions</h2>
        <ParchmentCard className="p-4 md:p-6">
          <SessionsTable sessions={sessions} />
        </ParchmentCard>
      </section>
    </div>
    </FeatureErrorBoundary>
  );
}
