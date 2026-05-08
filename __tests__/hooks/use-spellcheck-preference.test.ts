import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useSpellcheckPreference,
  readSpellcheckPreference,
} from '@/hooks/use-spellcheck-preference';

beforeEach(() => {
  window.localStorage.clear();
});

describe('readSpellcheckPreference', () => {
  it('defaults to true when localStorage is empty', () => {
    expect(readSpellcheckPreference()).toBe(true);
  });

  it('returns true for "1" in storage', () => {
    window.localStorage.setItem('zagafy_spellcheck_enabled', '1');
    expect(readSpellcheckPreference()).toBe(true);
  });

  it('returns false for "0" in storage', () => {
    window.localStorage.setItem('zagafy_spellcheck_enabled', '0');
    expect(readSpellcheckPreference()).toBe(false);
  });
});

describe('useSpellcheckPreference', () => {
  it('initial render returns true (matches default)', () => {
    const { result } = renderHook(() => useSpellcheckPreference());
    expect(result.current.enabled).toBe(true);
  });

  it('setEnabled persists to localStorage', () => {
    const { result } = renderHook(() => useSpellcheckPreference());
    act(() => {
      result.current.setEnabled(false);
    });
    expect(result.current.enabled).toBe(false);
    expect(window.localStorage.getItem('zagafy_spellcheck_enabled')).toBe('0');
  });

  it('toggle flips the stored value', () => {
    const { result } = renderHook(() => useSpellcheckPreference());
    expect(result.current.enabled).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(true);
  });

  it('hydrates from localStorage on mount', () => {
    window.localStorage.setItem('zagafy_spellcheck_enabled', '0');
    const { result } = renderHook(() => useSpellcheckPreference());
    // useEffect runs synchronously inside renderHook in happy-dom
    expect(result.current.enabled).toBe(false);
  });

  it('reacts to cross-tab storage events', () => {
    const { result } = renderHook(() => useSpellcheckPreference());
    expect(result.current.enabled).toBe(true);
    act(() => {
      window.localStorage.setItem('zagafy_spellcheck_enabled', '0');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'zagafy_spellcheck_enabled',
          newValue: '0',
          oldValue: '1',
        }),
      );
    });
    expect(result.current.enabled).toBe(false);
  });
});
