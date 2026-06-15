# AI Eval Pipeline (Phase 7.5 -- MP-14)

## Overview

The eval pipeline validates AI endpoint quality by running structured test cases
against each AI-powered API route and grading the responses automatically.

## Test Cases

Each endpoint has **50 test cases** (10 representative cases are checked in for
the initial framework; the full suite is expanded over time). Cases live in
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
npx tsx eval/runner.ts --base-url http://localhost:3000
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
