import type { CanonStatus } from '@/lib/store';

export const WORLD_BIBLE_CATEGORIES = [
  'geography',
  'history',
  'magic-tech',
  'politics',
  'religion-culture',
  'economy',
  'languages',
  'calendar',
] as const;

export type WorldBibleCategory = (typeof WORLD_BIBLE_CATEGORIES)[number];

export interface WorldBibleSection {
  id: string;
  category: WorldBibleCategory;
  title: string;
  content: string;
  source: 'ai-extracted' | 'user-written';
  lastUpdated: string;
  canonStatus: CanonStatus;
}

/**
 * Content-identity key for a world-bible section (M-4). AI extraction mints a
 * fresh `crypto.randomUUID()` for every section on every run, so re-extracting
 * the same manuscript can't be deduped by id — it would append the same lore
 * again. This key (category + normalized title) identifies "the same entry"
 * across extraction runs so duplicates can be detected and skipped at merge.
 */
export function worldBibleDedupKey(section: { category: string; title: string }): string {
  return `${section.category}::${section.title.trim().toLowerCase()}`;
}

export function isWorldBibleSection(value: unknown): value is WorldBibleSection {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.category === 'string' &&
    (WORLD_BIBLE_CATEGORIES as readonly string[]).includes(v.category) &&
    typeof v.title === 'string' &&
    typeof v.content === 'string' &&
    (v.source === 'ai-extracted' || v.source === 'user-written') &&
    typeof v.lastUpdated === 'string' &&
    typeof v.canonStatus === 'string'
  );
}

export const CATEGORY_META: Record<WorldBibleCategory, { label: string; icon: string }> = {
  geography: { label: 'Geography', icon: 'Globe' },
  history: { label: 'History', icon: 'Scroll' },
  'magic-tech': { label: 'Magic & Tech', icon: 'Wand2' },
  politics: { label: 'Politics', icon: 'Landmark' },
  'religion-culture': { label: 'Religion & Culture', icon: 'Church' },
  economy: { label: 'Economy', icon: 'Coins' },
  languages: { label: 'Languages', icon: 'Languages' },
  calendar: { label: 'Calendar', icon: 'CalendarDays' },
};
