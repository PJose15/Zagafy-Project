'use client';

import { motion, AnimatePresence } from 'motion/react';
import { useSession } from '@/lib/session';
import { incrementStreak, getStreak } from '@/lib/diagnostic-streak';
import { BlockCard, blockCards } from './block-card';
import type { BlockType } from '@/lib/session';
import { getAdaptiveConfig } from '@/lib/adaptive-experience';
import { useState } from 'react';

export function DiagnosticOverlay() {
  const { setBlockType, completeDiagnostic } = useSession();
  const [streak, setStreak] = useState(() => {
    // Read streak on initial render (client-side only)
    if (typeof window !== 'undefined') {
      return getStreak();
    }
    return 0;
  });
  const [preparationMessage, setPreparationMessage] = useState<string | null>(null);

  const handleSelect = (type: Exclude<BlockType, null>) => {
    setBlockType(type);
    const newStreak = incrementStreak();
    setStreak(newStreak);

    // Show preparation message for 3 seconds
    const config = getAdaptiveConfig(type);
    setPreparationMessage(config.preparationMessage);
    setTimeout(() => {
      setPreparationMessage(null);
      completeDiagnostic(false);
    }, 3000);
  };

  const handleSkip = () => {
    const newStreak = incrementStreak();
    setStreak(newStreak);
    completeDiagnostic(true);
  };

  if (preparationMessage) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-parchment-200 flex items-center justify-center p-4"
          role="status"
          aria-live="polite"
        >
          <motion.p
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-2xl font-serif text-sepia-800 text-center max-w-md preparation-breathe"
          >
            {preparationMessage}
          </motion.p>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-parchment-200 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="diagnostic-title"
      >
        <div className="max-w-xl w-full space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-3"
          >
            <h2
              id="diagnostic-title"
              className="text-3xl font-serif font-bold text-sepia-900 tracking-tight"
            >
              Before you begin...
            </h2>
            <p className="text-sepia-600 text-sm max-w-md mx-auto">
              How are you feeling about writing today? This helps Zagafy adapt to where you are right now.
            </p>
            {streak > 0 && (
              <p className="text-xs text-sepia-600">
                Check-in streak: {streak} {streak === 1 ? 'day' : 'days'}
              </p>
            )}
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {blockCards.map((card, i) => (
              <BlockCard
                key={card.type}
                card={card}
                index={i}
                onSelect={handleSelect}
              />
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center"
          >
            <button
              onClick={handleSkip}
              className="text-sm text-sepia-600 hover:text-sepia-700 transition-colors underline underline-offset-4"
            >
              Skip check-in
            </button>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
