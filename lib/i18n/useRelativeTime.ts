'use client';

import { useLocale, useTranslations } from 'next-intl';

/**
 * Locale-aware relative-time formatter. Mirrors the per-page formatRelative
 * helpers (just now / Nm ago / Nh ago / Nd ago), falling back to a localized
 * absolute date once the timestamp is more than ~30 days old.
 */
export function useRelativeTime() {
  const t = useTranslations('common');
  const locale = useLocale();
  return (ts: number): string => {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60_000);
    if (min < 1) return t('timeJustNow');
    if (min < 60) return t('timeMinutes', { count: min });
    const hr = Math.floor(min / 60);
    if (hr < 24) return t('timeHours', { count: hr });
    const d = Math.floor(hr / 24);
    if (d < 30) return t('timeDays', { count: d });
    return new Date(ts).toLocaleDateString(locale);
  };
}
