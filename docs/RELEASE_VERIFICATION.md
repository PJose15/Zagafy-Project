# Zagafy release verification — October 2, 2026

## Observed results

The user story under test is: save a manuscript chapter → export DOCX/PDF →
download and reopen the document; export a JSON backup → change the chapter →
restore the backup → reload and recover the original chapter and author metadata.

| Gate | Result | Evidence and limits |
| --- | --- | --- |
| PR #121 CI | Passed on code commit `f8ade1c` | GitHub run 36954564786: dependency audit, lint, type check, tests and build passed. Documentation updates need their own checks. |
| PR #121 CodeQL | Passed on code commit `f8ade1c` | GitHub run 36954564770. |
| Latest CI browser suite | 14 passed, 6 skipped | Job 110675387414 on code commit `f8ade1c`. This is not authenticated release acceptance. |
| Vercel branch deployment | Ready; dashboard loads after Vercel sign-in | Signed-in project overview lists branch `fix/zagafy-launch-readiness` and PR #121. Browser rendered Dashboard, empty workspace and first-run check-in. This is local app rendering, not a Clerk session or integration proof. Health navigation was blocked by the browser client; no health success is claimed. |
| Local test suite after parser update | 210 suites, 2,882 tests passed | Includes three real document round-trip regressions; mocked service tests do not prove live integration behavior. |
| Local chapter persistence | Passed | Production build, save/reload/edit assertions; no Clerk configured, embed runtime. |
| Local DOCX/PDF downloads | Passed | Real browser/API downloads, independently reopened; expected chapter and English/Spanish text recovered. DOCX round-trip regression also checks bold/italic formatting and both chapters. PDF was additionally opened with Poppler. |
| Local JSON restore | Passed | Export, mutate chapter, restore, reload and reopen original content. Genre array and author fields survive restore and another export. |
| Dependency audit | Zero reported vulnerabilities | Full dependency scan after the PDF parser update. Recheck on merge/deployment. |

## Bugs found and fixed during verification

1. `pdf-parse` 1.1.4 rejected a valid generated PDF with `bad XRef entry`.
   Poppler confirmed the file and its text were valid. Updated to 2.4.5, used its
   `PDFParse` API with `destroy()` cleanup, and retained dynamic worker files in
   the ingest function's deployment trace. Runtime must satisfy
   `>=20.16.0 <21 || >=22.3.0`; CI uses Node 22.
2. JSON restore treated `genre` as a scalar string although StoryState and JSON
   exports use `string[]`. Validated the array and its bounded string members.
   Restores now whitelist and validate the three author contact fields too.

## Remaining live gates

| Gate | What is needed | Pass evidence |
| --- | --- | --- |
| Hosted configuration and database | Resolve existing database ownership; configure isolated staging deployment and database branch | Required variable names/targets, correct runtime, migration state, schema and safe rollback target. Never record secret values. |
| Authentication/account boundaries | Dedicated Clerk development-instance users and staging E2E credentials | Four required browser journeys with active session, new-account onboarding, sign-out and two-account/two-tab sync isolation. |
| Billing | Stripe test-mode access, staging webhook secret and isolated database | Checkout, upgrade/downgrade/cancel/past-due, duplicate/out-of-order events, retry after database failure, correct stored entitlement and live price mapping. |
| Redis | Staging Upstash credentials | Atomic final-allowance concurrency, helper ownership/replay/expiry, multi-instance limits and outage/recovery. |
| AI ingestion/quality | Staging Gemini/Anthropic keys, current test-account JWT and allowance | Real TXT/MD/DOCX/PDF ingestion through extraction/review/save; narrative/canon review, latency and spend evidence. Local parser round trips do not prove AI extraction. |
| Collaboration | Two dedicated accounts and paid staging entitlement | Invite, accept, concurrent edits, revoke and denied access after revocation. |
| Operations | Staging email/monitoring access and operational owner | Email delivery, cron authorization/schedule, alert delivery, database restore drill and deployment rollback. Local JSON restore does not prove database recovery. |

The required staging workflow is `.github/workflows/release-readiness.yml`; it
now includes core persistence, DOCX/PDF downloads and JSON backup/restore. Missing
credentials or an absent active Clerk session must fail, rather than skip.

No merge, production promotion, live payment, infrastructure mutation or
production recovery drill has been performed. Connections alone do not constitute
successful service verification. PR #121 remains a draft until these live gates pass.

## Billing schema follow-up

The webhook schema declared `stripe_events`, but the four committed migrations
did not create it. Added and registered migration `0004_stripe_events`. Event-claim
errors now return 503 before billing updates, provider lookups or notification
email; Stripe can retry after recovery.

Validation: all 19 webhook tests pass, including an outage regression asserting
no downstream side effects; TypeScript, changed-file lint and diff checks pass.
All five SQL migrations applied to a fresh embedded Postgres (PGlite). Reapplying
the new migration succeeds; the event timestamp default and duplicate insert
guard work, and prior migration columns remain present. This is local SQL evidence,
not proof of the hosted database schema or real Stripe deliveries.

Apply the registered migration to verified staging before enabling billing. No
hosted migration was run. Out-of-order delivery and process-crash handling remain
release gates.
