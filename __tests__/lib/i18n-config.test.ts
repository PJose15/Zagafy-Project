import { describe, it, expect } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import {
  LOCALES,
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  normalizeLocale,
  getMessages,
} from '@/lib/i18n/config';

/** Recursively collect dotted leaf-key paths from a nested message catalog. */
function leafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...leafKeys(v as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

describe('i18n config', () => {
  it('ships en + es as the only locales, default en', () => {
    expect(LOCALES).toEqual(['en', 'es']);
    expect(DEFAULT_LOCALE).toBe('en');
    expect(LOCALE_LABELS.en).toBe('English');
    expect(LOCALE_LABELS.es).toBe('Español');
  });

  it('normalizeLocale coerces unknown values to the default', () => {
    expect(normalizeLocale('es')).toBe('es');
    expect(normalizeLocale('en')).toBe('en');
    expect(normalizeLocale('fr')).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
    expect(normalizeLocale(null)).toBe('en');
    expect(normalizeLocale('')).toBe('en');
  });

  it('getMessages returns the matching catalog and falls back to default', () => {
    expect(getMessages('es')).toBe(es);
    expect(getMessages('en')).toBe(en);
    expect(getMessages('xx')).toBe(en);
    expect(getMessages(undefined)).toBe(en);
  });
});

describe('catalog parity', () => {
  it('es defines exactly the same keys as en (no missing/extra translations)', () => {
    const enKeys = leafKeys(en as Record<string, unknown>);
    const esKeys = leafKeys(es as Record<string, unknown>);
    const missingInEs = enKeys.filter((k) => !esKeys.includes(k));
    const extraInEs = esKeys.filter((k) => !enKeys.includes(k));
    expect(missingInEs).toEqual([]);
    expect(extraInEs).toEqual([]);
  });

  it('no translated value is left empty', () => {
    for (const [locale, catalog] of [['en', en], ['es', es]] as const) {
      const stack: Array<Record<string, unknown>> = [catalog as Record<string, unknown>];
      while (stack.length) {
        const node = stack.pop()!;
        for (const v of Object.values(node)) {
          if (v && typeof v === 'object') stack.push(v as Record<string, unknown>);
          else expect(String(v).trim(), `empty value in ${locale}`).not.toBe('');
        }
      }
    }
  });
});
