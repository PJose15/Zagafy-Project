/**
 * MP-04 — DOCX builder (Shunn Modern Manuscript Format).
 *
 * Produces a standard-manuscript-format .docx buffer: 12pt Times New Roman,
 * double-spaced, 1" margins, a title page with contact info + word count, a
 * running "Surname / TITLE / page" header, chapters starting one-third down a
 * fresh page, half-inch first-line indents, and centered "#" scene breaks.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Header,
  PageNumber,
  PageBreak,
  LineRuleType,
  convertInchesToTwip,
  type ISectionOptions,
  type IRunOptions,
} from 'docx';
import type { ManuscriptModel, ExportParagraph, ExportRun } from './manuscript-model';
import { roundWordCount } from './manuscript-model';

const FONT = 'Times New Roman';
const SIZE = 24; // half-points → 12pt
const DOUBLE_LINE = 480; // twips
const SINGLE_LINE = 240;
const FIRST_LINE_INDENT = convertInchesToTwip(0.5);
const SCENE_BREAK_GLYPH = '#';

function surname(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'Author';
}

/** First meaningful word of the title, uppercased — the running-header keyword. */
function titleKeyword(title: string): string {
  const stop = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'on']);
  const words = title.trim().split(/\s+/).filter(Boolean);
  const word = words.find(w => !stop.has(w.toLowerCase())) ?? words[0] ?? 'UNTITLED';
  return word.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase() || 'UNTITLED';
}

function runOptions(run: ExportRun): IRunOptions {
  return {
    text: run.text,
    bold: run.bold,
    italics: run.italic,
    underline: run.underline ? {} : undefined,
    strike: run.strikethrough,
  };
}

function bodyParagraph(p: ExportParagraph, isFirstInChapter: boolean): Paragraph {
  if (p.sceneBreak) {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: DOUBLE_LINE, lineRule: LineRuleType.AUTO, before: SINGLE_LINE, after: SINGLE_LINE },
      children: [new TextRun({ text: SCENE_BREAK_GLYPH })],
    });
  }
  const alignment =
    p.align === 'center' ? AlignmentType.CENTER
    : p.align === 'right' ? AlignmentType.RIGHT
    : p.align === 'justify' ? AlignmentType.JUSTIFIED
    : AlignmentType.LEFT;

  return new Paragraph({
    alignment,
    spacing: { line: DOUBLE_LINE, lineRule: LineRuleType.AUTO },
    // Shunn: first paragraph of a chapter is flush-left; the rest are indented.
    indent: isFirstInChapter || p.align !== 'left' ? undefined : { firstLine: FIRST_LINE_INDENT },
    children: p.runs.length
      ? p.runs.map(r => new TextRun(runOptions(r)))
      : [new TextRun({ text: '' })],
  });
}

function titlePageParagraphs(model: ManuscriptModel): Paragraph[] {
  const { author, title } = model;
  const single = { line: SINGLE_LINE, lineRule: LineRuleType.AUTO };
  const contact: Paragraph[] = [];

  const left = (text: string) =>
    new Paragraph({ spacing: single, children: [new TextRun({ text })] });

  if (author.name) contact.push(left(author.name));
  if (author.address) {
    for (const line of author.address.split('\n')) contact.push(left(line));
  }
  if (author.email) contact.push(left(author.email));

  // Approximate word count, top-right.
  const words = roundWordCount(model.totalWordCount);
  const wordCountPara = new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: single,
    children: [new TextRun({ text: `About ${words.toLocaleString()} words` })],
  });

  // Title block, roughly one-third down the page.
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { ...single, before: convertInchesToTwip(2.5) },
    children: [new TextRun({ text: title.toUpperCase() })],
  });
  const byline = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: single,
    children: [new TextRun({ text: `by ${author.name || 'Anonymous'}` })],
  });

  return [...contact, wordCountPara, titlePara, byline, new Paragraph({ children: [new PageBreak()] })];
}

function chapterParagraphs(
  model: ManuscriptModel,
  index: number,
  pageBreakBefore: boolean,
): Paragraph[] {
  const chapter = model.chapters[index];
  const out: Paragraph[] = [];

  // Chapter heading, pushed ~1/3 down a new page.
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      pageBreakBefore,
      spacing: { line: DOUBLE_LINE, lineRule: LineRuleType.AUTO, before: convertInchesToTwip(2), after: SINGLE_LINE },
      children: [new TextRun({ text: chapter.title })],
    }),
  );

  if (chapter.paragraphs.length === 0) {
    out.push(
      new Paragraph({
        spacing: { line: DOUBLE_LINE, lineRule: LineRuleType.AUTO },
        children: [new TextRun({ text: '' })],
      }),
    );
    return out;
  }

  let firstBody = true;
  for (const p of chapter.paragraphs) {
    out.push(bodyParagraph(p, firstBody));
    if (!p.sceneBreak) firstBody = false;
  }
  return out;
}

function runningHeader(model: ManuscriptModel): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { line: SINGLE_LINE, lineRule: LineRuleType.AUTO },
        children: [
          new TextRun({ text: `${surname(model.author.name)} / ${titleKeyword(model.title)} / ` }),
          new TextRun({ children: [PageNumber.CURRENT] }),
        ],
      }),
    ],
  });
}

export async function buildManuscriptDocx(model: ManuscriptModel): Promise<Buffer> {
  const children: Paragraph[] = [];
  const hasTitlePage = model.options.titlePage;

  if (hasTitlePage) {
    children.push(...titlePageParagraphs(model));
  }

  model.chapters.forEach((_, i) => {
    // Page break before every chapter, except the very first when there's no
    // title page (the title page already ends with its own page break).
    const pageBreakBefore = hasTitlePage || i > 0;
    children.push(...chapterParagraphs(model, i, pageBreakBefore));
  });

  const section: ISectionOptions = {
    properties: {
      // First page (title page) gets no running header.
      titlePage: hasTitlePage,
      page: {
        margin: {
          top: convertInchesToTwip(1),
          bottom: convertInchesToTwip(1),
          left: convertInchesToTwip(1),
          right: convertInchesToTwip(1),
        },
      },
    },
    headers: {
      default: runningHeader(model),
      ...(hasTitlePage ? { first: new Header({ children: [new Paragraph({})] }) } : {}),
    },
    children,
  };

  const doc = new Document({
    creator: model.author.name || 'Zagafy',
    title: model.title,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: SIZE },
          paragraph: { spacing: { line: DOUBLE_LINE, lineRule: LineRuleType.AUTO } },
        },
      },
    },
    sections: [section],
  });

  return Packer.toBuffer(doc);
}
