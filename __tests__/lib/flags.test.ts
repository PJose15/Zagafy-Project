import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FLAG_DEFAULTS,
  isFlagKey,
  getFeatureFlag,
  isFeatureEnabled,
  type FlagKey,
} from '@/lib/flags';

describe('flags', () => {
  describe('FLAG_DEFAULTS', () => {
    it('has four flags defined', () => {
      expect(Object.keys(FLAG_DEFAULTS)).toHaveLength(4);
    });

    it('all default to false', () => {
      for (const value of Object.values(FLAG_DEFAULTS)) {
        expect(value).toBe(false);
      }
    });

    it('includes expected flag keys', () => {
      expect('realtime-collaboration' in FLAG_DEFAULTS).toBe(true);
      expect('ai-long-term-memory' in FLAG_DEFAULTS).toBe(true);
      expect('language-tool-grammar' in FLAG_DEFAULTS).toBe(true);
      expect('pdf-export-v2' in FLAG_DEFAULTS).toBe(true);
    });
  });

  describe('isFlagKey', () => {
    it.each([
      'realtime-collaboration',
      'ai-long-term-memory',
      'language-tool-grammar',
      'pdf-export-v2',
    ])('returns true for "%s"', (key) => {
      expect(isFlagKey(key)).toBe(true);
    });

    it.each([null, undefined, '', 'unknown-flag', 42, true])(
      'returns false for %s',
      (val) => {
        expect(isFlagKey(val)).toBe(false);
      },
    );
  });

  describe('getFeatureFlag', () => {
    it('returns default when posthog-js is not loaded', () => {
      expect(getFeatureFlag('realtime-collaboration')).toBe(false);
      expect(getFeatureFlag('ai-long-term-memory')).toBe(false);
    });
  });

  describe('isFeatureEnabled (server)', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    it('returns default when NEXT_PUBLIC_POSTHOG_KEY is unset', async () => {
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
      const result = await isFeatureEnabled('realtime-collaboration');
      expect(result).toBe(false);
    });

    it('returns default for each flag when PostHog is unconfigured', async () => {
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
      const flags: FlagKey[] = [
        'realtime-collaboration',
        'ai-long-term-memory',
        'language-tool-grammar',
        'pdf-export-v2',
      ];
      for (const flag of flags) {
        const result = await isFeatureEnabled(flag);
        expect(result).toBe(FLAG_DEFAULTS[flag]);
      }
    });

    it('does not throw when posthog-node fails', async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
      // posthog-node will try to connect and fail — should fall back
      const result = await isFeatureEnabled('realtime-collaboration', 'user_123');
      expect(typeof result).toBe('boolean');
    });
  });
});
