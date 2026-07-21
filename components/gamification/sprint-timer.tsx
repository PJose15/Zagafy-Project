'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';
import { ProgressRing } from '@/components/antiquarian';
import { InkStampButton } from '@/components/antiquarian';
import type { WritingSprint } from '@/lib/types/gamification';

interface SprintTimerProps {
  sprint: WritingSprint;
  currentWords: number;
  onEnd: () => void;
  onAbandon: () => void;
}

export function SprintTimer({ sprint, currentWords, onEnd, onAbandon }: SprintTimerProps) {
  const t = useTranslations('gamification');
  const tSprints = useTranslations('sprints');
  // H10: Sync ref when sprint prop changes; M2: guard invalid dates
  const rawStart = new Date(sprint.startTime).getTime();
  const safeStart = Number.isFinite(rawStart) ? rawStart : 0;
  const computedEnd = safeStart + sprint.durationMinutes * 60_000;
  const endTimeMs = useRef(computedEnd);
  useEffect(() => { endTimeMs.current = computedEnd; }, [computedEnd]);
  const autoEndedRef = useRef(false);

  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((computedEnd - Date.now()) / 1000)),
  );
  // Derived reset when a NEW sprint arrives without a remount (React 19
  // adjust-state-during-render pattern, as in ClosingRitual). Render must stay
  // pure (no Date.now()), so reset to the full duration — the wall-clock
  // interval below corrects it within a second.
  const [prevSprintId, setPrevSprintId] = useState(sprint.id);
  if (prevSprintId !== sprint.id) {
    setPrevSprintId(sprint.id);
    setSecondsLeft(Math.max(0, sprint.durationMinutes * 60));
  }
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wordsWritten = Math.max(0, currentWords - sprint.wordsStart);
  const timeProgress = sprint.durationMinutes * 60 > 0
    ? ((sprint.durationMinutes * 60 - secondsLeft) / (sprint.durationMinutes * 60)) * 100
    : 100;

  // Compute from wall clock to avoid drift on tab backgrounding. Keyed on the
  // sprint identity + end time so a NEW sprint arriving without a remount
  // restarts the (possibly self-cleared) interval and re-arms the end guard.
  useEffect(() => {
    autoEndedRef.current = false;
    intervalRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.floor((endTimeMs.current - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sprint.id, computedEnd]);

  // Auto-end when timer reaches 0
  useEffect(() => {
    if (secondsLeft === 0 && !autoEndedRef.current) {
      autoEndedRef.current = true;
      onEnd();
    }
  }, [secondsLeft, onEnd]);

  // Z9: Finish Early shares the auto-end guard so a click racing the final
  // tick can't fire onEnd twice; after expiry "See Results" always works.
  const handleEnd = () => {
    if (secondsLeft > 0) {
      if (autoEndedRef.current) return;
      autoEndedRef.current = true;
    }
    onEnd();
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const isExpired = secondsLeft === 0;
  // Final stretch — the last ten seconds beat like a heart (one pulse per
  // tick, keyed by the countdown) and the ring turns wax-red.
  const isFinalStretch = secondsLeft > 0 && secondsLeft <= 10;

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* M5: Accessible timer with live region */}
      <motion.div
        key={isFinalStretch ? secondsLeft : 'steady'}
        animate={isFinalStretch ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <ProgressRing value={timeProgress} size="lg" color={isExpired ? 'forest' : isFinalStretch ? 'wax' : 'brass'}>
          <span
            className={`text-xl font-mono font-bold ${isFinalStretch ? 'text-wax-600' : 'text-sepia-800'}`}
            aria-atomic="true"
            role="timer"
          >
            {timeDisplay}
          </span>
        </ProgressRing>
      </motion.div>
      {/* Polite remaining-time announcements on minute boundaries only — the
          visible per-second timer stays aria-live off (role=timer default) so
          screen readers aren't flooded every tick. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {t('minutesLeftAria', { count: minutes })}
      </span>

      <div className="text-center space-y-1">
        <h3 className="text-lg font-serif font-semibold text-sepia-800">{tSprints(`theme.${sprint.theme}.name`)}</h3>
        <p className="text-xs text-sepia-600 italic max-w-md">{tSprints(`theme.${sprint.theme}.prompt`)}</p>
      </div>

      {/* L10: Accessible stat labels */}
      <div className="flex items-center gap-6 text-center" role="group" aria-label={t('sprintStatsAria')}>
        <div aria-label={t('wordsWrittenAria', { count: wordsWritten })}>
          <span className="text-2xl font-mono font-bold text-sepia-800">{wordsWritten}</span>
          <span className="block text-[10px] text-sepia-600 uppercase" aria-hidden="true">{t('words')}</span>
        </div>
        <div className="w-px h-8 bg-sepia-300/30" aria-hidden="true" />
        <div aria-label={t('wordTargetAria', { count: sprint.targetWords })}>
          <span className="text-2xl font-mono font-bold text-sepia-800">{sprint.targetWords}</span>
          <span className="block text-[10px] text-sepia-600 uppercase" aria-hidden="true">{t('target')}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <InkStampButton variant="primary" onClick={handleEnd}>
          {isExpired ? t('seeResults') : t('finishEarly')}
        </InkStampButton>
        {!isExpired && (
          <InkStampButton variant="ghost" onClick={onAbandon}>
            {t('abandon')}
          </InkStampButton>
        )}
      </div>
    </div>
  );
}
