import { describe, it, expect } from 'vitest';
import { paginateText, paginateTextWithOffsets, estimateReadingTime, formatChapterForReading, countWords } from '@/lib/reader-utils';

describe('reader-utils', () => {
  describe('paginateText', () => {
    it('returns empty for empty text', () => {
      expect(paginateText('')).toEqual([]);
      expect(paginateText('   ')).toEqual([]);
    });
    it('returns single page for short text', () => {
      expect(paginateText('hello world')).toHaveLength(1);
    });
    it('paginates long text', () => {
      const text = Array(600).fill('word').join(' ');
      const pages = paginateText(text, 250);
      expect(pages).toHaveLength(3);
    });
    it('respects custom wordsPerPage', () => {
      const text = Array(20).fill('word').join(' ');
      expect(paginateText(text, 10)).toHaveLength(2);
    });
  });
  describe('paginateTextWithOffsets', () => {
    it('returns empty for empty text', () => {
      expect(paginateTextWithOffsets('')).toEqual([]);
      expect(paginateTextWithOffsets('   ')).toEqual([]);
    });

    it('page text is an exact substring of the source at the reported offset', () => {
      const text = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
      const pages = paginateTextWithOffsets(text, 10);
      expect(pages).toHaveLength(3);
      for (const page of pages) {
        expect(text.slice(page.start, page.start + page.text.length)).toBe(page.text);
      }
    });

    it('first page starts at offset 0 and preserves internal whitespace/newlines', () => {
      const text = 'The  quick\nbrown fox jumps';
      const [page] = paginateTextWithOffsets(text, 250);
      expect(page.start).toBe(0);
      // Exact substring — double space + newline preserved (unlike paginateText).
      expect(page.text).toBe('The  quick\nbrown fox jumps');
    });

    it('later-page offsets let whole-chapter indices re-base to page-local ones', () => {
      // Two pages of 5 words. An issue on the 6th word (page 2) must re-base
      // to a page-local index that slices the correct word.
      const text = 'a b c d e TARGET g h i j';
      const pages = paginateTextWithOffsets(text, 5);
      expect(pages).toHaveLength(2);
      const secondPage = pages[1];
      const targetStart = text.indexOf('TARGET');
      const local = targetStart - secondPage.start;
      expect(secondPage.text.slice(local, local + 'TARGET'.length)).toBe('TARGET');
    });
  });

  describe('estimateReadingTime', () => {
    it('returns 1 min minimum', () => {
      expect(estimateReadingTime('hello').minutes).toBe(1);
    });
    it('estimates correctly for 400 words', () => {
      const text = Array(400).fill('word').join(' ');
      expect(estimateReadingTime(text).minutes).toBe(2);
    });
    it('formats hours for long text', () => {
      const text = Array(15000).fill('word').join(' ');
      expect(estimateReadingTime(text).display).toContain('h');
    });
  });
  describe('formatChapterForReading', () => {
    it('prepends title', () => {
      expect(formatChapterForReading('Ch 1', 'body')).toBe('Ch 1\n\nbody');
    });
  });
  describe('countWords', () => {
    it('counts words', () => {
      expect(countWords('one two three')).toBe(3);
    });
    it('returns 0 for empty', () => {
      expect(countWords('')).toBe(0);
    });
  });
});
