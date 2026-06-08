'use client';

import { useState, useCallback } from 'react';
import { CreditCard, ArrowUpRight, Crown, Loader2 } from 'lucide-react';
import { ParchmentCard, BrassButton } from '@/components/antiquarian';
import { useToast } from '@/components/toast';
import { PLANS, type PlanId } from '@/lib/billing';
import { parseApiResponse } from '@/lib/api-response';

/**
 * Phase 5.7 — billing section for the settings page.
 *
 * Shows current plan, upgrade buttons for higher tiers, and a "Manage
 * billing" button that opens the Stripe Customer Portal. Only renders
 * when auth is enabled (SaaS mode).
 */

interface BillingSectionProps {
  currentPlan?: PlanId;
}

export function BillingSection({ currentPlan = 'free' }: BillingSectionProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  // Check auth directly from env vars (lib/auth imports server-only Clerk)
  const authEnabled =
    Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'embed';

  const handleCheckout = useCallback(async (plan: Exclude<PlanId, 'free'>) => {
    setLoading(plan);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, interval: 'monthly' }),
      });
      const result = await parseApiResponse<{ url: string }>(res);
      if (!result.ok) {
        toast(result.message, 'error');
        return;
      }
      if (result.data.url) {
        window.location.href = result.data.url;
      }
    } catch {
      toast('Failed to start checkout. Please try again.', 'error');
    } finally {
      setLoading(null);
    }
  }, [toast]);

  const handlePortal = useCallback(async () => {
    setLoading('portal');
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await parseApiResponse<{ url: string }>(res);
      if (!result.ok) {
        toast(result.message, 'error');
        return;
      }
      if (result.data.url) {
        window.location.href = result.data.url;
      }
    } catch {
      toast('Failed to open billing portal. Please try again.', 'error');
    } finally {
      setLoading(null);
    }
  }, [toast]);

  if (!authEnabled) return null;

  const currentPlanInfo = PLANS.find((p) => p.id === currentPlan) ?? PLANS[0];
  const upgradePlans = PLANS.filter(
    (p) => p.id !== 'free' && p.monthlyPrice > currentPlanInfo.monthlyPrice,
  );

  return (
    <ParchmentCard className="space-y-4">
      <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
        <CreditCard size={20} className="text-brass-500" />
        Billing
      </h2>

      {/* Current plan display */}
      <div className="flex items-center gap-3">
        <span className="text-sepia-600 text-sm">Current plan:</span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brass-100 text-brass-800 text-sm font-semibold border border-brass-300/50">
          {currentPlan !== 'free' && <Crown size={14} />}
          {currentPlanInfo.name}
        </span>
        {currentPlanInfo.monthlyPrice > 0 && (
          <span className="text-sepia-500 text-xs">
            ${currentPlanInfo.monthlyPrice}/mo
          </span>
        )}
      </div>

      {/* Upgrade options */}
      {upgradePlans.length > 0 && (
        <div className="space-y-3 pt-2">
          <p className="text-sepia-600 text-sm">Upgrade your plan:</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upgradePlans.map((plan) => (
              <div
                key={plan.id}
                className="border border-sepia-300/50 rounded-lg p-4 space-y-2 bg-parchment-50/50"
              >
                <div className="flex items-baseline gap-1">
                  <span className="font-serif font-semibold text-sepia-900">
                    {plan.name}
                  </span>
                  <span className="text-sepia-600 text-sm">
                    ${plan.monthlyPrice}/mo
                  </span>
                </div>
                <p className="text-xs text-sepia-500 leading-relaxed">
                  {plan.description}
                </p>
                <BrassButton
                  onClick={() => handleCheckout(plan.id as Exclude<PlanId, 'free'>)}
                  disabled={loading !== null}
                  icon={
                    loading === plan.id
                      ? <Loader2 size={16} className="animate-spin" />
                      : <ArrowUpRight size={16} />
                  }
                >
                  {loading === plan.id ? 'Loading...' : `Upgrade to ${plan.name}`}
                </BrassButton>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manage billing (only if on a paid plan) */}
      {currentPlan !== 'free' && (
        <div className="pt-2">
          <BrassButton
            onClick={handlePortal}
            disabled={loading !== null}
            icon={
              loading === 'portal'
                ? <Loader2 size={16} className="animate-spin" />
                : <CreditCard size={16} />
            }
          >
            {loading === 'portal' ? 'Loading...' : 'Manage billing'}
          </BrassButton>
          <p className="text-xs text-sepia-500 mt-2">
            Update payment method, download invoices, or cancel your subscription.
          </p>
        </div>
      )}
    </ParchmentCard>
  );
}
