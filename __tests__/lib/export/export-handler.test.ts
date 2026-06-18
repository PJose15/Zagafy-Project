import { describe, it, expect } from 'vitest';
import { contentDisposition, sanitizeFilename } from '@/lib/export/export-handler';

describe('contentDisposition', () => {
  it('emits a quoted ASCII filename plus an RFC 5987 filename*', () => {
    const value = contentDisposition('My_Manuscript.docx');
    expect(value).toBe(
      "attachment; filename=\"My_Manuscript.docx\"; filename*=UTF-8''My_Manuscript.docx",
    );
  });

  it('folds non-ASCII characters in the legacy filename but preserves them in filename*', () => {
    const value = contentDisposition('Café_Naïve.pdf');
    // Legacy token must be pure ASCII so browsers do not garble it.
    const legacy = value.match(/filename="([^"]*)"/)?.[1] ?? '';
    expect(legacy).toBe('Caf__Na_ve.pdf');
    expect(/^[\x20-\x7E]*$/.test(legacy)).toBe(true);
    // Extended token round-trips back to the original via percent-decoding.
    const ext = value.match(/filename\*=UTF-8''(.*)$/)?.[1] ?? '';
    expect(decodeURIComponent(ext)).toBe('Café_Naïve.pdf');
  });

  it('strips characters that would break the quoted-string', () => {
    const value = contentDisposition('a"b\\c.docx');
    const legacy = value.match(/filename="([^"]*)"/)?.[1] ?? '';
    expect(legacy).toBe('a_b_c.docx');
  });

  it('pairs cleanly with sanitizeFilename output for a Unicode title', () => {
    const base = sanitizeFilename('Café Story');
    const value = contentDisposition(`${base}.docx`);
    expect(value).toContain("filename*=UTF-8''");
    expect(value.startsWith('attachment; filename="')).toBe(true);
  });
});
