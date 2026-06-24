'use client';

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';

export function TermsContent() {
  const t = useTranslations('marketing.terms');
  const sections = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    title: t(`s${n}Title`),
    body: t(`s${n}Body`),
  }));

  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="font-serif text-4xl font-bold text-cream-50 mb-8">{t('title')}</h1>

      <div className="bg-parchment-100 border border-sepia-300/50 rounded-xl p-8 shadow-parchment texture-parchment text-sepia-900 space-y-6 leading-relaxed">
        <p className="text-sm text-sepia-600">{t('lastUpdated')}</p>

        {sections.map((s) => (
          <Fragment key={s.title}>
            <h2 className="font-serif text-xl font-bold pt-2">{s.title}</h2>
            <p>{s.body}</p>
          </Fragment>
        ))}
      </div>
    </section>
  );
}
