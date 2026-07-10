import { and, eq, lt, lte } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { sendEmail, isEmailConfigured } from '@/lib/email';
import { log } from '@/lib/logger';

/**
 * Onboarding drip emails (day 1 / 3 / 7).
 *
 * Driven by the daily Vercel cron at /api/cron/onboarding. `users.onboarding_stage`
 * tracks the highest day-N email already sent (0 = none). Each run computes the
 * stage each user is *due* from account age and, for users behind, advances the
 * stage then sends the matching template.
 *
 * Idempotency / crash-safety design (mirrors the Stripe webhook claim pattern):
 * we UPDATE-then-send, claiming the stage atomically via a conditional
 * `UPDATE ... SET onboarding_stage = $stage WHERE id = $id AND onboarding_stage < $stage
 * RETURNING id` — only a returned row grants the right to send. For a marketing
 * drip, a missed email (claimed but crashed before send) is strictly better than
 * a double send (sent but crashed before update), and concurrent/overlapping runs
 * can never both claim the same user+stage.
 *
 * When email is entirely unconfigured (no RESEND_API_KEY) we skip WITHOUT
 * advancing any stages, so the drip delivers once email is switched on rather
 * than silently burning through stages.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Max users processed per cron run — keeps well within maxDuration = 60s. */
export const BATCH_LIMIT = 200;

export type OnboardingStage = 0 | 1 | 3 | 7;

/** Highest drip stage due for an account created at `createdAt`, as of `now`. */
export function stageForAccountAge(createdAt: Date, now: Date): OnboardingStage {
  const days = (now.getTime() - createdAt.getTime()) / DAY_MS;
  if (days >= 7) return 7;
  if (days >= 3) return 3;
  if (days >= 1) return 1;
  return 0;
}

export interface DripCounts {
  /** Candidate users examined this run (stage < 7, account older than 1 day). */
  examined: number;
  /** Emails actually delivered to Resend. */
  sent: number;
  /** Examined but not sent: not yet due, lost the atomic claim, or send failed. */
  skipped: number;
}

/**
 * Run one drip pass. Returns counts for the cron response / logs.
 * Requires a configured database (caller guards with isDatabaseConfigured()).
 */
export async function runOnboardingDrip(now: Date = new Date()): Promise<DripCounts> {
  const counts: DripCounts = { examined: 0, sent: 0, skipped: 0 };

  if (!isEmailConfigured()) {
    // Do NOT advance stages when email is off — otherwise every user would be
    // marked "sent" without ever receiving mail. Log once per run and bail.
    log.info('Onboarding drip skipped (RESEND_API_KEY not configured)');
    return counts;
  }

  const cutoff = new Date(now.getTime() - DAY_MS);
  const candidates = await db()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      onboardingStage: users.onboardingStage,
    })
    .from(users)
    .where(and(lt(users.onboardingStage, 7), lte(users.createdAt, cutoff)))
    .limit(BATCH_LIMIT);

  counts.examined = candidates.length;
  const appUrl = process.env.APP_URL;

  for (const user of candidates) {
    const stage = stageForAccountAge(user.createdAt, now);
    if (stage === 0 || stage <= user.onboardingStage) {
      counts.skipped += 1;
      continue;
    }

    // Atomic claim: only the run that flips the stage may send. An empty
    // returning means another (concurrent/overlapping) run already claimed it.
    const claimed = await db()
      .update(users)
      .set({ onboardingStage: stage })
      .where(and(eq(users.id, user.id), lt(users.onboardingStage, stage)))
      .returning({ id: users.id });

    if (claimed.length === 0) {
      log.info('Onboarding stage already claimed — skipping', { userId: user.id, stage });
      counts.skipped += 1;
      continue;
    }

    const data: Record<string, string> = {};
    if (user.name) data.name = user.name;
    if (appUrl) data.appUrl = appUrl;

    const delivered = await sendEmail({
      to: user.email,
      template: `onboarding_day${stage}`,
      data,
    });

    if (delivered) {
      counts.sent += 1;
    } else {
      // Stage already advanced (update-first): the user misses this email
      // rather than risking a double send on retry. sendEmail never throws.
      log.warn('Onboarding email send failed after stage claim', { userId: user.id, stage });
      counts.skipped += 1;
    }
  }

  return counts;
}
