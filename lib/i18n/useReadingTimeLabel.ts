'use client';

import { useTranslations } from 'next-intl';
import { readingTimeMinutes, READING_SPEEDS } from '@/lib/analytics/pacing';

/**
 * Locale-aware counterpart to `readingTimeLabel` in lib/analytics/pacing.ts.
 * The pure function stays English (it's covered by unit tests and used in
 * non-React contexts); components call this hook so the label renders in the
 * active UI locale. Format mirrors the pure helper exactly:
 *   < 60 min → "~12 min read" | whole hours → "~4h read" | else "~1h 14m read"
 */
export function useReadingTimeLabel() {
  const t = useTranslations('common');
  return (wordCount: number, wpm: number = READING_SPEEDS.average): string => {
    const m = readingTimeMinutes(wordCount, wpm);
    if (m < 60) return t('readingTimeMin', { minutes: m });
    const hours = Math.floor(m / 60);
    const mins = m % 60;
    return mins === 0
      ? t('readingTimeHour', { hours })
      : t('readingTimeHourMin', { hours, minutes: mins });
  };
}
