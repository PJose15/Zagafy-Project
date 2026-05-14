# Clerk Setup — Pedro's Runbook

Phase 5.2 wired Clerk auth into the app. The integration is **dormant by default** — without `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` set, the app behaves exactly as it did before (no sign-in screens, no API gates). This doc covers how to turn it on.

## Two deployment modes

| Mode | When | Behavior |
|---|---|---|
| **Embed** | `NEXT_PUBLIC_DEPLOYMENT_MODE=embed` (or both Clerk keys missing) | No `ClerkProvider`, no middleware auth checks, no API gates. Identical to pre-5.2 behavior. Used by the AI Studio applet. |
| **SaaS** | Both Clerk keys set AND `DEPLOYMENT_MODE` is anything other than `embed` | `ClerkProvider` wraps the app, middleware redirects unauthed users on every page except `/sign-in`, `/sign-up`, `/api/health(*)`. Every protected `/api/*` route returns 401 to unauthed callers. |

The toggle lives in `lib/auth.ts` → `isAuthEnabled()`.

## What you do (one-time, ~10 min)

1. **Create a Clerk account.** https://clerk.com/sign-up — free tier covers 10k MAU.
2. **Create an application** (e.g. `Zagafy`). Sign-in methods: enable **Email** and **Google**. Magic links optional.
3. **Copy the keys** from the Clerk dashboard:
   - **Publishable key** (starts with `pk_test_…` or `pk_live_…`) — safe in client bundle.
   - **Secret key** (starts with `sk_test_…` or `sk_live_…`) — server-only.
4. **Paste into `.env.local`:**

   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```

5. **Add the same vars to Vercel** → Project Settings → Environment Variables (Production + Preview).
6. **Set `NEXT_PUBLIC_DEPLOYMENT_MODE`** explicitly per environment:
   - Local dev: leave unset (embed mode by default; or set to `saas` to test full auth flow)
   - Vercel SaaS production: set to anything other than `embed` (e.g. `saas`) — or leave unset; the presence of the Clerk key alone enables auth
   - AI Studio deploy target: set to `embed` (overrides the Clerk key, bypasses auth)
7. **Restart `npm run dev`** for env changes to take effect.

## Smoke test (SaaS mode)

1. With Clerk keys set and `DEPLOYMENT_MODE` unset (or not `embed`):
2. `npm run dev` → visit http://localhost:3000
3. Should redirect to `/sign-in`
4. Sign up with email or Google
5. Lands back on `/`
6. Sign out → next API call (e.g. open the assistant page and try to chat) should fail with 401

## Smoke test (embed mode)

1. With or without Clerk keys, set `NEXT_PUBLIC_DEPLOYMENT_MODE=embed`:
2. `npm run dev` → visit http://localhost:3000
3. Should render the dashboard immediately, no sign-in
4. All API routes work without auth

## How it works

- **`lib/auth.ts`** — `isAuthEnabled()`, `requireUser()`. The single source of truth for whether auth is on.
- **`middleware.ts`** — branches at module load. SaaS mode wraps with `clerkMiddleware`; embed mode runs only the existing CORS + bot-signal policy.
- **`app/layout.tsx`** — conditionally wraps the tree in `<ClerkProvider>` based on `isAuthEnabled()`.
- **`app/(auth)/sign-in` and `/sign-up`** — minimal pages rendering Clerk's `<SignIn>` / `<SignUp>` widgets.
- **`app/api/*/route.ts`** — every protected route calls `await requireUser()` after the rate-limit check. In embed mode this returns a synthetic `embed-mode` user; in SaaS mode it returns 401 if no session.

## Deferred to later tasks

- **User record sync** (Clerk webhook → `users` table) — Task 5.3 once Neon is wired up
- **Cascade delete on account deletion** — Task 5.3
- **Per-user (not per-IP) rate limiting** — Task 5.11
- **Ownership checks** (`requesting story X requires owning story X`) — Task 5.13
- **Sign-out clears local Dexie data** — Task 5.5 (multi-device UX)
- **Page-level auth UI affordances** (sign-in button in header, etc.) — Task 5.5

## Disabling Clerk

Either:
- Remove `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` from the environment, or
- Set `NEXT_PUBLIC_DEPLOYMENT_MODE=embed`

Both fall back to the pre-5.2 unauthed behavior.
