/**
 * Phase 4.2 / MP-06 — find-and-replace across chapters.
 *
 * Pure algorithm. The UI layer maps chapters → calls findAll/replaceAll →
 * persists the result. Versioning happens at the chapter level (existing
 * chapterVersions Dexie store) so writers can roll a Replace-All back.
 *
 * CB-07: chapter content may be Lexical JSON. Searching runs over the plain
 * text (so matches and previews read naturally); replacing walks the Lexical
 * text nodes in place so rich formatting survives. Plain-text content takes
 * the original fast path unchanged.
 */

import { getPlainText, isLexicalJson, mapLexicalText } from '@/lib/editor/serialization';

export type FindScope = 'current-chapter' | 'all-chapters';

export interface FindOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  scope?: FindScope;
}

export interface Match {
  chapterId: string;
  chapterTitle: string;
  index: number;
  length: number;
  /** The exact substring that matched (may differ from the query under
   *  case-insensitive or regex mode — e.g. query "the" matching "The"/"THE"). */
  matchText: string;
  contextBefore: string;
  contextAfter: string;
}

const CONTEXT_RADIUS = 50;
const MAX_MATCHES_PER_CHAPTER = 5_000;
/** Defensive upper bound — manuscripts on free tier won't approach this. */
const MAX_MATCHES_TOTAL = 50_000;

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the regex used for both findAll and replaceAll. Throws when regex
 * mode is on and the user-supplied pattern is invalid; callers should
 * catch and surface an error to the UI.
 */
export function buildPattern(query: string, opts: FindOptions = {}): RegExp {
  const flags = opts.caseSensitive ? 'g' : 'gi';
  let body: string;
  if (opts.regex) {
    body = query;
  } else {
    body = escapeRegex(query);
  }
  if (opts.wholeWord) {
    body = `\\b(?:${body})\\b`;
  }
  // Dynamic by design: plain queries are escaped above; regex mode is an
  // explicit user opt-in (invalid patterns throw and are surfaced to the UI).
  // eslint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(body, flags);
}

function takeContext(text: string, start: number, end: number): { before: string; after: string } {
  const beforeStart = Math.max(0, start - CONTEXT_RADIUS);
  const afterEnd = Math.min(text.length, end + CONTEXT_RADIUS);
  return {
    before: text.slice(beforeStart, start),
    after: text.slice(end, afterEnd),
  };
}

/**
 * Find every match of `query` inside one chapter. Returns at most
 * MAX_MATCHES_PER_CHAPTER hits; further matches are dropped silently
 * (UI surfaces a "more than N matches" hint).
 */
export function findInChapter(
  chapter: { id: string; title: string; content: string },
  query: string,
  opts: FindOptions = {},
): Match[] {
  if (!query) return [];
  const text = getPlainText(chapter.content);
  const pattern = buildPattern(query, opts);
  const matches: Match[] = [];
  let exec: RegExpExecArray | null;
  let safety = 0;
  while ((exec = pattern.exec(text)) !== null) {
    const start = exec.index;
    const end = start + exec[0].length;
    const { before, after } = takeContext(text, start, end);
    matches.push({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      index: start,
      length: exec[0].length,
      matchText: exec[0],
      contextBefore: before,
      contextAfter: after,
    });
    if (matches.length >= MAX_MATCHES_PER_CHAPTER) break;
    // Empty matches (e.g. zero-width regex) — advance one character to
    // avoid an infinite loop.
    if (exec[0].length === 0) pattern.lastIndex += 1;
    safety += 1;
    if (safety > MAX_MATCHES_PER_CHAPTER * 2) break;
  }
  return matches;
}

/**
 * Run findInChapter across multiple chapters. Honors the scope option:
 * 'current-chapter' restricts to the first chapter in the input, even if
 * more are passed. 'all-chapters' walks the whole list. Returns at most
 * MAX_MATCHES_TOTAL matches in document order.
 */
export function findAll(
  chapters: { id: string; title: string; content: string }[],
  query: string,
  opts: FindOptions = {},
): Match[] {
  if (!query) return [];
  const scope: FindScope = opts.scope ?? 'all-chapters';
  const targets = scope === 'current-chapter' ? chapters.slice(0, 1) : chapters;
  const results: Match[] = [];
  for (const ch of targets) {
    const matches = findInChapter(ch, query, opts);
    results.push(...matches);
    if (results.length >= MAX_MATCHES_TOTAL) {
      return results.slice(0, MAX_MATCHES_TOTAL);
    }
  }
  return results;
}

/**
 * Apply a replacement to one chapter's content. Returns the new content
 * and the number of replacements made. The pattern always carries the
 * 'g' flag so every occurrence is replaced.
 */
export function replaceAllInChapter(
  content: string,
  query: string,
  replacement: string,
  opts: FindOptions = {},
): { newContent: string; replaced: number } {
  if (!query) return { newContent: content, replaced: 0 };
  const pattern = buildPattern(query, opts);
  let replaced = 0;
  const apply = (text: string) =>
    text.replace(pattern, () => {
      replaced += 1;
      return replacement;
    });

  // Lexical JSON: replace inside each text node so formatting is preserved.
  // Plain text: replace directly.
  const newContent = isLexicalJson(content)
    ? mapLexicalText(content, apply)
    : apply(content);

  return { newContent, replaced };
}
