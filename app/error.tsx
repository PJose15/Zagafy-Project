'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';
import { fadeUp } from '@/lib/animations';
import { InkStampButton, ParchmentCard } from '@/components/antiquarian';

/** Route error — an apologetic note in the margin, never a stack trace. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errorPage');

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex-1 w-full flex flex-col items-center justify-center min-h-[60vh] p-8">
      <motion.div {...fadeUp} className="w-full max-w-md">
        <ParchmentCard variant="translucent" padding="lg" className="border-l-4 border-l-wax-600">
          <p className="label-caps text-[10px] text-wax-600 mb-2">{t('eyebrow')}</p>
          <h1 className="text-2xl font-serif font-bold text-sepia-900 text-balance">{t('title')}</h1>
          <p className="mt-3 font-serif italic text-sepia-700 leading-relaxed">{t('subtitle')}</p>
          {error.digest && (
            <p className="mt-3 font-mono text-[10px] text-sepia-600">
              {t('digest')}: {error.digest}
            </p>
          )}
          <div className="mt-5">
            <InkStampButton onClick={reset}>{t('retry')}</InkStampButton>
          </div>
        </ParchmentCard>
      </motion.div>
    </div>
  );
}
