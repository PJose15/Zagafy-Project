'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';

type BreathPhase = 'inhale' | 'hold' | 'exhale';

const phases: { phase: BreathPhase; duration: number; labelKey: string }[] = [
  { phase: 'inhale', duration: 4000, labelKey: 'breatheIn' },
  { phase: 'hold', duration: 4000, labelKey: 'hold' },
  { phase: 'exhale', duration: 4000, labelKey: 'breatheOut' },
];

// 12s per cycle, 5 cycles = 60s total
const TOTAL_CYCLES = 5;

interface BreathingGuideProps {
  onComplete: () => void;
}

export function BreathingGuide({ onComplete }: BreathingGuideProps) {
  const t = useTranslations('ritual');
  const [currentPhase, setCurrentPhase] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (done) {
      onComplete();
    }
  }, [done, onComplete]);

  useEffect(() => {
    const advancePhase = () => {
      setCurrentPhase(prev => {
        const nextPhase = (prev + 1) % phases.length;
        if (nextPhase === 0) {
          setCycle(prevCycle => {
            const nextCycle = prevCycle + 1;
            if (nextCycle >= TOTAL_CYCLES) {
              setDone(true);
              return prevCycle;
            }
            return nextCycle;
          });
        }
        return nextPhase;
      });
    };

    timerRef.current = setTimeout(advancePhase, phases[currentPhase].duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentPhase, cycle, onComplete]);

  const phase = phases[currentPhase];
  const scale = phase.phase === 'inhale' ? 1.4 : phase.phase === 'hold' ? 1.4 : 1;

  return (
    <div className="flex flex-col items-center justify-center gap-8">
      <motion.div
        animate={{ scale }}
        transition={{ duration: phase.duration / 1000, ease: 'easeInOut' }}
        className="w-32 h-32 rounded-full border-2 border-brass-400/40 bg-forest-500/10 flex items-center justify-center"
      >
        <div className="w-4 h-4 rounded-full bg-forest-500/60" />
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.p
          key={`${cycle}-${currentPhase}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="text-lg text-sepia-700 font-serif"
        >
          {t(phase.labelKey)}
        </motion.p>
      </AnimatePresence>

      <p className="text-xs text-sepia-600">
        {t('cycle', { current: Math.min(cycle + 1, TOTAL_CYCLES), total: TOTAL_CYCLES })}
      </p>
    </div>
  );
}
