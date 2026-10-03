# Zagafy release verification — October 2, 2026

## Observed results

The user story under test is: save a manuscript chapter → export DOCX/PDF →
download and reopen the document; export a JSON backup → change the chapter →
restore the backup → reload and recover the original chapter and author metadata.

| Gate | Result | Evidence and limits |
| --- | --- | --- |
| Previous PR #121 CI | Passed on commit `132ba19` | GitHub run 36961251196. The continuation below needs checks tied to its uploaded commit. |
| Previous PR #121 CodeQL | Passed on commit `132ba19` | GitHub run 36961251257. |
| Latest CI browser suite | 14 passed, 6 skipped | Job 110675387414 on code commit `f8ade1c`. This is not authenticated release acceptance. |
| Hosted deployment acceptance | Not verified in this continuation | Authenticated staging and production acceptance remain release gates. |
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
hosted migration was run. The subsequent reconciliation tests below cover local out-of-order delivery
and transactional retry. Real provider delivery and process termination remain
staging release gates.


## Data integrity and billing continuation

The next audit followed the author workflow and found a reproducible save race:
“Save Chapter” reported success before the debounced storage write finished.
Immediate reload lost the chapter; immediate navigation exported an empty backup.
The action now awaits the local transaction and keeps the editor open on failure.
Explicit saves cancel older pending debounce work.

Manuscript metadata, all chapter contents, deletions and queued manuscript sync
mutations now commit atomically. Storage read failures and corrupt project records
block editing and empty default overwrites; retry and a project-scoped raw recovery
download preserve the stored records. Recovery files include full local chapter
text and do not parse or modify corrupt blobs.

Cloud push now validates its input, serializes writes per story, and rolls back
failed batches. Queue batching is limited to 500 entities, with exact covered-row
acknowledgement. Incomplete acknowledgements and failed conflict backups retain
pending mutations. Story conflicts create full local snapshots visible in Versions;
chapter conflicts retain a version before overwriting the losing text.

Stripe webhook claims and entitlement writes now share a Postgres transaction.
Provider or database failures roll back the claim so the same event can be retried;
notification email is best-effort after commit. A per-customer lock serializes
reconciliation. Current subscription state and exact configured prices determine
access, including annual billing and replacement subscriptions; stale event
metadata and delayed cancellation events do not control the tier. Unknown active
prices and incomplete subscription listings fail for retry.

Settings now loads the authenticated plan, suppresses stale responses when accounts
change, shows lookup failures instead of Free, and offers monthly/yearly upgrades.
Checkout routes customers with ongoing subscriptions to manage their existing one.
Simultaneous first checkouts still require the remaining safeguards and hosted
Stripe configuration verification recorded in PRODUCT_STATUS.md.

Local regression evidence: 215 suites and 2,945 tests passed, including actual
registered Postgres migrations, atomic rollback, duplicate deliveries, same-event
retry, delayed cancellation, annual pricing, concurrent version checks and failed
recovery storage. TypeScript and the production build pass. Repository lint has
existing warnings and no errors. Dependency audit reports zero vulnerabilities.
These are local checks, not live payment, multi-instance load or hosted migration
proof. See PRODUCT_STATUS.md for the prioritized implementation gaps.

The production-build browser rerun passed all four required local journeys:
chapter save/reload, independently parsed DOCX/PDF downloads, and JSON change/
restore/reload. The earlier failing save-race checks passed after the fix. Local
runtime had no authenticated Clerk session; hosted acceptance remains required.


## Cloud receipt and update follow-up

Registered migration `0005_sync_receipts` adds timezone-aware `synced_at` columns
and scoped indexes for chapter versions, snapshots, sessions, chat, writer insights
and comments. Their incremental pull filters use database receipt time while
retaining historical user-facing dates. Updates refresh receipt time. Completed
sessions and renamed history now update rather than being silently ignored.

Push and pull use the same per-story transaction lock. Pull rereads access/state
after locking and takes its watermark from the database clock. Chapter/story
updates explicitly store UTC in their legacy timestamp columns. This prevents
non-UTC database sessions and different application clocks from causing a receipt
to fall behind a pull watermark. Concurrent push/pull tests verify coherent batches
and delivery on the next pull; these embedded tests do not simulate multiple
hosted processes or network partitions.

Foreign IDs cannot be silently acknowledged for chapter versions, snapshots,
sessions, chat messages, insights or comments; each guarded upsert requires a
returned row, and a failed guard rolls back the preceding batch writes. The earlier
chapter-ID guard has the same behavior. Version-parent ownership remains checked.

All six registered migrations apply through the real Drizzle migrator. Reapplying
the new SQL preserves historical data, and all six receipt columns are timestamptz.
The current `0005_snapshot.json` matches the schema: subsequent `db:generate`
reports no changes instead of recreating objects from manual migrations.

Latest local full run: 215 suites / 2,956 tests passed. Production build, TypeScript
and repository lint pass (seven existing warnings). The previous four production-build local
browser journeys remain evidence for the unchanged manuscript/export/restore
client. A hosted migration must be applied and verified in isolated staging before
using the updated sync endpoints. No hosted schema was changed.


## Cloud catalog and durable local mutation continuation

The project library now includes an authenticated owned/shared cloud catalog with
keyset pagination and owner-plan eligibility. Postgres regressions verify isolation,
revoked sharing, pagination and metadata-only results. Import downloads the full
project before activation and atomically saves the binding, manuscript, history,
sessions, insights and comments. Real IndexedDB regressions cover simultaneous
imports, account changes, ID collisions, incomplete manuscripts and late storage
failure. Reopening an existing binding keeps pending local writing.

The shared import path uses the same implementation. Initial story hydration no
longer autosaves downloaded data back into the queue. Incremental pulls now update
mutable history and sessions, retain queued local edits, remap local project scopes
and commit rows with the watermark in one transaction. Failed storage leaves the
prior rows and watermark intact. An old snapshot scope is repaired only when one
existing binding identifies its owning local project.

History, sessions, snapshots, insights, comments and project renames now save their
normal Dexie mutations with durable queue entries. Failure regressions verify
rollback, preservation of prior records and notification only after commit. Sync
retries queued entries on startup and periodically, retaining a failed push status.
Insight confidence converts between local fractions and server integer percentages.

Legacy localStorage fallbacks, concurrent history replacement, general cloud
removal delivery and simultaneous initial checkouts remain explicit implementation
gaps in PRODUCT_STATUS.md. Local tests do not establish live authenticated
second-device access, provider integration or deployment readiness.

Verified local result for this continuation: **220 suites / 3,008 tests passed**.
The production build and type checking pass; repository lint has six existing
warnings and no errors. All four production-build browser journeys pass again:
chapter save/reload, real DOCX/PDF downloads and parsing, and JSON backup restore.
These browser checks use the local embed runtime and do not establish authenticated
hosted cloud acceptance. No hosted migration, live payment, merge or deployment
was performed.


A final first-upload regression found that a history-only queued mutation could
create a cloud story without an existing local manuscript. Initial binding now
commits a complete project upload seed and binding together; invalid/incomplete
manuscripts or failed queue storage leave no new binding. Metadata and chapter
parents precede history even when more than 500 entities are queued. Concurrent
preparations share one binding and seed.

The regression runs the real client engine against the sync route handlers and
migrated embedded Postgres, then clears IndexedDB and reopens the cloud project.
The manuscript, author metadata, chapter versions, snapshots, sessions, chat,
insights and comments survive, with local scopes restored and no upload echo.
Insight confidence round trips correctly for both fractional local values and
older percentage values. This is an embedded two-workspace test, not a hosted
Clerk/browser or multi-process acceptance result.

## Chapter-history continuation

The chapter history suite now uses real Dexie transactions with fake-indexeddb,
rather than forcing every operation into a localStorage fallback. Regressions
cover simultaneous additions, canonical selection, one-time initial seeding,
concurrent add/rename/delete, project isolation, legacy migration, corrupt records
and rollback when the sync queue cannot persist. Hook and editor tests cover
failed loads/saves, retry, stale chapter/project responses, awaiting a recovery
snapshot before switching, and preserving typing during that await.

Final local checks: 220 suites / 3,017 tests passed; clean production build
and TypeScript passed; lint completed with six existing warnings and no errors.
GitHub checks for this continuation are recorded in PR #121 against the uploaded
commit. No new hosted two-device, authenticated staging, payment, deployment or
browser-download acceptance is claimed by these local history tests. The next
storage checkpoint is session history and WIP/legacy migration recovery; cloud
deletion delivery and initial checkout concurrency remain open.
