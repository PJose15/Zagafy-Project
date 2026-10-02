# Zagafy release verification — October 1, 2026

## Observed results

The user story under test is: save a manuscript chapter → export DOCX/PDF →
download and reopen the document; export a JSON backup → change the chapter →
restore the backup → reload and recover the original chapter and author metadata.

| Gate | Result | Evidence and limits |
| --- | --- | --- |
| PR #121 CI | Passed on initial release commit | GitHub run 36951732252: dependency audit, lint, type check, tests and build passed. Later commits need their own run. |
| PR #121 CodeQL | Passed on initial release commit | GitHub run 36951732183. Later commits need their own run. |
| Initial CI browser suite | 11 passed, 6 skipped | Job 110666599221. This is not authenticated release acceptance. |
| Vercel branch deployment | Ready, access protected | GitHub's Vercel status and bot comment report deployment of commit `228e677000979531a9ddab8b61a9b114701c370b`. Root, sign-in and health requests redirect to Vercel login. The returned HTML is not an app-health success. |
| Local test suite after parser update | 210 suites, 2,882 tests passed | Includes three real document round-trip regressions; mocked service tests do not prove live integration behavior. |
| Local chapter persistence | Passed | Production build, save/reload/edit assertions; no Clerk configured, embed runtime. |
| Local DOCX/PDF downloads | Passed | Real browser/API downloads, independently reopened; expected chapter and English/Spanish text recovered. DOCX round-trip regression also checks bold/italic formatting and both chapters. PDF was additionally opened with Poppler. |
| Local JSON restore | Passed | Export, mutate chapter, restore, reload and reopen original content. Genre array and author fields survive restore and another export. |
| Dependency audit | Zero reported vulnerabilities | Full dependency scan after the PDF parser update. Recheck on merge/deployment. |
| Hosted configuration | Not inspected | No service inspection tools were exposed in this execution, even after connection notices for Vercel and Neon. No inference about hosted secrets is made. |

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
| Hosted configuration and database | Working Vercel/Neon inspection access, isolated staging deployment and database branch | Required variable names/targets, correct runtime, migration state, schema and safe rollback target. Never record secret values. |
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
