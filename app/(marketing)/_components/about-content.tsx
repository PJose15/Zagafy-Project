'use client';

import { useTranslations } from 'next-intl';

export function AboutContent() {
  const t = useTranslations('marketing.about');
  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="font-serif text-4xl md:text-5xl font-bold text-cream-50 mb-8">
        {t('title')}
      </h1>

      <div className="bg-parchment-100 border border-sepia-300/50 rounded-xl p-8 shadow-parchment texture-parchment text-sepia-900 space-y-6 leading-relaxed">
        <p className="text-lg font-serif text-sepia-800">{t('intro')}</p>

        <h2 className="font-serif text-2xl font-bold text-sepia-900 pt-4">{t('missionTitle')}</h2>
        <p>{t('mission1')}</p>
        <p>{t('mission2')}</p>

        <h2 className="font-serif text-2xl font-bold text-sepia-900 pt-4">{t('philosophyTitle')}</h2>
        <p>{t('philosophy1')}</p>
        <p>{t('philosophy2')}</p>
      </div>
    </section>
  );
}
