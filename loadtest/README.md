# Load Tests (k6)

> Phase 6.7 (ME-03). Run pre-launch and quarterly.

## Prerequisites

Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/

## Scenarios

| Script | VUs | Target | Description |
|--------|-----|--------|-------------|
| `dashboard.js` | 50 | p95 < 2s | Dashboard browsing |
| `chat.js` | 20 | p95 < 5s | AI chat endpoint |
| `ingest.js` | 10 | zero 5xx | File upload/ingest |

## Usage

```bash
# Local
k6 run loadtest/dashboard.js

# Against staging
k6 run -e BASE_URL=https://staging.zagafy.com loadtest/dashboard.js

# With authentication
k6 run -e BASE_URL=https://staging.zagafy.com -e AUTH_TOKEN=<token> loadtest/chat.js

# All scenarios
k6 run loadtest/dashboard.js && k6 run loadtest/chat.js && k6 run loadtest/ingest.js
```

## Interpreting results

k6 outputs a summary table. Key metrics:
- `http_req_duration` p95 — must be under threshold
- `http_req_failed` — must be < 1% (< 5% for ingest)
- `errors` — custom error rate

## Generating HTML reports

```bash
k6 run --out json=results.json loadtest/dashboard.js
# Then use https://k6.io/docs/results-output/real-time/json/
```
