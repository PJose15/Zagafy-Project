# Zagafy On-Call Runbook

Production observability guide. Phase 5.11.

---

## Alert Inventory

Four alerts are configured. Each fires when its condition holds for 5 minutes.

| # | Alert | Condition | Severity | Where Configured |
|---|-------|-----------|----------|------------------|
| 1 | High error rate | Error rate > 1% over 5 min | Page | Sentry Alert Rules |
| 2 | Chat latency spike | p95 latency > 5 s on `/api/chat` over 5 min | Page | Sentry Alert Rules |
| 3 | Stripe webhook signature failure | Any `unauthorized` on `/api/webhooks/stripe` | Page | Sentry Issue Alert |
| 4 | Daily AI spend exceeded | Single call cost > threshold OR daily aggregate > $X | Notify | Sentry + structured logs |

---

## Sentry Alert Configuration

### Alert 1 — Error Rate > 1%

1. Sentry -> Alerts -> Create Alert -> **Metric Alert**
2. Metric: `event.type:error`
3. Filter: `transaction:*` (all endpoints)
4. Threshold: error rate > 1% over 5-minute window
5. Action: page on-call via email / Slack / PagerDuty
6. Resolve: when error rate drops below 0.5%

### Alert 2 — p95 Latency on /api/chat

1. Sentry -> Alerts -> Create Alert -> **Metric Alert**
2. Metric: `transaction.duration`
3. Filter: `transaction:/api/chat` AND `http.method:POST`
4. Threshold: p95 > 5000 ms over 5-minute window
5. Action: page on-call
6. Resolve: when p95 drops below 3000 ms

### Alert 3 — Stripe Webhook Signature Failures

1. Sentry -> Alerts -> Create Alert -> **Issue Alert**
2. Filter: issue contains `Stripe signature verification failed` OR tag `endpoint:/api/webhooks/stripe` with level `warning`
3. Condition: seen more than 1 time in 5 minutes
4. Action: page on-call immediately (potential payment compromise)

### Alert 4 — Daily AI Spend

1. Set `DAILY_AI_SPEND_ALERT_CENTS` in environment (e.g., `1000` = $10)
2. Per-call threshold: `lib/metrics.ts` logs a warning when a single AI call exceeds this value. Sentry captures the warning automatically.
3. Aggregate tracking: use PostHog Insight:
   - Event: `ai_cost_recorded`
   - Sum of property `cost_cents` grouped by day
   - Set a PostHog Action alert when daily sum exceeds target

---

## Dashboards

### Vercel Analytics (Web Vitals)

Enabled by default on Vercel deployments. Tracks:
- LCP, FID, CLS, TTFB, INP
- Per-page breakdown
- Geographic distribution

No additional configuration needed.

### Sentry Performance

Available at Sentry -> Performance. Shows:
- Transaction duration (p50, p75, p95, p99)
- Throughput (requests/min)
- Error rate per transaction
- Slow endpoint identification

Traces sample rate is set at 10% in `sentry.server.config.ts`.
To increase during incident investigation, temporarily raise `tracesSampleRate`.

### PostHog Product Metrics

Create these Insights in PostHog:

1. **Daily Active Users**: Unique users with any event, grouped by day
2. **Signup to Activation**: Funnel from `signup` -> `story_created` -> `chapter_created`
3. **AI Cost per Day**: Sum of `cost_cents` on `ai_cost_recorded`, grouped by day
4. **API Request Volume**: Count of `$api_request` events, grouped by `endpoint`
5. **Error Rate by Endpoint**: Count of `$api_request` where `is_error = true`, divided by total

### Structured Logs (Vercel)

Filter logs in Vercel dashboard or log drain by:
- `"_metric":"endpoint"` — per-request latency/status
- `"_metric":"ai_cost"` — AI API call costs
- `"_metric":"sync_queue_depth"` — sync queue size
- `"level":"error"` — all errors
- `"level":"warn"` — warnings (including alert-triggering conditions)

---

## Incident Response Procedures

### Triage (first 5 minutes)

1. Check the alert details in Sentry — which endpoint, which error
2. Open Sentry -> Issues to see the stack trace and breadcrumbs
3. Check Vercel logs for the `requestId` mentioned in the alert
4. Determine scope: single user? all users? specific region?

### High Error Rate (Alert 1)

**Likely causes:**
- Upstream API outage (Gemini, Anthropic, Clerk, Stripe)
- Database connection failure (Neon)
- Bad deployment (code regression)

**Steps:**
1. Check Sentry error details — is it one error type or many?
2. If upstream: check provider status pages
   - Gemini: `GET /api/health/gemini` for quick probe
   - Neon: https://neonstatus.com
   - Clerk: https://status.clerk.com
   - Stripe: https://status.stripe.com
3. If bad deploy: roll back via Vercel dashboard (Deployments -> previous -> Promote)
4. If database: check `DATABASE_URL` connectivity, Neon dashboard for compute status

### Chat Latency Spike (Alert 2)

**Likely causes:**
- Gemini API slowdown or degradation
- Oversized context payloads from clients
- Rate limiting causing retries

**Steps:**
1. Check Gemini status: `GET /api/health/gemini`
2. Look at Sentry traces for `/api/chat` — is the time spent in the AI call?
3. Check if rate limiting is the cause: `GET /api/health/rate-limit` (requires `X-Health-Token`)
4. If Gemini is slow, there is no mitigation except waiting — the retry logic in `lib/ai/retry.ts` handles transient errors

### Stripe Webhook Failures (Alert 3)

**This is critical — potential payment data compromise or misconfiguration.**

**Steps:**
1. Check Sentry for the exact error: is it signature verification or processing?
2. If signature failure:
   - Verify `STRIPE_WEBHOOK_SECRET` matches the webhook endpoint in Stripe Dashboard
   - Check if the webhook endpoint URL changed (e.g., new domain)
   - Check for replay attacks (same event ID appearing with different signatures)
3. If processing failure: check the Sentry stack trace for the specific event type
4. Verify in Stripe Dashboard -> Webhooks -> your endpoint -> Recent deliveries
5. Stripe retries failed webhooks for up to 3 days, so missed events will be redelivered

### AI Spend Alert (Alert 4)

**Steps:**
1. Check PostHog `ai_cost_recorded` events — which user/endpoint is driving cost?
2. If one user: check for abuse patterns (automated requests, excessive context size)
3. If systemic: check if a code change increased token usage (e.g., larger system prompts)
4. Mitigation: rate limits are already in place per endpoint; adjust in `lib/rate-limit.ts`

---

## Escalation

| Level | When | Who |
|-------|------|-----|
| L1 | Alert fires | On-call (Pedro) |
| L2 | Not resolved in 30 min | Pedro + review upstream status |
| L3 | Data loss or payment issue | Pedro + Stripe support if billing |

---

## Maintenance Tasks

### Weekly
- Review Sentry unresolved issues
- Check PostHog AI cost trends
- Verify no new `npm audit` vulnerabilities

### Monthly
- Review Sentry performance baselines — adjust alert thresholds if traffic patterns changed
- Check Vercel Analytics for web vitals regressions
- Review rate limit effectiveness (false positives in logs)

---

## Key Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `SENTRY_DSN` | Error tracking + performance traces | Yes (production) |
| `NEXT_PUBLIC_POSTHOG_KEY` | Product analytics + metrics dashboards | Yes (production) |
| `DAILY_AI_SPEND_ALERT_CENTS` | Per-call AI cost warning threshold | Optional (default: none) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification | Yes (if billing enabled) |

---

## Useful Commands

```bash
# Quick health check
curl https://zagafy.com/api/health

# Gemini reachability probe
curl https://zagafy.com/api/health/gemini

# Rate limit subsystem (requires HEALTH_TOKEN)
curl -H "X-Health-Token: $HEALTH_TOKEN" https://zagafy.com/api/health/rate-limit

# Search Vercel logs for a specific request
# Use the Vercel dashboard or CLI:
vercel logs --filter "requestId=<uuid>"

# Search for metric logs
vercel logs --filter "_metric=endpoint"
vercel logs --filter "_metric=ai_cost"
```

## Onboarding Drip Cron

- `/api/cron/onboarding` sends the day 1/3/7 onboarding emails; Vercel auto-registers the daily 09:00 UTC cron from `vercel.json` on deploy.
- Apply migration `0001_onboarding_stage` (`npm run db:migrate`) BEFORE the cron can deliver — it adds `users.onboarding_stage`.
- Set `CRON_SECRET` in the Vercel project env — the route returns 500 in production without it, and Vercel sends it as the cron's bearer token.
