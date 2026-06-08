# Sentry Setup — Pedro's Runbook

Phase 5.1 (MB-03) wired the SDK, PII scrubbing, logger forwarding, and source-map upload. The integration **no-ops** until `NEXT_PUBLIC_SENTRY_DSN` is set, so the app builds and runs fine without an account. This doc lists the manual steps to turn it on.

## What you do (one-time, ~10 min)

1. **Create a Sentry account.** https://sentry.io/signup/ — free tier covers 5k errors/mo and 10k performance traces/mo.
2. **Create an organization** (e.g. `zagafy`).
3. **Create a project.** Platform: **Next.js**. Note the project slug (e.g. `story-memory-writer`).
4. **Copy the DSN** from Project Settings → Client Keys (DSN). Looks like `https://abc123@o123.ingest.us.sentry.io/456`.
5. **Generate an auth token** at https://sentry.io/orgredirect/settings/auth-tokens/. Required scopes: `project:releases`, `org:read`. Used only at build time for source-map upload.
6. **Paste 4 vars into `.env.local`:**

   ```
   NEXT_PUBLIC_SENTRY_DSN=https://...
   SENTRY_DSN=https://...
   SENTRY_AUTH_TOKEN=sntrys_...
   SENTRY_ORG=zagafy
   SENTRY_PROJECT=story-memory-writer
   ```

7. **Add the same 5 vars to Vercel** → Project Settings → Environment Variables (Production + Preview). Trigger a redeploy.

## Smoke test

After deploying with the vars set:

1. Hit any production URL.
2. Trigger an error (visit a route that throws, or temporarily add `throw new Error('sentry test')` in a server route).
3. Within ~30 seconds the error should appear in Sentry → Issues.

In the issue, verify:

- Stack trace is **un-minified** (source maps uploaded successfully).
- Request body and breadcrumb data show `[Redacted]` for any `text`/`chapter`/`manuscript`/`prompt`/`message` fields.
- No email, IP, or cookie present.

## How it works

- **Three configs** at repo root:
  - `sentry.client.config.ts` — runs in the browser
  - `sentry.server.config.ts` — runs in Node serverless functions
  - `sentry.edge.config.ts` — runs in Edge runtime (middleware)
- **`instrumentation.ts`** registers the right config based on `NEXT_RUNTIME` and exports `onRequestError` so Next.js 15's request-error hook flows to Sentry.
- **`next.config.ts`** wraps the config with `withSentryConfig` only when DSN is present — keeps local dev silent.
- **Logger forwarding:** `lib/logger.ts` `log.error()` and `log.warn()` automatically call `Sentry.captureException` / `captureMessage` when DSN is set. Endpoint, requestId, and userId become Sentry tags.
- **PII scrubbing** (`lib/sentry-pii.ts`) runs in `beforeSend` and `beforeBreadcrumb`:
  - Cookies, `Authorization`, `X-Health-Token` headers → `[Redacted]`
  - Strings longer than 256 chars → `[Redacted: string len=N]`
  - Object keys matching the sensitive pattern (`text`, `chapter`, `manuscript`, `bible`, `prompt`, `content`, `body`, `message`, `story`, `scene`, `outline`, `note`, `draft`, `polish`, `braindump`, `email`, `password`, `token`, `secret`, `api_key`, `authorization`, `cookie`, …) → `[Redacted]`
  - `user.email`, `user.ip_address`, `user.username` deleted
  - `query_string` deleted entirely

If you find content leaking into Sentry that shouldn't, add the field name to `SENSITIVE_KEY_PATTERN` in `lib/sentry-pii.ts`.

## Sample rates (current)

- Errors: 100%
- Performance traces: 10%
- Session replay: disabled (`replaysSessionSampleRate: 0`)
- On-error replay: disabled (`replaysOnErrorSampleRate: 0`)

Adjust in the three `sentry.*.config.ts` files. To enable session replay later, install `@sentry/replay` and bump the sample rates.

## Tunnel route

`tunnelRoute: '/monitoring'` in `next.config.ts` means Sentry events are sent through a Next.js rewrite to dodge ad blockers. No action required — it just works once the SDK is enabled.

## Releases

Releases are tagged automatically using `VERCEL_GIT_COMMIT_SHA` (server) and `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` (client). Vercel injects these on every deploy.

## Disabling Sentry

Remove `NEXT_PUBLIC_SENTRY_DSN` (and `SENTRY_DSN`) from the environment. The SDK skips `init()` and the `withSentryConfig` wrapper is bypassed. Logger forwarding becomes a no-op.
