'use client';

import { useState, useCallback, useEffect } from 'react';
import { CreditCard, ArrowUpRight, Crown, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ParchmentCard, BrassButton } from '@/components/antiquarian';
import { useToast } from '@/components/toast';
import { PLANS, isPlanId, type PlanId } from '@/lib/billing';
import { parseApiResponse } from '@/lib/api-response';
import { useUser } from '@clerk/nextjs';

/**
 * Phase 5.7 — billing section for the settings page.
 *
 * Shows current plan, upgrade buttons for higher tiers, and a "Manage
 * billing" button that opens the Stripe Customer Portal. Only renders
 * when auth is enabled (SaaS mode).
 */

export function BillingSection() {
  const authEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) && process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'embed';
  return authEnabled ? <SignedInBillingSection /> : null;
}

function SignedInBillingSection() {
  const t = useTranslations('billing');
  const { toast } = useToast();
  const { user, isLoaded, isSignedIn } = useUser();
  const userId = user?.id;
  const [loading, setLoading] = useState<string | null>(null);
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [billing, setBilling] = useState<{ userId: string; plan: PlanId; hasBillingAccount: boolean } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch('/api/billing/status', { cache: 'no-store', signal: controller.signal });
        const result = await parseApiResponse<{ plan: PlanId; hasBillingAccount: boolean }>(response);
        if (!result.ok || !isPlanId(result.data.plan)) throw new Error('Billing lookup failed');
        if (active) { setBilling({ ...result.data, userId: userId! }); setFailure(null); }
      } catch {
        if (active) setFailure(userId!);
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [isLoaded, isSignedIn, userId, retry]);

  const handleCheckout = useCallback(async (plan: Exclude<PlanId, 'free'>) => {
    setLoading(plan);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, interval }),
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
      toast(t('checkoutError'), 'error');
    } finally {
      setLoading(null);
    }
  }, [toast, t, interval]);

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
      toast(t('portalError'), 'error');
    } finally {
      setLoading(null);
    }
  }, [toast, t]);

  if (isLoaded && !isSignedIn) return null;
  if (!billing || billing.userId !== userId || failure === userId) {
    return <ParchmentCard className="space-y-3">
      <h2 className="text-xl font-serif font-semibold">{t('title')}</h2>
      {failure === userId ? <><p role="alert">{t('statusError')}</p><BrassButton onClick={() => { setFailure(null); setRetry(value => value + 1); }}>{t('retry')}</BrassButton></> : <p role="status">{t('loading')}</p>}
    </ParchmentCard>;
  }
  const currentPlan = billing.plan;

  const currentPlanInfo = PLANS.find((p) => p.id === currentPlan) ?? PLANS[0];
  const upgradePlans = PLANS.filter(
    (p) => p.id !== 'free' && p.monthlyPrice > currentPlanInfo.monthlyPrice,
  );

  return (
    <ParchmentCard className="space-y-4">
      <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
        <CreditCard size={20} className="text-brass-500" />
        {t('title')}
      </h2>

      {/* Current plan display */}
      <div className="flex items-center gap-3">
        <span className="text-sepia-600 text-sm">{t('currentPlan')}</span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brass-100 text-brass-800 text-sm font-semibold border border-brass-300/50">
          {currentPlan !== 'free' && <Crown size={14} />}
          {currentPlanInfo.name}
        </span>

      </div>

      {/* Upgrade options */}
      {upgradePlans.length > 0 && (
        <div className="space-y-3 pt-2">
          <p className="text-sepia-600 text-sm">{t('upgradePlan')}</p>
          <div role="radiogroup" aria-label={t('interval')} className="flex gap-2">
            <BrassButton role="radio" aria-checked={interval === 'monthly'} onClick={() => setInterval('monthly')}>{t('monthly')}</BrassButton>
            <BrassButton role="radio" aria-checked={interval === 'yearly'} onClick={() => setInterval('yearly')}>{t('yearly')}</BrassButton>
          </div>
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
                    {interval === 'monthly' ? t('perMonth', { price: plan.monthlyPrice }) : t('perYear', { price: plan.yearlyPrice })}
                  </span>
                </div>
                <p className="text-xs text-sepia-600 leading-relaxed">
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
                  {loading === plan.id ? t('loading') : t('upgradeTo', { name: plan.name })}
                </BrassButton>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keep invoices and subscription management available after cancellation. */}
      {billing.hasBillingAccount && (
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
            {loading === 'portal' ? t('loading') : t('manageBilling')}
          </BrassButton>
          <p className="text-xs text-sepia-600 mt-2">
            {t('manageNote')}
          </p>
        </div>
      )}
    </ParchmentCard>
  );
}
