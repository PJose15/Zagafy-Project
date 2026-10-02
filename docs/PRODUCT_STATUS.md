# Zagafy product status — October 2, 2026

Zagafy is an offline-first narrative workshop for authors. The product centers on
an editable manuscript, project-specific canon and characters, deliberate AI
assistance, reversible revisions, and publishing preparation. English and Spanish
interfaces and an antiquarian visual style are part of the existing experience.
Clerk, Postgres, Redis and Stripe support the optional hosted subscription product.

This inventory is based on the current release branch, not historical roadmap
checkboxes. A feature existing in code is distinct from a verified hosted feature.

## Existing product and evidence

| Area | Present in the code | Evidence and remaining limit |
| --- | --- | --- |
| First-run and projects | Intake, Genesis wizard, project library and switching | Local project persistence tests; authenticated onboarding acceptance remains. |
| Manuscript | Lexical editor, chapter organization, word counts, find/replace | Real browser save/reload regression; storage transactions and failure regressions. |
| Narrative design | Story bible, canon, characters, timeline, conflicts and outlines | Existing component/API tests; complete author journey and narrative quality review remain. |
| Assistance | Main chat, coaching, polish, flow, character chat and helper analysis | Auth, quota and helper ownership/replay tests; real model quality, latency and spend remain. |
| History | Chapter versions and manuscript snapshots | Local storage and conflict recovery tests. Complete cloud coverage is not yet established. |
| Publishing | Query materials, manuscript DOCX/PDF and JSON backup/restore | Real document round trips and browser downloads/restores; live AI publishing quality remains. |
| Billing | Tier limits, monthly/yearly checkout, portal and webhooks | Transactional Postgres webhook regressions, price matching, authenticated plan display and API tests; live Stripe lifecycle remains. |
| Cloud/collaboration | Project binding, push/pull, invitations, roles, comments | Database transactions, concurrency and authorization regressions; gaps below still block a complete cloud promise. |
| Operations | CI, CodeQL, monitoring hooks, cron, staging workflow and runbook | Local and CI evidence must be tied to a specific commit; live alerts, restore and rollback drills remain. |

## Fixed in the current continuation

- Manuscript metadata, chapter contents, deletions and durable manuscript sync
  mutations commit in one local transaction. Failed chapter or queue writes roll
  back the entire save. Chapter IDs cannot overwrite another local project.
- Storage read failures and corrupt project records block editing and default overwrites.
  Retry and a project-scoped raw recovery download preserve access to the original
  records and chapter contents; read and corruption regressions cover failures.
- Explicit chapter save waits for confirmed storage before success; failure keeps
  the editor open. Explicit saves cancel older pending debounce writes.
- Cloud push validates batches, serializes concurrent writes per story, and rolls
  back partial batches. Accepted story state controls its title; a chapter-only
  push cannot rename the story from stale client metadata.
- Sync pushes are bounded to 500 entries and clear only covered queue rows. Partial
  acknowledgements keep the queue. Failed pushes retain their error state.
- Conflict resolution saves a chapter version or a full manuscript snapshot before
  overwriting a local edit. Failed recovery storage blocks that overwrite.
- Stripe event claims and entitlement writes commit together. Failures roll back
  claims for retry. Per-customer locking and fresh subscription lookup prevent old
  event metadata from controlling the current entitlement.
- Entitlements use configured Stripe price IDs, including annual subscriptions;
  grace access cannot upgrade an account on failed payment.
- Settings loads the actual authenticated plan, rejects failed lookups instead of
  displaying Free, suppresses old-account responses, and supports yearly checkout.
  Customers with ongoing subscriptions are directed to manage their existing one.

## Remaining implementation work, in priority order

| Priority | Concrete gap | Acceptance needed |
| --- | --- | --- |
| 1 | History, snapshots, sessions and writer insights do not consistently enqueue all local mutations | Atomic local mutation plus queue, captured project IDs, no echo on pull, and two-device round-trip tests. |
| 1 | Incremental pull uses client-authored historical timestamps for several entity types | Add server receipt/update timestamps with a migration; prove late offline uploads and skewed clocks reach another client. |
| 1 | Session upsert currently ignores an existing row, and some immutable ID collisions are silently acknowledged | Persist session completion and reject foreign entity collisions; database regressions for every entity type. |
| 1 | Cloud deletions lack a general tombstone/delivery protocol | Verify deletion propagation across disconnected devices, including dependent rows and retained recovery copies. |
| 1 | New simultaneous checkouts can still race before a subscription exists | Serialize/reuse checkout attempts and verify Stripe's one-subscription redirect plus portal configuration in staging. |
| 2 | Some non-manuscript queue writes swallow failures and rely on a full push that is not implemented | Make failures observable/retryable or add tested reconciliation; retain local data. |
| 2 | Browser project switching and cross-tab hydration need further in-flight save coverage | Rapid switches, pending saves, concurrent tabs, failed hydration and account changes cannot transfer or lose edits. |
| 2 | Drizzle migration snapshots lag manual SQL migrations | Restore a current schema snapshot and prove future generation does not recreate existing objects. |
| 2 | Notification delivery is best-effort after billing commits | Decide whether reliable email is required; use a durable outbox if it is, with idempotent retry tests. |
| 2 | Snapshot pruning can remove recovery history | Define retention rules for conflict backups and verify predictable, user-visible recovery. |
| 3 | Historical roadmap and counts overstate some completion and understate other shipped features | Keep this inventory and release evidence current; complete accessibility, localization and author usability review. |

## Hosted release gates

Use isolated staging and dedicated test accounts for authenticated onboarding,
account separation, two-device sync/collaboration, Stripe checkout/change/cancel/
payment failure/retry, Redis concurrency/outage, real AI review/save, email and
monitoring, database restore, and deployment rollback. The required staging suite
must not skip when credentials or sessions are missing.

No live payment, hosted migration, production merge or promotion is implied by
local tests. See [RELEASE_VERIFICATION.md](RELEASE_VERIFICATION.md),
[STAGING.md](STAGING.md) and [LAUNCH_READINESS.md](LAUNCH_READINESS.md).
