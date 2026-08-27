# Activating distributed rate limiting + AI quota (Upstash)

The AI cost-control layer — per-user monthly AI quotas (`lib/ai-quota.ts`) and
per-endpoint rate limiting (`lib/rate-limit.ts`) — is **code-complete but dormant
in production until Upstash Redis is configured**. Without it the limiter falls
back to a per-lambda in-memory store (counters don't span serverless instances)
and the AI quota is not enforced at all, i.e. **there is no distributed cost
ceiling on Gemini/Anthropic spend**. This is a config-only task; no code changes.

## ⚠ Ordering hazard — read first

`RATE_LIMIT_STRICT=true` **without** the Upstash vars puts the limiter in
`disabled` mode, and **every rate-limited endpoint returns 503 (the app goes
down)**. Always set and verify the Upstash vars FIRST, then flip strict.

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

### 4. Only after step 3 passes — fail closed
Add `RATE_LIMIT_STRICT=true` (Production) and redeploy. Now if the Upstash vars
ever go missing, the limiter fails **closed** (503) rather than silently dropping
the cost ceiling.

## How the modes resolve (`getRateLimitMode()`)
- **upstash** — both `UPSTASH_REDIS_REST_*` set → distributed limiting + quota. ✅ goal
- **memory** — default (incl. production without Upstash) → per-lambda fallback, no quota. ⚠ current prod state
- **disabled** — production + `RATE_LIMIT_STRICT=true` + no Upstash → every endpoint 503s. ✗ only if misordered

A circuit breaker (3 failures / 30s → open 60s) protects against Upstash
outages, returning 503 rather than hammering a failing backend.
