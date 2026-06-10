/**
 * MP-04 — PDF builder (Shunn Modern Manuscript Format) via @react-pdf/renderer.
 *
 * Mirrors the DOCX builder: 12pt Times, double-spaced, 1" margins, optional
 * title page, running "Surname / TITLE / page" header, chapters starting
 * one-third down a fresh page, half-inch first-line indents, centered "#"
 * scene breaks.
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { ManuscriptModel, ExportChapter, ExportParagraph, ExportRun } from './manuscript-model';
import { roundWordCount } from './manuscript-model';

const PT_PER_INCH = 72;
const SCENE_BREAK_GLYPH = '#';

const styles = StyleSheet.create({
  page: {
    paddingTop: PT_PER_INCH,
    paddingBottom: PT_PER_INCH,
    paddingHorizontal: PT_PER_INCH,
    fontFamily: 'Times-Roman',
    fontSize: 12,
    lineHeight: 2,
  },
  header: {
    position: 'absolute',
    top: PT_PER_INCH / 2,
    right: PT_PER_INCH,
    fontSize: 12,
    textAlign: 'right',
  },
  paragraph: { textIndent: PT_PER_INCH / 2 },
  paragraphFirst: { textIndent: 0 },
  sceneBreak: { textAlign: 'center', marginVertical: 6 },
  chapterTitle: { textAlign: 'center', marginBottom: 12 },
  chapterTitleFirst: { textAlign: 'center', marginTop: PT_PER_INCH * 2, marginBottom: 12 },
  // Title page
  contact: { lineHeight: 1.2 },
  wordCount: { textAlign: 'right', lineHeight: 1.2, marginTop: 0 },
  titleBlock: { textAlign: 'center', marginTop: PT_PER_INCH * 3 },
  byline: { textAlign: 'center', lineHeight: 1.2 },
});

function surname(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'Author';
}

function titleKeyword(title: string): string {
  const stop = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'on']);
  const words = title.trim().split(/\s+/).filter(Boolean);
  const word = words.find(w => !stop.has(w.toLowerCase())) ?? words[0] ?? 'UNTITLED';
  return word.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase() || 'UNTITLED';
}

function runStyle(run: ExportRun): Record<string, string> {
  const style: Record<string, string> = {};
  if (run.bold) style.fontWeight = 'bold';
  if (run.italic) style.fontStyle = 'italic';
  const deco: string[] = [];
  if (run.underline) deco.push('underline');
  if (run.strikethrough) deco.push('line-through');
  if (deco.length) style.textDecoration = deco.join(' ');
  return style;
}

function ParagraphView({ p, first }: { p: ExportParagraph; first: boolean }) {
  if (p.sceneBreak) {
    return <Text style={styles.sceneBreak}>{SCENE_BREAK_GLYPH}</Text>;
  }
  const align =
    p.align === 'center' ? 'center'
    : p.align === 'right' ? 'right'
    : p.align === 'justify' ? 'justify'
    : 'left';
  const base = first || p.align !== 'left' ? styles.paragraphFirst : styles.paragraph;
  return (
    <Text style={{ ...base, textAlign: align as 'left' }}>
      {p.runs.length === 0
        ? ' '
        : p.runs.map((run, i) => (
            <Text key={i} style={runStyle(run)}>
              {run.text}
            </Text>
          ))}
    </Text>
  );
}

function ChapterView({ chapter, isFirst }: { chapter: ExportChapter; isFirst: boolean }) {
  // The first body (non-scene-break) paragraph is flush-left; the rest indent.
  const firstBodyIndex = chapter.paragraphs.findIndex(p => !p.sceneBreak);
  return (
    <View break={!isFirst}>
      <Text style={isFirst ? styles.chapterTitleFirst : styles.chapterTitle}>{chapter.title}</Text>
      {chapter.paragraphs.map((p, i) => (
        <ParagraphView key={i} p={p} first={i === firstBodyIndex} />
      ))}
    </View>
  );
}

function TitlePage({ model }: { model: ManuscriptModel }) {
  const { author, title } = model;
  const words = roundWordCount(model.totalWordCount);
  return (
    <Page size="LETTER" style={styles.page}>
      <View>
        {author.name ? <Text style={styles.contact}>{author.name}</Text> : null}
        {author.address
          ? author.address.split('\n').map((line, i) => (
              <Text key={i} style={styles.contact}>
                {line}
              </Text>
            ))
          : null}
        {author.email ? <Text style={styles.contact}>{author.email}</Text> : null}
      </View>
      <Text style={styles.wordCount}>About {words.toLocaleString()} words</Text>
      <View style={styles.titleBlock}>
        <Text>{title.toUpperCase()}</Text>
        <Text style={styles.byline}>by {author.name || 'Anonymous'}</Text>
      </View>
    </Page>
  );
}

function ManuscriptDocument({ model }: { model: ManuscriptModel }) {
  const headerText = `${surname(model.author.name)} / ${titleKeyword(model.title)} / `;
  return (
    <Document title={model.title} author={model.author.name || 'Zagafy'}>
      {model.options.titlePage ? <TitlePage model={model} /> : null}
      <Page size="LETTER" style={styles.page}>
        <Text
          style={styles.header}
          fixed
          render={({ pageNumber }) => `${headerText}${pageNumber}`}
        />
        {model.chapters.map((chapter, i) => (
          <ChapterView key={i} chapter={chapter} isFirst={i === 0} />
        ))}
      </Page>
    </Document>
  );
}

export async function buildManuscriptPdf(model: ManuscriptModel): Promise<Buffer> {
  return renderToBuffer(<ManuscriptDocument model={model} />);
}
