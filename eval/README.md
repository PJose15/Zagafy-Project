# AI Eval Pipeline (Phase 7.5 -- MP-14)

## Overview

The eval pipeline validates AI endpoint quality by running structured test cases
against each AI-powered API route and grading the responses automatically.

## Test Cases

The checked-in suite has 20 cases across three endpoints. Cases live in
`eval/cases/<endpoint>.json` and follow this schema:

```json
{
  "id": "chat-001",
  "endpoint": "/api/chat",
  "input": { "userInput": "...", "language": "English", "storyContext": "..." },
  "rubric": {
    "mustContain": ["keyword or phrase the response must include"],
    "mustNotContain": ["phrase that must NOT appear"],
    "qualityCriteria": ["Human-readable quality expectation"]
  }
}
```

### Endpoints Covered

| Endpoint              | File                     | Cases |
| --------------------- | ------------------------ | ----- |
| `/api/chat`           | `cases/chat.json`        | 10    |
| `/api/story-coach`    | `cases/story-coach.json` | 5     |
| `/api/character-chat` | `cases/character-chat.json` | 5  |

## Runner

```bash
EVAL_AUTH_TOKEN=<current-staging-user-JWT> npx tsx eval/runner.ts --base-url https://<staging-domain>
```

The runner:

1. Reads all test case files from `eval/cases/`.
2. Calls each endpoint with the specified input via `POST`.
3. Checks the response body against the rubric:
   - **mustContain** -- every listed string must appear (case-insensitive).
   - **mustNotContain** -- none of the listed strings may appear.
   - **qualityCriteria** -- logged for manual review; not auto-graded.
4. Writes a summary JSON to `eval/results/run-<timestamp>.json`.
5. Exits with code **1** if any critical failure is detected.

## Auto-Grading

- `PASS` -- all mustContain present, no mustNotContain found.
- `FAIL` -- one or more rubric violations.
- `ERROR` -- endpoint returned a non-200 status or timed out.

## Nightly CI

A GitHub Actions workflow (`.github/workflows/eval.yml`) runs the pipeline
every night at 03:00 UTC. Results are uploaded as build artifacts and retained
for 90 days.

## Quality Dashboard (Concept)

Future work: a small dashboard page that reads `eval/results/` history and
plots pass-rate trends per endpoint over time, enabling the team to catch
regressions before they reach users.

The staging server must already be running. Nightly CI requires `STAGING_URL` and
`EVAL_AUTH_TOKEN` secrets, with JWT renewal managed by the operator. Missing/expired
credentials and endpoint errors fail the job. Empty/degraded responses fail too.
`qualityReview: manual_required` records that contract checks do not grade narrative
quality. Attach human review before using the results as a release approval.
