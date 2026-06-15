import { eq } from 'drizzle-orm';
import { db, isDatabaseConfigured, schema } from '@/db/client';
import { isPlanId, type PlanId } from '@/lib/billing';

/**
 * Best-effort plan lookup for tier gating. Defaults to 'free' whenever the
 * database is unconfigured or the query fails, so export gating degrades safely
 * (a missing DB never grants unlimited access).
 */
export async function getUserPlan(userId: string): Promise<PlanId> {
  if (!isDatabaseConfigured()) return 'free';
  try {
    const rows = await db()
      .select({ plan: schema.users.plan })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    const plan = rows[0]?.plan;
    return isPlanId(plan) ? plan : 'free';
  } catch {
    return 'free';
  }
}
