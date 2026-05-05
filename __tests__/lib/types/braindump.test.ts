import { describe, it, expect, beforeEach } from 'vitest';
import {
  isBraindumpEntry,
  readBraindumps,
  writeBraindumps,
  addBraindump,
  updateBraindump,
  deleteBraindump,
  clearBraindumps,
  saveBraindumpTemp,
  readBraindumpTemp,
  clearBraindumpTemp,
} from '@/lib/types/braindump';
import type { BraindumpEntry, BraindumpTemp } from '@/lib/types/braindump';

function makeEntry(overrides: Partial<BraindumpEntry> = {}): BraindumpEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    durationSeconds: 60,
    language: 'en-US',
    projectId: 'proj-1',
    projectName: 'Test Project',
    rawTranscript: 'Hello world this is a test',
    polishedText: null,
    wasPolished: false,
    wordCount: 7,
    ...overrides,
  };
}

describe('braindump types', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('isBraindumpEntry', () => {
    it('returns true for a valid entry', () => {
      expect(isBraindumpEntry(makeEntry())).toBe(true);
    });

    it('returns true when polishedText is a string', () => {
      expect(isBraindumpEntry(makeEntry({ polishedText: 'Polished text' }))).toBe(true);
    });

    it('returns false for null', () => {
      expect(isBraindumpEntry(null)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(isBraindumpEntry('string')).toBe(false);
    });

    it('returns false when required fields are missing', () => {
      expect(isBraindumpEntry({ id: 'x' })).toBe(false);
    });

    it('returns false when polishedText is a number', () => {
      expect(isBraindumpEntry(makeEntry({ polishedText: 42 as unknown as string }))).toBe(false);
    });
  });

  describe('readBraindumps / writeBraindumps', () => {
    it('returns empty array when nothing stored', () => {
      expect(readBraindumps()).toEqual([]);
    });

    it('round-trips entries', () => {
      const entries = [makeEntry({ id: '1' }), makeEntry({ id: '2' })];
      writeBraindumps(entries);
      const result = readBraindumps();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1');
    });

    it('filters out invalid entries', () => {
      localStorage.setItem('zagafy_braindumps', JSON.stringify([makeEntry(), { bad: true }, 'not-an-entry']));
      expect(readBraindumps()).toHaveLength(1);
    });

    it('returns empty array for corrupt JSON', () => {
      localStorage.setItem('zagafy_braindumps', '{broken');
      expect(readBraindumps()).toEqual([]);
    });

    it('returns empty array for non-array JSON', () => {
      localStorage.setItem('zagafy_braindumps', '"just a string"');
      expect(readBraindumps()).toEqual([]);
    });

    it('enforces max 10 entries on write', () => {
      const entries = Array.from({ length: 12 }, (_, i) => makeEntry({ id: `e-${i}` }));
      writeBraindumps(entries);
      const result = readBraindumps();
      expect(result).toHaveLength(10);
      // Should keep the newest (last 10)
      expect(result[0].id).toBe('e-2');
      expect(result[9].id).toBe('e-11');
    });
  });

  describe('addBraindump', () => {
    it('adds an entry to the list', () => {
      addBraindump(makeEntry({ id: 'add-1' }));
      expect(readBraindumps()).toHaveLength(1);
    });

    it('evicts oldest when adding 11th entry', () => {
      for (let i = 0; i < 10; i++) {
        addBraindump(makeEntry({ id: `e-${i}` }));
      }
      addBraindump(makeEntry({ id: 'e-10' }));
      const result = readBraindumps();
      expect(result).toHaveLength(10);
      expect(result[0].id).toBe('e-1');
      expect(result[9].id).toBe('e-10');
    });
  });

  describe('updateBraindump', () => {
    it('updates polishedText and wasPolished', () => {
      addBraindump(makeEntry({ id: 'up-1' }));
      updateBraindump('up-1', { polishedText: 'Polished!', wasPolished: true });
      const result = readBraindumps();
      expect(result[0].polishedText).toBe('Polished!');
      expect(result[0].wasPolished).toBe(true);
    });

    it('no-ops for non-existent id', () => {
      addBraindump(makeEntry({ id: 'up-1' }));
      updateBraindump('no-exist', { polishedText: 'X' });
      expect(readBraindumps()[0].polishedText).toBeNull();
    });
  });

  describe('deleteBraindump', () => {
    it('removes an entry by id', () => {
      addBraindump(makeEntry({ id: 'del-1' }));
      addBraindump(makeEntry({ id: 'del-2' }));
      deleteBraindump('del-1');
      const result = readBraindumps();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('del-2');
    });
  });

  describe('clearBraindumps', () => {
    it('removes all entries', () => {
      addBraindump(makeEntry());
      clearBraindumps();
      expect(readBraindumps()).toEqual([]);
    });
  });

  describe('temp save/read/clear', () => {
    const temp: BraindumpTemp = {
      transcript: 'some text',
      language: 'en-US',
      elapsedSeconds: 30,
      savedAt: new Date().toISOString(),
    };

    it('returns null when nothing saved', () => {
      expect(readBraindumpTemp()).toBeNull();
    });

    it('round-trips temp data', () => {
      saveBraindumpTemp(temp);
      expect(readBraindumpTemp()).toEqual(temp);
    });

    it('clears temp data', () => {
      saveBraindumpTemp(temp);
      clearBraindumpTemp();
      expect(readBraindumpTemp()).toBeNull();
    });

    it('returns null for corrupt JSON', () => {
      localStorage.setItem('zagafy_braindump_temp', '{broken');
      expect(readBraindumpTemp()).toBeNull();
    });

    it('returns null for invalid shape', () => {
      localStorage.setItem('zagafy_braindump_temp', JSON.stringify({ foo: 'bar' }));
      expect(readBraindumpTemp()).toBeNull();
    });
  });

  // ─── Additional comprehensive tests ────────────────────────────────

  describe('isBraindumpEntry edge cases', () => {
    it('returns true for empty string polishedText', () => {
      expect(isBraindumpEntry(makeEntry({ polishedText: '' }))).toBe(true);
    });

    it('returns true for zero wordCount', () => {
      expect(isBraindumpEntry(makeEntry({ wordCount: 0 }))).toBe(true);
    });

    it('returns true for zero durationSeconds', () => {
      expect(isBraindumpEntry(makeEntry({ durationSeconds: 0 }))).toBe(true);
    });

    it('returns true for negative durationSeconds (type guard does not validate range)', () => {
      expect(isBraindumpEntry(makeEntry({ durationSeconds: -5 }))).toBe(true);
    });

    it('returns false for undefined input', () => {
      expect(isBraindumpEntry(undefined)).toBe(false);
    });

    it('returns false when a required field is undefined', () => {
      const entry = makeEntry();

      (entry as any).rawTranscript = undefined;
      expect(isBraindumpEntry(entry)).toBe(false);
    });

    it('returns false when polishedText is undefined instead of null', () => {
      const entry = makeEntry();

      (entry as any).polishedText = undefined;
      expect(isBraindumpEntry(entry)).toBe(false);
    });

    it('returns false when wasPolished is a truthy non-boolean (1)', () => {

      expect(isBraindumpEntry(makeEntry({ wasPolished: 1 as any }))).toBe(false);
    });

    it('returns false when wasPolished is a truthy non-boolean ("true")', () => {

      expect(isBraindumpEntry(makeEntry({ wasPolished: 'true' as any }))).toBe(false);
    });

    it('returns false for an array input', () => {
      expect(isBraindumpEntry([1, 2, 3])).toBe(false);
    });

    it('returns false for an empty array input', () => {
      expect(isBraindumpEntry([])).toBe(false);
    });

    it('returns false for deeply nested invalid object', () => {
      expect(isBraindumpEntry({ a: { b: { c: 'deep' } } })).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isBraindumpEntry({})).toBe(false);
    });

    it('returns true when wordCount is NaN (typeof NaN is number)', () => {
      // NaN is typeof number, so the type guard passes — this documents the behavior
      expect(isBraindumpEntry(makeEntry({ wordCount: NaN }))).toBe(true);
    });

    it('returns false when id is a number instead of string', () => {

      expect(isBraindumpEntry(makeEntry({ id: 123 as any }))).toBe(false);
    });
  });

  describe('CRUD edge cases', () => {
    it('delete non-existent entry does not crash', () => {
      addBraindump(makeEntry({ id: 'keep-me' }));
      expect(() => deleteBraindump('does-not-exist')).not.toThrow();
      expect(readBraindumps()).toHaveLength(1);
      expect(readBraindumps()[0].id).toBe('keep-me');
    });

    it('delete from empty list does not crash', () => {
      expect(() => deleteBraindump('no-entries')).not.toThrow();
      expect(readBraindumps()).toEqual([]);
    });

    it('update only polishedText without wasPolished', () => {
      addBraindump(makeEntry({ id: 'partial-1', wasPolished: false, polishedText: null }));
      updateBraindump('partial-1', { polishedText: 'Only text updated' });
      const result = readBraindumps();
      expect(result[0].polishedText).toBe('Only text updated');
      expect(result[0].wasPolished).toBe(false);
    });

    it('update only wasPolished without polishedText', () => {
      addBraindump(makeEntry({ id: 'partial-2', wasPolished: false, polishedText: null }));
      updateBraindump('partial-2', { wasPolished: true });
      const result = readBraindumps();
      expect(result[0].wasPolished).toBe(true);
      expect(result[0].polishedText).toBeNull();
    });

    it('multiple rapid adds in sequence', () => {
      for (let i = 0; i < 5; i++) {
        addBraindump(makeEntry({ id: `rapid-${i}` }));
      }
      const result = readBraindumps();
      expect(result).toHaveLength(5);
      expect(result.map(e => e.id)).toEqual([
        'rapid-0', 'rapid-1', 'rapid-2', 'rapid-3', 'rapid-4',
      ]);
    });

    it('write empty array clears storage', () => {
      addBraindump(makeEntry({ id: 'before-clear' }));
      writeBraindumps([]);
      expect(readBraindumps()).toEqual([]);
    });

    it('read after clear returns empty array', () => {
      addBraindump(makeEntry({ id: 'will-be-cleared' }));
      clearBraindumps();
      expect(readBraindumps()).toEqual([]);
    });

    it('delete first entry from list of three', () => {
      addBraindump(makeEntry({ id: 'first' }));
      addBraindump(makeEntry({ id: 'middle' }));
      addBraindump(makeEntry({ id: 'last' }));
      deleteBraindump('first');
      const result = readBraindumps();
      expect(result).toHaveLength(2);
      expect(result.map(e => e.id)).toEqual(['middle', 'last']);
    });

    it('delete middle entry from list of three', () => {
      addBraindump(makeEntry({ id: 'first' }));
      addBraindump(makeEntry({ id: 'middle' }));
      addBraindump(makeEntry({ id: 'last' }));
      deleteBraindump('middle');
      const result = readBraindumps();
      expect(result).toHaveLength(2);
      expect(result.map(e => e.id)).toEqual(['first', 'last']);
    });

    it('delete last entry from list of three', () => {
      addBraindump(makeEntry({ id: 'first' }));
      addBraindump(makeEntry({ id: 'middle' }));
      addBraindump(makeEntry({ id: 'last' }));
      deleteBraindump('last');
      const result = readBraindumps();
      expect(result).toHaveLength(2);
      expect(result.map(e => e.id)).toEqual(['first', 'middle']);
    });

    it('handles unicode and special characters in rawTranscript and projectName', () => {
      const entry = makeEntry({
        id: 'unicode-1',
        rawTranscript: 'Hola mundo! \u{1F680} \u00E9\u00E8\u00EA \u4F60\u597D \u0410\u0411\u0412 \u2603\uFE0F \u2764\uFE0F\u200D\u{1F525}',
        projectName: 'Projet \u00C9t\u00E9 \u2014 \u201CLa R\u00E9alit\u00E9\u201D',
      });
      addBraindump(entry);
      const result = readBraindumps();
      expect(result).toHaveLength(1);
      expect(result[0].rawTranscript).toBe('Hola mundo! \u{1F680} \u00E9\u00E8\u00EA \u4F60\u597D \u0410\u0411\u0412 \u2603\uFE0F \u2764\uFE0F\u200D\u{1F525}');
      expect(result[0].projectName).toBe('Projet \u00C9t\u00E9 \u2014 \u201CLa R\u00E9alit\u00E9\u201D');
    });

    it('handles very long rawTranscript (1000 chars)', () => {
      const longText = 'a'.repeat(1000);
      const entry = makeEntry({ id: 'long-1', rawTranscript: longText });
      addBraindump(entry);
      const result = readBraindumps();
      expect(result).toHaveLength(1);
      expect(result[0].rawTranscript).toHaveLength(1000);
      expect(result[0].rawTranscript).toBe(longText);
    });
  });

  describe('max enforcement edge cases', () => {
    it('exactly 10 entries keeps all', () => {
      const entries = Array.from({ length: 10 }, (_, i) => makeEntry({ id: `exact-${i}` }));
      writeBraindumps(entries);
      const result = readBraindumps();
      expect(result).toHaveLength(10);
      expect(result[0].id).toBe('exact-0');
      expect(result[9].id).toBe('exact-9');
    });

    it('write exactly 10 then add 1 more evicts first', () => {
      for (let i = 0; i < 10; i++) {
        addBraindump(makeEntry({ id: `fill-${i}` }));
      }
      expect(readBraindumps()).toHaveLength(10);

      addBraindump(makeEntry({ id: 'fill-10' }));
      const result = readBraindumps();
      expect(result).toHaveLength(10);
      expect(result[0].id).toBe('fill-1');
      expect(result[9].id).toBe('fill-10');
    });

    it('write 20 entries directly keeps last 10', () => {
      const entries = Array.from({ length: 20 }, (_, i) => makeEntry({ id: `bulk-${i}` }));
      writeBraindumps(entries);
      const result = readBraindumps();
      expect(result).toHaveLength(10);
      expect(result[0].id).toBe('bulk-10');
      expect(result[9].id).toBe('bulk-19');
    });
  });

  describe('temp data edge cases', () => {
    it('second write replaces first (overwrite)', () => {
      const first: BraindumpTemp = {
        transcript: 'first recording',
        language: 'en-US',
        elapsedSeconds: 10,
        savedAt: '2026-01-01T00:00:00Z',
      };
      const second: BraindumpTemp = {
        transcript: 'second recording',
        language: 'fr-FR',
        elapsedSeconds: 20,
        savedAt: '2026-01-02T00:00:00Z',
      };
      saveBraindumpTemp(first);
      saveBraindumpTemp(second);
      const result = readBraindumpTemp();
      expect(result).toEqual(second);
      expect(result?.transcript).toBe('second recording');
    });

    it('temp with 0 elapsedSeconds', () => {
      const temp: BraindumpTemp = {
        transcript: 'instant save',
        language: 'en-US',
        elapsedSeconds: 0,
        savedAt: new Date().toISOString(),
      };
      saveBraindumpTemp(temp);
      const result = readBraindumpTemp();
      expect(result).toEqual(temp);
      expect(result?.elapsedSeconds).toBe(0);
    });

    it('temp with empty transcript string', () => {
      const temp: BraindumpTemp = {
        transcript: '',
        language: 'en-US',
        elapsedSeconds: 5,
        savedAt: new Date().toISOString(),
      };
      saveBraindumpTemp(temp);
      const result = readBraindumpTemp();
      expect(result).toEqual(temp);
      expect(result?.transcript).toBe('');
    });

    it('clear temp when nothing saved does not crash', () => {
      expect(() => clearBraindumpTemp()).not.toThrow();
      expect(readBraindumpTemp()).toBeNull();
    });
  });
});
