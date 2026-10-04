> **October 1, 2026 update:** production rate limits and AI quotas now always fail
> closed when Upstash is missing or unavailable. Configure and verify Redis before
> deploying this release. RATE_LIMIT_STRICT is no longer required to activate this
> protection. Character-chat helpers require an expiring user-bound main-turn grant.
> See [LAUNCH_READINESS.md](LAUNCH_READINESS.md) for current gates.

# Activating distributed rate limiting + AI quota (Upstash)

Production rate limits and AI quotas require Upstash Redis. Missing configuration
blocks rate-limited routes with HTTP503; quota outages also block paid AI. Local
development and tests can use process-local limits. Configure and verify Redis
before deploying this release; RATE_LIMIT_STRICT no longer controls this default.

## Runbook

### 1. Create the Upstash Redis database
- [console.upstash.com](https://console.upstash.com) → create a **Redis** DB in
  the region closest to the Vercel deployment.
- Copy the **REST URL** and **REST Token** (the DB's "REST API" panel).
- Cleaner alternative: add the **Upstash integration from the Vercel Marketplace**
  — it injects `UPSTASH_REDIS_REST_URL` / `_TOKEN` automatically.

### 2. Set env vars in Vercel (Project → Settings → Environment Variables → Production)
| Var | Value |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | the REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | the REST token |
| `HEALTH_TOKEN` | any long random string (required for the health probe below) |

Then **redeploy** so the vars take effect.

### 3. Verify Upstash is active (mode must be `upstash`, not `memory`)
```
npm run verify:ratelimit -- --url https://<your-domain> --token <HEALTH_TOKEN>
```
or directly:
```
curl -s https://<your-domain>/api/health/rate-limit -H "X-Health-Token: <HEALTH_TOKEN>"
```
Expect `"mode":"upstash"` and `"breakerState":"closed"`. That confirms the AI
quota + distributed rate limiting are live.

### 4. Verify failure behavior in staging
Temporarily use an invalid Redis token in an isolated staging deployment. Requests
must fail503 without calling an AI provider. Restore the valid token and verify
recovery. Do not perform this fault injection against paying production users.
