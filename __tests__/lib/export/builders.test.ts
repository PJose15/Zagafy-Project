import { describe, it, expect } from 'vitest';
import { buildManuscriptModel, type ManuscriptModel } from '@/lib/export/manuscript-model';
import { buildManuscriptDocx } from '@/lib/export/docx-builder';
import { buildManuscriptPdf } from '@/lib/export/pdf-builder';

function sampleModel(titlePage: boolean): ManuscriptModel {
  return buildManuscriptModel({
    title: 'The Long Road',
    author: { name: 'Jane Q. Writer', email: 'jane@example.com', address: '1 Main St\nAnytown, CA 90000' },
    chapters: [
      { title: 'Chapter One', content: 'It was a bright cold day.\n* * *\nThe clocks were striking thirteen.' },
      { title: 'Chapter Two', content: 'Winston walked on.' },
    ],
    options: { titlePage },
  });
}

describe('buildManuscriptDocx', () => {
  it('produces a non-empty .docx (zip) buffer', async () => {
    const buf = await buildManuscriptDocx(sampleModel(true));
    expect(buf.length).toBeGreaterThan(1000);
    // .docx is a zip archive — magic bytes "PK".
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it('works without a title page', async () => {
    const buf = await buildManuscriptDocx(sampleModel(false));
    expect(buf.length).toBeGreaterThan(1000);
  });
});

describe('buildManuscriptPdf', () => {
  it('produces a valid PDF buffer', async () => {
    const buf = await buildManuscriptPdf(sampleModel(true));
    expect(buf.length).toBeGreaterThan(1000);
    // PDF magic header "%PDF".
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF');
  }, 20000);
});
