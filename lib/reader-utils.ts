const WORDS_PER_PAGE = 250;
const WORDS_PER_MINUTE = 200;

export function paginateText(text: string, wordsPerPage = WORDS_PER_PAGE): string[] {
  if (!text.trim()) return [];
  const words = text.split(/\s+/);
  const pages: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerPage) {
    pages.push(words.slice(i, i + wordsPerPage).join(' '));
  }
  return pages;
}

/** A page of text plus its start offset within the original string. */
export interface PaginatedPage {
  /** The page text — an exact substring of the original (`text.slice(start, start + text.length)`). */
  text: string;
  /** Character offset of this page's first word within the original text. */
  start: number;
}

/**
 * Like `paginateText`, but preserves each page's exact character offset within
 * the original string so that index-based overlays (e.g. prose annotations,
 * whose indices are relative to the whole chapter) can be re-based to the page.
 *
 * Unlike `paginateText`, the page text is a true substring of the source
 * (internal whitespace/newlines preserved), so `content.slice(page.start, …)`
 * and issue-index arithmetic line up exactly.
 */
export function paginateTextWithOffsets(text: string, wordsPerPage = WORDS_PER_PAGE): PaginatedPage[] {
  if (!text.trim()) return [];
  // Collect each word run with its original start/end offset.
  const words: { start: number; end: number }[] = [];
  const wordRegex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = wordRegex.exec(text)) !== null) {
    words.push({ start: match.index, end: match.index + match[0].length });
  }

  const pages: PaginatedPage[] = [];
  for (let i = 0; i < words.length; i += wordsPerPage) {
    const chunk = words.slice(i, i + wordsPerPage);
    const start = chunk[0].start;
    const end = chunk[chunk.length - 1].end;
    pages.push({ text: text.slice(start, end), start });
  }
  return pages;
}

export function estimateReadingTime(text: string): { minutes: number; display: string } {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
  const display = minutes < 60 ? `${minutes} min read` : `${Math.floor(minutes / 60)}h ${minutes % 60}m read`;
  return { minutes, display };
}

export function formatChapterForReading(title: string, content: string): string {
  return `${title}\n\n${content}`;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
