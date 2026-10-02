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
| Hosted configuration | Inspected; launch blockers found | Signed-in Vercel project/shared variable lists, Storage and Build settings inspected without revealing values. Neon signed-in organization/project list inspected. Details below. |

## Hosted inspection — October 2, 2026

Production remains on `master` commit `485b710` at `zagafy.vercel.app`;
PR #121 has not been promoted. Project Node.js setting is `24.x`, which satisfies
the parser runtime range. No Vercel deployment checks are configured.

The complete project variable list and shared tab showed:

| Variables | Configured target |
| --- | --- |
| `CLERK_WEBHOOK_SECRET`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Production only |
| `DATABASE_URL`, `APP_URL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET` | Production only |
| `ANTHROPIC_API_KEY` | All Environments |
| `GEMINI_API_KEY` | Separate Production and All Pre-Production entries |
| Shared variables | No shared variables linked |

Required names absent from both project and linked shared variables:
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_WRITER_MONTHLY`,
`STRIPE_PRICE_WRITER_YEARLY`, `STRIPE_PRICE_AUTHOR_MONTHLY`,
`STRIPE_PRICE_AUTHOR_YEARLY`. Preview additionally lacks the Clerk keys,
webhook secret, database URL, app URL and cron secret shown as Production-only.
No secret values were revealed, copied or tested; presence does not establish
credential validity. Email and monitoring configuration were not present in this
variable list either and remain unverified.

Vercel Storage reports no connected database. This does not negate the configured
production `DATABASE_URL`; it may point to an external database. The signed-in
Neon account's organization selector offered one organization, whose project list
reported no projects. The production database's provider/project/branch, schema,
migrations and restore capability therefore remain unresolved. Do not create a
replacement database or run migrations before identifying the existing database.

### Next configuration work

1. Identify the database behind the existing production URL through its owner,
   then establish an isolated staging branch with the app's schema. Do not copy
   production credentials/data into an unreviewed preview.
2. Configure preview with Clerk development-instance keys, dedicated test users,
   staging database/app URL and the required Redis REST pair.
3. Connect Stripe test mode and supply webhook and Writer/Author price IDs;
   include Studio IDs if offering Studio. Configure email and monitoring.
4. Redeploy the exact candidate and run authenticated readiness, real Redis,
   Stripe, AI, collaboration and operational gates below before promotion.

No hosted configuration was changed during this inspection.

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
