'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { fadeUp, stagger } from '@/lib/animations';
import { useStory } from '@/lib/store';
import { wordCount } from '@/lib/editor/serialization';
import { useGamification } from '@/hooks/use-gamification';
import { useConfirm } from '@/components/confirm-dialog';
import { CarvedHeader, ParchmentCard } from '@/components/antiquarian';
import { SprintLauncher } from '@/components/gamification/sprint-launcher';
import { SprintTimer } from '@/components/gamification/sprint-timer';
import { SprintResults } from '@/components/gamification/sprint-results';
import { getSprintStats } from '@/lib/gamification/sprints';
import type { SprintResult } from '@/lib/gamification/sprints';
import type { SprintTheme } from '@/lib/types/gamification';
import { Trophy, Pen, BarChart3 } from 'lucide-react';

export default function SprintsPage() {
  const t = useTranslations('sprints');
  const { confirm } = useConfirm();
  const { state } = useStory();
  const { activeSprint, startSprint, endSprint, abandonSprint, gamification } = useGamification();
  const [lastResult, setLastResult] = useState<SprintResult | null>(null);

  const totalWords = useMemo(() =>
    state.chapters.reduce((s, c) => s + (c.content ? wordCount(c.content) : 0), 0),
    [state.chapters],
  );

  const stats = useMemo(() => getSprintStats(gamification.sprints.sprintHistory), [gamification.sprints.sprintHistory]);

  // Memoize reversed history slice — avoids creating a new array on every render
  const recentSprints = useMemo(
    () => gamification.sprints.sprintHistory.slice().reverse().slice(0, 10),
    [gamification.sprints.sprintHistory]
  );

  // H8: Use ref for latest totalWords to avoid stale closure
  const totalWordsRef = useRef(totalWords);
  useEffect(() => { totalWordsRef.current = totalWords; }, [totalWords]);

  const handleStart = useCallback((theme: SprintTheme) => {
    startSprint(theme, totalWordsRef.current);
    setLastResult(null);
  }, [startSprint]);

  const handleEnd = useCallback(() => {
    const result = endSprint(totalWordsRef.current);
    setLastResult(result);
  }, [endSprint]);

  const handleAbandon = useCallback(async () => {
    const confirmed = await confirm({
      title: t('abandonConfirmTitle'),
      message: t('abandonConfirmMessage'),
      confirmLabel: t('abandonConfirmLabel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    abandonSprint();
    setLastResult(null);
  }, [abandonSprint, confirm, t]);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <CarvedHeader
        title={t('title')}
        subtitle={t('subtitle')}
      />

      {/* Timer / results / launcher — crossfade between the three modes */}
      <AnimatePresence mode="wait" initial={false}>
        {activeSprint && !lastResult && (
          <motion.div key="timer" {...fadeUp}>
            <SprintTimer
              sprint={activeSprint}
              currentWords={totalWords}
              onEnd={handleEnd}
              onAbandon={handleAbandon}
            />
          </motion.div>
        )}

        {lastResult && (
          <motion.div key="results" {...fadeUp}>
            <SprintResults result={lastResult} onDismiss={() => setLastResult(null)} />
          </motion.div>
        )}

        {!activeSprint && !lastResult && (
          <motion.div key="launcher" {...fadeUp}>
            <SprintLauncher onStart={handleStart} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats summary */}
      {stats.completedSprints > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <BarChart3 size={16} className="text-brass-600" aria-hidden="true" />
            <h2 className="label-caps text-sm text-sepia-700">{t('statsHeading')}</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { value: String(stats.completedSprints), label: t('statSprints') },
              { value: stats.totalWordsWritten.toLocaleString(), label: t('statWords') },
              { value: String(stats.avgWordsPerSprint), label: t('statAvg') },
              { value: `${stats.targetMetRate}%`, label: t('statTargetRate') },
            ].map((stat, i) => (
              <motion.div key={stat.label} {...stagger.cards(i)}>
                <ParchmentCard padding="sm">
                  <span className="text-2xl font-mono font-bold text-sepia-800">{stat.value}</span>
                  <span className="block label-caps text-[10px] text-sepia-600 mt-0.5">{stat.label}</span>
                </ParchmentCard>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Sprint history */}
      {gamification.sprints.sprintHistory.length > 0 && (
        <section className="space-y-3">
          <h2 className="label-caps text-sm text-sepia-700">{t('historyHeading')}</h2>
          <div className="space-y-2">
            {recentSprints.map((sprint) => {
              return (
                <ParchmentCard key={sprint.id} padding="sm" hover>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {sprint.status === 'completed' ? (
                        <Trophy size={14} className="text-forest-600" aria-hidden="true" />
                      ) : (
                        <Pen size={14} className="text-sepia-600" aria-hidden="true" />
                      )}
                      <div>
                        <span className="text-sm font-medium text-sepia-800">{t(`theme.${sprint.theme}.name`)}</span>
                        <span className="text-[10px] text-sepia-600 ml-2">
                          {new Date(sprint.startTime).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-mono text-sepia-700">
                        {t('wordsSuffix', { count: sprint.wordsWritten ?? 0 })}
                      </span>
                      <span className={[
                        'text-[10px] ml-2',
                        sprint.status === 'completed' ? 'text-forest-600' : 'text-sepia-600',
                      ].join(' ')}>
                        {t(`status.${sprint.status}`)}
                      </span>
                    </div>
                  </div>
                </ParchmentCard>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
