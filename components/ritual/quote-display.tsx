'use client';

import { motion } from 'motion/react';
import { useLocale } from 'next-intl';
import type { WriterQuote } from '@/lib/types/quotes';
import quotesEs from '@/data/quotes.es.json';

interface QuoteDisplayProps {
  quote: WriterQuote;
}

// Spanish overrides keyed by quote id (author + source stay as-is — proper nouns).
const ES: Record<string, { text: string; zagafyPhrase: string }> = quotesEs;

/** Per-word soak: each word resolves from nothing, ~35ms apart, like ink
    spreading into paper. The daily set-piece earns set-piece motion. */
const wordVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.35 } },
};

export function QuoteDisplay({ quote }: QuoteDisplayProps) {
  const locale = useLocale();
  const localized = locale === 'es' ? ES[quote.id] : undefined;
  const text = localized?.text ?? quote.text;
  const zagafyPhrase = localized?.zagafyPhrase ?? quote.zagafyPhrase;

  const words = text.split(/\s+/);
  // Attribution and phrase wait for the last word to begin soaking in.
  const soak = words.length * 0.035;

  return (
    <div className="text-center space-y-6 max-w-lg mx-auto px-4">
      <motion.blockquote
        initial="hidden"
        animate="visible"
        transition={{ staggerChildren: 0.035 }}
        className="text-xl md:text-2xl font-serif text-sepia-900 leading-relaxed italic"
      >
        {words.map((word, i) => (
          <motion.span key={i} variants={wordVariants}>
            {i === 0 && '“'}
            {word}
            {i === words.length - 1 ? '”' : ' '}
          </motion.span>
        ))}
      </motion.blockquote>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: soak + 0.25, duration: 0.6 }}
        className="text-sm text-sepia-600"
      >
        &mdash; {quote.author}, <span className="italic">{quote.source}</span>
      </motion.p>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: soak + 0.6, duration: 0.6 }}
        className="text-base text-brass-700 font-serif"
      >
        {zagafyPhrase}
      </motion.p>
    </div>
  );
}
