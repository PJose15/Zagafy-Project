/**
 * Phase 5.7 — billing plan definitions and tier enforcement.
 *
 * Every feature gate reads from `PLAN_LIMITS` so changes to quotas are
 * a single-source edit. The `requirePlan()` helper is used by API routes
 * to block access when the caller's plan is insufficient.
 */

export type PlanId = 'free' | 'writer' | 'author' | 'studio';

export interface PlanLimits {
  /** Maximum number of stories (novels). */
  maxStories: number;
  /** Maximum chapters per story. */
  maxChaptersPerStory: number;
  /** AI calls allowed per calendar month. */
  aiCallsPerMonth: number;
  /** Whether cloud sync is available. */
  cloudSync: boolean;
  /** Maximum collaborators per story (0 = none). */
  maxCollaborators: number;
  /** Whether custom heteronyms are available. */
  customHeteronyms: boolean;
  /** Whether API access is available. */
  apiAccess: boolean;
  /** Maximum cloud snapshots per story. */
  maxSnapshotsPerStory: number;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    maxStories: 1,
    maxChaptersPerStory: 50,
    aiCallsPerMonth: 100,
    cloudSync: false,
    maxCollaborators: 0,
    customHeteronyms: false,
    apiAccess: false,
    maxSnapshotsPerStory: 3,
  },
  writer: {
    maxStories: Infinity,
    maxChaptersPerStory: Infinity,
    aiCallsPerMonth: 1500,
    cloudSync: true,
    maxCollaborators: 0,
    customHeteronyms: false,
    apiAccess: false,
    maxSnapshotsPerStory: 25,
  },
  author: {
    maxStories: Infinity,
    maxChaptersPerStory: Infinity,
    aiCallsPerMonth: 5000,
    cloudSync: true,
    maxCollaborators: 1,
    customHeteronyms: false,
    apiAccess: false,
    maxSnapshotsPerStory: 100,
  },
  studio: {
    maxStories: Infinity,
    maxChaptersPerStory: Infinity,
    aiCallsPerMonth: 15000,
    cloudSync: true,
    maxCollaborators: 5,
    customHeteronyms: true,
    apiAccess: true,
    maxSnapshotsPerStory: Infinity,
  },
};

/** Ordered by rank — used for "plan X is at least plan Y" comparisons. */
const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  writer: 1,
  author: 2,
  studio: 3,
};

/** Type guard: returns true when the value is a valid PlanId string. */
export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && value in PLAN_LIMITS;
}

/** True when `userPlan` meets or exceeds `requiredPlan`. */
export function planMeetsRequirement(userPlan: PlanId, requiredPlan: PlanId): boolean {
  return PLAN_RANK[userPlan] >= PLAN_RANK[requiredPlan];
}

/** Return the quota limits for the given billing plan. */
export function getLimits(plan: PlanId): PlanLimits {
  return PLAN_LIMITS[plan];
}

/**
 * Displayable plan metadata for the settings billing section.
 */
export interface PlanInfo {
  id: PlanId;
  name: string;
  monthlyPrice: number; // 0 for free
  yearlyPrice: number; // 0 for free
  description: string;
}

export const PLANS: PlanInfo[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: '1 novel, 50 chapters, 100 AI calls/mo',
  },
  {
    id: 'writer',
    name: 'Writer',
    monthlyPrice: 12,
    yearlyPrice: 120,
    description: 'Unlimited novels & chapters, 1,500 AI calls/mo, cloud sync',
  },
  {
    id: 'author',
    name: 'Author',
    monthlyPrice: 24,
    yearlyPrice: 240,
    description: 'Everything in Writer + 1 collaborator, 5,000 AI calls/mo',
  },
  {
    id: 'studio',
    name: 'Studio',
    monthlyPrice: 49,
    yearlyPrice: 490,
    description: 'Everything in Author + 5 collaborators, custom heteronyms, API access',
  },
];

/**
 * Map from plan ID → Stripe Price ID. Configured via env vars so the
 * same code works against Stripe test mode and live mode.
 *
 * Env vars follow the pattern STRIPE_PRICE_<PLAN>_MONTHLY / _YEARLY.
 * Returns null when the env var is missing (plan not yet created in
 * Stripe Dashboard).
 */
export function getStripePriceId(
  plan: Exclude<PlanId, 'free'>,
  interval: 'monthly' | 'yearly',
): string | null {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`;
  return process.env[key] ?? null;
}

/**
 * Base URL for Stripe success/cancel/return redirects.
 * Returns null in production when neither APP_URL nor NEXT_PUBLIC_APP_URL is
 * set — callers must treat that as a config error rather than silently
 * redirecting paying customers to localhost.
 */
export function resolveAppUrl(): string | null {
  const url = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (url) return url;
  return process.env.NODE_ENV === 'production' ? null : 'http://localhost:3000';
}
