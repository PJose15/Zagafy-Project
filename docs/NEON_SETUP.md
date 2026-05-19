# Neon + Drizzle Setup — Pedro's Runbook

Phase 5.3 wired Drizzle ORM + the `@neondatabase/serverless` HTTP driver. The cloud schema (`db/schema.ts`) is defined but no migration runs until you connect a Neon database. The Clerk webhook handler (`app/api/webhooks/clerk/route.ts`) returns a 500 with a clear log message when `DATABASE_URL` is unset, so the rest of the app keeps working.

## What you do (one-time, ~10 min)

### 1. Create the Neon project (~3 min)

1. https://neon.tech/signup — free tier covers 500 MB storage and unlimited compute on a single project.
2. Create a project named `zagafy` (Postgres 17, region nearest your Vercel deployment region).
3. Copy the **pooled connection string** from the dashboard. Looks like:
   ```
   postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. Paste into `.env.local`:
   ```
   DATABASE_URL=postgresql://...
   ```
5. Add the same to Vercel → Project Settings → Environment Variables (Production + Preview).

### 2. Generate and apply the initial migration (~2 min)

From the repo root:

```
npm run db:generate
```

This reads `db/schema.ts` and writes SQL to `db/migrations/0000_initial.sql` (or similar). Commit that file — migrations are part of the codebase.

Then apply it:

```
npm run db:migrate
```

This runs the SQL against `DATABASE_URL`. Should report 9 tables created (`users`, `stories`, `story_collaborators`, `chapters`, `chapter_versions`, `story_snapshots`, `sessions`, `chat_messages`, `writer_insights`).

Sanity check via Drizzle Studio:

```
npm run db:studio
```

Opens a web UI at https://local.drizzle.studio — verify the tables exist with the expected columns.

### 3. Configure the Clerk webhook (~5 min)

Required so sign-ups in Clerk auto-create rows in our `users` table.

1. Clerk Dashboard → **Webhooks** → **Add Endpoint**
2. **Endpoint URL:** `https://<your-vercel-domain>/api/webhooks/clerk`
   - For local testing: use https://ngrok.com or https://dashboard.clerk.com/last-active?path=webhooks → Endpoint testing tab → "Send test event"
3. **Subscribe to events:** `user.created`, `user.updated`, `user.deleted`
4. Copy the **Signing Secret** (starts with `whsec_…`)
5. Paste into `.env.local` and Vercel:
   ```
   CLERK_WEBHOOK_SECRET=whsec_...
   ```

## Smoke test

After all three steps:

1. Trigger a test webhook from Clerk Dashboard → Webhooks → your endpoint → "Send test event" → pick `user.created`
2. Should return 200 with `{ "synced": "user_..." }`
3. Run `npm run db:studio`, open the `users` table — should see the test user row
4. Trigger `user.deleted` for the same user → row should disappear (FK cascades will also remove any stories/chapters/etc. for that user)

## How it works

- **`db/schema.ts`** — 9 tables with FK + indexes. IDs are `text` so client-generated Dexie IDs round-trip into Postgres unchanged.
- **`db/client.ts`** — lazy Drizzle client. `db()` throws if `DATABASE_URL` is unset, so importing the module is always safe.
- **`drizzle.config.ts`** — config for `drizzle-kit generate` / `migrate` / `studio`.
- **`db/migrations/`** — generated SQL; **commit these files** so deploys re-run them on fresh DBs.
- **`app/api/webhooks/clerk/route.ts`** — verifies Svix HMAC signature, upserts on `user.created`/`user.updated`, deletes on `user.deleted`. Cascade FKs handle the downstream cleanup.
- **Middleware** — `/api/webhooks/(.*)` is on the public-route allowlist; Clerk middleware does not call `auth.protect()` for these (signature verification is the gate).

## Schema design notes

For v1, the following entities live inside the `stories.state` JSONB column rather than dedicated tables:

- Characters
- Conflicts
- Timeline events
- World bible sections / categories
- Heteronyms
- Genesis (onboarding) data

This mirrors the current Dexie `stories.data` shape and lets Phase 5.4 (sync engine) ship a write-through layer without redesigning every entity. Normalizing them into their own tables is a future migration when we have query patterns that justify it (e.g. "list every character across all my stories").

The following entities **do** get dedicated tables because they have meaningful query patterns or large content:

- `chapters` — large `content` text + ordering queries
- `chapter_versions` — version-history queries by chapter + time
- `story_snapshots` — full point-in-time backups
- `sessions` — analytics over the writing-session series
- `chat_messages` — paginated chat history
- `writer_insights` — long-term memory queries by category / pinned

## Deferred to later tasks

- **Sync engine** (Dexie ⇆ Postgres with last-write-wins on `updated_at`) — Task 5.4
- **Per-user / per-story ownership checks** inside `requireUser` — Task 5.13
- **Stripe customer ID linking** on the `users` row — Task 5.7
- **Collaboration writes** to `story_collaborators` — Task 5.6
- **Backup / PITR setup** (Neon's branch-based backup) — Task 5.12

## Disabling

Remove `DATABASE_URL` from the environment. `db()` will throw if called; the webhook returns a clean 500 with a structured log line. The rest of the app (still single-user Dexie-backed) keeps working.
