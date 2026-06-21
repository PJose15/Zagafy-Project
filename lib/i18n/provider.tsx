'use client';

/**
 * Client-side i18n provider. The UI locale is a profile preference
 * (localStorage), not a URL segment, so we resolve it on the client and feed
 * NextIntlClientProvider directly. Also keeps <html lang> in sync for a11y/SEO.
 *
 * SSR + first client render use the default catalog (the profile snapshot
 * defaults to 'en'); once the stored profile hydrates, the provider re-renders
 * in the chosen locale. The <html lang> mutation lives in an effect so it never
 * causes a hydration mismatch.
 */

import { useEffect } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { useProfile } from '@/hooks/use-profile';
import { getMessages, normalizeLocale } from '@/lib/i18n/config';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();
  const locale = normalizeLocale(profile?.preferences.uiLocale);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  return (
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}
