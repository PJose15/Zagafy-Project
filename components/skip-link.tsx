'use client';

import { useTranslations } from 'next-intl';

/**
 * Accessible skip-to-content link. Client component so it can read the
 * user's locale via next-intl (the root layout is a server component and the
 * locale lives client-side) — rendered inside I18nProvider.
 */
export function SkipLink() {
  const t = useTranslations('common');
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:z-[200] focus:top-4 focus:left-4 focus:bg-forest-700 focus:text-cream-50 focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium"
    >
      {t('skipToContent')}
    </a>
  );
}
