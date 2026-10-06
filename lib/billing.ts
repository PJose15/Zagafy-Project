/**
 * Phase 5.7 — billing plan definitions and tier enforcement.
 *
 * Implemented service feature gates read from `PLAN_LIMITS` so changes to quotas are
 * a single-source edit. The `requirePlan()` helper is used by API routes
 * to block access when the caller's plan is insufficient.
 */

export type PlanId = 'free' | 'writer' | 'author' | 'studio';

export interface PlanLimits {
  /** Local project count; local writing is available to every plan. */
  maxStories: number;
  /** Maximum chapters per story. */
  maxChaptersPerStory: number;
  /** AI calls allowed per calendar month. */
  aiCallsPerMonth: number;
  /** Whether cloud sync is available. */
  cloudSync: boolean;
  /** Maximum collaborators per story (0 = none). */
  maxCollaborators: number;
  /** Local writing voices are available to every plan. */
  customHeteronyms: boolean;
  /** Public developer API is not shipped; false on every launch plan. */
  apiAccess: boolean;
  /**
   * Maximum snapshots retained per story. The snapshot store enforces a single
   * UNIVERSAL cap (DEFAULT_SNAPSHOT_CAP in lib/snapshot.ts, auto-pruning the
   * oldest) for every tier, so all plans share the same value here to keep this
   * table truthful. (Previously this advertised per-tier numbers — 3/25/100/∞ —
   * that nothing enforced; making snapshots a paid differentiator is a pricing
   * decision, deliberately not taken.)
   */
  maxSnapshotsPerStory: number;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    maxStories: Infinity,
    maxChaptersPerStory: Infinity,
    aiCallsPerMonth: 100,
    cloudSync: false,
    maxCollaborators: 0,
    customHeteronyms: true,
    apiAccess: false,
    maxSnapshotsPerStory: 30, // universal cap — see DEFAULT_SNAPSHOT_CAP
  },
  writer: {
    maxStories: Infinity,
    maxChaptersPerStory: Infinity,
    aiCallsPerMonth: 1500,
    cloudSync: true,
    maxCollaborators: 0,
    customHeteronyms: true,
    apiAccess: false,
    maxSnapshotsPerStory: 30,
  },
  author: {
    maxStories: Infinity,
    maxChaptersPerStory: Infinity,
    aiCallsPerMonth: 5000,
    cloudSync: true,
    maxCollaborators: 1,
    customHeteronyms: true,
    apiAccess: false,
    maxSnapshotsPerStory: 30,
  },
  studio: {
    maxStories: Infinity,
    maxChaptersPerStory: Infinity,
    aiCallsPerMonth: 15000,
    cloudSync: true,
    maxCollaborators: 5,
    customHeteronyms: true,
    apiAccess: false,
    maxSnapshotsPerStory: 30,
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
  return typeof value === 'string' && Object.hasOwn(PLAN_LIMITS, value);
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
    description: 'Local writing workspace, 100 AI calls/mo',
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
    description: 'Everything in Author + 5 collaborators',
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
  return process.env[key]?.trim() || null;
}

/** Resolve entitlements from configured price identity, never price amount or metadata. */
export function getPlanForStripePrice(priceId: string): Exclude<PlanId, 'free'> | null {
  const matches = (['writer', 'author', 'studio'] as const).filter(plan =>
    (['monthly', 'yearly'] as const).some(interval => getStripePriceId(plan, interval) === priceId),
  );
  if (matches.length > 1) throw new Error('Stripe price maps to multiple plans');
  return matches[0] ?? null;
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
