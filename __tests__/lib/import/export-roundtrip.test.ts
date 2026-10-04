// @vitest-environment node
import { describe, it, expect } from 'vitest';
import mammoth from 'mammoth';
import { buildManuscriptModel } from '@/lib/export/manuscript-model';
import { buildManuscriptDocx } from '@/lib/export/docx-builder';
import { buildManuscriptPdf } from '@/lib/export/pdf-builder';
import { readPdfText } from '@/lib/import/read-pdf';

const content = JSON.stringify({ root: { type: 'root', children: [{
  type: 'paragraph', children: [
    { type: 'text', text: 'La carta decía: mañana volverá la luz. ', format: 1 },
    { type: 'text', text: 'A letter addressed to tomorrow.', format: 2 },
  ],
}] } });
const model = buildManuscriptModel({
  title: 'Letters from Ponce', author: { name: 'Release Test' },
  chapters: [{ title: 'The Lighthouse', content }, { title: 'The Return', content: 'The keeper returned at dawn.' }],
  options: { titlePage: true },
});

describe('manuscript export/import round trip', () => {
  it('reopens DOCX with both chapters, accents, bold and italic text intact', async () => {
    const buffer = await buildManuscriptDocx(model);
    const { value } = await mammoth.convertToHtml({ buffer });
    expect(value).toContain('The Lighthouse');
    expect(value).toContain('The Return');
    expect(value).toContain('<strong>La carta decía: mañana volverá la luz. </strong>');
    expect(value).toContain('<em>A letter addressed to tomorrow.</em>');
    expect(value).toContain('The keeper returned at dawn.');
  });

  it('reads an exported PDF through the actual importer with all chapters and accents', async () => {
    const text = await readPdfText(await buildManuscriptPdf(model));
    expect(text).toContain('The Lighthouse');
    expect(text).toContain('The Return');
    expect(text).toContain('mañana volverá la luz');
    expect(text).toContain('A letter addressed to tomorrow.');
    expect(text).toContain('The keeper returned at dawn.');
  });

  it('rejects a malformed PDF instead of presenting empty successful import text', async () => {
    await expect(readPdfText(Buffer.from('not a pdf'))).rejects.toThrow();
  });
});
