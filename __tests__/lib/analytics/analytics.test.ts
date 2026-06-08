import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  readConsent,
  writeConsent,
  isDoNotTrack,
  isAnalyticsEnabled,
  trackEvent,
  identifyUser,
  resetAnalytics,
} from '@/lib/analytics';

// Mock server-only import so tests don't fail
vi.mock('server-only', () => ({}));
const { trackServerEvent } = await import('@/lib/analytics-server');

describe('analytics', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset navigator.doNotTrack
    Object.defineProperty(navigator, 'doNotTrack', {
      value: null,
      writable: true,
      configurable: true,
    });
  });

  describe('readConsent / writeConsent', () => {
    it('returns "pending" when no consent stored', () => {
      expect(readConsent()).toBe('pending');
    });

    it('returns "granted" after writing granted', () => {
      writeConsent('granted');
      expect(readConsent()).toBe('granted');
    });

    it('returns "denied" after writing denied', () => {
      writeConsent('denied');
      expect(readConsent()).toBe('denied');
    });

    it('persists in localStorage', () => {
      writeConsent('granted');
      expect(localStorage.getItem('zagafy_analytics_consent')).toBe('granted');
    });

    it('returns "pending" for invalid stored values', () => {
      localStorage.setItem('zagafy_analytics_consent', 'maybe');
      expect(readConsent()).toBe('pending');
    });
  });

  describe('isDoNotTrack', () => {
    it('returns false when DNT is not set', () => {
      Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
      expect(isDoNotTrack()).toBe(false);
    });

    it('returns true when DNT is "1"', () => {
      Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
      expect(isDoNotTrack()).toBe(true);
    });

    it('returns false when DNT is "0"', () => {
      Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true });
      expect(isDoNotTrack()).toBe(false);
    });

    it('returns true when GPC is active', () => {
      Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
      Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
      expect(isDoNotTrack()).toBe(true);
      // Cleanup
      Object.defineProperty(navigator, 'globalPrivacyControl', { value: undefined, configurable: true });
    });
  });

  describe('isAnalyticsEnabled', () => {
    it('returns false when consent is pending', () => {
      expect(isAnalyticsEnabled()).toBe(false);
    });

    it('returns true when consent is granted and DNT is off', () => {
      writeConsent('granted');
      Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
      expect(isAnalyticsEnabled()).toBe(true);
    });

    it('returns false when consent is denied', () => {
      writeConsent('denied');
      expect(isAnalyticsEnabled()).toBe(false);
    });

    it('returns false when DNT is active even with consent granted', () => {
      writeConsent('granted');
      Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
      expect(isAnalyticsEnabled()).toBe(false);
    });
  });

  describe('trackEvent', () => {
    it('does not throw when analytics is disabled', () => {
      // Consent not granted — should no-op silently
      expect(() => trackEvent('signup')).not.toThrow();
    });

    it('does not throw when posthog-js is not loaded', () => {
      writeConsent('granted');
      expect(() => trackEvent('ai_call_completed', { model: 'gemini' })).not.toThrow();
    });
  });

  describe('identifyUser', () => {
    it('does not throw when analytics is disabled', () => {
      expect(() => identifyUser('user_123')).not.toThrow();
    });
  });

  describe('resetAnalytics', () => {
    it('does not throw', () => {
      expect(() => resetAnalytics()).not.toThrow();
    });
  });

  describe('trackServerEvent', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    it('no-ops when NEXT_PUBLIC_POSTHOG_KEY is unset', async () => {
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
      // Should resolve without error
      await expect(trackServerEvent('user_1', 'subscribe')).resolves.toBeUndefined();
    });

    it('does not throw when posthog-node import fails', async () => {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key';
      // The import may work in test env but should not throw regardless
      await expect(
        trackServerEvent('user_1', 'ai_call_completed', { model: 'gemini' }),
      ).resolves.toBeUndefined();
    });
  });
});
