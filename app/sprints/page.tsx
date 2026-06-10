'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useStory } from '@/lib/store';
import { wordCount } from '@/lib/editor/serialization';
import { useGamification } from '@/hooks/use-gamification';
import { CarvedHeader, ParchmentCard } from '@/components/antiquarian';
import { SprintLauncher } from '@/components/gamification/sprint-launcher';
import { SprintTimer } from '@/components/gamification/sprint-timer';
import { SprintResults } from '@/components/gamification/sprint-results';
import { getSprintStats, getThemeConfig } from '@/lib/gamification/sprints';
import type { SprintResult } from '@/lib/gamification/sprints';
import type { SprintTheme } from '@/lib/types/gamification';
import { Timer, Trophy, Pen, BarChart3 } from 'lucide-react';

export default function SprintsPage() {
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

  const handleAbandon = useCallback(() => {
    abandonSprint();
    setLastResult(null);
  }, [abandonSprint]);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <CarvedHeader
        title="Writing Sprints"
        subtitle="Timed sessions to push your word count. Pick a theme and write."
        icon={<Timer size={28} />}
      />

      {/* Active sprint → timer */}
      {activeSprint && !lastResult && (
        <SprintTimer
          sprint={activeSprint}
          currentWords={totalWords}
          onEnd={handleEnd}
          onAbandon={handleAbandon}
        />
      )}

      {/* Results */}
      {lastResult && (
        <SprintResults result={lastResult} onDismiss={() => setLastResult(null)} />
      )}

      {/* Launcher — when no active sprint */}
      {!activeSprint && !lastResult && (
        <SprintLauncher onStart={handleStart} />
      )}

      {/* Stats summary */}
      {stats.completedSprints > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <BarChart3 size={16} className="text-brass-600" aria-hidden="true" />
            <h2 className="text-sm font-serif font-semibold text-sepia-700 uppercase tracking-wider">Sprint Stats</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ParchmentCard padding="sm">
              <span className="text-2xl font-mono font-bold text-sepia-800">{stats.completedSprints}</span>
              <span className="block text-[10px] text-sepia-400 uppercase mt-0.5">Sprints</span>
            </ParchmentCard>
            <ParchmentCard padding="sm">
              <span className="text-2xl font-mono font-bold text-sepia-800">{stats.totalWordsWritten.toLocaleString()}</span>
              <span className="block text-[10px] text-sepia-400 uppercase mt-0.5">Words</span>
            </ParchmentCard>
            <ParchmentCard padding="sm">
              <span className="text-2xl font-mono font-bold text-sepia-800">{stats.avgWordsPerSprint}</span>
              <span className="block text-[10px] text-sepia-400 uppercase mt-0.5">Avg/Sprint</span>
            </ParchmentCard>
            <ParchmentCard padding="sm">
              <span className="text-2xl font-mono font-bold text-sepia-800">{stats.targetMetRate}%</span>
              <span className="block text-[10px] text-sepia-400 uppercase mt-0.5">Target Rate</span>
            </ParchmentCard>
          </div>
        </section>
      )}

      {/* Sprint history */}
      {gamification.sprints.sprintHistory.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-serif font-semibold text-sepia-700 uppercase tracking-wider">History</h2>
          <div className="space-y-2">
            {recentSprints.map((sprint) => {
              const config = getThemeConfig(sprint.theme);
              return (
                <ParchmentCard key={sprint.id} padding="sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {sprint.status === 'completed' ? (
                        <Trophy size={14} className="text-forest-600" aria-hidden="true" />
                      ) : (
                        <Pen size={14} className="text-sepia-400" aria-hidden="true" />
                      )}
                      <div>
                        <span className="text-sm font-medium text-sepia-800">{config.name}</span>
                        <span className="text-[10px] text-sepia-400 ml-2">
                          {new Date(sprint.startTime).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-mono text-sepia-700">
                        {sprint.wordsWritten ?? 0}w
                      </span>
                      <span className={[
                        'text-[10px] ml-2',
                        sprint.status === 'completed' ? 'text-forest-600' : 'text-sepia-400',
                      ].join(' ')}>
                        {sprint.status}
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
