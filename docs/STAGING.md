# Staging Environment

> Phase 6.8 (ME-04). Updated 2026-06-09.

> The topology and domains below are a setup plan, not verified live configuration.
> See [RELEASE_VERIFICATION.md](RELEASE_VERIFICATION.md) for observed deployment
> evidence and [LAUNCH_READINESS.md](LAUNCH_READINESS.md) for current required variables.

## Architecture

| Component | Production | Staging |
|-----------|-----------|---------|
| Deploy | Vercel `master` branch | Vercel `staging` branch |
| URL | `zagafy.com` | `staging.zagafy.com` |
| Database | Neon main branch | Neon `staging` branch |
| Stripe | Live mode | Test mode |
| Clerk | Production instance | Development instance |
| PostHog | Production project | Staging project (or same with env filter) |
| Sentry | Production DSN | Staging DSN |

## Setup

### 1. Vercel

1. In the Vercel dashboard, go to **Settings → Git → Production Branch**.
2. Keep `master` as the production branch.
3. Add `staging` as a branch deploy with a custom domain `staging.zagafy.com`.
4. Set staging-specific environment variables (see below).

### 2. Neon database branch

```bash
# Create a staging branch from main
neonctl branches create --name staging --project-id <project-id>
```

The staging branch inherits the schema from main but has isolated data.
Use the staging branch connection string as `DATABASE_URL` in Vercel's
staging environment.

### 3. Stripe test mode

Use Stripe test-mode API keys for the staging environment:
- `STRIPE_SECRET_KEY` → `sk_test_...`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → `pk_test_...`
- `STRIPE_WEBHOOK_SECRET` → webhook secret for staging endpoint

Register a separate webhook endpoint in Stripe Dashboard pointing to
`https://staging.zagafy.com/api/webhooks/stripe`.

### 4. Environment variables

Set these in Vercel for the `staging` branch:

```
DATABASE_URL=<neon-staging-branch-url>
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
CLERK_SECRET_KEY=<dev-instance-key>
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<dev-instance-key>
SENTRY_DSN=<staging-dsn>
NEXT_PUBLIC_POSTHOG_KEY=<staging-or-shared>
```

## Promotion flow

```
feature-branch → staging (auto-deploy)
                     ↓
              QA + E2E + load tests
                     ↓
              staging → master (PR + review)
                     ↓
              production (auto-deploy)
```

1. Merge feature branches into `staging`.
2. Vercel auto-deploys to `staging.zagafy.com`.
3. Run E2E tests and load tests against staging.
4. When staging is validated, create a PR from `staging` → `master`.
5. After review and merge, Vercel deploys to production.

## E2E against staging

```bash
BASE_URL=https://staging.zagafy.com npx playwright test
```

## Load tests against staging

```bash
k6 run -e BASE_URL=https://staging.zagafy.com loadtest/dashboard.js
```


## Required cloud-history acceptance setup

The release-readiness workflow now checks eight required journeys: chapter
save/reload, two document export journeys, JSON backup/restore, single-message
chat recovery, and three authenticated cloud journeys (concurrent two-device
turns, offline clear/restore, and second-account isolation). Cloud fixtures use
real Clerk and sync/database routes; only the AI reply is stubbed. This does not
verify real model quality, quota spending or provider latency.

Use a dedicated preview and isolated database, never production. Set these on
the **preview branch**, not just production:

- `ZAGAFY_STAGING=true`, `NEXT_PUBLIC_DEPLOYMENT_MODE=saas`.
- Clerk development-instance public/secret keys from the same application.
- The isolated `DATABASE_URL`, migrated through `0007_chat_history`.
- Staging Upstash REST URL/token and a private, randomly generated `HEALTH_TOKEN`.
- Clerk development webhooks/user provisioning appropriate to the isolated database.

`GET /api/health/readiness` requires `X-Health-Token` even in development. It is
read-only, refuses production targets/keys and unacknowledged previews, checks
required cloud schema columns, and returns the deployed commit and generic missing
check names. It never returns credentials or database error details. This is a
configuration/schema attestation, not proof of live integration health. A Vercel
preview receiving `ZAGAFY_STAGING=true` must actually point to the dedicated
staging database; the flag cannot independently prove database isolation.

In GitHub configure secrets `STAGING_URL` (an HTTPS origin),
`STAGING_HEALTH_TOKEN`, the existing four `E2E_CLERK_*` secrets, and
`E2E_OTHER_CLERK_USER_EMAIL` / `E2E_OTHER_CLERK_USER_PASSWORD`. Configure repository
variable `STAGING_ISOLATED=true` only after checking the database and accounts.
Both users must be distinct dedicated `+clerk_test` accounts. The primary account
needs a paid cloud entitlement in the isolated database; the second account must
have no access to the synthetic project. These tests do not send invitations,
charge Stripe, create real users or change real entitlements.

Prefer the immutable deployment URL over a moving branch alias. Run
**Authenticated release readiness** from the release candidate branch after
its preview is ready. The workflow rechecks the deployed commit after browser tests. `STAGING_EXPECTED_SHA` is the workflow's full Git commit;
a different/stale deployed SHA fails before any test data writes. Tests create
UUID-named synthetic projects and delete those fixtures afterward. Independent
browser contexts have independent IndexedDB/localStorage. Required flows cannot
skip; JSON report validation rejects missing results, failed tests and flaky
retries. Failures upload artifacts for investigation.

For a local runner, provide the same variables securely, add
`STAGING_EXPECTED_SHA=<full candidate SHA>`, `STAGING_ISOLATED=true`,
`E2E_REQUIRE_AUTH=true` and `E2E_REQUIRE_CLOUD=true`, then run
`npm run verify:staging` before the selected Playwright specs. Keep secrets out of
shell arguments, logs and repository files. Missing staging credentials remain
an explicit blocked gate, never a successful verification.
