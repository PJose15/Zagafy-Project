import { NextRequest } from 'next/server';
import { Webhook } from 'svix';
import { eq } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/db/client';
import { users } from '@/db/schema';
import { err, ok, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * Clerk webhook → our `users` table.
 *
 * Public route (no requireUser; verification is via Svix HMAC signature).
 * Listens for user.created / user.updated / user.deleted.
 *
 * Phase 5.3 scope: user table sync only. Stripe-customer-id linking lands
 * in Task 5.7.
 */
type ClerkUserEvent = {
  type: 'user.created' | 'user.updated' | 'user.deleted';
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string; id: string }>;
    primary_email_address_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  };
};

function pickPrimaryEmail(data: ClerkUserEvent['data']): string | null {
  if (!data.email_addresses?.length) return null;
  const primary = data.email_addresses.find((e) => e.id === data.primary_email_address_id);
  return (primary ?? data.email_addresses[0]).email_address;
}

function pickName(data: ClerkUserEvent['data']): string | null {
  const parts = [data.first_name, data.last_name].filter(Boolean) as string[];
  if (parts.length === 0) return null;
  return parts.join(' ');
}

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/webhooks/clerk', requestId });

  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    log.error('CLERK_WEBHOOK_SECRET not configured');
    return err('internal_error', 'Webhook not configured', 500, undefined, { requestId });
  }

  if (!isDatabaseConfigured()) {
    log.error('DATABASE_URL not configured');
    return err('internal_error', 'Database not configured', 500, undefined, { requestId });
  }

  // Svix headers (Clerk uses Svix to sign webhook deliveries)
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return err('unauthorized', 'Missing Svix signature headers', 401, undefined, { requestId });
  }

  const rawBody = await req.text();
  let evt: ClerkUserEvent;
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkUserEvent;
  } catch (verifyErr) {
    log.warn('Webhook signature verification failed', { err: String(verifyErr) });
    return err('unauthorized', 'Invalid webhook signature', 401, undefined, { requestId });
  }

  try {
    if (evt.type === 'user.created' || evt.type === 'user.updated') {
      const email = pickPrimaryEmail(evt.data);
      if (!email) {
        log.warn('Clerk user event missing email', { userId: evt.data.id, type: evt.type });
        return ok({ skipped: 'no_email' }, { requestId });
      }
      const name = pickName(evt.data);
      await db()
        .insert(users)
        .values({ id: evt.data.id, email, name })
        .onConflictDoUpdate({
          target: users.id,
          set: { email, name },
        });
      log.info('user synced', { userId: evt.data.id, type: evt.type });
      return ok({ synced: evt.data.id }, { requestId });
    }

    if (evt.type === 'user.deleted') {
      // FK cascade removes the user's stories, chapters, etc.
      await db().delete(users).where(eq(users.id, evt.data.id));
      log.info('user deleted', { userId: evt.data.id });
      return ok({ deleted: evt.data.id }, { requestId });
    }

    log.info('ignoring unhandled event type', { type: evt.type });
    return ok({ ignored: evt.type }, { requestId });
  } catch (dbErr) {
    log.error('Webhook database write failed', dbErr);
    return err('internal_error', 'Database write failed', 500, undefined, { requestId });
  }
}
