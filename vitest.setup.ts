import { vi } from 'vitest';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';

/**
 * Global i18n test shim. Components now call `useTranslations()` (next-intl),
 * which requires a NextIntlClientProvider in the tree. Rather than wrap every
 * render, mock `useTranslations` with a real translator backed by the English
 * catalog — so existing assertions on English copy keep passing and ICU
 * plurals / `t.rich` behave exactly as in production.
 */
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  type TranslatorOpts = Parameters<typeof createTranslator>[0];
  return {
    ...actual,
    useLocale: () => 'en',
    useTranslations: (namespace?: string) =>
      createTranslator(
        { locale: 'en', messages: en, namespace } as unknown as TranslatorOpts,
      ),
  };
});
