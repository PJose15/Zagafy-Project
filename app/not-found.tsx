'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';
import { fadeUp } from '@/lib/animations';
import { ParchmentCard, EngravedFlourish } from '@/components/antiquarian';

/** 404 — a page torn from the book, its text lost between the bindings. */
export default function NotFound() {
  const t = useTranslations('notFound');

  return (
    <div className="flex-1 w-full flex flex-col items-center justify-center min-h-[70vh] p-8">
      <motion.div {...fadeUp} className="w-full max-w-lg">
        <ParchmentCard variant="aged" padding="lg" tornEdge className="relative pb-10">
          <span className="absolute top-4 right-6 font-mono text-[11px] text-sepia-600">
            {t('folio')}
          </span>
          <div className="flex justify-center mb-4">
            <EngravedFlourish className="opacity-60" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-sepia-900 text-center text-balance letterpress">
            {t('title')}
          </h1>
          <p className="mt-3 font-serif italic text-sepia-700 text-center leading-relaxed">
            {t('subtitle')}
          </p>
          {/* Ghost of the lost text */}
          <div className="mt-6 space-y-2.5" aria-hidden="true">
            <div className="h-2 rounded bg-sepia-300/25 w-full" />
            <div className="h-2 rounded bg-sepia-300/20 w-11/12" />
            <div className="h-2 rounded bg-sepia-300/15 w-full" />
            <div className="h-2 rounded bg-sepia-300/10 w-2/3" />
          </div>
        </ParchmentCard>
        <div className="flex justify-center mt-8">
          <Link
            href="/"
            className="inline-flex items-center justify-center font-semibold rounded-lg transition duration-150 bg-gradient-to-b from-brass-500 to-brass-700 text-sepia-900 border border-brass-600 shadow-brass hover:from-brass-400 hover:to-brass-600 active:from-brass-700 active:to-brass-500 active:translate-y-[1px] active:scale-[0.97] text-sm px-4 py-2 gap-2"
          >
            {t('back')}
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
