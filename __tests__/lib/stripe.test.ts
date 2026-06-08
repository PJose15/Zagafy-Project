import { describe, it, expect, beforeEach } from 'vitest';

const originalEnv = { ...process.env };

describe('lib/stripe', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  describe('isStripeConfigured', () => {
    it('returns false when STRIPE_SECRET_KEY is unset', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const { isStripeConfigured } = await import('@/lib/stripe');
      expect(isStripeConfigured()).toBe(false);
    });

    it('returns true when STRIPE_SECRET_KEY is set', async () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
      const { isStripeConfigured } = await import('@/lib/stripe');
      expect(isStripeConfigured()).toBe(true);
    });
  });
});
