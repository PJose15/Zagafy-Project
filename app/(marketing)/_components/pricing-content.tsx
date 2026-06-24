'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function PricingContent() {
  const t = useTranslations('marketing.pricing');
  const tiers = [
    {
      key: 'free',
      name: t('free.name'),
      price: t('free.price'),
      period: t('free.period'),
      description: t('free.description'),
      cta: t('free.cta'),
      features: [t('free.f1'), t('free.f2'), t('free.f3'), t('free.f4'), t('free.f5')],
      highlighted: false,
    },
    {
      key: 'writer',
      name: t('writer.name'),
      price: t('writer.price'),
      period: t('writer.period'),
      description: t('writer.description'),
      cta: t('writer.cta'),
      features: [t('writer.f1'), t('writer.f2'), t('writer.f3'), t('writer.f4'), t('writer.f5'), t('writer.f6')],
      highlighted: true,
    },
    {
      key: 'author',
      name: t('author.name'),
      price: t('author.price'),
      period: t('author.period'),
      description: t('author.description'),
      cta: t('author.cta'),
      features: [t('author.f1'), t('author.f2'), t('author.f3'), t('author.f4'), t('author.f5'), t('author.f6')],
      highlighted: false,
    },
  ];

  return (
    <section className="max-w-6xl mx-auto px-6 py-16">
      <h1 className="font-serif text-4xl md:text-5xl font-bold text-cream-50 text-center mb-4">
        {t('title')}
      </h1>
      <p className="text-center text-cream-300 max-w-2xl mx-auto mb-16 text-lg">
        {t('subtitle')}
      </p>

      <div className="grid md:grid-cols-3 gap-8 items-start">
        {tiers.map((tier) => (
          <div
            key={tier.key}
            className={[
              'bg-parchment-100 border rounded-xl p-8 shadow-parchment texture-parchment text-sepia-900 flex flex-col',
              tier.highlighted
                ? 'border-brass-500 ring-2 ring-brass-500/40 scale-[1.03]'
                : 'border-sepia-300/50',
            ].join(' ')}
          >
            <h2 className="font-serif text-2xl font-bold mb-1">{tier.name}</h2>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-3xl font-bold text-brass-700">{tier.price}</span>
              <span className="text-sepia-600 text-sm">{tier.period}</span>
            </div>
            <p className="text-sepia-600 mb-6">{tier.description}</p>

            <ul className="space-y-2 mb-8 flex-1">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-sepia-700">
                  <span className="text-forest-600 mt-0.5">&#10003;</span>
                  {f}
                </li>
              ))}
            </ul>

            <Link
              href="/sign-up"
              className={[
                'block text-center py-3 rounded-lg font-medium transition-colors',
                tier.highlighted
                  ? 'bg-brass-600 hover:bg-brass-500 text-cream-50'
                  : 'bg-mahogany-800 hover:bg-mahogany-700 text-cream-100',
              ].join(' ')}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
