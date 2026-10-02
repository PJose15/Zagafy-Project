import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireCloudUser, isAuthError } from '@/lib/auth';
import { db, isDatabaseConfigured } from '@/db/client';
import { users } from '@/db/schema';
import { isPlanId } from '@/lib/billing';
import { rateLimit } from '@/lib/rate-limit';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  const requestId = makeRequestId();
  const auth = await requireCloudUser();
  if (isAuthError(auth)) return auth;
  const limited = await rateLimit(req, { maxRequests: 30, windowMs: 60_000 });
  if (limited) return limited;
  if (!isDatabaseConfigured()) return err('upstream_unavailable', 'Billing status unavailable', 503, undefined, { requestId });
  try {
    const [user] = await db().select({ plan: users.plan, customer: users.stripeCustomerId })
      .from(users).where(eq(users.id, auth.userId)).limit(1);
    if (!user) return err('not_found', 'Account is not ready yet. Please retry shortly.', 404, undefined, { requestId });
    if (!isPlanId(user.plan)) throw new Error('Invalid stored billing plan');
    const response = ok({ plan: user.plan, hasBillingAccount: Boolean(user.customer) }, { requestId });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    createRouteLogger({ endpoint: '/api/billing/status', requestId }).error('billing status lookup failed', error);
    return err('upstream_unavailable', 'Billing status unavailable', 503, undefined, { requestId });
  }
}
