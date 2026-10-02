# Zagafy release readiness — October 1, 2026

This is the current launch checklist. The broad product roadmap and older audit
documents describe historical scope; they are not proof that a deployed release
has passed these gates. Base reviewed: `485b71029eea4c8af096a0197fe0f12db55829af`.

## Changes in this release candidate

| Audit item | Implementation |
| --- | --- |
| Z01: quota outages | Production denies unavailable quota reservations with 503; exhaustion remains 429. One Redis script reserves allowance and expiry atomically. |
| Z02: unmetered helpers | Main character chat returns `X-AI-Turn-ID`. Each user-bound grant lasts 180 seconds and admits one state, insight, contradiction and memory request each. Atomic Redis claims reject replay, expiry and another user. One visible chat turn still costs one monthly allowance unit. |
| Z03: missing auth configuration | Production SaaS routes refuse missing Clerk public or secret keys. Explicit embeds remain a separate mode; production embed AI shares a bounded free-plan budget. |
| Z04: dependency findings | Lockfile patch updates clear the current dependency scan without a framework major upgrade. Recheck at merge and deployment. |
| Z05: project switching | Push metadata, delayed pull data and conflict resolution stay bound to the captured project. Destroyed engines do not apply completed network responses. |
| Z06: offer accuracy | Local projects, chapters and writing voices are untiered, matching existing behavior. Removed the unimplemented developer API entitlement/promise. AI, cloud and collaborator limits remain. Prices unchanged. |
| Z07: browser evidence | Added a required chapter-save/reload journey without conditional skips and an authenticated staging workflow. It does not establish live payment, import/export, collaboration or first-run onboarding coverage. |
| Z08: false-green evaluation | Staging URL and authenticated JWT required; errors fail workflow. Updated obsolete input fields; empty/degraded output fails. Contract rubrics remain distinct from human quality review. |
| Z09: browser account switching | Sync requires a loaded signed-in account; changing accounts destroys the old engine. The browser workspace is linked to its first syncing account; another account cannot automatically sync that workspace. Local manuscripts remain device-local and are not erased on sign-out. |
| Z10: stale instructions | Current setup and launch guidance linked from README and roadmap. |

## Supported launch offer

Local manuscript editing, chapters/projects, story bible, writing voices, outlines,
flow tools and browser persistence are available across plans. Paid differentiation
is server-backed AI allowance, cloud sync, collaborators and existing gated exports.
There is no shipped public developer API. Studio has five collaborators; local
writing voices are not Studio-exclusive. Do not sell disabled or unverified features.

The workspace remains local to the browser, including after sign-out. Use separate
browser profiles for different people/accounts on shared devices. The new owner
marker does not retroactively identify the author of pre-existing local data;
confirm ownership before first sync after upgrading. It is a guard against accidental
cloud transfer, not OS-level encryption or local-device access control. Local data
is preserved; export a backup before clearing browser storage.

## Production configuration before deployment

Run `npm run verify:production-config` in a secured environment containing the
intended production variables. The command prints names of missing variables,
never values. Presence checks do not prove valid credentials.

- `NEXT_PUBLIC_DEPLOYMENT_MODE=saas`; Clerk public and secret keys from the same instance.
- `DATABASE_URL`, migrated Neon/Postgres schema, Clerk webhook signing configuration.
- `GEMINI_API_KEY` for writing and main character chat.
- `ANTHROPIC_API_KEY` for character-chat state/insight/contradiction/memory helpers.
- Upstash REST URL/token. Production no longer silently uses memory limits.
- Stripe secret/webhook keys and Writer/Author monthly/yearly price IDs. If Studio
  is offered, also configure both Studio price IDs and verify its lifecycle.
- Correct app URL, email domain/Resend credentials, Clerk webhook secret, cron auth,
  Sentry/error monitoring and gated `HEALTH_TOKEN` probe according to enabled features.

Configure Redis before deploying. Missing Redis causes rate-limited requests to
return503 even if `RATE_LIMIT_STRICT` is absent/false. Redis failures do not allow
paid AI. For an admitted request, provider failures may consume an allowance unit;
sidecar replay is rejected even if its first provider attempt failed. Helpers are
optional and non-blocking, so the main reply remains available.

Old clients without the helper grant cannot call helpers in production; deploy
server and client together and refresh stale sessions. Grants/claims contain only
the account ID and opaque turn ID, not manuscript text, and expire automatically.

## Required verification on the release commit

```bash
npm ci
npm audit --audit-level=high --omit=dev
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Run the **Authenticated release readiness** workflow against an isolated staging
deployment with `STAGING_URL`, Clerk development-instance E2E keys, and a dedicated
test user's email/password. Missing configuration fails this workflow. It exercises
the required manuscript journey; remaining real-world journeys below need evidence.

The nightly eval uses `STAGING_URL` and `EVAL_AUTH_TOKEN`, a current Clerk JWT for
a dedicated staging account. Arrange short-lived token renewal; an expired token
fails rather than creating a false-green result. These cases spend real staging
AI quota/provider funds. The result declares `qualityReview: manual_required`;
string-contract passes are not independent judgments of narrative quality.

## Outstanding release gates — not completed by local tests

- [ ] Verify production/deployment branch, keys, database migration state and service availability.
- [ ] Run authenticated staging readiness against real Clerk, with no required-flow skips.
- [ ] Complete first-run sign-up/intake and account-switch testing in two accounts/tabs,
      including old local data, interrupted sync, invite/revoke and concurrent edits.
- [ ] Import supported files, export DOCX/PDF, reopen them and verify content/formatting.
- [ ] Stripe test-mode checkout, upgrade/downgrade/cancel/past-due, duplicate/out-of-order
      webhook and database-failure/retry evidence; then verify live price mapping.
- [ ] Run Redis scripts against real staging Redis: final-turn concurrency, claim replay,
      wrong user, expiry, timeout, recovery and multi-instance limits.
- [ ] Evaluate real Gemini/Anthropic output, latency and costs; human-review canon,
      character behavior and story-coach quality. Do not treat automated string checks as approval.
- [ ] Confirm email delivery, cron scheduling/auth, alerts, provider spend caps and support ownership.
- [ ] Perform backup restore and release rollback drills; tag the exact approved commit.

## Rollback

Keep the last approved artifact/commit and environment configuration. These changes
do not require a database schema migration. Avoid rolling back to a version that
reopens AI quota/auth bypasses: disable paid AI or route traffic to a verified
release while repairing a regression. Preserve local IndexedDB and exported backups.
No production deployment or live integration verification is implied by this document.
