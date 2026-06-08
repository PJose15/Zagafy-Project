import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isPlanId,
  planMeetsRequirement,
  getLimits,
  getStripePriceId,
  PLAN_LIMITS,
  PLANS,
  type PlanId,
} from '@/lib/billing';

describe('billing', () => {
  describe('isPlanId', () => {
    it.each(['free', 'writer', 'author', 'studio'])('returns true for "%s"', (plan) => {
      expect(isPlanId(plan)).toBe(true);
    });

    it.each([null, undefined, '', 'pro', 'enterprise', 42, true])(
      'returns false for %s',
      (val) => {
        expect(isPlanId(val)).toBe(false);
      },
    );
  });

  describe('planMeetsRequirement', () => {
    it('free meets free', () => {
      expect(planMeetsRequirement('free', 'free')).toBe(true);
    });

    it('free does not meet writer', () => {
      expect(planMeetsRequirement('free', 'writer')).toBe(false);
    });

    it('writer meets writer', () => {
      expect(planMeetsRequirement('writer', 'writer')).toBe(true);
    });

    it('author meets writer', () => {
      expect(planMeetsRequirement('author', 'writer')).toBe(true);
    });

    it('studio meets everything', () => {
      expect(planMeetsRequirement('studio', 'free')).toBe(true);
      expect(planMeetsRequirement('studio', 'writer')).toBe(true);
      expect(planMeetsRequirement('studio', 'author')).toBe(true);
      expect(planMeetsRequirement('studio', 'studio')).toBe(true);
    });

    it('writer does not meet author', () => {
      expect(planMeetsRequirement('writer', 'author')).toBe(false);
    });

    it('author does not meet studio', () => {
      expect(planMeetsRequirement('author', 'studio')).toBe(false);
    });
  });

  describe('getLimits', () => {
    it('returns limits for each plan', () => {
      const plans: PlanId[] = ['free', 'writer', 'author', 'studio'];
      for (const plan of plans) {
        const limits = getLimits(plan);
        expect(limits).toBe(PLAN_LIMITS[plan]);
        expect(typeof limits.maxStories).toBe('number');
        expect(typeof limits.aiCallsPerMonth).toBe('number');
        expect(typeof limits.cloudSync).toBe('boolean');
      }
    });

    it('free has restrictive limits', () => {
      const limits = getLimits('free');
      expect(limits.maxStories).toBe(1);
      expect(limits.maxChaptersPerStory).toBe(50);
      expect(limits.aiCallsPerMonth).toBe(100);
      expect(limits.cloudSync).toBe(false);
      expect(limits.maxCollaborators).toBe(0);
    });

    it('writer enables cloud sync and more AI calls', () => {
      const limits = getLimits('writer');
      expect(limits.maxStories).toBe(Infinity);
      expect(limits.aiCallsPerMonth).toBe(1500);
      expect(limits.cloudSync).toBe(true);
    });

    it('studio has highest limits', () => {
      const limits = getLimits('studio');
      expect(limits.maxCollaborators).toBe(5);
      expect(limits.customHeteronyms).toBe(true);
      expect(limits.apiAccess).toBe(true);
    });

    it('limits increase monotonically across tiers', () => {
      const plans: PlanId[] = ['free', 'writer', 'author', 'studio'];
      for (let i = 1; i < plans.length; i++) {
        const prev = getLimits(plans[i - 1]);
        const curr = getLimits(plans[i]);
        expect(curr.aiCallsPerMonth).toBeGreaterThanOrEqual(prev.aiCallsPerMonth);
        expect(curr.maxCollaborators).toBeGreaterThanOrEqual(prev.maxCollaborators);
      }
    });
  });

  describe('PLANS metadata', () => {
    it('has four plans in ascending price order', () => {
      expect(PLANS).toHaveLength(4);
      expect(PLANS[0].id).toBe('free');
      expect(PLANS[0].monthlyPrice).toBe(0);
      for (let i = 1; i < PLANS.length; i++) {
        expect(PLANS[i].monthlyPrice).toBeGreaterThan(PLANS[i - 1].monthlyPrice);
      }
    });

    it('yearly price is less than 12x monthly for paid plans', () => {
      for (const plan of PLANS) {
        if (plan.monthlyPrice === 0) continue;
        expect(plan.yearlyPrice).toBeLessThanOrEqual(plan.monthlyPrice * 12);
      }
    });

    it('every plan has a non-empty description', () => {
      for (const plan of PLANS) {
        expect(plan.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getStripePriceId', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    it('returns env var value when set', () => {
      process.env.STRIPE_PRICE_WRITER_MONTHLY = 'price_writer_monthly_123';
      expect(getStripePriceId('writer', 'monthly')).toBe('price_writer_monthly_123');
    });

    it('returns null when env var is missing', () => {
      delete process.env.STRIPE_PRICE_WRITER_MONTHLY;
      expect(getStripePriceId('writer', 'monthly')).toBeNull();
    });

    it('maps plan + interval to correct env var name', () => {
      process.env.STRIPE_PRICE_AUTHOR_YEARLY = 'price_author_yearly_456';
      expect(getStripePriceId('author', 'yearly')).toBe('price_author_yearly_456');
    });

    it('handles studio monthly', () => {
      process.env.STRIPE_PRICE_STUDIO_MONTHLY = 'price_studio_m';
      expect(getStripePriceId('studio', 'monthly')).toBe('price_studio_m');
    });
  });
});
