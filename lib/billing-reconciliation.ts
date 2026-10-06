import type Stripe from 'stripe';
import { getPlanForStripePrice, planMeetsRequirement, type PlanId } from './billing';

/** Select the current entitlement from the customer's complete subscription list.
 * Metadata and dollar amounts are not authorization sources: discounts, annual
 * billing and a portal price change can all leave those values misleading.
 */
export function reconcileSubscriptionPlan(
  subscriptions: Stripe.Subscription[],
  currentPlan: PlanId,
): PlanId {
  let activePlan: PlanId = 'free';
  let gracePlan: PlanId = 'free';
  for (const subscription of subscriptions) {
    if (!['active', 'trialing', 'past_due'].includes(subscription.status)) continue;
    if (subscription.items.has_more) throw new Error('Incomplete subscription items');
    let plan: PlanId = 'free';
    for (const item of subscription.items.data) {
      const candidate = getPlanForStripePrice(item.price.id);
      if (candidate && planMeetsRequirement(candidate, plan)) plan = candidate;
    }
    if (plan === 'free') throw new Error('Active subscription has no configured Zagafy price');
    if (subscription.status === 'past_due') {
      // Preserve existing grace access, but never upgrade on failed payment.
      const capped = planMeetsRequirement(currentPlan, plan) ? plan : currentPlan;
      if (planMeetsRequirement(capped, gracePlan)) gracePlan = capped;
    } else if (planMeetsRequirement(plan, activePlan)) {
      activePlan = plan;
    }
  }
  return planMeetsRequirement(activePlan, gracePlan) ? activePlan : gracePlan;
}
