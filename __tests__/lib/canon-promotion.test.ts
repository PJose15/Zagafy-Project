import { describe, it, expect } from 'vitest';
import {
  promoteOne,
  demoteOne,
  isDiscarded,
  isConfirmed,
  isDraft,
  requiresConfirmConfirmation,
} from '@/lib/canon-promotion';

describe('canon-promotion', () => {
  it('promoteOne walks the ladder draft → flexible → confirmed', () => {
    expect(promoteOne('draft')).toBe('flexible');
    expect(promoteOne('flexible')).toBe('confirmed');
  });

  it('promoteOne is a no-op at confirmed', () => {
    expect(promoteOne('confirmed')).toBe('confirmed');
  });

  it('promoteOne does not auto-rescue from discarded', () => {
    expect(promoteOne('discarded')).toBe('discarded');
  });

  it('demoteOne reverses the ladder', () => {
    expect(demoteOne('confirmed')).toBe('flexible');
    expect(demoteOne('flexible')).toBe('draft');
  });

  it('demoteOne is a no-op at draft', () => {
    expect(demoteOne('draft')).toBe('draft');
  });

  it('demoteOne does not move discarded', () => {
    expect(demoteOne('discarded')).toBe('discarded');
  });

  it('predicates classify correctly', () => {
    expect(isDraft('draft')).toBe(true);
    expect(isDraft('flexible')).toBe(false);
    expect(isConfirmed('confirmed')).toBe(true);
    expect(isConfirmed('draft')).toBe(false);
    expect(isDiscarded('discarded')).toBe(true);
    expect(isDiscarded('flexible')).toBe(false);
  });

  it('requiresConfirmConfirmation flags the promote-to-confirmed transition only', () => {
    expect(requiresConfirmConfirmation('draft', 'confirmed')).toBe(true);
    expect(requiresConfirmConfirmation('flexible', 'confirmed')).toBe(true);
    expect(requiresConfirmConfirmation('confirmed', 'confirmed')).toBe(false);
    expect(requiresConfirmConfirmation('draft', 'flexible')).toBe(false);
    expect(requiresConfirmConfirmation('flexible', 'discarded')).toBe(false);
  });
});
