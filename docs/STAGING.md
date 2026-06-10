# Staging Environment

> Phase 6.8 (ME-04). Updated 2026-06-09.

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
