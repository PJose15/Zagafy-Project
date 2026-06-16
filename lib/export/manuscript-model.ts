/**
 * MP-04 — shared manuscript export model.
 *
 * A pure, dependency-free representation of a manuscript that both the DOCX
 * (`docx`) and PDF (`@react-pdf/renderer`) builders consume. It parses chapter
 * content — Lexical JSON (CB-07) or legacy plain text — into paragraphs and
 * formatted runs, preserving bold/italic/underline/strikethrough and centered
 * scene breaks. No `lexical` import, so it is safe to run inside an API route.
 */

// Lexical TextNode `format` bitfield flags (mirrors lexical's IS_* constants).
const IS_BOLD = 1;
const IS_ITALIC = 2;
const IS_STRIKETHROUGH = 4;
const IS_UNDERLINE = 8;

export type ExportAlign = 'left' | 'center' | 'right' | 'justify';

export interface ExportRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

export interface ExportParagraph {
  runs: ExportRun[];
  align: ExportAlign;
  /** True for a centered scene-break separator ("* * *" / "#"). */
  sceneBreak: boolean;
}

export interface ExportChapter {
  title: string;
  paragraphs: ExportParagraph[];
  wordCount: number;
}

export interface ManuscriptAuthor {
  name: string;
  email?: string;
  address?: string;
}

export interface ExportOptions {
  /** Render a Shunn-style title page as the first page. */
  titlePage: boolean;
}

export interface ManuscriptModel {
  title: string;
  author: ManuscriptAuthor;
  chapters: ExportChapter[];
  totalWordCount: number;
  options: ExportOptions;
}

/** A raw chapter as sent from the client (content may be Lexical JSON or plain text). */
export interface RawChapter {
  title: string;
  content: string;
}

// ─── Helpers ───

function isLexicalJson(content: string): boolean {
  if (!content || content.length < 10) return false;
  try {
    const parsed = JSON.parse(content);
    return parsed?.root?.type === 'root';
  } catch {
    return false;
  }
}

/** A line is a scene break when it's only separator glyphs (*, #, •) and spaces. */
export function isSceneBreak(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 12) return false;
  // Single linear char-class scan (ReDoS-safe), plus a guard that at least one
  // real separator glyph is present so an all-whitespace line doesn't match.
  return /^[*#•\s]+$/.test(t) && /[*#•]/.test(t);
}

function countWordsInText(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function normalizeAlign(format: unknown): ExportAlign {
  return format === 'center' || format === 'right' || format === 'justify' ? format : 'left';
}

function runsFromTextNode(node: Record<string, unknown>): ExportRun | null {
  const text = typeof node.text === 'string' ? node.text : '';
  if (!text) return null;
  const format = typeof node.format === 'number' ? node.format : 0;
  const run: ExportRun = { text };
  if (format & IS_BOLD) run.bold = true;
  if (format & IS_ITALIC) run.italic = true;
  if (format & IS_UNDERLINE) run.underline = true;
  if (format & IS_STRIKETHROUGH) run.strikethrough = true;
  return run;
}

function collectRuns(node: Record<string, unknown>, out: ExportRun[]): void {
  if (node.type === 'text') {
    const run = runsFromTextNode(node);
    if (run) out.push(run);
    return;
  }
  const children = node.children as Record<string, unknown>[] | undefined;
  if (Array.isArray(children)) {
    for (const child of children) collectRuns(child, out);
  }
}

function paragraphPlainText(p: ExportParagraph): string {
  return p.runs.map(r => r.text).join('');
}

// ─── Parsers ───

function parseLexical(content: string): ExportParagraph[] {
  let root: Record<string, unknown>;
  try {
    root = (JSON.parse(content) as { root: Record<string, unknown> }).root;
  } catch {
    return parsePlainText(content);
  }
  const blocks = (root?.children as Record<string, unknown>[]) ?? [];
  const paragraphs: ExportParagraph[] = [];
  for (const block of blocks) {
    const runs: ExportRun[] = [];
    collectRuns(block, runs);
    const text = runs.map(r => r.text).join('');
    // Drop empty paragraphs so the Lexical path matches the plain-text path —
    // Shunn format doesn't use blank-line spacing, and Flow mode persists every
    // textarea line (including blank separators) as a paragraph.
    if (text.trim().length === 0) continue;
    const align = normalizeAlign(block.format);
    paragraphs.push({ runs, align, sceneBreak: isSceneBreak(text) });
  }
  return paragraphs;
}

function parsePlainText(content: string): ExportParagraph[] {
  // Each line becomes a paragraph; blank lines are dropped (the builders add
  // their own spacing). Scene-break markers are centered.
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map<ExportParagraph>(line => {
      const sceneBreak = isSceneBreak(line);
      return {
        runs: [{ text: line }],
        align: sceneBreak ? 'center' : 'left',
        sceneBreak,
      };
    });
}

/** Parse one chapter's content into export paragraphs. */
export function contentToParagraphs(content: string): ExportParagraph[] {
  if (!content) return [];
  return isLexicalJson(content) ? parseLexical(content) : parsePlainText(content);
}

function chapterWordCount(paragraphs: ExportParagraph[]): number {
  return paragraphs.reduce((sum, p) => {
    if (p.sceneBreak) return sum;
    return sum + countWordsInText(paragraphPlainText(p));
  }, 0);
}

// ─── Model builder ───

export interface BuildModelInput {
  title: string;
  author: ManuscriptAuthor;
  chapters: RawChapter[];
  options: ExportOptions;
}

/** Build the full manuscript model from raw client payload. */
export function buildManuscriptModel(input: BuildModelInput): ManuscriptModel {
  const chapters: ExportChapter[] = input.chapters.map((ch, i) => {
    const paragraphs = contentToParagraphs(ch.content);
    return {
      title: ch.title?.trim() || `Chapter ${i + 1}`,
      paragraphs,
      wordCount: chapterWordCount(paragraphs),
    };
  });

  return {
    title: input.title?.trim() || 'Untitled',
    author: input.author,
    chapters,
    totalWordCount: chapters.reduce((sum, c) => sum + c.wordCount, 0),
    options: input.options,
  };
}

/**
 * Round a word count the way submission guidelines expect on a title page:
 * nearest 100 under 10k, nearest 1,000 otherwise.
 */
export function roundWordCount(words: number): number {
  if (words < 1000) return Math.max(0, Math.round(words / 100) * 100);
  if (words < 10000) return Math.round(words / 100) * 100;
  return Math.round(words / 1000) * 1000;
}
