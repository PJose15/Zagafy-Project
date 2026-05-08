/**
 * Phase 4.2 / MP-06 — find-and-replace across chapters.
 *
 * Pure algorithm. The UI layer maps chapters → calls findAll/replaceAll →
 * persists the result. Versioning happens at the chapter level (existing
 * chapterVersions Dexie store) so writers can roll a Replace-All back.
 */

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
  const pattern = buildPattern(query, opts);
  const matches: Match[] = [];
  let exec: RegExpExecArray | null;
  let safety = 0;
  while ((exec = pattern.exec(chapter.content)) !== null) {
    const start = exec.index;
    const end = start + exec[0].length;
    const { before, after } = takeContext(chapter.content, start, end);
    matches.push({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      index: start,
      length: exec[0].length,
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
  const newContent = content.replace(pattern, () => {
    replaced += 1;
    return replacement;
  });
  return { newContent, replaced };
}
