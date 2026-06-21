/**
 * i18n configuration — UI locale catalogs (separate from the per-project AI
 * `language`). The active UI locale comes from the local profile
 * (`profile.preferences.uiLocale`, see lib/profiles/profile.ts), NOT from a
 * URL segment, so this is a client-driven, preference-based setup.
 *
 * Adding a language = add a `messages/<locale>.json` catalog, import it here,
 * and add an entry to LOCALES + LOCALE_LABELS.
 */

import en from '@/messages/en.json';
import es from '@/messages/es.json';

export type AppLocale = 'en' | 'es';

/** Shipped UI locales, in selector display order. */
export const LOCALES: AppLocale[] = ['en', 'es'];

export const DEFAULT_LOCALE: AppLocale = 'en';

/** Native-name labels for the App Language selector. */
export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: 'English',
  es: 'Español',
};

type Messages = typeof en;

const CATALOGS: Record<AppLocale, Messages> = { en, es };

/** Coerce an arbitrary stored value to a shipped locale (falls back to default). */
export function normalizeLocale(value: string | undefined | null): AppLocale {
  return value === 'es' ? 'es' : 'en';
}

/** Get the message catalog for a locale (default catalog if unknown). */
export function getMessages(locale: string | undefined | null): Messages {
  return CATALOGS[normalizeLocale(locale)] ?? CATALOGS[DEFAULT_LOCALE];
}
