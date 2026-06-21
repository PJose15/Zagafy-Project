'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useSession } from '@/lib/session';
import { getQuoteForBlock, getRandomQuote } from '@/lib/quotes';
import { useCountdown } from '@/hooks/use-countdown';
import { AmbientParticles } from './ambient-particles';
import { QuoteDisplay } from './quote-display';
import { BreathingGuide } from './breathing-guide';
import type { WriterQuote } from '@/lib/types/quotes';
import { Sparkles, Wind } from 'lucide-react';

type RitualStep = 'choose' | 'breathing' | 'quote';

export function RitualOverlay() {
  const t = useTranslations('ritual');
  const { session, completeRitual } = useSession();
  const [step, setStep] = useState<RitualStep>('choose');
  const countdown = useCountdown(8);

  // Compute quote once based on block type (stable across renders via useMemo-like pattern)
  const [quote] = useState<WriterQuote>(() =>
    session.blockType
      ? getQuoteForBlock(session.blockType)
      : getRandomQuote()
  );

  const handleChooseQuote = () => {
    setStep('quote');
    countdown.start();
  };

  const handleChooseMindfulness = () => {
    setStep('breathing');
  };

  const handleBreathingComplete = () => {
    setStep('quote');
    countdown.start();
  };

  const handleEnter = () => {
    completeRitual(step === 'breathing' ? 'mindfulness' : 'quote');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-parchment-200 flex flex-col items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('ariaLabel')}
    >
      <AmbientParticles />

      <div className="relative z-10 flex flex-col items-center justify-center flex-1 w-full max-w-2xl px-4">
        <AnimatePresence mode="wait">
          {step === 'choose' && (
            <motion.div
              key="choose"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-center space-y-8"
            >
              <h2 className="text-2xl font-serif font-bold text-sepia-900">
                {t('title')}
              </h2>
              <p className="text-sm text-sepia-600 max-w-md mx-auto">
                {t('subtitle')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={handleChooseQuote}
                  className="flex items-center gap-3 px-6 py-4 rounded-xl border border-sepia-300/50 hover:border-brass-500/50 hover:bg-forest-600/5 transition-colors text-left"
                >
                  <Sparkles size={20} className="text-brass-500 shrink-0" />
                  <div>
                    <p className="text-sepia-800 font-medium">{t('inspiration')}</p>
                    <p className="text-xs text-sepia-600 mt-0.5">{t('inspirationDesc')}</p>
                  </div>
                </button>
                <button
                  onClick={handleChooseMindfulness}
                  className="flex items-center gap-3 px-6 py-4 rounded-xl border border-sepia-300/50 hover:border-forest-500/50 hover:bg-forest-500/5 transition-colors text-left"
                >
                  <Wind size={20} className="text-forest-400 shrink-0" />
                  <div>
                    <p className="text-sepia-800 font-medium">{t('mindfulness')}</p>
                    <p className="text-xs text-sepia-600 mt-0.5">{t('mindfulnessDesc')}</p>
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {step === 'breathing' && (
            <motion.div
              key="breathing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <BreathingGuide onComplete={handleBreathingComplete} />
            </motion.div>
          )}

          {step === 'quote' && quote && (
            <motion.div
              key="quote"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-12"
            >
              <QuoteDisplay quote={quote} />
              <AnimatePresence>
                {countdown.isComplete && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center"
                  >
                    <motion.button
                      onClick={handleEnter}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="px-8 py-3 rounded-xl bg-forest-700 text-cream-50 font-medium hover:bg-forest-600 transition-colors"
                    >
                      {t('enter')}
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      {(step === 'quote') && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-parchment-100">
          <motion.div
            className="h-full bg-forest-600/60"
            initial={{ width: '0%' }}
            animate={{ width: `${countdown.progress * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}
    </motion.div>
  );
}
